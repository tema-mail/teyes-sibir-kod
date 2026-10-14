"""Шаг 5. Проверить копию в public/: все страницы на месте, все ссылки на свои файлы живые,
счётчиков нет, noindex есть; затем открыть страницы-образцы в Chrome и записать, куда ходит браузер.

python3 scripts/verify.py                 – проверка файлов + браузер на локальном сервере
python3 scripts/verify.py --site URL      – браузер на выложенной копии + все страницы отвечают 200
python3 scripts/verify.py --files         – только проверка файлов
Мега-меню проверяет verify_menu.py (данные, поведение, снимки raw/verify/menu/).
Снимки экрана: raw/verify/<страница>-<ширина>[-live].png (live – тот же адрес на teyes-sibir.ru).
Код выхода 1, если найдено что-то из «нельзя».
"""
import csv
import functools
import http.server
import json
import pathlib
import re
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

from build import BASE, NOINDEX

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUBLIC, DATA, SHOTS = ROOT / "public", ROOT / "data", ROOT / "raw" / "verify"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
LIVE = "https://teyes-sibir.ru"
# Образцы: главная, хабы, услуга, каталог, работы, блог, юридическая, контакты
SAMPLES = ["", "services", "services/alarm_installation", "store", "store/catalog_teyes", "store/catalog/ford", "store/catalog/acura", "works", "works/toyota",
           "reviews", "contacts", "politica", "faq", "blog", "blog/androidavto"]
WIDTHS = [(1440, 900), (390, 844)]
SITE_COUNTER = "99532918"  # Метрика сайта; у виджета Яндекс.Карт свои счётчики – это не наша статистика
CHROME_NOISE = ("google.com", "googleapis.com", "gvt1.com")
LEFTOVER = re.compile(r"(?:https?:)?(?:\\?/){2}(?:static\d?|thb|optim|neo)\.tildacdn\.com(?:\\?/)[^\"'\s)<>]+")
LOCAL_REF = re.compile(r"(?:src|href|data-original|data-img-zoom-url|content)=[\"'](" + re.escape(BASE) + r"/[^\"']*)"
                       r"|url\([\"']?(" + re.escape(BASE) + r"/[^\"')]+)")
COUNTERS = ("mc.yandex.ru", "zrok.cloud", "tildastatscript")
GLUED = f"teyes-sibir.ru{BASE}/"  # ссылка копии, приклеенная к живому домену
ROOT_LINK = re.compile(r"(?:<a\b[^>]*?\bhref|\bdata-success-url|\bdata-field-formmsgurl-value)=[\"'](/(?!/)[^\"']*)", re.S)


@functools.cache
def public_files():
    """Точные имена файлов: на маке ФС не различает регистр, а GitHub Pages различает."""
    return {p.relative_to(PUBLIC).as_posix() for p in PUBLIC.rglob("*") if p.is_file()}


def exists(ref):
    path = urllib.parse.unquote(urllib.parse.urlsplit(ref).path).removeprefix(BASE).strip("/")
    return path in public_files() or f"{path}/index.html".lstrip("/") in public_files()


def check_files():
    with (DATA / "pages.csv").open(encoding="utf-8") as f:
        pages = {r["local"] for r in csv.DictReader(f) if r["status"] == "200"}
    dist = ROOT / "site" / "dist"  # страницы на коде (этап 2) проверяются теми же правилами
    pages = sorted(pages | ({f.relative_to(dist).as_posix() for f in dist.rglob("index.html")} if dist.exists() else set()))
    with (DATA / "assets.csv").open(encoding="utf-8") as f:
        dead = {r["url"] for r in csv.DictReader(f) if r["status"] != "200"}  # битые на самой Tilda
    problems, broken, leftover = [], {}, {}
    for local in pages:
        if local not in public_files():
            problems.append(f"нет страницы: {local}")
            continue
        text = (PUBLIC / local).read_text("utf-8")
        if NOINDEX not in text:
            problems.append(f"нет noindex: {local}")
        problems += [f"счётчик {c}: {local}" for c in COUNTERS if c in text]
        if GLUED in text:
            problems.append(f"склеенная ссылка {GLUED}: {local}")
        problems += [f"ссылка мимо копии {m.group(1)}: {local}" for m in ROOT_LINK.finditer(text)
                     if not m.group(1).startswith(f"{BASE}/")]
    texts = [PUBLIC / p for p in pages if p in public_files()] + list(PUBLIC.rglob("*.css")) + \
        list((PUBLIC / "assets" / "ws").rglob("*.js"))
    for f in texts:
        text, where = f.read_text("utf-8", "ignore"), f.relative_to(PUBLIC).as_posix()
        for m in LEFTOVER.finditer(text):
            if m.group(0).replace("\\/", "/").split("?")[0] not in dead:
                leftover.setdefault(m.group(0), where)
        for m in LOCAL_REF.finditer(text):
            ref = m.group(1) or m.group(2)
            if not exists(ref):
                broken.setdefault(ref, where)
    print(f"Файлы: страниц {len(pages)}, всего проверено HTML/CSS/JS {len(texts)}")
    print(f"  битых ссылок на свои файлы: {len(broken)}")
    for ref, where in list(broken.items())[:10]:
        print(f"    {ref}  (в {where})")
    print(f"  адресов Tilda осталось: {len(leftover)} (и {len(dead)} битых на самой Tilda – как на живом сайте)")
    for ref, where in list(leftover.items())[:10]:
        print(f"    {ref}  (в {where})")
    print(f"  прочих проблем: {len(problems)}")
    for p in problems[:20]:
        print(f"    {p}")
    return not problems and not broken and not leftover


def check_site(site):
    """Выложенная копия: каждая страница отвечает 200 по адресу с точным регистром."""
    with (DATA / "pages.csv").open(encoding="utf-8") as f:
        pages = sorted({r["local"].removesuffix("index.html") for r in csv.DictReader(f) if r["status"] == "200"})
    def status(page):
        res = subprocess.run(["curl", "-sS", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "30",
                              f"{site}/{urllib.parse.quote(page)}"], capture_output=True, text=True)
        return page, res.stdout.strip()
    with ThreadPoolExecutor(8) as pool:
        bad = [(p, st) for p, st in pool.map(status, pages) if st != "200"]
    print(f"Сайт {site}: страниц {len(pages)}, не отвечают 200: {len(bad)}")
    for p, st in bad[:15]:
        print(f"    {st} /{p}")
    return not bad


def serve():
    """Локальный сервер: public/ доступен по BASE, как на GitHub Pages."""
    tmp = pathlib.Path(tempfile.mkdtemp())
    (tmp / BASE.strip("/")).symlink_to(PUBLIC)
    errors = []

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, fmt, *args):
            if len(args) > 1 and str(args[1]).startswith(("4", "5")):
                errors.append(f"{args[1]} {self.path}")

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(tmp)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{server.server_port}{BASE}", errors


def chrome(url, width, height, shot):
    """Открыть адрес, дождаться снимка экрана, вернуть все запрошенные адреса."""
    shot.unlink(missing_ok=True)  # иначе старый снимок «готов» сразу и Chrome закроется, ничего не загрузив
    with tempfile.TemporaryDirectory() as prof:
        net = pathlib.Path(prof) / "net.json"
        proc = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
                                 "--disable-background-networking", "--disable-component-update",
                                 f"--user-data-dir={prof}/p", f"--window-size={width},{height}",
                                 "--virtual-time-budget=10000", f"--log-net-log={net}", f"--screenshot={shot}", url],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.time() + 90
        while time.time() < deadline and not (shot.exists() and shot.stat().st_size):
            time.sleep(1)
        time.sleep(2)
        proc.terminate()
        proc.wait(10)
        lines = net.read_text("utf-8", "ignore").splitlines() if net.exists() else []
    if not lines:
        return []
    types = {v: k for k, v in json.loads(lines[0].rstrip(",") + "}")["constants"]["logEventTypes"].items()}
    urls = []
    for line in lines[2:]:
        try:
            e = json.loads(line.rstrip(","))
        except ValueError:
            continue
        u = e.get("params", {}).get("url")
        if u and types.get(e.get("type")) == "URL_REQUEST_START_JOB":
            urls.append(u)
    return urls


def classify(url):
    """Куда сходил браузер копии: None – пропуск копирования или счётчик сайта; иначе – допустимая категория."""
    p = urllib.parse.urlsplit(url)
    host = p.hostname or ""
    if host.endswith("zrok.cloud") or (host == "mc.yandex.ru" and SITE_COUNTER in url):
        return None
    if host == "mc.yandex.ru":
        return "счётчик внутри виджета Яндекс.Карт"
    if host in ("fonts.googleapis.com", "fonts.gstatic.com"):
        return None
    if re.match(r"(store2?|feeds)\.tilda(api|cdn)\.", host) and p.path.endswith(("/getproductslist/", "/getfilters/", "/getfeed/")):
        return None  # снимок каталога или ленты не сработал: Tilda ответит «configured for another domain»
    if host.endswith("tildacdn.com") and host != "feeds.tildacdn.com":  # прочие запросы лент – посты по клику
        if re.match(r"/stor[0-9a-f-]+/", p.path):
            return "фото товаров каталога (этап 2)"
        if (host == "static.tildacdn.com" and p.path.startswith(("/js/", "/css/", "/lib/"))) or \
                (host == "neo.tildacdn.com" and p.path.startswith("/js/")):
            return "модули Tilda, которые её скрипты грузят сами"
        return None
    return host


def check_browser(site, live):
    errors = []
    if site is None:
        site, errors = serve()
    SHOTS.mkdir(parents=True, exist_ok=True)
    bad, external, modules = {}, {}, set()
    for page in SAMPLES:
        for width, height in WIDTHS:
            name = (page or "index").replace("/", "_")
            url = f"{site}/{page}" + ("/" if page else "")
            urls = chrome(url, width, height, SHOTS / f"{name}-{width}.png")
            if url not in urls:  # пустой журнал сети – не «чисто», а «не проверено»
                bad[url] = f"{page} – страница не загрузилась в Chrome"
            for u in urls:
                kind = classify(u)
                if kind is None:
                    bad.setdefault(u, page)
                elif not u.startswith(site) and not kind.endswith(CHROME_NOISE):
                    external[kind] = external.get(kind, 0) + 1
                    if kind.startswith("модули"):
                        modules.add(urllib.parse.urlsplit(u).path)
            if live:
                chrome(f"{LIVE}/{page}", width, height, SHOTS / f"{name}-{width}-live.png")
        print(f"  {page or '/'}: снято", flush=True)
    print(f"Браузер: страниц {len(SAMPLES)} × {len(WIDTHS)} ширины, снимки в {SHOTS.relative_to(ROOT)}")
    print(f"  запросов туда, куда нельзя: {len(bad)}")
    for u, page in list(bad.items())[:15]:
        print(f"    {u}  (на {page or '/'})")
    print(f"  ошибок сервера копии (404 и т.п.): {len(errors)}")
    for e in errors[:15]:
        print(f"    {e}")
    print("  внешнее, допустимо: " + ", ".join(f"{h} {n}" for h, n in sorted(external.items())))
    print("  модули Tilda по требованию: " + ", ".join(sorted(m.rsplit("/", 1)[-1] for m in modules)))
    return not bad and not errors


def main():
    args = sys.argv[1:]
    ok = check_files()
    if "--files" not in args:
        site = args[args.index("--site") + 1].rstrip("/") if "--site" in args else None
        ok = check_browser(site, live="--live" in args) and ok
        if site:
            ok = check_site(site) and ok
        import verify_menu  # здесь, а не наверху: verify_menu сам импортирует verify
        ok = verify_menu.check_menu(site) and ok
    print("ИТОГ:", "всё в порядке" if ok else "есть проблемы")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
