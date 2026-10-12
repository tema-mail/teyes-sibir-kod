"""Шаг 6. Снимок каталогов и лент Tilda для копии.

API магазина (store.tildaapi.com) и лент (feeds.tildaapi.com) отдают данные только домену teyes-sibir.ru:
из браузера на чужом домене приходит «ERROR: The … is configured for another domain». Без заголовков
Origin/Referer API отвечают. Поэтому: открываем в Chrome каждую страницу копии с каталогом или лентой,
записываем запросы (getproductslist, getfilters, getfeed), снимаем их ответы и все страницы пагинации (по total/size)
в raw/store/, рядом пишем raw/store/snapshot.js – вставку, которая подменяет адрес запроса на снимок.
build.py кладёт это в public/assets/store/ и подключает на этих страницах. Запросы с фильтрами или
сортировкой, выбранными посетителем, уходят в Tilda как есть. Ссылки на страницы сайта в снимке ведут
в копию; фото товаров остаются на CDN Tilda (этап 2). Сам пересобирает копию без вставки; после него – build.py.
Новый снимок заменяет старый только целиком: при любой ошибке прошлый возвращается, код выхода 1.
"""
import csv
import hashlib
import json
import math
import pathlib
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

import build
from build import BASE
from verify import PUBLIC, chrome, serve

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT, DATA = ROOT / "raw" / "store", ROOT / "data"
NEW = OUT / "new"  # новый снимок собирается здесь и подменяет старый только целиком
NOT_FOUND = "ERROR: Category is not found"  # раздел удалён в Tilda: живой сайт показывает ту же ошибку
BLOCK = re.compile(r"t_(?:store|feed)_init\('(\d+)'")  # блоки каталога и ленты в HTML страницы
API = re.compile(r"/api/(getproductslist|getfilters|getfeed)/$")  # товары, фильтры каталога, посты
LIVE_LINK = re.compile(r"https://(?:www\.)?teyes-sibir\.ru(?:/[^\"\s\\<>]*)?")
SKIP = ("c", "getparts", "getoptions")  # метка времени и флаги первого запроса не влияют на выбор снимка
WORKERS = 4
SHIM = """/* Снимок каталогов и лент Tilda для копии (scripts/store.py): запросы с настройками блока по умолчанию
   отвечаются из assets/store/, остальные (фильтры и сортировка посетителя) уходят в Tilda как есть. */
(function(){var snap=%s,base=%s,skip=%s,open=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,url){try{var u=new URL(url,location.href),
api=u.pathname.match(/\\/api\\/(getproductslist|getfilters|getfeed)\\/$/);
if(api&&/^(store2?|feeds)\\.tilda(api|cdn)\\./.test(u.hostname)){var p=[["_api",api[1]]];
u.searchParams.forEach(function(v,k){if(skip.indexOf(k)<0)p.push([k,v])});
if(!p.some(function(x){return x[0]==="slice"}))p.push(["slice","1"]);
p.sort(function(a,b){return a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0});
var f=snap[JSON.stringify(p)];if(f)arguments[1]=base+f}}catch(e){}return open.apply(this,arguments)}})();
"""


def is_api(url):
    p = urllib.parse.urlsplit(url)
    return bool(API.search(p.path)) and bool(re.match(r"(store2?|feeds)\.tilda(api|cdn)\.", p.hostname or ""))


def params(url):
    return dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(url).query, keep_blank_values=True))


def key(url):
    """Ключ снимка – как в SHIM: вид запроса, параметры без SKIP, slice по умолчанию 1, по порядку."""
    p = urllib.parse.urlsplit(url)
    q = [["_api", API.search(p.path).group(1)]]
    q += [[k, v] for k, v in urllib.parse.parse_qsl(p.query, keep_blank_values=True) if k not in SKIP]
    if not any(k == "slice" for k, _ in q):
        q.append(["slice", "1"])
    return json.dumps(sorted(q), ensure_ascii=False, separators=(",", ":"))


def with_slice(url, n):
    p = urllib.parse.urlsplit(url)
    q = [(k, v) for k, v in urllib.parse.parse_qsl(p.query, keep_blank_values=True) if k != "slice"] + [("slice", str(n))]
    return urllib.parse.urlunsplit(p._replace(query=urllib.parse.urlencode(q)))


def fetch(url, site):
    """Ответ API без Origin/Referer: (текст для снимка или None, ошибка, число записей, total)."""
    for attempt in range(4):  # API иногда отвечает «Temporary error» – повторить с паузой
        res = subprocess.run(["curl", "-sS", "--compressed", "--max-time", "60", "--retry", "2", url],
                             capture_output=True, text=True)
        if "Temporary error" not in res.stdout:
            break
        time.sleep(5 * (attempt + 1))
    if res.stdout.startswith(NOT_FOUND):
        return res.stdout, NOT_FOUND, 0, 0
    try:
        data = json.loads(res.stdout)
    except ValueError:
        return None, (res.stdout or res.stderr)[:80], 0, 0
    items = data.get("products", data.get("posts", data.get("filters"))) if isinstance(data, dict) else None
    if not isinstance(items, list):  # getfilters отдаёт {"filters": [...], "sort", "search"} без total
        return None, res.stdout[:80], 0, 0
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    text = LIVE_LINK.sub(lambda m: site.link(m.group(0)), text)  # посты и страницы сайта – в копию
    return text, "", len(items), int(data.get("total") or 0)


def discover(site, local):
    page = local.removesuffix("index.html")
    shot = OUT / "shots" / (page.strip("/").replace("/", "_") or "index")
    urls = chrome(f"{site}/{page}", 1440, 6000, shot.with_suffix(".png"))  # высокое окно: грузятся все блоки
    return local, f"{site}/{page}" in urls, [u for u in urls if is_api(u)]


def collect(pages):
    """Запросы со страниц → снимки в NEW. Возвращает (карта снимков, строки отчёта, проблемы полноты)."""
    server, _ = serve()
    links = build.Site()
    found, gaps = {}, []
    with ThreadPoolExecutor(WORKERS) as pool:
        for n, (local, loaded, urls) in enumerate(pool.map(lambda p: discover(server, p), pages), 1):
            blocks = set(BLOCK.findall((PUBLIC / local).read_text("utf-8", "ignore")))
            lost = blocks - {params(u).get("recid") for u in urls}
            if not loaded or lost:  # каждая страница сама должна запросить данные всех своих блоков
                gaps.append(f"{local}: " + ("не загрузилась" if not loaded else f"нет запроса для блоков {sorted(lost)}"))
            for u in urls:
                found.setdefault(key(u), (u, local))
            if n % 20 == 0:
                print(f"  {n} из {len(pages)}", flush=True)
    rows, snap = [], {}
    for k, (url, local) in sorted(found.items()):
        queue = [url]
        while queue:
            u = queue.pop(0)
            text, err, items, total = fetch(u, links)
            name = hashlib.md5(key(u).encode()).hexdigest()[:12] + ".json"
            rows.append({"page": local, "key": key(u), "file": name if text else "", "items": items, "error": err})
            if not text:
                continue
            (NEW / name).write_text(text, "utf-8")
            snap[key(u)] = name
            if u == url and total:  # первая страница: добавить остальные страницы пагинации
                size = int(params(u).get("size") or 0) or items or 1
                queue += [with_slice(u, n) for n in range(2, math.ceil(total / size) + 1)]
    return snap, rows, gaps


def snapshot():
    pages = sorted(p.relative_to(PUBLIC).as_posix() for p in PUBLIC.rglob("*.html")
                   if BLOCK.search(p.read_text("utf-8", "ignore")))
    print(f"страниц с каталогом или лентой: {len(pages)}", flush=True)
    (OUT / "shots").mkdir(exist_ok=True)
    shutil.rmtree(NEW, ignore_errors=True)
    NEW.mkdir()
    snap, rows, gaps = collect(pages)
    bad = [r for r in rows if not r["file"]]
    print(f"снимков {len(snap)}, записей {sum(r['items'] for r in rows)}, раздел удалён в Tilda: "
          f"{sum(r['error'] == NOT_FOUND for r in rows)}, ошибок ответа {len(bad)}, страниц с пробелами {len(gaps)}")
    for line in [f"{r['page']}: {r['error']}" for r in bad[:10]] + gaps[:10]:
        print(f"  {line}")
    if bad or gaps or not snap:
        raise RuntimeError("снимок неполный")
    return snap, rows


def main():
    shim, prev = OUT / "snapshot.js", OUT / "snapshot.js.prev"
    OUT.mkdir(parents=True, exist_ok=True)
    if prev.exists() and not shim.exists():
        prev.replace(shim)  # прошлый запуск прерван посередине – сначала вернуть его снимок
    if shim.exists():
        shim.replace(prev)  # прошлый снимок не теряем, пока не готов новый
    try:
        build.main()  # сборка без вставки: иначе запросы уже подменены и в журнале их не видно
        snap, rows = snapshot()
    except BaseException as exc:  # в том числе Ctrl-C: вернуть прошлый снимок и сборку с ним
        if prev.exists():
            prev.replace(shim)
        build.main()
        sys.exit(f"Снимок не обновлён ({exc!r}): прошлый оставлен как был")
    # порядок замены безопасен при обрыве: новые файлы → вставка → лишнее; prev ссылается только на живые файлы
    for f in NEW.iterdir():
        f.replace(OUT / f.name)
    NEW.rmdir()
    tmp = shim.with_name("snapshot.js.part")
    tmp.write_text(SHIM % (json.dumps(snap, ensure_ascii=False, sort_keys=True), json.dumps(f"{BASE}/assets/store/"),
                           json.dumps(list(SKIP))), "utf-8")
    tmp.replace(shim)
    prev.unlink(missing_ok=True)
    for f in OUT.glob("*.json"):
        if f.name not in snap.values():
            f.unlink()
    with (DATA / "store.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["page", "key", "file", "items", "error"])
        w.writeheader()
        w.writerows(rows)


if __name__ == "__main__":
    main()
