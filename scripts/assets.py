"""Шаг 2. Скачать все ресурсы страниц: картинки, стили и скрипты Tilda, шрифты.

Берёт адреса из raw/html (список страниц — data/pages.csv), из скачанных CSS и скриптов блоков страниц
(ws/…/tilda-blocks-page*.js), пока не перестанут появляться новые. Кладёт в raw/assets/<хост>/<путь>,
пишет data/assets.csv. Общие скрипты Tilda не разбираются: то, что они грузят сами
(формы, корзина, магазин), остаётся на Tilda — см. docs/РЕШЕНИЯ.md.
Повторный запуск докачивает только недостающее.
"""
import csv
import pathlib
import subprocess
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

import tilda_urls

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW_HTML, RAW, DATA = ROOT / "raw" / "html", ROOT / "raw" / "assets", ROOT / "data"
WORKERS = 8
# Google Fonts отдаёт woff2 только современному браузеру
CHROME_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"


def raw_path(url):
    p = urllib.parse.urlsplit(url)
    if p.hostname == "fonts.googleapis.com":
        return RAW / p.hostname / tilda_urls.gfonts(url)[1].rsplit("/", 1)[1]
    return RAW / p.hostname / urllib.parse.unquote(p.path).lstrip("/")


def kind(local):
    ext = local.rsplit(".", 1)[-1].lower()
    if ext in ("css", "js"):
        return ext
    if ext in ("woff", "woff2", "ttf", "otf", "eot"):
        return "font"
    return "img" if f".{ext}" in tilda_urls.IMG_EXT else "other"


def download(url):
    out = raw_path(url)
    if out.exists() and out.stat().st_size:
        return url, "200"
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.name + ".part")
    res = subprocess.run(["curl", "-sS", "-L", "--compressed", "--max-time", "120", "--retry", "2", "-A", CHROME_UA,
                          "-o", str(tmp), "-w", "%{http_code}", url], capture_output=True, text=True)
    status = res.stdout.strip() or "ERR"
    if status == "200":
        tmp.replace(out)
    else:
        tmp.unlink(missing_ok=True)
    return url, status


def nested(url, local):
    """Ресурсы внутри скачанного CSS или скрипта блоков страницы."""
    f = raw_path(url)
    if not f.exists():
        return {}
    text = f.read_text("utf-8", "ignore")
    if local.endswith(".css"):
        return tilda_urls.css_refs(text, url)
    if "/ws/" in local and local.endswith(".js"):
        return tilda_urls.find(text)
    return {}


def main():
    with (DATA / "pages.csv").open(encoding="utf-8") as f:
        pages = [r["local"] for r in csv.DictReader(f) if r["status"] == "200" and not r["alias_of"]]
    found = {}
    for local in pages:
        found.update(tilda_urls.find((RAW_HTML / local).read_text("utf-8", "ignore")).values())
    print(f"страниц {len(pages)}, ресурсов в HTML {len(found)}")
    status, todo = {}, dict(found)
    while todo:
        with ThreadPoolExecutor(WORKERS) as pool:
            for n, (url, st) in enumerate(pool.map(download, todo), 1):
                status[url] = st
                if n % 500 == 0:
                    print(f"  {n} из {len(todo)}", flush=True)
        more = {}
        for url in todo:
            more.update(nested(url, found[url]).values())
        todo = {u: l for u, l in more.items() if u not in found}
        found.update(todo)
        if todo:
            print(f"вложенных ресурсов: {len(todo)}")
    rows = [{"url": u, "local": l, "kind": kind(l), "status": status[u],
             "bytes": raw_path(u).stat().st_size if status[u] == "200" else 0} for u, l in sorted(found.items())]
    with (DATA / "assets.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["url", "local", "kind", "status", "bytes"])
        w.writeheader()
        w.writerows(rows)
    bad = [r for r in rows if r["status"] != "200"]
    total = sum(r["bytes"] for r in rows) / 2**20
    print(f"ресурсов {len(rows)}, скачано {len(rows) - len(bad)} ({total:.0f} МБ), не открылись {len(bad)}")
    for r in bad[:15]:
        print(f"  {r['status']} {r['url']}")


if __name__ == "__main__":
    main()
