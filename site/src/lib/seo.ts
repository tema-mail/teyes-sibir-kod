// SEO карточки товара (SAG: поиск, ответы, нейросети) – одно место для title, description, первого абзаца,
// keywords и разметки schema.org. Решение владельца 10.11.2026: «всё чётко» на всех карточках.
// Факты – только из данных: цена и память (products.json), адрес, телефон, часы, мессенджеры (site.ts SITE),
// «проверим совместимость по фото панели» (card-details.ts PERKS). Гарантии, цены установки и сроков в данных нет –
// в шаблоны не ставим, пока владелец не даст факт.
import { minPrice, img, sectionHref, sectionName, type Product } from './catalog';
import { u, BASE, LIVE, SITE, ASSET } from './site';

/** Полные адреса файлов там, где они реально лежат: на копии (GitHub Pages) или на своём домене. */
export const ORIGIN = BASE ? 'https://tema-mail.github.io' : LIVE;
export const ORG_ID = LIVE + '/#org';
const TITLE_MAX = 70;
const DESCR_MAX = 160;
const ADDRESS = 'Сухарная 35';

const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/\s/g, ' ');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fit = (list: string[], max: number) => list.find((s) => s.length <= max) || list[list.length - 1];

/** Ступени сжатия названия для title (H1 остаётся полным): годы без пробелов, без памяти, первая машина из списка
 *  через «/», «для магнитол Teyes» вместо перечня моделей, без уточнений в скобках (кроме диагонали). */
/** Последняя ступень: название до границы слова с «…» (перечни из десятка машин). */
const clip = (s: string, room: number) => (s.length <= room ? s : s.slice(0, room - 1).replace(/[\s,(]+\S*$/, '') + '…');

function squeeze(name: string): string[] {
  const out = [name];
  let n = name.replace(/\(?(\d{4})\s*[-–]\s*(\d{4})\)?/g, '$1–$2').replace(/\s+-\s+\d+\+\d+\s*Gb/gi, '');
  out.push(n);
  n = n.replace(/для (?:CC|SPRO|TPRO|X1|Lux)[^()]*?\/[^()]*?(?=\s\(|$)/i, 'для магнитол Teyes'); out.push(n); // перечень моделей
  n = n.replace(/(\S)\s+\/\s+.*?(?=\s\([\d,.]+"\)|\s–|$)/, '$1'); out.push(n); // несколько машин – первая
  n = n.replace(/\s\((?![\d,.]+"\))[^)]{16,}\)/g, ''); out.push(n); // длинные пояснения; цвет и короткое – остаются
  return [...new Set(out)];
}

// «Штатная магнитола Teyes CC3L F2 LADA Priora 2007-2013 - 4+64Gb» → модель «Teyes CC3L F2», машина «LADA Priora 2007-2013»
const HEAD_UNIT = /^(?:Штатн(?:ая|ые) (?:магнитола|мультимедиа) )?(Teyes (?:CC3 2[KК]|CC4 Pro|CC4L|CC4|CC3L|CC3|CC2L Plus|CC2 Plus|CC2L|CC2|SPRO Plus|TPRO 2|X1|Lux One)(?: 12[.,]3"?)?(?: 360)?(?: ADAS)?(?: (?:A|B|F1|F2))?) (.+)$/i;
const MEMORY_SUFFIX = /\s+-\s+\d+\+\d+\s*Gb$/i;
/** Машина без годов, скобок и размеров – для ключевых фраз. */
const carKey = (car: string) => car.replace(/\([^)]*\)|\[[^\]]*\]|\d{4}\s*[-–]\s*\d{4}|\d{4}\+?|Тип-[AB]|\b[FB]\d\b/g, ' ')
  .replace(/\s+/g, ' ').trim().toLowerCase();

type Kind = 'head' | 'frame' | 'service' | 'accessory';
/** Подписки и мелочь, которую не «ставят в боксе»: для них в тексте – подсказка по совместимости, без установки. */
const NO_INSTALL = /hanna|система охраны|защитное стекло|карта памяти|маты .*калибровки/i;

function parse(p: Product) {
  const m = p.section !== 'accessories' ? p.title.match(HEAD_UNIT) : null;
  if (m) {
    const car = m[2].replace(MEMORY_SUFFIX, '').trim();
    return { kind: 'head' as Kind, name: `Магнитола ${m[1]} на ${car}`, model: m[1], car };
  }
  if (p.model === 'Рамка' || /^переходная рамка/i.test(p.title)) {
    const car = p.title.replace(/^переходная рамка\s*/i, '').replace(/\s*\([\d,.]+"\)\s*$/, '').trim();
    return { kind: 'frame' as Kind, name: p.title, model: '', car };
  }
  return { kind: (NO_INSTALL.test(p.title) ? 'service' : 'accessory') as Kind, name: cap(p.title.replace(/^Штатн(?:ая|ые) /, '')), model: '', car: '' };
}

/** Память из вариантов: «4+32Gb», «6+128Gb» → «4+32 или 6+128». */
function memory(p: Product) {
  const vals = new Set<string>();
  p.editions.forEach((e) => Object.values(e.options).forEach((v) => { const m = v.match(/(\d+)\s*\+\s*(\d+)/); if (m) vals.add(`${m[1]}+${m[2]}`); }));
  const list = [...vals];
  return list.length && list.length <= 3 ? list.join(' или ') : '';
}

function prices(p: Product) {
  const all = p.editions.length ? p.editions.map((e) => e.price || p.price) : [p.price];
  return { low: Math.min(...all), high: Math.max(...all) };
}

/** Видимые крошки карточки – они же BreadcrumbList. */
export function crumbs(p: Product) {
  const list = [{ name: 'Главная', path: '/' }, { name: 'Магазин', path: '/store/' }];
  if (!['teyes', 'catalog', 'camera', 'accessories'].includes(p.section)) list.push({ name: 'Комплекты Teyes', path: '/store/catalog/' });
  list.push({ name: sectionName(p.section), path: sectionHref(p.section) });
  return list;
}

export function productSeo(p: Product) {
  const x = parse(p);
  const { low, high } = prices(p);
  const price = `${low !== high ? 'от ' : ''}${fmt(low)} ₽`;
  const mem = memory(p);

  const names = squeeze(x.kind === 'frame' ? x.name.replace(/^Переходная рамка/, 'Рамка') : x.name);
  const title = fit([x.name, ...names].flatMap((n) => [`${n} – ${price}, Новосибирск`, `${n} – ${price}`]), TITLE_MAX);

  // Ответ первым: что, на какую машину, цена, что сделаем дальше
  const tail = x.kind === 'head' ? `Совместимость проверим по фото панели, установка в Новосибирске – ${ADDRESS}.`
    : x.kind === 'frame' ? `Подберём по фото панели и поставим вместе с магнитолой Teyes в Новосибирске, ${ADDRESS}.`
    : x.kind === 'accessory' ? `Подскажем по совместимости и поставим с магнитолой Teyes в Новосибирске, ${ADDRESS}.`
    : 'Подскажем по совместимости с вашей магнитолой Teyes в Telegram и MAX.';
  const generated = fit([
    `${x.name} – ${price}${mem ? `, память ${mem} ГБ` : ''}. ${tail}`,
    `${x.name} – ${price}. ${tail}`,
    `${x.name} – ${price}. Новосибирск, ${ADDRESS}.`,
    `${names[names.length - 1]} – ${price}. ${tail}`,
    `${names[names.length - 1]} – ${price}. Новосибирск, ${ADDRESS}.`,
    `${clip(names[names.length - 1], DESCR_MAX - ` – ${price}. Новосибирск, ${ADDRESS}.`.length)} – ${price}. Новосибирск, ${ADDRESS}.`,
  ], DESCR_MAX);
  const own = p.descr && p.descr !== p.title && p.descr.length >= 60 && p.descr.length <= DESCR_MAX ? p.descr : '';
  const description = own || generated;
  const lead = p.descr && p.descr !== p.title ? p.descr : generated; // видимый абзац: свой текст админки важнее шаблона

  const car = carKey(x.car);
  const brand = car.split(' ')[0] || '';
  const keywords = (x.kind === 'head' ? [`магнитола ${x.model.toLowerCase()} ${car}`, `штатная магнитола ${car}`, `магнитола на ${car}`, `установка магнитолы ${brand} новосибирск`]
    : x.kind === 'frame' ? [`рамка ${car}`, `переходная рамка ${car}`, `рамка для магнитолы ${car}`, 'рамка teyes новосибирск']
    : [p.title.toLowerCase().split(/[,(]/)[0].trim(), `${p.model.toLowerCase()} teyes`, `${p.model.toLowerCase()} teyes купить новосибирск`])
    .filter((k, i, a) => k.replace(/\s+/g, '') && a.indexOf(k) === i).join(', ');

  const availability = p.editions.length && p.editions.every((e) => String(e.stock) === '0')
    ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock';
  const seller = { '@id': ORG_ID };
  const offers = low !== high
    ? { '@type': 'AggregateOffer', priceCurrency: 'RUB', lowPrice: low, highPrice: high, offerCount: p.editions.length, availability, seller }
    : { '@type': 'Offer', priceCurrency: 'RUB', price: low, availability, seller, url: LIVE + p.path };
  const src = (p as Product & { source?: { sku?: string } }).source;
  const ld = [
    {
      '@context': 'https://schema.org', '@type': 'Product', '@id': LIVE + p.path + '#product', name: p.title, description,
      sku: src?.sku || p.id, image: p.images.map((i) => ORIGIN + img(i)), brand: { '@type': 'Brand', name: 'Teyes' },
      ...(p.model ? { category: p.section === 'accessories' ? p.model : 'Штатные магнитолы' } : {}), offers,
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [...crumbs(p), { name: p.title, path: p.path }].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: LIVE + c.path })),
    },
  ];
  return { title, description, lead, keywords, ld, image: p.images[0] ? ORIGIN + img(p.images[0]) : '', isHeadUnit: x.kind === 'head' || (p.section !== 'accessories' && !!p.model) };
}

/** Организация – один раз на каждой странице (Base.astro); товары ссылаются на неё через seller. */
export function orgLd() {
  const [, opens = '11:00', closes = '19:00'] = SITE.hours.match(/(\d{1,2}:\d{2})\D+(\d{1,2}:\d{2})/) || [];
  return {
    '@context': 'https://schema.org', '@type': 'AutoPartsStore', '@id': ORG_ID, name: SITE.name, description: SITE.slogan,
    url: LIVE, logo: ORIGIN + u(ASSET.logo), telephone: SITE.tel.replace('tel:', ''), email: SITE.email,
    address: { '@type': 'PostalAddress', addressCountry: 'RU', addressLocality: 'Новосибирск', streetAddress: SITE.address.replace(/^г\.\s*Новосибирск,\s*/, '') },
    openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens, closes }],
    sameAs: [SITE.telegram, SITE.max],
  };
}

export const ldScript = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');
