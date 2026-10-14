// Корзина и избранное (как в milovini-samara): сигналы Preact, хранение в localStorage браузера,
// синхронизация между вкладками. Позиция корзины – товар + выбранный вариант + доп. опции.
import { signal, computed } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';

export type CartItem = {
  key: string; id: string; title: string; path: string; image: string;
  variant: string; addons: string[]; price: number; qty: number;
};

const CART = 'tx_cart', FAV = 'tx_fav';
const read = <T,>(name: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(name) || '') as T; } catch { return fallback; }
};
const write = (name: string, value: unknown) => { try { localStorage.setItem(name, JSON.stringify(value)); } catch { /* приватный режим */ } };
const browser = typeof window !== 'undefined';

export const cart = signal<CartItem[]>(browser ? read(CART, []) : []);
export const favs = signal<string[]>(browser ? read(FAV, []) : []);
/** Какая шторка открыта: корзина, избранное или ничего. */
export const sheet = signal<'cart' | 'fav' | null>(null);
export const toast = signal('');

export const cartCount = computed(() => cart.value.reduce((n, i) => n + i.qty, 0));
export const cartTotal = computed(() => cart.value.reduce((n, i) => n + i.qty * i.price, 0));

if (browser) {
  window.addEventListener('storage', (e) => {
    if (e.key === CART) cart.value = read(CART, []);
    if (e.key === FAV) favs.value = read(FAV, []);
  });
}

const saveCart = (items: CartItem[]) => { cart.value = items; write(CART, items); };

/** Ключ позиции: опции сортируются – порядок кликов по галочкам не плодит одинаковые строки. */
export const lineKey = (id: string, variant: string, addons: string[]) => [id, variant, ...[...addons].sort()].join('|');

export function addToCart(item: Omit<CartItem, 'key' | 'qty'>, qty = 1) {
  const key = lineKey(item.id, item.variant, item.addons);
  const items = cart.value.slice();
  const found = items.find((i) => i.key === key);
  if (found) found.qty += qty; else items.push({ ...item, key, qty });
  saveCart(items);
  showToast('Добавлено в корзину');
}
export const setQty = (key: string, qty: number) =>
  saveCart(qty > 0 ? cart.value.map((i) => (i.key === key ? { ...i, qty } : i)) : cart.value.filter((i) => i.key !== key));
export const removeFromCart = (key: string) => saveCart(cart.value.filter((i) => i.key !== key));
export const clearCart = () => saveCart([]);

export const isFav = (id: string) => favs.value.includes(id);
export function toggleFav(id: string) {
  favs.value = isFav(id) ? favs.value.filter((x) => x !== id) : [...favs.value, id];
  write(FAV, favs.value);
  showToast(isFav(id) ? 'Добавлено в избранное' : 'Убрано из избранного');
}

/** false при сборке и гидрации: корзина и избранное есть только в браузере, а Preact при гидрации не
 *  обновляет атрибуты (сердечко осталось бы пустым). Состояние из localStorage – после монтирования. */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

let toastTimer = 0;
export function showToast(text: string) {
  toast.value = text;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.value = ''; }, 2200);
}
