"""Новые товары из съёма teyes.com.ru (scripts/teyes_com_ru.py → raw/teyes-com-ru/) в магазин на коде.

Что делает: берёт карточки, которых у нас нет, и дописывает их в site/src/data/products.json, фото – 720 px WebP
q72 в site/public/img/p/ (как products.py: имя по хешу содержимого, одинаковые фото – один файл).
Решения владельца 10.11.2026: аксессуары (рамки, адаптеры, провода, камеры) – все; магнитолы – только на машины,
которых у нас нет и на которые есть спрос; цены – teyes.com.ru для Новосибирска на дату съёма; описание
источника НЕ берём – только наш текст по данным карточки (характеристики, совместимость, установка у нас).
Существующие товары и правки админки не трогает: только добавляет новые id (префикс 8…), повторный запуск
пропускает уже добавленные.

  .venv/bin/python scripts/import_teyes_com_ru.py --accessories        # аксессуары → /store/accessories/
  .venv/bin/python scripts/import_teyes_com_ru.py --head-units hu.txt  # магнитолы по списку отобранных адресов
  .venv/bin/python scripts/import_teyes_com_ru.py --dry-run ...        # только посчитать
"""
import argparse, hashlib, html, json, re
from datetime import date
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'raw' / 'teyes-com-ru'
PRODUCTS = ROOT / 'site' / 'src' / 'data' / 'products.json'
CATALOG = ROOT / 'site' / 'src' / 'data' / 'catalog.json'
OUT_IMG = ROOT / 'site' / 'public' / 'img' / 'p'
SIDE, QUALITY = 720, 72
# Фото на карточку: копия на Pages упирается в лимит 1 ГБ (сайт ~0,84 ГБ). Все снятые фото остаются в raw/ –
# на боевом сервере лимита нет, число можно поднять и перезалить.
PHOTOS_ACCESSORY, PHOTOS_HEAD_UNIT = 2, 4
SOURCE_DATE = date.today().strftime('%d.%m.%Y')
INSTALL = 'Сухарная 35, корпус 13'  # адрес установочного центра – как в PERKS карточки (site/src/data/card-details.ts)

# Тип аксессуара – по началу названия; он же фильтр каталога (поле model)
KINDS = [
    (r'^(переходная )?рамка', 'Рамка'),
    (r'^адаптер под (заднюю|переднюю)', 'Адаптер камеры'),
    (r'^(проводка|комплект проводов|кабель|teyes cable|type-c|android переходник|оптический мост)', 'Провода и переходники'),
    (r'^(камера|камеры|цифровая камера)', 'Камера'),
    (r'(парктроник|парковочный датчик)', 'Парктроники'),
]
SKIP = r'^(штатная магнитола|магнитола|уценка|планшет)'  # магнитолы идут отдельным шагом, уценку не берём

# Раздел /store/accessories/ – решение владельца 10.11.2026: сначала то, что ставим чаще всего; проводку питания,
# адаптеры под камеры, оптические MOST-адаптеры, переходники HDMI и дисплеи на замену не продаём. GROUPS – типы по порядку показа
# (он же порядок чипов фильтра), тип ищется по названию; рамки остаются рамками, прочее – «Другое» в конце.
DROP = r'^(адаптер под|переходник|дисплей для замены|комплект проводов|проводка питания|bc12|оптический most)'
GROUPS = [
    ('Камеры 360', r'360|кругового обзора'),
    ('Камеры заднего и переднего вида', r'камера (заднего|переднего)'),
    ('Микрофоны', r'микрофон'),
    ('OBD-сканеры', r'obd'),
    ('Видеорегистраторы', r'видеорегистратор|dvr|карта памяти'),
    ('Доводчики', r'доводчик'),
    ('GPS-антенны', r'gps антенна'),
    ('Голосовой помощник Hanna', r'hanna'),
    ('Фильтры помех', r'фильтр.*помех'),
    ('Кабели', r'^кабель|^удлинитель'),
    ('Парктроники', r'парктроник|парковочный датчик'),
    ('Датчики давления в шинах', r'tpms|давления в шинах'),
    ('Пластины', r'^пластины|bracket'),
    ('Кнопки', r'кнопк'),
    ('Система охраны', r'система охраны'),
    ('Защитные стёкла', r'защитное стекло'),
    ('Рамка', r'рамк|frame'),
    ('Другое', r''),
]
INNER = [r'dvr-блок', r'карта памяти']  # внутри типа – в конец: регистраторы, потом блок, потом карты памяти


def dropped(title: str, kind: str) -> bool:
    t = title.lower()
    return bool(re.search(DROP, t)) or (kind == 'Проводка питания' and not re.search(r'^удлинитель', t))


def group_of(title: str, kind: str) -> str:
    if kind == 'Рамка':
        return 'Рамка'
    t = title.lower()
    return next(g for g, pat in GROUPS if re.search(pat, t))


def rank(p: dict) -> tuple:
    t = p['title'].lower()
    return ([g for g, _ in GROUPS].index(p['model']) if p['model'] in dict(GROUPS) else len(GROUPS),
            next((i + 1 for i, pat in enumerate(INNER) if re.search(pat, t)), 0))


def kind_of(item: dict) -> str:
    """Тип – из крошек источника («Аксессуары → Видеорегистраторы», «Проводка питания»), иначе по названию."""
    c = item.get('crumbs') or []
    cat = (c[2] if len(c) > 3 and c[1] == 'Аксессуары' else c[1] if len(c) > 2 else '')
    named = {'Переходные рамки': 'Рамка', 'Установочные комплекты': 'Рамка'}
    if cat:
        return named.get(cat, cat)
    t = item['title'].lower()
    return next((k for pat, k in KINDS if re.search(pat, t)), 'Другое')


def sentences(text: str, limit: int = 300) -> str:
    """Целые предложения в пределах limit – без обрыва посреди слова (было text[:300])."""
    if len(text) <= limit:
        return text
    cut = text[:limit]
    end = max(cut.rfind('. '), cut.rfind('! '), cut.rfind('? '))
    return cut[:end + 1] if end > 0 else cut.rsplit(' ', 1)[0] + '…'


def new_id(url: str) -> str:
    """Стабильный id по адресу источника: 12 цифр с префиксом 8 (у Tilda 12 цифр, у камер 9000…)."""
    return '8' + str(int(hashlib.sha1(url.encode()).hexdigest(), 16))[:11]


TR = dict(zip('абвгдеёжзийклмнопрстуфхцчшщъыьэюя', ['a', 'b', 'v', 'g', 'd', 'e', 'e', 'zh', 'z', 'i', 'y', 'k', 'l', 'm', 'n', 'o', 'p',
          'r', 's', 't', 'u', 'f', 'kh', 'ts', 'ch', 'sh', 'shch', '', 'y', '', 'e', 'yu', 'ya']))


def slug(t: str, n: int = 60) -> str:
    s = re.sub(r'[^a-z0-9]+', '-', ''.join(TR.get(c, c) for c in t.lower())).strip('-')
    return s[:n].rstrip('-')


def webp(src: Path) -> str:
    name = hashlib.sha1(src.read_bytes()).hexdigest()[:16] + '.webp'
    dst = OUT_IMG / name
    if not dst.exists():
        with Image.open(src) as im:
            im = im.convert('RGBA' if im.mode in ('RGBA', 'LA', 'P', 'PA') or 'transparency' in im.info else 'RGB')
            im.thumbnail((SIDE, SIDE), Image.LANCZOS)
            tmp = dst.with_name(name + '.part')
            im.save(tmp, 'WEBP', quality=QUALITY, method=5)
            tmp.replace(dst)
    return name


def spec(item: dict, title: str) -> str:
    return next((s['value'] for s in item['specs'] if s['title'] == title), '')


def rub(n: int) -> str:
    return f'{n:,}'.replace(',', ' ') + ' ₽'


def accessory_text(item: dict, kind: str) -> tuple[str, str]:
    """Наш текст: короткий ответ (он же description) + совместимость и установка. Только факты из карточки."""
    t, price = item['title'], item['price']
    brand, years, wheel = spec(item, 'Марка автомобиля'), spec(item, 'Год выпуска авто'), spec(item, 'Руль')
    size, din = spec(item, 'Диагональ дисплея'), spec(item, 'Типоразмер')
    ys = [int(y) for y in re.findall(r'\d{4}', years)]
    span = f'{min(ys)}–{max(ys)}' if ys else ''
    car = ' '.join(x for x in [brand, f'{span} г. в.' if span else ''] if x)
    lead = f'{t}: цена {rub(price)} в Новосибирске.'
    if kind == 'Рамка':
        lead += f' Нужна, чтобы магнитола Teyes{" с экраном " + size if size else ""} встала в штатное место{" " + brand if brand else ""} без зазоров.'
    lead += f' Ставим вместе с магнитолой в установочном центре TEYES SIBIR ({INSTALL}), совместимость проверяем по фото панели до покупки.'
    rows = [('Тип', kind), ('Марка', brand), ('Годы выпуска', span), ('Руль', wheel), ('Экран магнитолы', size), ('Типоразмер', din)]
    lis = ''.join(f'<li><strong>{k}:</strong> {html.escape(v)}</li>' for k, v in rows if v)
    body = (f'<p>{html.escape(lead)}</p>'
            + (f'<h3>Совместимость</h3><ul>{lis}</ul>' if lis else '')
            + '<h3>Как не ошибиться с подбором</h3><p>Рамка, проводка и адаптеры зависят от марки, года и комплектации'
            ' (руль, штатная камера, усилитель). Пришлите фото центральной панели в Telegram или MAX – ответим, подходит ли'
            f'{" " + html.escape(car) if car else ""} эта позиция, и что ещё понадобится для установки.</p>'
            f'<p>Цена – по прайсу teyes.com.ru для Новосибирска на {SOURCE_DATE}.</p>')
    return lead, body


def accessories(have_urls: set, dry: bool) -> list:
    out = []
    for f in sorted((RAW / 'items').glob('*.json')):
        item = json.loads(f.read_text(encoding='utf-8'))
        t = item['title']
        if not t or not item['price'] or re.search(SKIP, t.lower()) or item['url'] in have_urls:
            continue
        kind = kind_of(item)
        if kind == 'Уценка' or dropped(t, kind):  # уценённые экземпляры – разовые, в каталог не берём
            continue
        kind = group_of(t, kind)
        lead, body = accessory_text(item, kind)
        pid = new_id(item['url'])
        images = [] if dry else [webp(RAW / 'img' / u.split('/')[-1]) for u in [u for u in item['images']
                                 if (RAW / 'img' / u.split('/')[-1]).exists()][:PHOTOS_ACCESSORY]]  # сначала отбор, потом сжатие
        out.append({
            'addons': [], 'brand': spec(item, 'Марка автомобиля') or 'Teyes',
            'characteristics': [{'title': s['title'], 'value': s['value']} for s in item['specs'] if s['value']],
            'descr': sentences(lead), 'editions': [], 'id': pid, 'images': images, 'mark': '', 'model': kind,
            'options': [], 'parts': [], 'path': f'/store/accessories/tproduct/{pid}-{slug(t)}',
            'price': item['price'], 'priceOld': item['priceOld'], 'section': 'accessories', 'sort': 0,
            'text': body, 'title': t, 'source': {'url': item['url'], 'sku': item['sku'], 'date': SOURCE_DATE},
        })
    return out

# ── Магнитолы на машины, которых у нас нет ──────────────────────────────────────────────────────────────────────
# Одна карточка = модель магнитолы × машина (вариант рамки Тип-A/B – отдельная машина), как у наших CC4:
# опции «Память» и «Версия» (Обычная / 360 / 360 ADAS), цена – у каждого варианта своя.
MODEL = {'CC3L': 'CC3L', 'CC3 2K': 'CC3 2К', 'CC4 Pro': 'CC4 Pro', 'CC4L': 'CC4L', 'CC4': 'CC4', 'Lux One': 'Lux One'}
BRAND_SECTION = {'Land Rover': 'landrover', 'Mercedes-Benz': 'mercedes', 'Great Wall': 'greatwall', 'Porsche': 'porche'}
MAGNITOLY_PART = '200450602982'  # служебная часть Tilda «Магнитолы» – товар попадает в общий список магнитол
# Допы наших карточек CC3L / CC3 2К / Lux One (у CC4, CC4L, CC4 Pro их нет) – берём с существующей карточки той же модели


def head_units(only: set, products: list, have_urls: set, sections: dict, parts: dict, dry: bool) -> list:
    groups = {}
    for f in sorted((RAW / 'items').glob('shtatnaya-magnitola-teyes-*.json')):
        item = json.loads(f.read_text(encoding='utf-8'))
        if not item['price'] or item['url'] in have_urls or item['url'] not in only:
            continue
        m = re.match(r'Штатная магнитола Teyes (CC3L|CC3 2K|CC4 Pro|CC4L|CC4|Lux One)( 12\.3"?| 12,3"?)?( 360)?( ADAS)?'
                     r' (\d{1,2})/(\d{2,3})(?: S-DTS| с DTS)? (.+)$', item['title'], re.I)
        if not m:
            print('НЕ РАЗОБРАНО', item['title'])
            continue
        model, big, v360, adas, ram, rom, car = m.groups()
        model = next(k for k in MODEL if k.lower() == model.lower())  # «LUX ONE» → «Lux One»
        dts = bool(re.search(r' (S-DTS|с DTS) ', item['title']))
        key = (model, bool(big), dts, car)
        version = '360 ADAS' if adas else '360' if v360 else 'Обычная'
        groups.setdefault(key, []).append((item, f'{ram}+{rom}Gb', version))
    addons = {}
    for p in products:
        if p['addons'] and p['model'] not in addons:
            addons[p['model']] = p['addons']
    out = []
    for (model, big, dts, car), rows in groups.items():
        rows.sort(key=lambda r: (r[2] != 'Обычная', r[0]['price']))
        base = rows[0][0]
        crumbs = base['crumbs']
        brand = crumbs[2] if len(crumbs) > 3 else ''
        sec = BRAND_SECTION.get(brand, re.sub(r'[^a-z]', '', brand.lower()))
        if sec not in sections:
            print('НЕТ РАЗДЕЛА МАРКИ', brand, car)
            continue
        ourmodel = MODEL[model]
        name = f'Teyes {model}{" 12.3" if big else ""}{" с DTS" if dts else ""}'
        title = f'Штатная магнитола {name} {car}'
        mems = list(dict.fromkeys(r[1] for r in rows))
        vers = list(dict.fromkeys(r[2] for r in rows))
        options = [{'title': 'Память', 'values': mems}] + ([{'title': 'Версия', 'values': vers}] if len(vers) > 1 else [])
        editions = [{'id': new_id(it['url']), 'options': {'Память': mem, **({'Версия': ver} if len(vers) > 1 else {})},
                     'price': it['price'], 'priceOld': it['priceOld'], 'stock': ''} for it, mem, ver in rows]
        low = min(e['price'] for e in editions)
        gen = crumbs[-2] if len(crumbs) > 4 else ''
        lead = (f'{title} ставится в штатное место вместо заводской магнитолы. Цена от {rub(low)} в Новосибирске,'
                f' установка – в установочном центре TEYES SIBIR ({INSTALL}).')
        sp = {s['title']: s['value'] for s in base['specs'] if s['value']}
        facts = [('Машина', car), ('Поколение', gen), ('Модель магнитолы', name), ('Память', ', '.join(m.replace('+', '/') for m in mems)),
                 ('Версии', ', '.join(vers) if len(vers) > 1 else ''), ('Экран', sp.get('Диагональ дисплея', '')),
                 ('Разрешение', sp.get('Разрешение экрана', '') or sp.get('Разрешение', '')),
                 ('Система', sp.get('Версия системы', '')), ('Процессор', sp.get('Платформа чипа', ''))]
        lis = ''.join(f'<li><strong>{k}:</strong> {html.escape(v)}</li>' for k, v in facts if v)
        body = (f'<p>{html.escape(lead)}</p><h3>Коротко</h3><ul>{lis}</ul>'
                '<h3>Как не ошибиться с подбором</h3><p>Рамка, проводка и то, что останется от штатного (камера, кнопки руля,'
                ' усилитель), зависят от года, рынка и комплектации машины. Пришлите фото центральной панели в Telegram или MAX –'
                ' проверим совместимость до покупки и скажем, что понадобится для установки.</p>'
                f'<p>Цены – по прайсу teyes.com.ru для Новосибирска на {SOURCE_DATE}.</p>')
        pid = new_id(base['url'])
        images = [] if dry else [webp(RAW / 'img' / u.split('/')[-1]) for u in [u for u in base['images']
                                 if (RAW / 'img' / u.split('/')[-1]).exists()][:PHOTOS_HEAD_UNIT]]  # сначала отбор, потом сжатие
        out.append({
            'addons': addons.get(ourmodel, []) if ourmodel in ('CC3L', 'CC3 2К', 'Lux One') else [], 'brand': brand,
            'characteristics': [{'title': s['title'], 'value': s['value']} for s in base['specs'] if s['value']],
            'descr': sentences(lead), 'editions': editions, 'id': pid, 'images': images, 'mark': '', 'model': ourmodel,
            'options': options, 'parts': [MAGNITOLY_PART] + ([parts[brand]] if brand in parts else []),
            'path': f'/store/catalog/{sec}/tproduct/{pid}-{slug(title)}', 'price': low, 'priceOld': 0,
            'section': sec, 'sort': 0, 'text': body, 'title': title,
            'source': {'url': base['url'], 'urls': [r[0]['url'] for r in rows], 'sku': base['sku'], 'date': SOURCE_DATE},
        })
    return out


def regroup(products: list) -> tuple[list, list]:
    """Применить DROP/GROUPS к уже залитым аксессуарам: убрать лишнее, перетипизировать, расставить по порядку.
    Текст карточки, где тип сменился, собирается заново из сырья (в нём строка «Тип»). → (товары, убранные)."""
    raw = {}
    for f in (RAW / 'items').glob('*.json'):
        item = json.loads(f.read_text(encoding='utf-8'))
        raw[item['url']] = item
    rest, acc, gone = [], [], []
    for p in products:
        if p['section'] != 'accessories':
            rest.append(p)
        elif dropped(p['title'], p['model']):
            gone.append(p)
        else:
            kind = group_of(p['title'], p['model'])
            item = raw.get(p.get('source', {}).get('url'))
            if kind != p['model'] and item:
                lead, p['text'] = accessory_text(item, kind)
                p['descr'] = sentences(lead)
            p['model'] = kind
            acc.append(p)
    acc.sort(key=rank)  # sort стабильный: внутри типа – прежний порядок
    return rest + acc, gone


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--regroup', action='store_true', help='применить порядок и чистку раздела аксессуаров к залитым')
    ap.add_argument('--accessories', action='store_true')
    ap.add_argument('--head-units', metavar='URLS', help='файл с отобранными адресами магнитол (по спросу)')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    products = json.loads(PRODUCTS.read_text(encoding='utf-8'))
    have_ids = {p['id'] for p in products}
    have_urls = {u for p in products for u in [p.get('source', {}).get('url')] + p.get('source', {}).get('urls', [])}
    cat = json.loads(CATALOG.read_text(encoding='utf-8'))
    sections = {x['slug']: x for x in cat['sections']}
    parts = {x['title']: x['uid'] for x in cat['parts']}
    if a.regroup:
        rows, gone = regroup(products)
        from collections import Counter
        print('убрано', len(gone), Counter(p['model'] for p in gone).most_common())
        print('типы', [(m, n) for m, n in Counter(p['model'] for p in rows if p['section'] == 'accessories').items()])
        if a.dry_run:
            return
        keep = {i for p in rows for i in p['images']}
        for i in {i for p in gone for i in p['images']} - keep:  # фото убранных, которые больше никому не нужны
            (OUT_IMG / i).unlink(missing_ok=True)
        PRODUCTS.write_text('[\n' + ',\n'.join(json.dumps(p, ensure_ascii=False, separators=(',', ':')) for p in rows)
                            + '\n]\n', encoding='utf-8')
        for x in cat['sections']:
            if x['slug'] == 'accessories':
                x['count'] = x['total'] = sum(p['section'] == 'accessories' for p in rows)
        CATALOG.write_text(json.dumps(cat, ensure_ascii=False, indent=1), encoding='utf-8')
        return
    add = []
    if a.accessories:
        add += accessories(have_urls, a.dry_run)
    if a.head_units:
        add += head_units({u.strip() for u in open(a.head_units) if u.strip()}, products, have_urls, sections, parts, a.dry_run)
    add = [p for p in add if p['id'] not in have_ids]
    from collections import Counter
    print('новых товаров', len(add), Counter(p['model'] for p in add).most_common())
    if a.dry_run or not add:
        return
    order = list(products[0].keys())  # порядок полей как у существующих товаров, формат – как в products.py
    rows = products + [{**{k: p[k] for k in order if k in p}, **{k: v for k, v in p.items() if k not in order}} for p in add]
    PRODUCTS.write_text('[\n' + ',\n'.join(json.dumps(p, ensure_ascii=False, separators=(',', ':')) for p in rows) + '\n]\n',
                        encoding='utf-8')
    if any(p['section'] == 'accessories' for p in add) and 'accessories' not in sections:
        cat['sections'].append({'slug': 'accessories', 'name': 'Дополнительное оборудование', 'country': '', 'count': 0, 'total': 0})
        cat['sections'].sort(key=lambda x: x['slug'])
    for x in cat['sections']:  # счётчики разделов, куда добавили товары
        if any(p['section'] == x['slug'] for p in add):
            x['count'] = x['total'] = sum(p['section'] == x['slug'] for p in rows)
    for x in cat['parts']:
        if any(x['uid'] in p['parts'] for p in add):
            x['count'] = sum(x['uid'] in p['parts'] for p in rows)
    CATALOG.write_text(json.dumps(cat, ensure_ascii=False, indent=1), encoding='utf-8')
    (RAW / 'added.json').write_text(json.dumps([p['path'] for p in add], ensure_ascii=False), encoding='utf-8')
    print('записано в', PRODUCTS.relative_to(ROOT), '; фото в', OUT_IMG.relative_to(ROOT))


if __name__ == '__main__':
    main()
