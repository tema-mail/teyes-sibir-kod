// Работы мастеров (раздел «Наши работы»): файлы site/src/data/works/<alias>.json кладёт Case Studio
// (публикатор Astro, коммит в этот репо). Фото – site/public/img/w/<alias>/, в HTML адреса начинаются с __BASE__/.
import { BASE, LIVE } from './site';

export interface Photo { src: string; w: number; h: number; role: string; alt: string; caption: string }
export interface Section { eyebrow: string; heading: string; paragraphs: string[]; photos: Photo[] }

export interface Work {
  id: number; alias: string; make: string; make_slug: string; model: string; year: string;
  service: string; extra_services: string[]; work_text?: string; title: string; description: string;
  main_phrase: string; extra_phrases: string[]; lead: string; faq: { q: string; a: string }[];
  /** С 25.10 страница верстается из разделов; у ранних записей есть только html. */
  sections?: Section[]; before?: Photo | null; after?: Photo | null;
  product?: { model: string; title: string; path: string } | null;
  cover: string; photos: string[]; published_at: string; html: string;
}

const files = import.meta.glob<Work>('../data/works/*.json', { eager: true, import: 'default' });

/** Все работы, новые первыми. */
export const WORKS: Work[] = Object.values(files).sort((a, b) => b.published_at.localeCompare(a.published_at));

/** __BASE__/img/… → адрес внутри копии (подпапка Pages) или корня своего домена. */
export const fix = (s: string) => s.split('__BASE__/').join(BASE + '/');

export const workPath = (w: Work) => `/nashi-raboty/${w.make_slug}/${w.alias}/`;
export const makePath = (slug: string) => `/nashi-raboty/${slug}/`;

/** Марки с работами: [slug, название, количество], по числу работ. */
export function makes(): [string, string, number][] {
  const map = new Map<string, [string, number]>();
  for (const w of WORKS) {
    const cur = map.get(w.make_slug);
    map.set(w.make_slug, [cur?.[0] || w.make, (cur?.[1] || 0) + 1]);
  }
  return [...map.entries()].map(([s, [n, c]]) => [s, n, c] as [string, string, number]).sort((a, b) => b[2] - a[2] || a[1].localeCompare(b[1]));
}

/** Полный адрес картинки для разметки и соцсетей: копия на Pages или свой домен. */
export const absolute = (path: string) => (BASE ? 'https://tema-mail.github.io' : LIVE) + fix(path);

export const date = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
