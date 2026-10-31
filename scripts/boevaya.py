#!/usr/bin/env python3
"""Боевая сборка teyes-sibir.ru для своего сервера (Beget) из копии public/ и страниц на коде site/dist.

  cd site && PUBLIC_BASE=/ npm run build && cd .. && python3 scripts/boevaya.py

Пишет boevoy/ (в git не идёт) и deploy/redirects.map. Копия на GitHub Pages не меняется: она остаётся
закрытой от поиска, а боевая версия:
- живёт в корне домена: адреса /teyes-sibir-kod/… → /…, tema-mail.github.io → teyes-sibir.ru;
- открыта для поиска: meta robots noindex снят, robots.txt, sitemap.xml, 404.html, llms.txt;
- с Метрикой 99532918 (вебвизор, цели форм Tilda через window.mainMetrikaId); статистика Tilda не возвращается;
- ссылки на старые адреса (меню /teyes, /signaling…) ведут сразу на живую страницу, без редиректа;
- без мусора Tilda: служебные блоки, тестовые страницы, дубли – их адреса уходят в 301 (redirects.map);
- у разделов «Наши работы» по маркам свой title и description (на Tilda у 13 марок стояло «Subaru»);
- canonical есть у каждой страницы.
HTML хранится сжатым (index.html.gz + пустой index.html для try_files): nginx gzip_static always + gunzip.
"""
import csv, gzip, html, pathlib, re, shutil, sys, urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUB, DIST, OUT = ROOT / 'public', ROOT / 'site/dist', ROOT / 'boevoy'
KARTA = pathlib.Path.home() / 'Sites/seo-razbory/teyes-sibir-migraciya-b384ad87/data/karta.csv'
MAP = ROOT / 'deploy/redirects.map'
SITE = 'https://teyes-sibir.ru'
TEXT = {'.html', '.js', '.css', '.json', '.xml', '.txt', '.webmanifest', '.svg'}

METRIKA = ('<!-- Yandex.Metrika counter 99532918 --><script type="text/javascript">setTimeout(function(){(function(m,e,t,r,i,k,a)'
           '{m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();k=e.createElement(t),'
           'a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script",'
           '"https://mc.yandex.ru/metrika/tag.js","ym");window.mainMetrikaId=\'99532918\';ym(window.mainMetrikaId,"init",'
           '{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true,ecommerce:"dataLayer"});},2000);</script>'
           '<noscript><div><img src="https://mc.yandex.ru/watch/99532918" style="position:absolute; left:-9999px;" alt="" />'
           '</div></noscript><!-- /Yandex.Metrika counter -->')

# Мусор Tilda (разбор 01.11.2026, ~/Sites/seo-razbory/teyes-sibir-migraciya-b384ad87): не выкладываем.
# Цель – куда 301; None – отдать 404 (служебные куски страниц, которых человек не должен видеть).
JUNK = {
    '/heder': None, '/footer': None, '/footertv': None, '/fail': None, '/pageerror': None, '/contactsold': '/contacts',
    '/admin': None,  # редактор копии на GitHub; на боевом домене не нужен
    '/test': '/toyota_tundra_teyes_cc3_2k',  # тестовая страница – копия Tundra
    '/multimedia_teyes/toyota/tundra': '/multimedia_teyes/toyota/toyota_tundra',  # дубль модели
    '/peugeot_4008_teyes_cc4_pro': '/teyes_cc4_pro_360_infiniti_qx80',  # по адресу Peugeot – текст про QX80
    '/work/toyota/pa4730g8h1-ustanovka-teyes-cc4-pro-v-toyota-land-cr': '/installing_teyescc4pro_toyotalandcruiser200',
    '/work/toyota/dm7u1on511-ustanovka-teyes-cc4-pro-v-toyota-highlan': '/teyes_cc4pro_toyota_highlander_novosibirsk',
    '/work': '/works',
    # битые ссылки в текстах Tilda
    '/multimedia_teyes/nissan/x-trail': '/multimedia_teyes/nissan/nissan_xtrail',  # две одинаковые страницы X-Trail
    '/work/infinity': '/works/infiniti', '/teyes_cc3_2k_honda_accordl': '/teyes_cc3_2k_honda_accord', '/portfolio': '/works',
}
WHOLE = {'/admin'}  # эти папки убираются целиком, у остальных мусорных адресов – только сама страница
# разделы работ по маркам: /work/<марка> дублирует /works/<марка> (там трафик)
WORKS_ALIAS = {'landrover': 'land_rover'}


def low(p):
    return (p.split('?')[0].split('#')[0].rstrip('/') or '/').lower()


def page_path(f, base):
    rel = f.parent.relative_to(base).as_posix()
    return '/' if rel == '.' else '/' + rel


def redirects():
    red = {}
    with open(KARTA, encoding='utf-8-sig') as fh:
        for r in csv.DictReader(fh, delimiter=';'):
            if r['Действие'].startswith('301') and r['Адрес на коде / цель']:
                red[low(r['Адрес Tilda'])] = r['Адрес на коде / цель']
    for k, v in JUNK.items():
        if v:
            red[low(k)] = v
    for d in sorted((OUT / 'work').glob('*/index.html')):
        brand = d.parent.name
        target = f'/works/{WORKS_ALIAS.get(brand, brand)}'
        if (OUT / target.lstrip('/') / 'index.html').exists():
            red[f'/work/{brand}'] = target
    # цепочки 301→301 сворачиваем в один переход
    for k in list(red):
        seen, t = {k}, red[k]
        while low(t) in red and low(t) not in seen:
            seen.add(low(t))
            t = red[low(t)]
        red[k] = t
    return {k: v for k, v in red.items() if low(v) != k}


def rebase(text, js=False):
    text = text.replace('https://tema-mail.github.io/teyes-sibir-kod', SITE)
    if js:  # в скриптах – только адреса в кавычках: голый /teyes-sibir-kod бывает частью регулярки (Lead: /^\/teyes-sibir-kod/)
        return re.sub(r'(["\'`])/teyes-sibir-kod(?=/)', r'\1', text)
    text = re.sub(r'\\/teyes-sibir-kod(?=\\/)', '', text)
    text = re.sub(r'/teyes-sibir-kod(?=/)', '', text)
    return re.sub(r'/teyes-sibir-kod(?=["\'?#)\s])', '/', text)


A_HREF = re.compile(r'(<a\b[^>]*?\bhref=)(["\'])(.*?)\2', re.S)
ROBOTS = re.compile(r'<meta\s+name=["\'](?:robots|googlebot)["\'][^>]*>\s*', re.I)


PID = {}  # номер товара Tilda → адрес карточки на коде (заполняет main)
TPRODUCT = re.compile(r'^(/[\w-]+)?/tproduct/(\d+)')
WORKS_OLD = re.compile(r'^/works[_/]\s*([^/?#]+)$')  # старые ссылки в текстах: /works_Lexus, /works/Mercedes-Benz


def fix_links(text, red):
    def sub(m):
        url = html.unescape(m.group(3))
        path = url[len(SITE):] if url.startswith(SITE) else url if url.startswith('/') else None
        if path is None:
            return m.group(0)
        t = red.get(low(path))
        if not t and len(path) > 1 and re.match(r'^/[^?#]*/(?=$|[?#])', path) and not re.search(r'\.\w+/?$', path.split('?')[0]):
            t = re.sub(r'/(?=$|[?#])', '', path, count=1)
        tp = TPRODUCT.match(path)
        if not t and tp and not (OUT / path.split('?')[0].lstrip('/') / 'index.html').exists():
            # старые карточки до переезда магазина (/catalog_teyes/tproduct/…): та же карточка по номеру или магазин
            t = PID.get(tp.group(2), '/store')
            red[low(path)] = t
        wo = WORKS_OLD.match(urllib.parse.unquote(path))
        if not t and wo and not (OUT / path.lstrip('/') / 'index.html').exists():
            brand = re.sub(r'\s+', '_', wo.group(1).strip().lower()).replace('-benz', '')
            brand = {'land_rover': 'land_rover', 'renault_logan': 'renault'}.get(brand, brand)
            t = f'/works/{brand}' if (OUT / 'works' / brand / 'index.html').exists() else '/works'
            red[low(path)] = t
        return f'{m.group(1)}{m.group(2)}{t}{m.group(2)}' if t else m.group(0)
    return A_HREF.sub(sub, text)


def works_title(path, text):
    """Разделы по маркам: на Tilda у многих title и description от чужой марки («…на Subaru»). Марка – из H1."""
    works, hub = re.match(r'^/works/([^/]+)$', path), re.match(r'^/multimedia_teyes/([^/]+)$', path)
    h1 = re.search(r'<h1[^>]*>(.*?)</h1>', text, re.S)
    if not (works or hub) or not h1:
        return text
    brand = re.sub(r'<[^>]+>|\s+', ' ', h1.group(1))
    brand = re.sub(r'Наши работы|Замена мультимедиа и русификация', '', brand).strip()
    if not brand or len(brand) > 30:
        return text
    if works:
        title = f'Установка Teyes на {brand} в Новосибирске – наши работы Teyes Sibir'
        desc = f'Наши работы по {brand} в Новосибирске: установка Android-магнитол Teyes, камер и сигнализаций. Фото до и после, что ставили и что сохранили.'
    else:
        title = f'Магнитола Teyes на {brand} в Новосибирске – подбор и установка'
        desc = f'Подбор и установка Android-магнитол Teyes на {brand} в Новосибирске: модели и поколения, рамка, что сохраняется из штатного. Пришлите фото панели – подберём.'
    text = re.sub(r'<title>.*?</title>', f'<title>{html.escape(title)}</title>', text, count=1, flags=re.S)
    for attr in ('description', 'og:description'):
        text = re.sub(rf'(<meta\s+(?:name|property)="{attr}"\s+content=")[^"]*', lambda x: x.group(1) + html.escape(desc), text)
    return re.sub(r'(<meta\s+property="og:title"\s+content=")[^"]*', lambda x: x.group(1) + html.escape(title), text)


def main():
    if not DIST.exists() or '/teyes-sibir-kod/_astro' in (DIST / 'store/index.html').read_text('utf-8'):
        sys.exit('site/dist собран для GitHub Pages – сначала: cd site && PUBLIC_BASE=/ npm run build')
    shutil.rmtree(OUT, ignore_errors=True)
    shutil.copytree(PUB, OUT, ignore=shutil.ignore_patterns('.site-dist.txt', '.nojekyll'))
    old = (PUB / '.site-dist.txt').read_text('utf-8').splitlines() if (PUB / '.site-dist.txt').exists() else []
    for rel in old:  # прошлая заливка страниц на коде – убрать, свежая ниже
        if rel and '..' not in rel.split('/'):
            (OUT / rel).unlink(missing_ok=True)
    shutil.copytree(DIST, OUT, dirs_exist_ok=True)
    def drop(path):  # убрать только саму страницу: внутри папки могут жить другие (/work → /work/bmw/<работа>)
        if path in WHOLE:
            shutil.rmtree(OUT / path.lstrip('/'), ignore_errors=True)
        else:
            (OUT / path.lstrip('/') / 'index.html').unlink(missing_ok=True)
    for k in JUNK:
        drop(k)
    for d in OUT.glob('store/**/tproduct/*/index.html'):
        n = re.match(r'(\d+)', d.parent.name)
        if n:
            PID[n.group(1)] = '/' + d.parent.relative_to(OUT).as_posix()
    red = redirects()
    for k in red:  # страница-дубль, у которой есть 301, не выкладывается
        if k.startswith('/work/') and k.count('/') == 2:
            drop(k)

    pages, stat = [], {'metrika': 0, 'canonical': 0, 'links': 0, 'works': 0}
    for f in sorted(OUT.rglob('*')):
        if not f.is_file() or f.suffix not in TEXT:
            continue
        text = f.read_text('utf-8', errors='surrogateescape')
        new = rebase(text, js=f.suffix == '.js')
        if f.name == 'index.html':
            path = page_path(f, OUT)
            new = ROBOTS.sub('', new)
            new = re.sub(r'<html(?![^>]*\blang=)', '<html lang="ru"', new, count=1)
            if 't-records' in new:  # поля Tilda 12–13 px: iPhone приближает страницу при касании
                new = new.replace('</head>', '<style>input,select,textarea{font-size:16px!important}</style></head>', 1)
            if 'mc.yandex.ru/metrika' not in new:
                new = new.replace('</body>', METRIKA + '</body>', 1)
                stat['metrika'] += 1
            if 'rel="canonical"' not in new:
                new = re.sub(r'</head>', f'<link rel="canonical" href="{SITE}{path if path == "/" else path}" /></head>', new, count=1)
                stat['canonical'] += 1
            before = new
            new = fix_links(new, red)
            stat['links'] += before != new
            w = works_title(path, new)
            stat['works'] += w != new
            new = w
            if not path.startswith(('/order', '/favorites', '/thankpage', '/cart')):
                pages.append(path)
        if new != text:
            f.write_text(new, 'utf-8', errors='surrogateescape')

    (OUT / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                     + ''.join(f'<url><loc>{html.escape(SITE + p)}</loc></url>\n' for p in pages)  # lastmod не ставим: одна дата сборки у всех – поисковик перестаёт ей верить
                                     + '</urlset>\n', 'utf-8')
    (OUT / 'robots.txt').write_text('User-agent: *\nDisallow: /order\nDisallow: /favorites\nDisallow: /thankpage\n'
                                    f'Disallow: /*?\nAllow: /*.css\nAllow: /*.js\n\nSitemap: {SITE}/sitemap.xml\n', 'utf-8')
    (OUT / 'llms.txt').write_text(LLMS, 'utf-8')
    fail = PUB / 'fail/index.html'
    if fail.exists():  # своя страница 404 Tilda – тот же вид сайта
        t = fix_links(rebase(ROBOTS.sub('', fail.read_text('utf-8'))), red)
        (OUT / '404.html').write_text(re.sub(r'<head\b[^>]*>', lambda m: m.group(0) + '<meta name="robots" content="noindex" />', t, count=1), 'utf-8')

    MAP.parent.mkdir(exist_ok=True)
    with open(MAP, 'w', encoding='utf-8') as fh:
        fh.write('# 301 со старых адресов Tilda и с удалённого мусора. Генерирует scripts/boevaya.py – руками не править.\n')
        # регулярки без учёта регистра: Tilda отдаёт /works/Audi и /works/audi одинаково, nginx $uri регистр различает
        for k, v in sorted(red.items()):
            fh.write(f'"~*^{re.escape(k)}/?$" "{v}";\n')
        # те же страницы с другим регистром (меню Tilda ссылается на /works/Audi, файл – works/audi): 301 на свой адрес
        for d in sorted(OUT.glob('works/*/index.html')) + sorted(OUT.glob('multimedia_teyes/**/index.html')):
            p = page_path(d, OUT)
            e = re.escape(p)
            fh.write(f'"~^(?!{e}/?$)(?i){e}/?$" "{p}";\n')
    # HTML – сжатым: index.html.gz, а index.html пустой (нужен try_files), отдаёт nginx gzip_static always + gunzip
    raw = gz = 0
    for f in OUT.rglob('*.html'):
        data = f.read_bytes()
        raw += len(data)
        z = gzip.compress(data, 9)
        gz += len(z)
        f.with_name(f.name + '.gz').write_bytes(z)
        f.write_bytes(b'')
    size = sum(f.stat().st_size for f in OUT.rglob('*') if f.is_file()) / 2**20
    print(f'страниц в sitemap {len(pages)}, 301 в карте {len(red)}, Метрика вставлена {stat["metrika"]}, canonical добавлен {stat["canonical"]},'
          f' страниц с исправленными ссылками {stat["links"]}, разделов работ с новым title {stat["works"]}')
    print(f'HTML {raw / 2**20:.0f} МБ → сжатым {gz / 2**20:.0f} МБ; вся боевая сборка {size:.0f} МБ')


LLMS = """# TEYES Sibir

> Официальный установочный центр и магазин мультимедиа Teyes в Новосибирске: подбор и установка Android-магнитол Teyes в штатное место, камеры и круговой обзор 360°, сигнализации StarLine и Pandora с автозапуском, отопители, автозвук, шумоизоляция, доводчики, электропривод багажника, русификация автомобилей из Китая и Японии.

Адрес: Новосибирск, ул. Сухарная, 35 к13, пом. 110. Телефон: +7 (995) 437-92-66. Telegram: @teyesnsk. Пн–пт 11:00–19:00.

## Услуги
- [Установка мультимедиа Teyes](https://teyes-sibir.ru/services/installation_teyes)
- [Камеры и круговой обзор 360°](https://teyes-sibir.ru/services/camera360)
- [Сигнализации StarLine с автозапуском](https://teyes-sibir.ru/services/starline)
- [Установка сигнализаций](https://teyes-sibir.ru/services/alarm_installation)
- [Отопители и предпусковые подогреватели](https://teyes-sibir.ru/services/installation_of_heating_devices)
- [Подогрев сидений](https://teyes-sibir.ru/services/seat-heating)
- [Видеорегистраторы](https://teyes-sibir.ru/services/dashcam)
- [Автозвук](https://teyes-sibir.ru/services/installing_car_audio)
- [Шумоизоляция](https://teyes-sibir.ru/services/installing_sound_insulation)
- [Доводчики дверей](https://teyes-sibir.ru/services/closers)
- [Электропривод багажника](https://teyes-sibir.ru/services/power-tailgate)
- [Русификация автомобилей](https://teyes-sibir.ru/services/russification_of_cars)

## Подбор и работы
- [Подбор Teyes по марке и модели](https://teyes-sibir.ru/multimedia_teyes)
- [Наши работы](https://teyes-sibir.ru/works)
- [Магазин Teyes](https://teyes-sibir.ru/store/catalog_teyes)
- [Контакты](https://teyes-sibir.ru/contacts)
"""

if __name__ == '__main__':
    main()
