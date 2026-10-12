"""Шаг 4. Собрать копию сайта в public/ из raw/ и манифестов data/*.csv.

Что меняется в HTML Tilda, и только это:
- адреса картинок, стилей, скриптов и шрифтов Tilda/Google → свои файлы в public/assets/;
- ссылки на страницы сайта (<a href>, переход после отправки формы, рубрики постов в JSON) → страницы копии;
  на то, чего в копии нет (товары /tproduct/, редиректы) → живой teyes-sibir.ru;
  canonical, og:url и прочие мета-ссылки не трогаются;
- вырезаны счётчики: блок <!-- Stat --> … </body> (Метрика 99532918 и статистика Tilda)
  и трекер zrok.cloud из кода шапки проекта;
- добавлен <meta name="robots" content="noindex, nofollow"> – копия не должна попасть в поиск;
- на страницах с каталогом или лентой подключён снимок assets/store/snapshot.js (его готовит store.py),
  потому что API магазина и лент Tilda не отдают данные чужому домену.
Остальное – байт в байт как отдаёт Tilda. Сайт больше LIMIT_MB – сборка падает (лимит GitHub Pages 1 ГБ).
"""
import csv
import pathlib
import re
import shutil
import sys
import urllib.parse

import tilda_urls
from assets import raw_path

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW_HTML, IMG, PUBLIC, DATA = ROOT / "raw" / "html", ROOT / "raw" / "img", ROOT / "public", ROOT / "data"
STORE = ROOT / "raw" / "store"
BASE = "/teyes-sibir-kod"  # путь копии на GitHub Pages; со своим доменом станет ""
PUBLIC_URL = "https://tema-mail.github.io" + BASE
LIVE, HOST = "https://teyes-sibir.ru", "teyes-sibir.ru"
NOINDEX = '<meta name="robots" content="noindex, nofollow" />'
LIMIT_MB = 950

ESCAPED_CDN = re.compile(r"https?:\\/\\/((?:static\d?|thb|optim|neo)\.tildacdn\.com)\\/((?:[^\"'\s)<>\\&,]|\\/)+)")
A_HREF = re.compile(r"(<a\b[^>]*?\bhref=)([\"'])(.*?)\2", re.S)
FORM_URL = re.compile(r"(\b(?:data-success-url|data-field-formmsgurl-value)=)([\"'])(.*?)\2")
ESCAPED_LINK = re.compile(r"https?:\\/\\/(?:www\.)?teyes-sibir\.ru(?:\\/[^\"\\\s]*)*")
STAT = re.compile(r"<!-- Stat -->.*?(?=</body>)", re.S)
ZROK = re.compile(r"<script>[^<]*zrok\.cloud[^<]*</script>\s*")
ROBOTS = re.compile(r"<meta\s+name=[\"'](?:robots|googlebot)[\"'][^>]*>\s*", re.I)
HEAD = re.compile(r"<head\b[^>]*>", re.I)


class Site:
    def __init__(self):
        self.files, self.pages, self.missing = {}, {}, set()
        with (DATA / "assets.csv").open(encoding="utf-8") as f:
            self.assets = [r for r in csv.DictReader(f) if r["status"] == "200"]
        self.files = {r["url"]: r["local"] for r in self.assets}
        with (DATA / "images.csv").open(encoding="utf-8") as f:
            self.images = list(csv.DictReader(f))
        self.files.update({r["url"]: r["out"] for r in self.images})
        with (DATA / "pages.csv").open(encoding="utf-8") as f:
            rows = [r for r in csv.DictReader(f) if r["status"] == "200"]
        self.page_files = sorted({r["local"] for r in rows})
        for r in rows:
            path = urllib.parse.urlsplit(r["url"]).path.rstrip("/").lower() or "/"
            self.pages[path] = r["local"]

    def asset(self, res, original):
        if res and res[0] in self.files:
            return f"{BASE}/{self.files[res[0]]}"
        self.missing.add(res[0] if res else original)
        return original

    def cdn(self, text):
        """Адреса Tilda и Google Fonts → файлы копии (и в обычном виде, и в JSON с \\/)."""
        def escaped(m):
            res = tilda_urls.resource(m.group(1), m.group(2).replace("\\/", "/"))
            new = self.asset(res, m.group(0))
            return m.group(0) if new == m.group(0) else new.replace("/", "\\/")
        text = ESCAPED_CDN.sub(escaped, text)
        text = tilda_urls.CDN.sub(lambda m: self.asset(tilda_urls.resource(m.group(1), m.group(2)), m.group(0)), text)
        return tilda_urls.GFONTS_CSS.sub(lambda m: self.asset(tilda_urls.gfonts(m.group(0)), m.group(0)), text)

    def link(self, url):
        p = urllib.parse.urlsplit(url)
        if p.scheme in ("http", "https"):
            if (p.hostname or "").removeprefix("www.") != HOST:
                return url
        elif p.scheme or p.netloc or not url.startswith("/") or url.startswith(f"{BASE}/assets/"):
            return url  # #якорь, tel:, mailto:, относительные, уже переписанные файлы копии
        tail = (f"?{p.query}" if p.query else "") + (f"#{p.fragment}" if p.fragment else "")
        local = self.pages.get(urllib.parse.unquote(p.path).rstrip("/").lower() or "/")
        if local is None:
            return f"{LIVE}{p.path or '/'}{tail}"
        return f"{BASE}/{local.removesuffix('index.html')}{tail}"

    def page(self, local):
        text = (RAW_HTML / local).read_text("utf-8")
        text, stat = STAT.subn("", text, count=1)
        text = ZROK.sub("", text)
        text = ROBOTS.sub("", text)
        head = NOINDEX
        if ("t_store_init(" in text or "t_feed_init(" in text) and (STORE / "snapshot.js").exists():
            head += f'\n<script src="{BASE}/assets/store/snapshot.js"></script>'
        text = HEAD.sub(lambda m: f"{m.group(0)}\n{head}", text, count=1)
        text = self.cdn(text)
        text = text.replace(f'content="{BASE}/', f'content="{PUBLIC_URL}/')  # og:image – только полный адрес
        for attr in (A_HREF, FORM_URL):
            text = attr.sub(lambda m: f"{m.group(1)}{m.group(2)}{self.link(m.group(3))}{m.group(2)}", text)
        text = ESCAPED_LINK.sub(lambda m: self.link(m.group(0).replace("\\/", "/")).replace("/", "\\/"), text)
        write(local, text)
        return stat

    def css(self, url, local):
        text = raw_path(url).read_text("utf-8", "ignore")
        refs = tilda_urls.css_refs(text, url)
        def sub(m):
            ref = m.group(2).strip()
            return f'url("{self.asset(refs[ref], ref)}")' if ref in refs else m.group(0)
        write(local, tilda_urls.CSS_URL.sub(sub, text))


def write(local, text):
    out = PUBLIC / local
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, "utf-8")


def copy(src, local):
    out = PUBLIC / local
    out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, out)


def main():
    site = Site()
    shutil.rmtree(PUBLIC, ignore_errors=True)
    PUBLIC.mkdir()
    (PUBLIC / ".nojekyll").write_text("")
    no_stat = [local for local in site.page_files if not site.page(local)]
    images = {r["url"] for r in site.images}
    for r in site.assets:
        if r["url"] in images:
            continue
        if r["kind"] == "css":
            site.css(r["url"], r["local"])
        elif r["kind"] == "js" and "/ws/" in r["local"]:
            write(r["local"], site.cdn(raw_path(r["url"]).read_text("utf-8", "ignore")))
        else:
            copy(raw_path(r["url"]), r["local"])
    for r in site.images:
        copy(IMG / r["out"], r["out"])
    for f in sorted(STORE.glob("*.js")) + sorted(STORE.glob("*.json")):
        text = f.read_text("utf-8")
        # в лентах обложки постов – свои файлы; в каталогах фото товаров остаются на CDN Tilda (этап 2)
        write(f"assets/store/{f.name}", site.cdn(text) if text.startswith('{"feeduid"') else text)
    size = sum(f.stat().st_size for f in PUBLIC.rglob("*") if f.is_file()) / 2**20
    print(f"страниц {len(site.page_files)}, ресурсов {len(site.assets)}, сайт {size:.0f} МБ")
    if no_stat:
        print(f"без блока счётчиков: {len(no_stat)} (например {no_stat[0]})")
    if site.missing:
        print(f"не скачаны, остались ссылками на Tilda: {len(site.missing)}")
        for u in sorted(site.missing)[:10]:
            print(f"  {u}")
    if size > LIMIT_MB:
        sys.exit(f"Сайт {size:.0f} МБ больше лимита {LIMIT_MB} МБ")


if __name__ == "__main__":
    main()
