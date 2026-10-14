// Покупка на странице товара: вариант (память магнитолы – своя цена), доп. опции с доплатой, количество,
// итог; «В корзину», «Оформить заказ», «Записаться на установку», избранное.
import { useMemo, useState } from 'preact/hooks';
import type { Addon, Edition } from '../lib/catalog';
import { addToCart, isFav, toggleFav, favs, sheet } from '../lib/store';

type Props = {
  id: string; title: string; path: string; image: string; price: number; priceOld: number;
  options: { title: string; values: string[] }[]; editions: Edition[]; addons: Addon[];
  orderHref: string; leadHref: string;
};
const rub = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';

export default function ProductBuy(p: Props) {
  const [choice, setChoice] = useState<Record<string, string>>(() =>
    Object.fromEntries(p.options.map((o) => [o.title, o.values[0]])));
  const [extra, setExtra] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  favs.value; // подписка: сердечко перерисуется при изменении избранного

  const edition = useMemo(() => p.editions.find((e) =>
    p.options.every((o) => e.options[o.title] === choice[o.title])), [choice]);
  const base = edition?.price || p.price;
  const old = edition ? edition.priceOld : p.priceOld;
  const addonsSum = p.addons.filter((a) => extra.includes(a.label)).reduce((n, a) => n + a.price, 0);
  const unit = base + addonsSum;
  const variant = p.options.map((o) => `${o.title}: ${choice[o.title]}`).join(', ');

  const add = () => addToCart({ id: p.id, title: p.title, path: p.path, image: p.image, variant, addons: extra, price: unit }, qty);

  return (
    <div class="buy">
      <div class="buy__price">
        <b>{rub(unit)}</b>
        {old > base && <s>{rub(old + addonsSum)}</s>}
      </div>
      {p.options.map((o) => (
        <fieldset class="buy__group">
          <legend>{o.title}</legend>
          <div class="buy__chips">
            {o.values.map((v) => (
              <button type="button" class={`chip${choice[o.title] === v ? ' is-on' : ''}`} aria-pressed={choice[o.title] === v}
                onClick={() => setChoice({ ...choice, [o.title]: v })}>{v}</button>
            ))}
          </div>
        </fieldset>
      ))}
      {p.addons.length > 0 && (
        <fieldset class="buy__group">
          <legend>Дополнительно</legend>
          {p.addons.map((a) => (
            <label class="buy__addon">
              <input type="checkbox" checked={extra.includes(a.label)}
                onChange={(e) => setExtra((e.target as HTMLInputElement).checked ? [...extra, a.label] : extra.filter((x) => x !== a.label))} />
              <span>{a.label}</span>
              {a.price > 0 && <em>+{rub(a.price)}</em>}
            </label>
          ))}
        </fieldset>
      )}
      <div class="buy__row">
        <div class="buy__qty" role="group" aria-label="Количество">
          <button type="button" aria-label="Меньше" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>−</button>
          <span aria-live="polite">{qty}</span>
          <button type="button" aria-label="Больше" onClick={() => setQty(qty + 1)}>+</button>
        </div>
        <button type="button" class="btn btn--accent buy__cart" onClick={() => { add(); sheet.value = 'cart'; }}>В корзину</button>
        <button type="button" class={`buy__fav${isFav(p.id) ? ' is-on' : ''}`} aria-pressed={isFav(p.id)}
          aria-label={isFav(p.id) ? 'Убрать из избранного' : 'В избранное'} onClick={() => toggleFav(p.id)}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 5 6.5 5c2 0 3.3 1 4.1 2.2.1.1.3.1.4 0C11.8 6 13.1 5 15.1 5 18.6 5 20.7 8.4 19.2 11.8 17.1 16.4 12 21 12 21z" fill="currentColor" /></svg>
        </button>
      </div>
      <div class="buy__row">
        <a class="btn btn--ghost" href={p.orderHref} onClick={add}>Оформить заказ</a>
        <a class="btn btn--ghost" href={p.leadHref} data-lead={p.title}>Записаться на установку</a>
      </div>
    </div>
  );
}
