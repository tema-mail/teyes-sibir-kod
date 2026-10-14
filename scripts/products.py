"""Этап 2, шаг 2. Товары магазина для раздела на Astro: site/src/data/products.json + catalog.json и фото.

Источник – снимок API магазина Tilda, который уже собран store.py (raw/store, data/store.csv): в Tilda ничего
не пишем и заново не опрашиваем. Каждый товар один раз (по uid), адрес – как у Tilda
(/store/catalog/<марка>/tproduct/<uid>-<slug>). Варианты (editions: «Модель 6+64Gb» со своей ценой),
доп. опции с доплатой (properties «…=+5500»), характеристики и метки NEW/SALE сохраняются.
Владелец 14.10.2026: «по одному товару с категории, чтобы не занимать место» – на сайт идут PER_SECTION
товаров каждой категории (первые по порядку сайта, с фото); всех товаров в категории – в catalog.json (total).
Фото выбранных: оригиналы в raw/products/, в site/public/img/p/ – одна копия 720 px WebP q72 на картинку
(одинаковые по содержимому склеиваются), лишние файлы прошлых запусков удаляются.
Названия марок – из data/menu.json (там опечатки кнопок сайта уже исправлены).
"""
import csv
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA, STORE = ROOT / "data", ROOT / "raw" / "store"
ORIG, OUT_IMG = ROOT / "raw" / "products", ROOT / "site" / "public" / "img" / "p"
OUT_DATA = ROOT / "site" / "src" / "data"
SIDE, QUALITY, WORKERS = 720, 72, 8
PER_SECTION = 1  # товаров на категорию на сайте; все – None (тогда ≈90 МБ фото и 2 167 страниц)
EDITION_SERVICE = {"uid", "externalid", "sku", "price", "priceold", "quantity", "img"}
MODEL = re.compile(r"Teyes\s+(LUX\s*ONE|CC4\s*Pro|CC4L|CC4|CC3\s*2K|CC3L\s*Pro|CC3L|CC3|SPRO\s*Plus|SPRO|TPRO\s*2|TPRO|X1|CC2\s*Plus|CC2L|CC2)", re.I)


def money(value):
    try:
        return round(float(str(value).replace(" ", "").replace(",", ".") or 0))
    except ValueError:
        return 0


def snapshot_products():
    """Все товары из снимка: {uid: товар} – по первому встреченному, порядок как на сайте."""
    found = {}
    with (DATA / "store.csv").open(encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if '"getproductslist"' in r["key"] and r["file"]]
    for r in rows:
        text = (STORE / r["file"]).read_text("utf-8")
        if text.startswith("ERROR"):
            continue
        for p in json.loads(text)["products"]:
            found.setdefault(p["uid"], p)
    return found


def addons(props):
    """Доп. опции с доплатой: «Видеорегистратор Teyes X5 5500 руб=+5500» → {label, price}."""
    out = []
    for prop in props or []:
        if (prop.get("params") or {}).get("type") != "multi":
            continue
        for line in str(prop.get("values") or "").splitlines():
            label, _, plus = line.strip().partition("=+")
            if label:
                out.append({"label": label.strip(), "price": money(plus)})
    return out


def editions(p):
    out = []
    for e in p.get("editions") or []:
        opts = {k: v for k, v in e.items() if k not in EDITION_SERVICE and v not in ("", None)}
        if opts:
            out.append({"id": str(e["uid"]), "options": opts, "price": money(e.get("price")),
                        "priceOld": money(e.get("priceold")), "stock": str(e.get("quantity") or "")})
    return out


def normalize(p, brands):
    path = urllib.parse.unquote(urllib.parse.urlsplit(p["url"]).path).rstrip("/")
    m = re.match(r"/store/catalog/([^/]+)/tproduct/", path)
    section = m.group(1) if m else "teyes" if path.startswith("/store/catalog_teyes/") else "catalog"
    chars = [{"title": c["title"], "value": c["value"]} for c in p.get("characteristics") or [] if c.get("value")]
    model = next((c["value"] for c in chars if c["title"].lower().startswith("модель магнитолы")), "")
    if not model:
        mm = MODEL.search(p["title"])
        model = re.sub(r"\s+", " ", mm.group(1)).upper().replace("PRO", "Pro").replace("PLUS", "Plus") if mm else ""
    options = [{"title": o["title"], "values": o.get("values") or []}
               for o in json.loads(p.get("json_options") or "[]") if o.get("title")]
    return {
        "id": str(p["uid"]), "path": path, "section": section, "brand": brands.get(section, ""),
        "title": p["title"].strip(), "descr": (p.get("descr") or "").strip(), "text": p.get("text") or "",
        "price": money(p["price"]), "priceOld": money(p.get("priceold")), "mark": p.get("mark") or "",
        "model": model, "sort": p.get("sort") or 0, "options": options, "editions": editions(p),
        "addons": addons(p.get("properties")), "characteristics": chars,
        "gallery": [g["img"] for g in json.loads(p.get("gallery") or "[]") if g.get("img")],
    }


def fetch(url):
    name = hashlib.md5(url.encode()).hexdigest() + pathlib.PurePosixPath(urllib.parse.urlsplit(url).path).suffix.lower()
    out = ORIG / name
    if not (out.exists() and out.stat().st_size):
        tmp = out.with_name(name + ".part")
        res = subprocess.run(["curl", "-sS", "-L", "--max-time", "120", "--retry", "2", "-o", str(tmp), "-w", "%{http_code}", url],
                             capture_output=True, text=True)
        if res.stdout.strip() != "200":
            tmp.unlink(missing_ok=True)
            return url, None
        tmp.replace(out)
    return url, out


def webp(src):
    """Оригинал → img/p/<хеш содержимого>.webp; одинаковые картинки дают один файл."""
    name = hashlib.sha1(src.read_bytes()).hexdigest()[:16] + ".webp"
    dst = OUT_IMG / name
    if not dst.exists():
        with Image.open(src) as im:
            im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P", "PA") or "transparency" in im.info else "RGB")
            im.thumbnail((SIDE, SIDE), Image.LANCZOS)
            tmp = dst.with_name(name + ".part")
            im.save(tmp, "WEBP", quality=QUALITY, method=5)
            tmp.replace(dst)
    return name


def main():
    menu = json.loads((DATA / "menu.json").read_text("utf-8"))
    kits = next(s for s in menu["menus"]["store"]["sections"] if s["id"] == "kits")
    brands, countries = {}, {}
    for g in kits["groups"]:
        for i in g["items"]:
            slug = i["href"].rstrip("/").rsplit("/", 1)[-1]
            brands[slug], countries[slug] = i["name"], g["name"]
    raw = snapshot_products()
    every = [normalize(p, brands) for p in raw.values()]
    every.sort(key=lambda p: (p["section"], not p["gallery"], p["sort"], p["title"]))
    totals, products = {}, []
    for p in every:
        totals[p["section"]] = totals.get(p["section"], 0) + 1
        if PER_SECTION is None or totals[p["section"]] <= PER_SECTION:
            products.append(p)
    urls = sorted({u for p in products for u in p["gallery"]})
    print(f"товаров {len(products)}, фото {len(urls)}", flush=True)
    ORIG.mkdir(parents=True, exist_ok=True)
    OUT_IMG.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(WORKERS) as pool:
        files = dict(pool.map(fetch, urls))
    names, failed = {}, [u for u, f in files.items() if not f]
    with ThreadPoolExecutor(WORKERS) as pool:
        for url, name in zip([u for u, f in files.items() if f], pool.map(webp, [f for f in files.values() if f])):
            names[url] = name
    for p in products:
        p["images"] = [names[u] for u in p.pop("gallery") if u in names]
    for old in OUT_IMG.glob("*.webp"):  # фото товаров, которых больше нет на сайте
        if old.name not in set(names.values()):
            old.unlink()
    sections = {}
    for p in products:
        s = sections.setdefault(p["section"], {"slug": p["section"], "name": p["brand"] or p["section"],
                                               "country": countries.get(p["section"], ""), "count": 0,
                                               "total": totals[p["section"]]})
        s["count"] += 1
    OUT_DATA.mkdir(parents=True, exist_ok=True)
    (OUT_DATA / "products.json").write_text(json.dumps(products, ensure_ascii=False, separators=(",", ":")), "utf-8")
    (OUT_DATA / "catalog.json").write_text(json.dumps({"sections": sorted(sections.values(), key=lambda s: s["slug"])},
                                                      ensure_ascii=False, indent=1), "utf-8")
    size = sum(f.stat().st_size for f in OUT_IMG.glob("*.webp")) / 2**20
    print(f"фото в WebP: {len(set(names.values()))} файлов, {size:.0f} МБ; не скачались: {len(failed)}")
    for u in failed[:10]:
        print(f"  {u}")
    no_img = sum(1 for p in products if not p["images"])
    print(f"разделов {len(sections)}, на сайт товаров {len(products)} из {len(every)}, без фото {no_img}, "
          f"без модели Teyes {sum(1 for p in products if not p['model'])}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
