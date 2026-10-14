// Каталог категории: фильтры (модель Teyes, цена, поиск по названию), сортировка, «Показать ещё».
// Чипы – «Все» первым, выбор прячет остальные товары (стандарт каталогов владельца). Данные – пропсами.
import { useMemo, useState } from 'preact/hooks';
import type { Card } from '../lib/catalog';
import ProductCard from './ProductCard';

const PRICES: [string, number, number][] = [
  ['Любая цена', 0, Infinity], ['до 30 000 ₽', 0, 30000], ['30–50 тыс. ₽', 30000, 50000],
  ['50–80 тыс. ₽', 50000, 80000], ['от 80 000 ₽', 80000, Infinity],
];
const SORTS = [['default', 'По порядку сайта'], ['cheap', 'Сначала дешевле'], ['dear', 'Сначала дороже']] as const;
const STEP = 24;

export default function Catalog({ cards, hrefs, models }: { cards: Card[]; hrefs: Record<string, string>; models: string[] }) {
  const [model, setModel] = useState('');
  const [price, setPrice] = useState(0);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<(typeof SORTS)[number][0]>('default');
  const [shown, setShown] = useState(STEP);

  const list = useMemo(() => {
    const [, lo, hi] = PRICES[price];
    const q = query.trim().toLowerCase();
    const out = cards.filter((c) => (!model || c.model === model) && c.price >= lo && c.price < hi && (!q || c.title.toLowerCase().includes(q)));
    if (sort === 'cheap') out.sort((a, b) => a.price - b.price);
    if (sort === 'dear') out.sort((a, b) => b.price - a.price);
    return out;
  }, [cards, model, price, query, sort]);
  const reset = (f: () => void) => { f(); setShown(STEP); };

  return (
    <div class="catalog">
      <div class="catalog__filters">
        {models.length > 1 && (
          <div class="catalog__chips" role="group" aria-label="Модель магнитолы">
            <button type="button" class={`chip${model ? '' : ' is-on'}`} aria-pressed={!model} onClick={() => reset(() => setModel(''))}>Все</button>
            {models.map((m) => (
              <button type="button" class={`chip${model === m ? ' is-on' : ''}`} aria-pressed={model === m} onClick={() => reset(() => setModel(m))}>Teyes {m}</button>
            ))}
          </div>
        )}
        {cards.length > 1 && (
          <div class="catalog__chips" role="group" aria-label="Цена">
            {PRICES.map(([label], i) => (
              <button type="button" class={`chip${price === i ? ' is-on' : ''}`} aria-pressed={price === i} onClick={() => reset(() => setPrice(i))}>{label}</button>
            ))}
          </div>
        )}
        {cards.length > 1 && (
          <div class="catalog__row">
            <input class="catalog__search" type="search" placeholder="Поиск по названию: модель машины, год…" aria-label="Поиск по названию"
              value={query} onInput={(e) => reset(() => setQuery((e.target as HTMLInputElement).value))} />
            <select class="catalog__sort" aria-label="Сортировка" value={sort} onChange={(e) => setSort((e.target as HTMLSelectElement).value as typeof sort)}>
              {SORTS.map(([v, t]) => <option value={v}>{t}</option>)}
            </select>
          </div>
        )}
        <p class="catalog__count" aria-live="polite">{list.length === cards.length ? `Товаров: ${cards.length}` : `Найдено ${list.length} из ${cards.length}`}</p>
      </div>
      {list.length > 0 ? (
        <div class="grid">{list.slice(0, shown).map((c) => <ProductCard card={c} href={hrefs[c.id]} />)}</div>
      ) : (
        <p class="catalog__none">Ничего не нашлось – сбросьте фильтры или позвоните, подберём по вашей машине.</p>
      )}
      {list.length > shown && (
        <button type="button" class="btn btn--ghost catalog__more" onClick={() => setShown(shown + STEP)}>Показать ещё</button>
      )}
    </div>
  );
}
