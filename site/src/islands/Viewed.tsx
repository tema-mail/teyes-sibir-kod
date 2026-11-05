// «Вы смотрели»: запоминает текущий товар и показывает прошлые. Пока смотреть нечего – блока нет.
import { useEffect, useState } from 'preact/hooks';
import type { Card } from '../lib/catalog';
import { rememberViewed } from '../lib/store';
import ProductCard from './ProductCard';

export default function Viewed({ card, base }: { card: Card; base: string }) {
  const [list, setList] = useState<Card[]>([]);
  useEffect(() => setList(rememberViewed(card).slice(0, 4)), []);
  if (!list.length) return null;
  return (
    <section class="product__block">
      <h2>Вы смотрели</h2>
      <div class="grid">{list.map((c) => <ProductCard card={c} href={`${base}${c.path}/`} />)}</div>
    </section>
  );
}
