"""Шаг 7. Данные мега-меню «Услуги» и «Магазин» → data/menu.json (его встраивает build.py).

Всё берётся из живых страниц копии: адреса – только существующие страницы (иначе ошибка), подписи марок –
с кнопок сайта (заголовки многих страниц на Tilda ошибочны: «Установка Teyes на Subaru» у Audi и т.п.),
порядок марок – как на сайте, картинки плиток – фото со страниц сайта, число товаров – из снимка каталогов
(data/store.csv, raw/store). Пустые разделы магазина и дубли <uid>-<марка> в меню не попадают.
Раскладка разделов и групп ниже – единственное, что задано руками.
"""
import csv
import html
import json
import pathlib
import re
import sys
import urllib.parse
from collections import Counter, defaultdict

import build

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA, PUBLIC, STORE = ROOT / "data", ROOT / "public", ROOT / "raw" / "store"
SITE = build.LIVE
CONTACTS = {"phone": "+7 (995) 437-92-66", "tel": "tel:+79954379266", "book": "#popup:zapisizxedera",
            "address": "Новосибирск, ул. Сухарная 35, корпус 13", "hours": "пн–пт с 11:00 до 19:00"}
CTA = "Не знаете, что выбрать? Оставьте заявку – подберём под вашу машину и назовём цену."

# Страна марки – для групп в развороте. Марки без страны попадают в «Другие».
COUNTRY = {
    "Япония": "toyota lexus honda nissan infiniti mazda subaru mitsubishi suzuki daihatsu isuzu hijet move yrv",
    "Корея": "hyundai kia ssangyong",
    "Китай": "haval greatwall geely chery byd gac changan baic faw dongfeng foton jac lifan zotye leopaard maxus roewe mg",
    "Европа": "mercedes bmw audi volkswagen skoda porsche porche opel peugeot citroen renault dacia fiat volvo landrover "
              "seat iveco maserati 3-series-f30 7-series-f01",
    "США": "ford chevrolet jeep lincoln cadillac buick gmc hummer",
    "Россия": "lada gaz uaz",
}
COUNTRY = {slug: c for c, slugs in COUNTRY.items() for slug in slugs.split()}
# Подписи там, где на сайте нет кнопки с названием (страницы моделей на уровне марки, приложения)
# или на кнопке опечатка («Shevrolet», «Сhery» с русской С, «Sitroen», «Porshe») – эти подписи главнее кнопок
FIXED = {"chevrolet": "Chevrolet", "chery": "Chery", "citroen": "Citroen", "porche": "Porsche", "gaz": "ГАЗ", "uaz": "УАЗ"}
NAMES = {**FIXED, "3-series-f30": "BMW 3 Series F30", "7-series-f01": "BMW 7 Series F01", "hijet": "Daihatsu Hijet",
         "move": "Daihatsu Move", "yrv": "Daihatsu YRV", "greatwall": "Great Wall", "porche": "Porsche",
         "landrover": "Land Rover", "ssangyong": "SsangYong", "mg": "MG", "faw": "FAW", "jac": "JAC", "gmc": "GMC",
         "baic": "BAIC", "byd": "BYD", "gac": "GAC", "gaz": "ГАЗ", "uaz": "УАЗ",
         "changan_app": "Changan", "cherryapp": "Chery", "eadoplus_app": "Changan Eado Plus", "exeedapp": "Exeed",
         "havalapp": "Haval", "jaecooapp": "Jaecoo", "jetourapp": "Jetour", "omodaapp": "Omoda", "tankapp": "Tank"}

SERVICES = [
    {"id": "teyes", "title": "Установка Teyes", "href": "/services/installation_teyes",
     "img": "assets/tild3631-3161-4233-b566-626262383765/Group_1171274811.webp", "brands": "/multimedia_teyes/"},
    {"id": "noise", "title": "Шумоизоляция", "href": "/services/installing_sound_insulation",
     "img": "assets/tild3330-3236-4833-b836-633165663633/4wAAAgG5KeA-1920.webp"},
    {"id": "audio", "title": "Автозвук", "href": "/services/installing_car_audio",
     "img": "assets/tild3762-6530-4939-b034-363762646263/Rectangle_30468.webp"},
    {"id": "alarm", "title": "Сигнализации", "href": "/services/alarm_installation",
     "img": "assets/tild3864-6236-4563-b263-373766663637/Rectangle_30468_1.webp",
     "groups": [("Охрана и автозапуск", None, [("Установка сигнализаций", "/services/alarm_installation"),
                                               ("Сигнализации StarLine", "/services/starline"),
                                               ("Сигнализации в магазине", "/store/signaling")])]},
    {"id": "rus", "title": "Русификация и приложения", "href": "/services/russification_of_cars",
     "img": "assets/tild6132-3439-4731-a530-623231613763/image_28_1.webp", "rus": True},
    {"id": "cams", "title": "Камеры и мониторы", "href": None,
     "img": "assets/tild3835-3466-4735-b563-323832623664/work_06.webp",
     "groups": [("Обзор и запись", None, [("Круговой обзор 360°", "/services/camera360"),
                                          ("Видеорегистраторы", "/services/dashcam")]),
                ("Мониторы", None, [("Потолочные мониторы", "/services/ceiling-monitors"),
                                    ("Мониторы для задних пассажиров", "/services/rear-seat-monitors")])]},
    {"id": "comfort", "title": "Комфорт и подогрев", "href": None,
     "img": "assets/tild3364-6332-4461-b330-343031653261/image_11.webp",
     "groups": [("Двери и багажник", None, [("Доводчики дверей", "/services/closers"),
                                            ("Электропривод багажника", "/services/power-tailgate")]),
                ("Тепло", None, [("Подогрев сидений", "/services/seat-heating"),
                                 ("Автономные отопители", "/services/installation_of_heating_devices")])]},
    {"id": "film", "title": "Тонировка и защита", "href": None,
     "img": "assets/tild6132-3362-4166-b536-633733323762/image.webp",
     "groups": [("Плёнки", None, [("Тонировка", "/tinting"), ("Бронирование плёнкой", "/protective_film")])]},
]
STORE_SECTIONS = [
    {"id": "teyes", "title": "Магнитолы Teyes", "href": "/store/catalog_teyes",
     "img": "assets/tild3539-6661-4439-b438-346434386535/184549ad-5ac1-4176-8.webp"},
    {"id": "kits", "title": "Комплекты Teyes", "href": "/store/catalog", "brands": "/store/catalog/",
     "img": "assets/tild3631-3161-4233-b566-626262383765/Group_1171274811.webp"},
    {"id": "cams", "title": "Камеры Teyes", "href": "/store/camera",
     "img": "assets/tild3565-3635-4463-a364-313063396337/f69df2bd-6e61-465b-a.webp",
     "groups": [("Камеры", None, [("Камеры Teyes", "/store/camera"), ("Омыватели камер", "/store/camera_washers")])]},
    {"id": "audio", "title": "Автозвук", "href": "/store/autosound",
     "img": "assets/tild3433-3965-4665-b165-336639326431/6e70c1d9-a59e-40ad-8.webp"},
    {"id": "closers", "title": "Доводчики и электроприводы", "href": "/store/closers",
     "img": "assets/tild3834-3832-4238-b763-373366653339/c5cb099c-1ec7-46d4-9.webp"},
    {"id": "acc", "title": "Дополнительное оборудование", "href": "/store/accessories",
     "img": "assets/tild6330-6335-4232-b831-653131643233/12d48b74-acb8-47a1-a.webp"},
    {"id": "alarm", "title": "Автосигнализации", "href": "/store/signaling",
     "img": "assets/tild3530-3033-4533-b863-306264363039/322c5411-a795-44ed-9.webp"},
    {"id": "sale", "title": "Акции и распродажи", "href": "/store/action",
     "img": "assets/tild6631-3061-4438-a165-316662626437/db50e8aa-aea2-4385-b.webp"},
]


def plural(n, one, few, many):
    t, h = n % 10, n % 100
    word = one if t == 1 and h != 11 else few if 2 <= t <= 4 and not 10 <= h < 20 else many
    return f"{n} {word}"


class Menu:
    def __init__(self):
        self.site = build.Site()
        with (DATA / "pages.csv").open(encoding="utf-8") as f:
            self.paths = sorted({urllib.parse.urlsplit(r["url"]).path for r in csv.DictReader(f)
                                 if r["status"] == "200" and not r["alias_of"]})
        self.labels, self.order = self.button_labels()
        self.totals = self.store_totals()
        self.missing = []

    def link(self, path):
        """Путь сайта → адрес в копии; несуществующая страница – ошибка сборки меню."""
        url = self.site.link(SITE + path)
        if not url.startswith(f"{build.BASE}/"):
            self.missing.append(path)
        return url

    def img(self, local):
        if not (PUBLIC / local).is_file():
            self.missing.append(local)
        return f"{build.BASE}/{local}"

    def button_labels(self):
        """Подписи и порядок марок с кнопок Zero-блоков сайта: {путь: подпись}, [пути по порядку]."""
        labels, order = defaultdict(Counter), {}
        pattern = re.compile(r"<a class='tn-atom' href=\"" + re.escape(build.BASE) + r"(/[^\"#?]+?)/?\">\s*"
                             r"<div class='tn-atom__button-content'>(?:\s*<span class='tn-atom__button-icon[^>]*></span>)?"
                             r"\s*<span class=\"tn-atom__button-text\">([^<]{1,40})</span>")
        for page in ("multimedia_teyes/index.html", "store/catalog/index.html"):
            for n, (path, text) in enumerate(pattern.findall((PUBLIC / page).read_text("utf-8"))):
                labels[path][html.unescape(text).strip()] += 1
                order.setdefault(path, n)
        return {p: c.most_common(1)[0][0] for p, c in labels.items()}, order

    def store_totals(self):
        """Число товаров на странице каталога – total первого запроса товаров в снимке."""
        totals = {}
        with (DATA / "store.csv").open(encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if '"getproductslist"' not in r["key"] or '["slice","1"]' not in r["key"] or not r["file"]:
                    continue
                text = (STORE / r["file"]).read_text("utf-8")
                path = "/" + r["page"].removesuffix("index.html").strip("/")
                totals.setdefault(path, 0 if text.startswith("ERROR") else int(json.loads(text).get("total") or 0))
        return totals

    def brand_groups(self, prefix, counts):
        """Марки раздела по странам, внутри – порядок кнопок сайта; counts: {путь: число} или None."""
        groups = defaultdict(list)
        for path in self.paths:
            slug = path.removeprefix(prefix)
            if not path.startswith(prefix) or "/" in slug or re.match(r"\d+-", slug):
                continue
            if counts is not None and not counts.get(path):
                continue  # пустой раздел магазина («Category is not found» или 0 товаров)
            name = FIXED.get(slug) or self.labels.get(path) or NAMES.get(slug) or slug.capitalize()
            item = {"name": name, "href": self.link(path)}
            if counts:
                item["meta"] = str(counts[path])
            groups[COUNTRY.get(slug, "Другие")].append((self.order.get(path, 999), item))
        names = [c for c in ("Япония", "Корея", "Китай", "Европа", "США", "Россия", "Другие") if groups[c]]
        return [{"name": c, "items": [i for _, i in sorted(groups[c], key=lambda x: x[0])]} for c in names]

    def rus_groups(self):
        def title(path):
            local = self.site.pages[path.rstrip("/").lower()]
            m = re.search(r"<title>Русификация (.+?) в Новосибирске", (ROOT / "raw" / "html" / local).read_text("utf-8"))
            name = html.unescape(m.group(1)) if m else path.strip("/")
            return name[:1].upper() + name[1:]
        rus = [p for p in self.paths if re.fullmatch(r"/[a-z_]+rus|/zeekr_001(_facelift_2025)?", p)]
        apps = [p for p in self.paths if p.strip("/") in NAMES and p.strip("/").endswith("app")]
        return [{"name": "Русификация по маркам", "href": self.link("/services/russification_of_cars"),
                 "items": sorted(({"name": title(p), "href": self.link(p)} for p in rus), key=lambda i: i["name"])},
                {"name": "Приложения в штатную магнитолу", "href": self.link("/installing_applications"),
                 "items": sorted(({"name": NAMES[p.strip("/")], "href": self.link(p)} for p in apps),
                                 key=lambda i: i["name"])}]

    def section(self, s, store):
        out = {"id": s["id"], "title": s["title"], "img": self.img(s["img"]),
               "href": self.link(s["href"]) if s.get("href") else None}
        if s.get("brands") and not store:
            out["groups"] = self.brand_groups(s["brands"], None)
            models = sum(1 for p in self.paths if p.startswith(s["brands"]) and p.count("/") == 3)
            out["meta"] = f"{plural(sum(len(g['items']) for g in out['groups']), 'марка', 'марки', 'марок')} · " \
                          f"{plural(models, 'модель', 'модели', 'моделей')}"
        elif s.get("brands"):
            out["groups"] = self.brand_groups(s["brands"], self.totals)
            n = sum(int(i["meta"]) for g in out["groups"] for i in g["items"])
            out["meta"] = f"{plural(sum(len(g['items']) for g in out['groups']), 'марка', 'марки', 'марок')} · " \
                          f"{plural(n, 'комплект', 'комплекта', 'комплектов')}"
        elif s.get("rus"):
            out["groups"] = self.rus_groups()
            out["meta"] = " · ".join(plural(len(g["items"]), "марка", "марки", "марок") if i == 0 else
                                     plural(len(g["items"]), "приложение", "приложения", "приложений")
                                     for i, g in enumerate(out["groups"]))
        elif s.get("groups"):
            out["groups"] = [{"name": name, "href": self.link(href) if href else None,
                              "items": [{"name": n, "href": self.link(h)} for n, h in items]}
                             for name, href, items in s["groups"]]
            out["meta"] = plural(sum(len(g["items"]) for g in out["groups"]), "раздел", "раздела", "разделов")
        if store and s.get("href") and not s.get("brands"):
            total = self.totals.get(s["href"])
            if total:
                out["meta"] = plural(total, "товар", "товара", "товаров")
        return out


def main():
    m = Menu()
    data = {**CONTACTS, "cta": CTA, "menus": {
        "services": {"label": "Услуги", "all": {"title": "Все услуги", "href": m.link("/services"), "text": CTA},
                     "sections": [m.section(s, False) for s in SERVICES]},
        "store": {"label": "Магазин", "all": {"title": "Все товары", "href": m.link("/store"),
                                              "text": "Магнитолы Teyes, комплекты под вашу машину и оборудование – "
                                                      "с установкой в нашем центре."},
                  "sections": [m.section(s, True) for s in STORE_SECTIONS]}}}
    if m.missing:
        sys.exit(f"В меню ссылки на то, чего нет в копии: {sorted(set(m.missing))}")
    (DATA / "menu.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), "utf-8")
    for key, menu in data["menus"].items():
        links = sum(len(g["items"]) for s in menu["sections"] for g in s.get("groups", []))
        print(f"{menu['label']}: разделов {len(menu['sections'])}, ссылок в разворотах {links}")
        for s in menu["sections"]:
            print(f"  {s['title']}: {s.get('meta', '')}")


if __name__ == "__main__":
    main()
