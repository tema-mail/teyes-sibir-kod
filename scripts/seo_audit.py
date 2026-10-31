#!/usr/bin/env python3
"""SEO-проверка собранной копии сайта (public/) перед переносом teyes-sibir.ru с Tilda на код.

  python3 scripts/seo_audit.py            # пишет data/seo-audit/pages.csv и summary.json, печатает сводку

По каждой странице: robots, canonical, title, description, H1, картинки без alt, JSON-LD, OG,
объём текста, битые внутренние ссылки. По сайту: дубли title/description/H1, robots.txt,
sitemap.xml, llms.txt, страница 404. Меряет форму, а не смысл: хороший ли текст и отвечает ли
страница на запрос – смотрит человек.
"""
import collections, csv, html, json, pathlib, re
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUB = ROOT / 'public'
DIST = ROOT / 'site/dist'  # страницы на коде, GitHub Actions кладёт их поверх public/ (scripts/overlay.py)
OUT = ROOT / 'data/seo-audit'
PREFIX = '/teyes-sibir-kod'
SKIP = ('/admin', '/heder', '/footer', '/footertv', '/fail', '/pageerror', '/thankpage', '/favorites', '/cart')


class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title, self.in_title = '', False
        self.meta, self.links, self.imgs, self.h1, self.ld = {}, [], [], [], []
        self.canon, self.lang = '', ''
        self.in_h1 = 0
        self.in_ld = False
        self.skip = 0
        self.text = []

    def handle_starttag(self, t, a):
        a = dict(a)
        if t == 'html':
            self.lang = a.get('lang', '')
        elif t == 'title':
            self.in_title = True
        elif t == 'meta':
            k = (a.get('name') or a.get('property') or '').lower()
            if k:
                self.meta[k] = a.get('content') or ''
        elif t == 'link' and (a.get('rel') or '').lower() == 'canonical':
            self.canon = a.get('href') or ''
        elif t == 'a' and a.get('href'):
            self.links.append(a['href'])
        elif t == 'img':
            self.imgs.append(a.get('alt'))
        elif t == 'h1':
            self.in_h1 += 1
            self.h1.append('')
        elif t == 'script':
            self.skip += 1
            self.in_ld = (a.get('type') or '') == 'application/ld+json'
        elif t in ('style', 'noscript'):
            self.skip += 1

    def handle_endtag(self, t):
        if t == 'title':
            self.in_title = False
        elif t == 'h1' and self.in_h1:
            self.in_h1 -= 1
        elif t in ('script', 'style', 'noscript') and self.skip:
            self.skip -= 1
            self.in_ld = False

    def handle_data(self, d):
        if self.in_ld:
            self.ld.append(d)
            return
        if self.in_title:
            self.title += d
        if self.skip:
            return
        if self.in_h1 and self.h1:
            self.h1[-1] += d
        self.text.append(d)


def ld_types(chunks):
    types = set()
    for c in chunks:
        try:
            j = json.loads(c)
        except Exception:
            types.add('ОШИБКА-JSON')
            continue
        stack = [j]
        while stack:
            x = stack.pop()
            if isinstance(x, dict):
                t = x.get('@type')
                if t:
                    types.update(t if isinstance(t, list) else [t])
                stack.extend(x.values())
            elif isinstance(x, list):
                stack.extend(x)
    return types


def norm(href):
    h = html.unescape(href.split('#')[0].split('?')[0])
    if h.startswith('https://teyes-sibir.ru') or h.startswith('http://teyes-sibir.ru'):
        h = h.split('teyes-sibir.ru', 1)[1] or '/'
    elif h.startswith('https://tema-mail.github.io' + PREFIX):
        h = h.split('github.io', 1)[1]
    if not h.startswith('/') or h.startswith('//'):
        return None
    if h.startswith(PREFIX):
        h = h[len(PREFIX):] or '/'
    return h


def exists(path):
    for base in (DIST, PUB):
        p = base / path.lstrip('/')
        if p.is_file() or (p / 'index.html').is_file() or (base / path.lstrip('/').lower() / 'index.html').is_file():
            return True
    return False


def page_type(path):
    seg = path.strip('/').split('/')[0]
    return {'': 'Главная', 'store': 'Магазин', 'multimedia_teyes': 'Модель', 'work': 'Работа', 'works': 'Работы',
            'services': 'Услуга', 'blog': 'Блог', 'starline': 'StarLine', 'nashi-raboty': 'Работа (код)'}.get(
        seg, 'Русификация' if seg.endswith('rus') else 'Приложения' if seg.endswith('app') else 'Одиночная')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rows, broken = [], collections.Counter()
    files = {}
    for base in (PUB, DIST):  # dist перекрывает public, как на выложенном сайте
        for f in base.rglob('index.html'):
            rel = str(f.parent.relative_to(base))
            files['/' if rel == '.' else '/' + rel + '/'] = f
    for path, f in sorted(files.items()):
        if path.startswith(SKIP) or '/_astro' in path:
            continue
        p = P()
        p.feed(f.read_text(encoding='utf-8', errors='replace'))
        txt = re.sub(r'\s+', ' ', ' '.join(p.text))
        imgs = p.imgs
        bl = sorted({n for n in (norm(h) for h in p.links) if n and not exists(n)})
        for b in bl:
            broken[b] += 1
        types = ld_types(p.ld)
        rows.append({
            'path': path, 'type': page_type(path),
            'robots': p.meta.get('robots', ''), 'canonical': p.canon,
            'title': p.title.strip(), 'title_len': len(p.title.strip()),
            'description': p.meta.get('description', ''), 'desc_len': len(p.meta.get('description', '')),
            'h1_count': len(p.h1), 'h1': ' | '.join(re.sub(r'\s+', ' ', h).strip() for h in p.h1)[:200],
            'imgs': len(imgs), 'imgs_no_alt': sum(1 for a in imgs if not (a or '').strip()),
            'jsonld': ', '.join(sorted(types)), 'og_title': int(bool(p.meta.get('og:title'))),
            'og_image': int(bool(p.meta.get('og:image'))), 'words': len(txt.split()),
            'faq_text': int(bool(re.search(r'Частые вопросы|Вопросы и ответы|FAQ', txt))), 'lang': p.lang,
            'broken_links': len(bl), 'broken_sample': ' '.join(bl[:5]),
        })
    keys = list(rows[0].keys())
    with open(OUT / 'pages.csv', 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, keys)
        w.writeheader()
        w.writerows(rows)

    def dups(k):
        c = collections.Counter(r[k] for r in rows if r[k])
        return {v: n for v, n in c.items() if n > 1}

    by = collections.defaultdict(list)
    for r in rows:
        by[r['type']].append(r)
    summary = {'pages': len(rows), 'dist_built': DIST.is_dir(), 'by_type': {}, 'site': {}}
    for t, rs in sorted(by.items(), key=lambda x: -len(x[1])):
        n = len(rs)
        summary['by_type'][t] = {
            'pages': n,
            'noindex': sum('noindex' in r['robots'] for r in rs),
            'no_canonical': sum(not r['canonical'] for r in rs),
            'canonical_not_teyes': sum(bool(r['canonical']) and 'teyes-sibir.ru' not in r['canonical'] for r in rs),
            'no_title': sum(not r['title'] for r in rs),
            'title_long_70': sum(r['title_len'] > 70 for r in rs),
            'no_desc': sum(not r['description'] for r in rs),
            'desc_bad_len': sum(bool(r['description']) and not 70 <= r['desc_len'] <= 170 for r in rs),
            'h1_not_1': sum(r['h1_count'] != 1 for r in rs),
            'imgs_total': sum(r['imgs'] for r in rs), 'imgs_no_alt': sum(r['imgs_no_alt'] for r in rs),
            'no_jsonld': sum(not r['jsonld'] for r in rs),
            'jsonld_error': sum('ОШИБКА-JSON' in r['jsonld'] for r in rs),
            'faq_text_no_faqpage': sum(r['faq_text'] and 'FAQPage' not in r['jsonld'] for r in rs),
            'no_og_image': sum(not r['og_image'] for r in rs),
            'thin_lt_150_words': sum(r['words'] < 150 for r in rs),
            'with_broken_links': sum(r['broken_links'] > 0 for r in rs),
        }
    s = summary['site']
    for k in ('title', 'description', 'h1'):
        d = dups(k)
        s[f'dup_{k}_values'] = len(d)
        s[f'dup_{k}_pages'] = sum(d.values())
        s[f'dup_{k}_top'] = sorted(d.items(), key=lambda x: -x[1])[:8]
    for k, fn in (('robots_txt', 'robots.txt'), ('sitemap_xml', 'sitemap.xml'), ('llms_txt', 'llms.txt'), ('page_404', '404.html')):
        s[k] = (PUB / fn).is_file() or (DIST / fn).is_file()
    s['broken_targets'] = len(broken)
    s['broken_top'] = broken.most_common(25)
    s['org_schema_pages'] = sum(any(t in r['jsonld'] for t in ('LocalBusiness', 'AutomotiveBusiness', 'Organization')) for r in rows)
    (OUT / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=1))
    print(json.dumps(summary, ensure_ascii=False, indent=1)[:6000])


if __name__ == '__main__':
    main()
