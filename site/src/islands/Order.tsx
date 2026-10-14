// Оформление заказа: состав корзины (вариант, опции, количество), контакты, машина, согласие → в приёмник Tilda
// формой «Cart» (как живая корзина teyes-sibir.ru). Онлайн-оплату и «Долями» проводит только Tilda – здесь их нет.
import { useEffect, useState } from 'preact/hooks';
import { cart, cartTotal, clearCart, setQty, removeFromCart } from '../lib/store';
import { sendForm, phoneOk } from '../lib/forms';

const rub = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
const BASE = import.meta.env.BASE_URL.replace(/\/$/, ''); // в корзине адрес товара – как на сайте, без подпапки копии

export default function Order({ storeHref, policyHref, phone }: { storeHref: string; policyHref: string; phone: string }) {
  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');
  const [tel, setTel] = useState('');
  const [email, setEmail] = useState('');
  const [car, setCar] = useState('');
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  useEffect(() => setReady(true), []);

  if (!ready) return null;
  if (done) return (
    <div class="order__done" role="status">
      <h2>Заказ № {done} отправлен</h2>
      <p>Мы свяжемся с вами, чтобы подтвердить заказ. Если удобнее – позвоните: <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a>.</p>
      <a class="btn btn--ghost" href={storeHref}>Вернуться в магазин</a>
    </div>
  );
  const items = cart.value;
  if (!items.length) return (
    <div class="order__done"><p>Корзина пуста.</p><a class="btn btn--accent" href={storeHref}>Перейти в магазин</a></div>
  );

  const submit = async (e: Event) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!name.trim()) er.name = 'Напишите, как к вам обращаться';
    if (!phoneOk(tel)) er.tel = 'Нужен номер телефона, например +7 999 123-45-67';
    if (!agree) er.agree = 'Нужно согласие на обработку данных';
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    const d = new Date(), pad = (n: number) => String(n).padStart(2, '0');
    const num = `${pad(d.getDate())}${pad(d.getMonth() + 1)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const lines = items.map((i) => [i.title, i.variant, i.addons.length ? '+ ' + i.addons.join(', ') : '']
      .filter(Boolean).join('; ') + ` × ${i.qty} = ${rub(i.price * i.qty)}`).join('\n');
    const ok = await sendForm('Cart', {
      'Номер заказа': num, 'Имя': name.trim(), 'Телефон': tel.trim(), 'Email': email.trim(),
      'Автомобиль и комментарий': car.trim(), 'Заказ': lines, 'Итого': rub(cartTotal.value),
      'Источник': 'сайт на коде (копия teyes-sibir.ru)', 'Согласие': 'yes',
    });
    setBusy(false);
    if (!ok) { setErrors({ send: `Не получилось отправить заказ. Позвоните нам: ${phone}` }); return; }
    clearCart();
    setDone(num);
  };

  return (
    <form class="order" onSubmit={submit} noValidate>
      <section class="order__items">
        <h2>Ваш заказ</h2>
        <ul class="drawer__list">
          {items.map((i) => (
            <li class="line">
              {i.image && <img src={i.image} alt="" width="72" height="72" loading="lazy" />}
              <div class="line__body">
                <p class="line__title"><a href={BASE + i.path + '/'}>{i.title}</a></p>
                {i.variant && <p class="line__meta">{i.variant}</p>}
                {i.addons.length > 0 && <p class="line__meta">+ {i.addons.join(', ')}</p>}
                <div class="line__row">
                  <div class="buy__qty" role="group" aria-label="Количество">
                    <button type="button" aria-label="Меньше" onClick={() => setQty(i.key, i.qty - 1)}>−</button>
                    <span>{i.qty}</span>
                    <button type="button" aria-label="Больше" onClick={() => setQty(i.key, i.qty + 1)}>+</button>
                  </div>
                  <b>{rub(i.price * i.qty)}</b>
                </div>
              </div>
              <button type="button" class="line__del" aria-label={`Убрать ${i.title}`} onClick={() => removeFromCart(i.key)}>×</button>
            </li>
          ))}
        </ul>
        <p class="drawer__sum"><span>Итого</span><b>{rub(cartTotal.value)}</b></p>
      </section>
      <section class="order__form">
        <h2>Контакты</h2>
        <label class="field"><span>Имя *</span>
          <input type="text" autocomplete="name" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} aria-invalid={!!errors.name} />
          {errors.name && <em>{errors.name}</em>}
        </label>
        <label class="field"><span>Телефон *</span>
          <input type="tel" autocomplete="tel" inputmode="tel" value={tel} onInput={(e) => setTel((e.target as HTMLInputElement).value)} aria-invalid={!!errors.tel} />
          {errors.tel && <em>{errors.tel}</em>}
        </label>
        <label class="field"><span>Email</span>
          <input type="email" autocomplete="email" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
        </label>
        <label class="field"><span>Машина и комментарий</span>
          <textarea rows={3} placeholder="Марка, модель, год – проверим совместимость" value={car} onInput={(e) => setCar((e.target as HTMLTextAreaElement).value)} />
        </label>
        <label class="check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree((e.target as HTMLInputElement).checked)} />
          <span>Согласен на обработку персональных данных по <a href={policyHref}>политике конфиденциальности</a></span>
        </label>
        {errors.agree && <em class="field__err">{errors.agree}</em>}
        {errors.send && <em class="field__err" role="alert">{errors.send}</em>}
        <button type="submit" class="btn btn--accent" disabled={busy}>{busy ? 'Отправляем…' : 'Отправить заказ'}</button>
        <p class="order__note">Мы свяжемся с вами, чтобы подтвердить заказ и способ оплаты.</p>
      </section>
    </form>
  );
}
