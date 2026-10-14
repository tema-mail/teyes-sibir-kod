// Избранное: карточки товаров, отмеченных сердечком (хранится в браузере). Каталог отдаётся пропсами.
import { useEffect, useState } from 'preact/hooks';
import type { Card } from '../lib/catalog';
import { favs } from '../lib/store';
import ProductCard from './ProductCard';

export default function FavPage({ cards, hrefs, storeHref }: { cards: Card[]; hrefs: Record<string, string>; storeHref: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  const list = cards.filter((c) => favs.value.includes(c.id));
  if (!list.length) return (
    <div class="fav__empty"><p>Здесь появятся товары, отмеченные сердечком.</p><a class="btn btn--accent" href={storeHref}>Перейти в магазин</a></div>
  );
  return <div class="grid">{list.map((c) => <ProductCard card={c} href={hrefs[c.id]} />)}</div>;
}
