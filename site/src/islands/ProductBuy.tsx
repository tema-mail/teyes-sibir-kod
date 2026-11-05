// Покупка на странице товара: вариант (память магнитолы – своя цена), доп. опции с доплатой, количество,
// итог; «В корзину», «Оформить заказ», «Записаться на установку», избранное.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Addon, Edition } from '../lib/catalog';
import { addToCart, cart, isFav, lineKey, toggleFav, favs, sheet, useMounted } from '../lib/store';

type Props = {
  id: string; title: string; path: string; image: string; price: number; priceOld: number; priceCard?: number;
  options: { title: string; values: string[] }[]; editions: Edition[]; addons: Addon[];
  orderHref: string; leadHref: string;
};
const rub = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';


// Что всплывает по знаку вопроса у цены со скидкой
export function CashHint() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!(e instanceof KeyboardEvent ? e.key !== 'Escape' : box.current?.contains(e.target as Node))) setOpen(false); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', close); };
  }, [open]);
  return (
    <span class="buy__hint" ref={box}>
      <button type="button" aria-label="Почему цена со скидкой" aria-expanded={open} onClick={() => setOpen(!open)}>?</button>
      {open && (
        <span class="buy__pop" role="tooltip">
          <span>Скидка для следующих способов оплаты: наличный расчёт.</span>
          <span>Данная скидка не предоставляется: при оплате картой по терминалу, QR-коду, при оформлении кредита или при оплате по счёту юр. лицом.</span>
          <span>Почему так? Мы стараемся обеспечить для вас не только лучший сервис, но и максимально низкие цены, в связи с этим наша наценка для многих товаров меньше, чем комиссии, которые взимают банки. Поэтому мы ввели дополнительную скидку для способов оплаты, не имеющих комиссии.</span>
        </span>
      )}
    </span>
  );
}

export default function ProductBuy(p: Props) {
  const [choice, setChoice] = useState<Record<string, string>>(() =>
    Object.fromEntries(p.options.map((o) => [o.title, o.values[0]])));
  const [extra, setExtra] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  favs.value; // подписка: сердечко перерисуется при изменении избранного
  const mounted = useMounted();

  const edition = useMemo(() => p.editions.find((e) =>
    p.options.every((o) => e.options[o.title] === choice[o.title])), [choice]);
  const base = edition?.price || p.price;
  const old = edition ? edition.priceOld : p.priceOld;
  const addonsSum = p.addons.filter((a) => extra.includes(a.label)).reduce((n, a) => n + a.price, 0);
  const unit = base + addonsSum;
  const nocash = edition?.priceCard || p.priceCard || 0;
  const variant = p.options.map((o) => `${o.title}: ${choice[o.title]}`).join(', ');

  const add = () => addToCart({ id: p.id, title: p.title, path: p.path, image: p.image, variant, addons: extra, price: unit }, qty);
  // «Оформить заказ» после «В корзину» не удваивает позицию
  const order = () => { if (!cart.value.some((i) => i.key === lineKey(p.id, variant, extra))) add(); };
  const fav = mounted && isFav(p.id);
  const [bar, setBar] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // Панель «В корзину» появляется, когда блок покупки ушёл выше экрана
  useEffect(() => {
    if (!box.current || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setBar(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(box.current);
    return () => io.disconnect();
  }, []);

  return (
    <div class="buy" ref={box}>
      {nocash > 0 ? (
        <div class="buy__prices">
          <div class="buy__cash">
            <b>{rub(unit)}</b>
            <span class="buy__label">Цена со скидкой при оплате наличными <CashHint /></span>
          </div>
          <div class="buy__nocash">
            <span>{rub(nocash + addonsSum)}</span>
            <span class="buy__label">Цена без скидки</span>
          </div>
        </div>
      ) : (
        <div class="buy__price">
          <b>{rub(unit)}</b>
          {old > base && <s>{rub(old + addonsSum)}</s>}
        </div>
      )}
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
        <button type="button" class={`buy__fav${fav ? ' is-on' : ''}`} aria-pressed={fav}
          aria-label={fav ? 'Убрать из избранного' : 'В избранное'} onClick={() => toggleFav(p.id)}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 5 6.5 5c2 0 3.3 1 4.1 2.2.1.1.3.1.4 0C11.8 6 13.1 5 15.1 5 18.6 5 20.7 8.4 19.2 11.8 17.1 16.4 12 21 12 21z" fill="currentColor" /></svg>
        </button>
      </div>
      <div class="buy__row">
        <a class="btn btn--ghost" href={p.orderHref} onClick={order}>Оформить заказ</a>
        <a class="btn btn--ghost" href={p.leadHref} data-lead={p.title}>Записаться на установку</a>
      </div>
      <div class={`pbar${bar ? ' is-on' : ''}`} aria-hidden={!bar}>
        <img src={p.image} alt="" width="44" height="44" />
        <span class="pbar__title">{p.title}</span>
        <b>{rub(unit)}</b>
        <button type="button" class="btn btn--accent" tabIndex={bar ? 0 : -1} onClick={() => { add(); sheet.value = 'cart'; }}>В корзину</button>
      </div>
    </div>
  );
}
