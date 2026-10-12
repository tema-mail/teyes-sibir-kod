"""Адреса ресурсов Tilda в HTML, CSS и JS: поиск и раскладка по файлам копии.

Общий модуль для assets.py (что скачать) и build.py (на что заменить).
Ресурс описывается парой (адрес для скачивания, путь в копии без BASE).
Заглушки ленивой подгрузки (thb …/-/resize/20x/, -/resizeb/20x/, -/empty/) качаются как есть — крошечные;
остальные варианты thb/optim (уменьшенные, webp) сводятся к оригиналу со static.
"""
import hashlib
import re
import urllib.parse

CDN = re.compile(r"(?:https?:)?//((?:static\d?|thb|optim|neo)\.tildacdn\.com)/([^\"'\s)<>\\&,]+)")
GFONTS_CSS = re.compile(r"https://fonts\.googleapis\.com/css2?\?[^\"'\s<>)]+")
CSS_URL = re.compile(r"url\(\s*([\"']?)([^\"')]+?)\1\s*\)")
TINY_OPS = ("/-/empty/", "/-/resize/20x/", "/-/resizeb/20x/")
IMG_EXT = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico", ".bmp", ".avif")


def unescape(text):
    """JSON внутри HTML пишет https:\\/\\/static… — приводим к обычному виду для поиска."""
    return text.replace("\\/", "/")


def resource(host, path):
    """Хост и путь Tilda → (адрес для скачивания, путь в копии) или None, если это не файл."""
    path = path.split("?")[0].split("#")[0]
    if not path or path.endswith("/"):
        return None
    if host.startswith("static"):
        return f"https://static.tildacdn.com/{path}", f"assets/{path}"
    if host == "neo.tildacdn.com":
        return f"https://neo.tildacdn.com/{path}", f"assets/neo/{path}"
    if "/-/" not in f"/{path}":
        return f"https://static.tildacdn.com/{path}", f"assets/{path}"
    if any(op in f"/{path}" for op in TINY_OPS):
        return f"https://{host}/{path}", f"assets/thb/{path.replace('/-/', '/_/')}"
    parts = path.split("/")
    name = parts[-1]
    stem, ext = name.rsplit(".", 1) if "." in name else (name, "")
    if ext == "webp" and stem.lower().endswith(IMG_EXT):
        name = stem  # …/-/format/webp/photo.png.webp → photo.png
    return f"https://static.tildacdn.com/{parts[0]}/{name}", f"assets/{parts[0]}/{name}"


def gfonts(url):
    """Стили Google Fonts → (адрес, путь в копии); имя файла — по хешу запроса."""
    url = url.replace("&amp;", "&")
    return url, f"assets/fonts/g{hashlib.md5(url.encode()).hexdigest()[:10]}.css"


def find(text):
    """Все ресурсы в тексте: {исходная строка адреса: (адрес для скачивания, путь в копии)}."""
    found = {}
    for m in CDN.finditer(unescape(text)):
        res = resource(m.group(1), m.group(2))
        if res:
            found[m.group(0)] = res
    for m in GFONTS_CSS.finditer(text):
        found[m.group(0)] = gfonts(m.group(0))
    return found


def css_refs(css, css_url):
    """url(...) из CSS → {как записано: (абсолютный адрес, путь в копии)}; только Tilda и шрифты Google."""
    found = {}
    for m in CSS_URL.finditer(css):
        ref = m.group(2).strip()
        if ref.startswith(("data:", "#")):
            continue
        full = urllib.parse.urljoin(css_url, ref)
        p = urllib.parse.urlsplit(full)
        host = p.hostname or ""
        if host.endswith("tildacdn.com"):
            res = resource(host, p.path.lstrip("/"))
        elif host == "fonts.gstatic.com":
            res = (f"https://fonts.gstatic.com{p.path}", f"assets/fonts/gstatic{p.path}")
        else:
            res = None
        if res:
            found[ref] = res
    return found
