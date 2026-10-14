// Товары и категории магазина для страниц на коде. Данные – site/src/data/*.json (готовит scripts/products.py
// из снимка магазина Tilda): на сайт идёт по PER_SECTION товаров категории, total – сколько их в магазине.
import products from '../data/products.json';
import catalog from '../data/catalog.json';
import { u } from './site';

export type Edition = { id: string; options: Record<string, string>; price: number; priceOld: number; stock: string };
export type Addon = { label: string; price: number };
export type Product = {
  id: string; path: string; section: string; brand: string; title: string; descr: string; text: string;
  price: number; priceOld: number; mark: string; model: string; sort: number;
  options: { title: string; values: string[] }[]; editions: Edition[]; addons: Addon[];
  characteristics: { title: string; value: string }[]; images: string[];
};
export type Section = { slug: string; name: string; country: string; count: number; total: number };
/** То, что нужно сетке каталога и корзине, без описаний. */
export type Card = { id: string; path: string; title: string; price: number; priceOld: number; mark: string; model: string; image: string; brand: string };

export const PRODUCTS = products as Product[];
export const SECTIONS = (catalog as { sections: Section[] }).sections;

/** Фото товара: site/public/img/p/<имя>.webp. */
export const img = (name?: string) => (name ? u(`/img/p/${name}`) : '');

/** Адрес категории в копии: Магнитолы Teyes, Комплекты Teyes (корень), марка в комплектах. */
export const sectionHref = (slug: string) =>
  slug === 'teyes' ? '/store/catalog_teyes/' : slug === 'catalog' ? '/store/catalog/' : `/store/catalog/${slug}/`;

export const sectionName = (slug: string) =>
  slug === 'teyes' ? 'Магнитолы Teyes' : slug === 'catalog' ? 'Комплекты Teyes' : SECTIONS.find((s) => s.slug === slug)?.name || slug;

export const toCard = (p: Product): Card => ({
  id: p.id, path: p.path, title: p.title, price: p.price, priceOld: p.priceOld, mark: p.mark, model: p.model,
  image: img(p.images[0]), brand: p.brand,
});

export const bySection = (slug: string) => PRODUCTS.filter((p) => p.section === slug);

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
