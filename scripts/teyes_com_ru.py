"""Съём карточек teyes.com.ru (город nsb – цены Новосибирска): заголовок, цена, старая цена, артикул, крошки,
характеристики по группам и фото самого товара. Описания источника НЕ берём (решение владельца 10.11.2026:
на карточках только наш текст). Результат – raw/teyes-com-ru/items/<slug>.json и фото raw/teyes-com-ru/img/.

  python3 scripts/teyes_com_ru.py urls.txt            # адреса по одному в строке
Повторный запуск докачивает только то, чего нет. Не больше WORKERS запросов одновременно и пауза – не нагружаем источник."""
import html, json, re, ssl, sys, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / 'raw' / 'teyes-com-ru'
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh) teyes-sibir-catalog/1'}
PAUSE = 0.3
WORKERS = 4  # параллельных запросов к источнику – щадящий режим
CTX = ssl.create_default_context(cafile='/etc/ssl/cert.pem')  # у Python с python.org нет своих корневых сертификатов


def get(url: str) -> bytes:
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60, context=CTX) as r:
                return r.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(3 * (attempt + 1))


def text(s: str) -> str:
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()


def parse(url: str, s: str) -> dict:
    h1 = re.search(r'<h1[^>]*>(.*?)</h1>', s, re.S)
    price = re.search(r'itemprop="price" content="([\d.]+)"', s)
    sku = re.search(r'itemprop="sku" content="([^"]+)"', s)
    old = re.search(r'class="[^"]*price[^"]*compare[^"]*"[^>]*>\s*([\d\s\xa0]+)', s)
    crumbs = []
    bl = s.find('schema.org/BreadcrumbList')
    if bl >= 0:
        crumbs = [html.unescape(x) for x in re.findall(r'<meta itemprop="name" content="([^"]+)" />', s[bl:bl + 6000])]
    # характеристики: группы product-features__group-name, внутри имя (без всплывающей подсказки) и значение
    specs, group = [], ''
    for m in re.finditer(r'product-features__group-name">(.*?)</div>|<span class="product-feature__name">(.*?)<(?:span|/span)'
                         r'.*?product-feature__value[^"]*">(.*?)</div>', s, re.S):
        if m.group(1) is not None:
            group = text(m.group(1))
        else:
            specs.append({'group': group, 'title': text(m.group(2)), 'value': text(m.group(3))})
    og = re.search(r'og:image" content="[^"]*/products/(\d+/\d+/\d+)/', s)
    images = []
    if og:  # у каждого фото берём самый крупный размер, который реально есть на странице (.970, иначе .750x0, .440)
        d = og.group(1)
        found = re.findall(r'/products/' + d + r'/images/(\d+)/\1\.(970|750x0|440)\.(webp|jpg|jpeg|png)', s)
        rank = {'970': 0, '750x0': 1, '440': 2}
        best = {}
        for i, size, ext in found:
            if i not in best or rank[size] < rank[best[i][0]]:
                best[i] = (size, ext)
        order = list(dict.fromkeys(i for i, _, _ in found))
        images = [f'https://teyes.com.ru/wa-data/public/shop/products/{d}/images/{i}/{i}.{best[i][0]}.{best[i][1]}' for i in order]
    return {'url': url, 'title': text(h1.group(1)) if h1 else '', 'price': int(float(price.group(1))) if price else 0,
            'priceOld': int(re.sub(r'\D', '', old.group(1)) or 0) if old else 0, 'sku': sku.group(1) if sku else '',
            'crumbs': crumbs, 'specs': specs, 'images': images}


def one(url: str) -> str:
    """Одна карточка: '' – уже есть или скачана, иначе текст ошибки."""
    out = ROOT / 'items' / f"{url.rstrip('/').split('/')[-1]}.json"
    if out.exists():
        return ''
    try:
        item = parse(url, get(url).decode('utf-8', 'ignore'))
        for src in list(item['images']):
            f = ROOT / 'img' / src.split('/')[-1]
            if not f.exists():
                for alt in (src, re.sub(r'\.970\.', '.750x0.', src), re.sub(r'\.970\.', '.440.', src)):
                    try:
                        f.write_bytes(get(alt))
                        break
                    except Exception as e:
                        err = e
                else:  # ни один размер не скачался – убираем фото из карточки и пишем в лог
                    item['images'].remove(src)
                    print('ФОТО', src, err, flush=True)
        out.write_text(json.dumps(item, ensure_ascii=False), encoding='utf-8')
        time.sleep(PAUSE)
        return ''
    except Exception as e:  # ошибку записываем, а не подменяем пустой карточкой
        return f'ОШИБКА {url} {e}'


def main(listfile: str) -> None:
    from concurrent.futures import ThreadPoolExecutor
    (ROOT / 'items').mkdir(parents=True, exist_ok=True)
    (ROOT / 'img').mkdir(parents=True, exist_ok=True)
    urls = [u.strip() for u in open(listfile) if u.strip()]
    errors = 0
    with ThreadPoolExecutor(WORKERS) as pool:
        for n, err in enumerate(pool.map(one, urls), 1):
            if err:
                errors += 1
                print(err, flush=True)
            if n % 100 == 0:
                print(f'{n}/{len(urls)} ошибок {errors}', flush=True)
    print(f'готово: адресов {len(urls)}, ошибок {errors}, карточек в raw {len(list((ROOT / "items").glob("*.json")))}')


if __name__ == '__main__':
    main(sys.argv[1])
