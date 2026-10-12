"""Шаг 1. Список всех страниц teyes-sibir.ru и их HTML как его отдаёт сайт.

Источники: sitemap.xml и sitemap потоков; страницы проекта Tilda (MCP, только чтение – если есть ключ);
живые адреса из слепка ~/Documents/teyes-sibir-slepok (если есть). Карточки товаров (/tproduct/)
и служебные адреса /tilda/ не берутся – товары будут на этапе 2 из данных магазина.
Tilda отдаёт адреса без учёта регистра (/works/Audi = /works/audi): такие варианты – одна страница,
основной – тот, что в sitemap (он же canonical), остальные пишутся с alias_of.
Пишет data/pages.csv и raw/html/<путь>. Повторный запуск докачивает только недостающее (--fresh – всё заново).
"""
import csv
import pathlib
import re
import subprocess
import sys
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW, DATA = ROOT / "raw" / "html", ROOT / "data"
SITE = "https://teyes-sibir.ru"
HOST = "teyes-sibir.ru"
PROJECT_ID = 10257003
SITEMAPS = ["sitemap.xml", "sitemap-feeds.xml", "sitemap-store.xml"]
NA_TILDU = pathlib.Path.home() / "Documents/teyes-sibir-site/scripts"
SLEPOK = pathlib.Path.home() / "Documents/teyes-sibir-slepok/data/master_pages.csv"
SKIP = re.compile(r"/tproduct/|^/tilda/")
WORKERS = 6
UA = "teyes-kod-mirror/1.0 (+owner)"


def curl(url, out=None):
    """Без следования редиректам: статус и (если out) тело в файл."""
    cmd = ["curl", "-sS", "--max-time", "60", "-A", UA, "-o", str(out) if out else "/dev/null", "-w", "%{http_code}", url]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return res.stdout.strip() or "ERR"


def norm(url):
    url = url.strip()
    if url.startswith("/"):
        url = SITE + url
    p = urllib.parse.urlsplit(url)
    if (p.hostname or "").removeprefix("www.") != HOST:
        return None
    path = urllib.parse.unquote(p.path) or "/"
    path = path.rstrip("/") if len(path) > 1 else path
    return None if SKIP.search(path) else f"{SITE}{path}"


def local_path(url):
    """Адрес → файл в копии: / → index.html, /a/b → a/b/index.html, /page1.html → page1.html."""
    path = urllib.parse.urlsplit(url).path.strip("/")
    if not path:
        return "index.html"
    return path if path.endswith(".html") else f"{path}/index.html"


def from_sitemaps():
    found, queue, seen = set(), [f"{SITE}/{n}" for n in SITEMAPS], set()
    while queue:
        sm = queue.pop(0)
        if sm in seen:
            continue
        seen.add(sm)
        xml = subprocess.run(["curl", "-sS", "--max-time", "60", sm], capture_output=True, text=True).stdout
        locs = re.findall(r"<loc>\s*([^<]+?)\s*</loc>", xml)
        if "<sitemapindex" in xml:
            queue += locs
        else:
            found |= {u for u in map(norm, locs) if u}
    print(f"sitemap: файлов {len(seen)}, адресов {len(found)}")
    return found


def from_tilda():
    try:
        sys.path.insert(0, str(NA_TILDU))
        import na_tildu
        pages = na_tildu.Mcp().json("get_pages", projectid=PROJECT_ID)
    except Exception as exc:  # нет ключа или сети – работаем без этого источника
        print(f"Tilda: пропущено ({str(exc)[:80]})")
        return set()
    found = {norm(f"/{p['alias'].strip('/')}" if p.get("alias") else f"/page{p['id']}.html") for p in pages}
    found.discard(None)
    print(f"Tilda: страниц проекта {len(pages)}")
    return found


def from_slepok():
    if not SLEPOK.exists():
        return set()
    with SLEPOK.open(encoding="utf-8") as f:
        found = {norm(r["url"]) for r in csv.DictReader(f) if r["status"] == "200" and r["page_type"] != "Товар"}
    found.discard(None)
    print(f"слепок: живых адресов {len(found)}")
    return found


def fetch(url, fresh):
    out = RAW / local_path(url)
    if out.exists() and not fresh:
        return url, "200"
    out.parent.mkdir(parents=True, exist_ok=True)
    status = curl(url, out)
    if status != "200" and out.exists():
        out.unlink()
    return url, status


def main():
    fresh = "--fresh" in sys.argv
    in_sitemap = from_sitemaps()
    groups = {}
    for url in sorted(in_sitemap | from_tilda() | from_slepok()):
        groups.setdefault(url.lower(), []).append(url)
    main_of = {}
    for variants in groups.values():
        main_url = next((u for u in variants if u in in_sitemap), variants[0])
        main_of.update({u: main_url for u in variants})
    urls = sorted(set(main_of.values()))
    rows = []
    with ThreadPoolExecutor(WORKERS) as pool:
        for n, (url, status) in enumerate(pool.map(lambda u: fetch(u, fresh), urls), 1):
            rows.append({"url": url, "status": status, "local": local_path(url) if status == "200" else "", "alias_of": ""})
            if n % 200 == 0:
                print(f"  {n} из {len(urls)}", flush=True)
    by_url = {r["url"]: r for r in rows}
    rows += [{**by_url[m], "url": u, "alias_of": m} for u, m in sorted(main_of.items()) if u != m]
    DATA.mkdir(exist_ok=True)
    with (DATA / "pages.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["url", "status", "local", "alias_of"])
        w.writeheader()
        w.writerows(rows)
    ok = sum(r["status"] == "200" and not r["alias_of"] for r in rows)
    print(f"Адресов {len(rows)}, страниц {len(urls)}, отвечают 200: {ok}; редиректы и 404 не копируются")


if __name__ == "__main__":
    main()
