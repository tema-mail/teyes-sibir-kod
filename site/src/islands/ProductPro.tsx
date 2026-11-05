// Покупка на образцах карточки /store/variant/: одни и те же блоки, сетку задаёт CSS по номеру варианта.
// Сплит, 1 клик и счёт – заявки через окно Lead ([data-lead]), на сайте оплаты нет. Внизу экрана – панель «В корзину».
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Addon, Edition } from '../lib/catalog';
import { addToCart, cart, lineKey, sheet } from '../lib/store';
import { CashHint } from './ProductBuy';

type Props = {
  variant: number; id: string; title: string; path: string; image: string; price: number; priceCard?: number;
  options: { title: string; values: string[] }[]; editions: Edition[]; addons: Addon[];
  series: { name: string; href: string; on: boolean }[]; gifts: string[];
  orderHref: string; certHref: string; telegram: string; max: string; tgIcon: string; maxIcon: string; children?: ComponentChildren;
};
const rub = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
// В подписях опций Tilda цена вписана в текст, а бесплатная активация теперь в подарках
const clean = (a: Addon) => a.label.replace(/\s+\d+\s*руб\.?$/, '').replace(/\s*\(оплачивается отдельно, от [\d\s]+руб\.\)/, '').trim();
const note = (a: Addon) => (a.price > 0 ? `+${rub(a.price)}` : /от\s*(\d+)/.exec(a.label) ? `от ${rub(Number(/от\s*(\d+)/.exec(a.label)![1]))}` : '');

export default function ProductPro(p: Props) {
  const [choice, setChoice] = useState<Record<string, string>>(() => Object.fromEntries(p.options.map((o) => [o.title, o.values[0]])));
  const [extra, setExtra] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [bar, setBar] = useState(false);
  const buy = useRef<HTMLDivElement>(null);
  const addons = p.addons.filter((a) => !/активаци/i.test(a.label));

  const edition = useMemo(() => p.editions.find((e) => p.options.every((o) => e.options[o.title] === choice[o.title])), [choice]);
  const sum = addons.filter((a) => extra.includes(a.label)).reduce((n, a) => n + a.price, 0);
  const unit = (edition?.price || p.price) + sum;
  const nocash = (edition?.priceCard || p.priceCard || 0) + sum;
  const variant = p.options.map((o) => `${o.title}: ${choice[o.title]}`).join(', ');
  const about = [p.title, ...Object.values(choice)].join(' ');
  const stock = Number(edition?.stock || 0) > 0;
  const add = () => { addToCart({ id: p.id, title: p.title, path: p.path, image: p.image, variant, addons: extra, price: unit }, qty); sheet.value = 'cart'; };
  const order = () => { if (!cart.value.some((i) => i.key === lineKey(p.id, variant, extra))) addToCart({ id: p.id, title: p.title, path: p.path, image: p.image, variant, addons: extra, price: unit }, qty); };

  // Панель появляется, когда кнопка покупки ушла выше экрана
  useEffect(() => {
    if (!buy.current || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setBar(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(buy.current);
    return () => io.disconnect();
  }, []);

  return (
    <div class={`pp pp--${p.variant}`}>
      <div class="pp__gal">{p.children}</div>

      <div class="pp__choose">
        <fieldset class="buy__group">
          <legend>Серия</legend>
          <div class="buy__chips">{p.series.map((s) => <a class={`chip${s.on ? ' is-on' : ''}`} href={s.href} aria-current={s.on ? 'true' : undefined}>{s.name}</a>)}</div>
        </fieldset>
        {p.options.map((o) => (
          <fieldset class="buy__group">
            <legend>Память, ГБ</legend>
            <div class="buy__chips">{o.values.map((v) => (
              <button type="button" class={`chip${choice[o.title] === v ? ' is-on' : ''}`} aria-pressed={choice[o.title] === v} onClick={() => setChoice({ ...choice, [o.title]: v })}>{v.replace('+', '/').replace('Gb', '')}</button>
            ))}</div>
          </fieldset>
        ))}
      </div>

      <div class="pp__gifts">
        <h2>В подарок при покупке на сайте</h2>
        <ul>{p.gifts.map((g) => <li>{g}</li>)}</ul>
        <p>* Количество подарков ограничено</p>
      </div>

      {addons.length > 0 && (
        <details class="pp__services" open={p.variant !== 1}>
          <summary>Установка и аксессуары</summary>
          <div class="pp__service-list">{addons.map((a) => (
            <label class={`pp__service${extra.includes(a.label) ? ' is-on' : ''}`}>
              <input type="checkbox" checked={extra.includes(a.label)} disabled={a.price === 0}
                onChange={(e) => setExtra((e.target as HTMLInputElement).checked ? [...extra, a.label] : extra.filter((x) => x !== a.label))} />
              <span>{clean(a)}</span><em>{note(a)}</em>
            </label>
          ))}</div>
        </details>
      )}

      <div class="pp__side">
        <div class="buy pp__buy" ref={buy}>
          <p class={`pp__stock${stock ? ' is-on' : ''}`}>{stock ? 'В наличии в Новосибирске' : 'Наличие уточним при заказе'}</p>
          <div class="buy__prices">
            <div class="buy__cash"><b>{rub(unit)}</b><span class="buy__label">Цена со скидкой при оплате наличными <CashHint /></span></div>
            {nocash > 0 && <div class="buy__nocash"><span>{rub(nocash)}</span><span class="buy__label">Цена без скидки</span></div>}
          </div>
          <div class="buy__row">
            <div class="buy__qty" role="group" aria-label="Количество">
              <button type="button" aria-label="Меньше" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>−</button>
              <span aria-live="polite">{qty}</span>
              <button type="button" aria-label="Больше" onClick={() => setQty(qty + 1)}>+</button>
            </div>
            <button type="button" class="btn btn--accent buy__cart" onClick={add}>В корзину</button>
          </div>
          <a class="btn btn--ghost" href={p.orderHref} data-lead={`Купить в 1 клик: ${about}`}>Купить в 1 клик</a>
          <a class="btn pp__split" href={p.orderHref} data-lead={`Яндекс Сплит: ${about}`}>Яндекс Сплит <small>по заявке</small></a>
          <a class="pp__invoice" href={p.orderHref} data-lead={`Счёт для юр. лица: ${about}`}>Запросить счёт для юр. лица</a>
          <a class="pp__invoice" href={p.orderHref} onClick={order}>Оформить заказ</a>
          <details class="pp__pay">
            <summary>Способы оплаты</summary>
            <ul>
              <li><b>Наличными</b> – цена со скидкой</li>
              <li><b>Картой или по QR-коду</b> – цена без скидки</li>
              <li><b>Яндекс Сплит</b> – по заявке, цена без скидки</li>
              <li><b>По счёту для юр. лица</b> – по заявке, цена без скидки</li>
            </ul>
          </details>
        </div>
        <ul class="pp__certs"><li><a href={p.certHref}>Сертификат соответствия ЕАС</a></li></ul>
        <div class="pp__chat">
          <a href={p.telegram} target="_blank" rel="noopener"><img src={p.tgIcon} alt="" width="24" height="24" />Написать в Telegram</a>
          <a href={p.max} target="_blank" rel="noopener"><img src={p.maxIcon} alt="" width="24" height="24" />Написать в MAX</a>
        </div>
      </div>

      <div class={`pp-bar${bar ? ' is-on' : ''}`} aria-hidden={!bar}>
        <img src={p.image} alt="" width="48" height="48" />
        <span class="pp-bar__title">{p.title}</span>
        <b>{rub(unit)}</b>
        <button type="button" class="btn btn--accent" tabIndex={bar ? 0 : -1} onClick={add}>В корзину</button>
      </div>
    </div>
  );
}
