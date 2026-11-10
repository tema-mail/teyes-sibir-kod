"""Проверка SEO карточек товара по собранному сайту (SAG, 10.11.2026). Код выхода 1 – есть нарушения.

  python3 scripts/seo_check.py site/dist

Ловит: title > 70, description пустой / = title или H1 / > 160, нет keywords или og:image, в разметке нет ровно одного
Product, нет BreadcrumbList или организации, у Product нет sku или seller, «в день обращения» (факт не подтверждён),
«Модель магнитолы: Teyes <тип аксессуара>».
"""
import collections, html, json, re, sys
from pathlib import Path

dist = Path(sys.argv[1] if len(sys.argv) > 1 else 'site/dist')
pages = [f for f in dist.rglob('index.html') if '/tproduct/' in str(f)]
bad = collections.Counter(); tl, dl = [], []; titles = collections.Counter(); descs = collections.Counter(); first = {}
for f in pages:
    s = f.read_text(encoding='utf-8')
    t = html.unescape(re.search(r'<title>(.*?)</title>', s, re.S).group(1))
    m = re.search(r'<meta name="description" content="([^"]*)"', s); d = html.unescape(m.group(1)) if m else ''
    m = re.search(r'<h1[^>]*>(.*?)</h1>', s, re.S); h1 = html.unescape(re.sub('<[^>]+>', '', m.group(1))) if m else ''
    tl.append(len(t)); dl.append(len(d)); titles[t] += 1; descs[d] += 1
    lds = [json.loads(html.unescape(x)) for x in re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S)]
    types = [x.get('@type') for x in lds]
    pr = next((x for x in lds if x.get('@type') == 'Product'), {})
    checks = {
        'title > 70': len(t) > 70, 'description > 160': len(d) > 160, 'description пустой': not d,
        'description = title/H1': d in (t, h1), 'нет keywords': 'name="keywords"' not in s, 'нет og:image': 'og:image' not in s,
        'Product не один': types.count('Product') != 1, 'нет BreadcrumbList': 'BreadcrumbList' not in types,
        'нет организации': 'AutoPartsStore' not in types, 'нет sku': not pr.get('sku'), 'нет seller': 'seller' not in pr.get('offers', {}),
        'в день обращения': 'в день обращения' in s, 'тип аксессуара как модель': '/accessories/' in str(f) and 'Модель магнитолы' in s,
    }
    for k, v in checks.items():
        if v:
            bad[k] += 1; first.setdefault(k, str(f.relative_to(dist)))
tl.sort(); dl.sort()
print(f'карточек {len(pages)}; title медиана {tl[len(tl)//2]}, макс {tl[-1]}; description медиана {dl[len(dl)//2]}, макс {dl[-1]}')
print('дублей title', sum(v for v in titles.values() if v > 1), '| дублей description', sum(v for v in descs.values() if v > 1))
for k, v in bad.most_common():
    print(f'  {k}: {v}  (например {first[k]})')
# title > 70 – предупреждение (длинное название машины не режем, ключ стоит первым); остальное – ошибка
sys.exit(1 if any(k != 'title > 70' for k in bad) else 0)
