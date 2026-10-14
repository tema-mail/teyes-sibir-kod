// Товары и категории магазина для страниц на коде. Данные – site/src/data/*.json (готовит scripts/products.py
// из снимка магазина Tilda): все товары (PER_SECTION = None), total – сколько их в категории магазина;
// parts – служебные страницы разделов Tilda /store/catalog/<uid>-<имя>, товар туда попадает по своим parts.
import products from '../data/products.json';
import catalog from '../data/catalog.json';
import { u } from './site';

export type Edition = { id: string; options: Record<string, string>; price: number; priceOld: number; stock: string };
export type Addon = { label: string; price: number };
export type Product = {
  id: string; path: string; section: string; brand: string; title: string; descr: string; text: string;
  price: number; priceOld: number; mark: string; model: string; sort: number;
  options: { title: string; values: string[] }[]; editions: Edition[]; addons: Addon[];
  characteristics: { title: string; value: string }[]; images: string[]; parts: string[];
  hidden?: boolean; // скрыт в админке – нет на сайте (ни страницы, ни в каталогах)
};
export type Part = { uid: string; path: string; title: string; count: number };
export type Section = { slug: string; name: string; country: string; count: number; total: number };
/** То, что нужно сетке каталога и корзине, без описаний. */
export type Card = { id: string; path: string; title: string; price: number; priceOld: number; from: boolean; mark: string; model: string; image: string; brand: string };

/** Цена, за которую товар реально можно купить: у товаров с вариантами – самый дешёвый вариант.
 *  В магазине Tilda базовая цена у 295 товаров ниже любого варианта (29 500 в каталоге, 50 400 при покупке). */
export const minPrice = (p: Product) => (p.editions.length ? Math.min(...p.editions.map((e) => e.price || p.price)) : p.price);

export const ALL_PRODUCTS = products as Product[]; // со скрытыми – для админки
export const PRODUCTS = ALL_PRODUCTS.filter((p) => !p.hidden);
export const SECTIONS = (catalog as { sections: Section[] }).sections;
export const PARTS = (catalog as { parts: Part[] }).parts;

/** Фото товара: site/public/img/p/<имя>.webp. */
export const img = (name?: string) => (name ? u(`/img/p/${name}`) : '');

/** Адрес категории в копии: Магнитолы Teyes, Комплекты Teyes (корень), марка в комплектах. */
export const sectionHref = (slug: string) =>
  slug === 'teyes' ? '/store/catalog_teyes/' : slug === 'catalog' ? '/store/catalog/' : `/store/catalog/${slug}/`;

export const sectionName = (slug: string) =>
  slug === 'teyes' ? 'Магнитолы Teyes' : slug === 'catalog' ? 'Комплекты Teyes' : SECTIONS.find((s) => s.slug === slug)?.name || slug;

export const toCard = (p: Product): Card => ({
  id: p.id, path: p.path, title: p.title, price: minPrice(p), priceOld: p.editions.length ? 0 : p.priceOld,
  from: new Set(p.editions.map((e) => e.price)).size > 1, mark: p.mark, model: p.model,
  image: img(p.images[0]), brand: p.brand,
});

export const bySection = (slug: string) => PRODUCTS.filter((p) => p.section === slug);
export const byPart = (uid: string) => PRODUCTS.filter((p) => p.parts.includes(uid));

/** Похожие: та же модель магнитолы в других марках, затем остальные; без самого товара. */
export function similar(p: Product, n = 8): Card[] {
  const rest = PRODUCTS.filter((x) => x.id !== p.id);
  const same = rest.filter((x) => x.model === p.model);
  return [...same, ...rest.filter((x) => x.model !== p.model)].slice(0, n).map(toCard);
}

/** Модели магнитол в наборе товаров – для фильтра каталога, по частоте. */
export function models(list: { model: string }[]) {
  const count = new Map<string, number>();
  list.forEach((p) => p.model && count.set(p.model, (count.get(p.model) || 0) + 1));
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
}
