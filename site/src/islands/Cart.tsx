// Корзина в шапке: кнопка с числом и шторка (позиции с вариантом и опциями, количество, сумма, «Оформить»),
// плюс всплывающее «Добавлено». Экземпляров два (телефон и компьютер); шторку и тост рисует только drawer.
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { cart, cartCount, cartTotal, sheet, toast, setQty, removeFromCart } from '../lib/store';

const rub = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
// Tab не уходит из открытой шторки под неё
const trap = (e: KeyboardEvent, box: HTMLElement) => {
  const f = box.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input');
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
};

export default function Cart({ drawer = false, orderHref, favHref }: { drawer?: boolean; orderHref: string; favHref: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!drawer || sheet.value !== 'cart') return;
    const back = document.activeElement as HTMLElement | null; // после закрытия фокус вернётся туда, откуда открыли
    box.current?.querySelector<HTMLElement>('.drawer__close')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') sheet.value = null;
      if (e.key === 'Tab' && box.current) trap(e, box.current);
    };
    document.addEventListener('keydown', onKey);
    document.documentElement.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.documentElement.style.overflow = ''; back?.focus(); };
  }, [drawer, sheet.value]);

  const count = mounted ? cartCount.value : 0;
  const buttons = (
    <div class="cartbtns">
      <a class="cartbtn" href={favHref} aria-label="Избранное">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 5 6.5 5c2 0 3.3 1 4.1 2.2.1.1.3.1.4 0C11.8 6 13.1 5 15.1 5 18.6 5 20.7 8.4 19.2 11.8 17.1 16.4 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="1.8" /></svg>
      </a>
      <button type="button" class="cartbtn" aria-label={`Корзина, товаров: ${count}`} onClick={() => (sheet.value = 'cart')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 7h12l-1 13H7L6 7z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>
        {count > 0 && <span class="cartbtn__n">{count}</span>}
      </button>
    </div>
  );
  if (!drawer || !mounted) return buttons;

  const items = cart.value;
  const panel = (
    <>
      {sheet.value === 'cart' && (
        <div class="drawer" role="dialog" aria-modal="true" aria-label="Корзина" ref={box}>
          <button type="button" class="drawer__shade" aria-label="Закрыть корзину" onClick={() => (sheet.value = null)} />
          <div class="drawer__panel">
            <div class="drawer__head">
              <p class="drawer__title">Корзина</p>
              <button type="button" class="drawer__close" aria-label="Закрыть" onClick={() => (sheet.value = null)}>×</button>
            </div>
            {items.length === 0 ? (
              <p class="drawer__empty">Корзина пуста. Добавьте магнитолу или комплект из каталога.</p>
            ) : (
              <ul class="drawer__list">
                {items.map((i) => (
                  <li class="line">
                    {i.image && <img src={i.image} alt="" width="72" height="72" loading="lazy" />}
                    <div class="line__body">
                      <p class="line__title">{i.title}</p>
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
            )}
            {items.length > 0 && (
              <div class="drawer__foot">
                <p class="drawer__sum"><span>Итого</span><b>{rub(cartTotal.value)}</b></p>
                <a class="btn btn--accent" href={orderHref}>Оформить заказ</a>
              </div>
            )}
          </div>
        </div>
      )}
      {toast.value && <div class="toast" role="status">{toast.value}</div>}
    </>
  );
  return <>{buttons}{createPortal(panel, document.body)}</>;
}
