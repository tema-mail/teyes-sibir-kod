// Месяц к прошлому месяцу по реальным запросам с показами: Яндекс – «Статистика запросов» Вебмастера («Все» и
// выбранные владельцем регионы), Google – Search Console («Все»; города Google не отдаёт).
// Владелец 17.10: «нужны наши цифры с Вебмастера», «замеры за месяц собираются»; 18.10: «редкие запросы тоже…
// подтяни их как редкие», «брендовые отдельно», «цифра, какая она действительно есть».
// Данные Яндекса – POST /api/positions/webmaster (снимает мак из кабинета владельца: API Вебмастера из сети не отвечает).
import { useMemo, useState } from 'preact/hooks';
import { cls, dm, inTop, num, pos } from './posUtil';

type Row = { query: string; position: number; impressions: number; clicks: number; prev_position: number | null;
  prev_impressions: number | null; prev_clicks: number | null; direction: string; brand: boolean };
type Period = { date_from: string; date_to: string; collected_at: string };
export type Wm = (Period & { engine: 'yandex' | 'google'; region: number; name: string; prev: Period | null; rows: Row[];
  gone: { query: string; position: number; impressions: number; clicks: number; brand: boolean }[] }) | null;
export type View = { key: string; label: string; title: string; wm: Wm };
type Only = 'all' | 'near' | 'top' | 'up' | 'down' | 'new' | 'gone';
type Kind = 'all' | 'brand' | 'plain' | 'rare';

/** Редкий запрос – меньше 5 показов за месяц (как «низкие показы» в дашборде августа). */
export const RARE = 5;
const PAGE = 300; // строк таблицы за раз: у Яндекса по всем регионам больше 2 000 запросов
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
/** Средняя позиция с весом по показам – как общая «средняя позиция» в Вебмастере. */
const avg = (rows: { position: number; impressions: number }[]) => {
  const w = sum(rows.map((r) => r.impressions));
  return w ? sum(rows.map((r) => r.position * r.impressions)) / w : null;
};
const span = (p: Period) => `${dm(p.date_from)} – ${dm(p.date_to)}`;
const shift = (r: Row) => (r.prev_position == null ? null : Math.round((r.prev_position - r.position) * 10) / 10); // плюс – выше
const isKind = (k: Kind) => (r: { brand: boolean; impressions: number }) =>
  k === 'all' || (k === 'brand' ? r.brand : k === 'plain' ? !r.brand && r.impressions >= RARE : !r.brand && r.impressions < RARE);

export default function WmMonth({ views }: { views: View[] }) {
  const [key, setKey] = useState(views[0]?.key);
  const [only, setOnly] = useState<Only>('all');
  const [kind, setKind] = useState<Kind>('all');
  const [dir, setDir] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const view = views.find((v) => v.key === key) || views[0];
  const wm = view?.wm ?? null;
  const dirs = useMemo(() => (wm ? [...new Set(wm.rows.map((r) => r.direction))] : []), [wm]);
  const tabs = views.length > 1 && (
    <nav class="ps-seg" aria-label="Регион">{views.map((v) => <a href="#" class={v.key === view.key ? 'on' : ''} onClick={(ev) => { ev.preventDefault(); setKey(v.key); setOnly('all'); setDir(''); setLimit(PAGE); }}>{v.label}</a>)}</nav>
  );
  if (!wm) return <>{tabs}<div class="ps-note">{view?.title}: замера за месяц ещё нет.</div></>;
  const prevRows = wm.rows.filter((r) => r.prev_position != null)
    .map((r) => ({ position: r.prev_position!, impressions: r.prev_impressions || 0, clicks: r.prev_clicks || 0, brand: r.brand })).concat(wm.gone);
  const was = wm.prev ? prevRows : null;
  const d = (a: number, b: number | undefined) => {
    if (b == null) return '';
    const x = a - b;
    return x === 0 ? 'без изменений' : `${x > 0 ? '▲ +' : '▼ '}${num(Math.round(x * 10) / 10)} к прошлому месяцу`;
  };
  const top = (rows: { position: number }[], n: number) => rows.filter((r) => inTop(r.position, n)).length;
  const shows = (rows: { impressions: number }[]) => sum(rows.map((r) => r.impressions));
  const clicks = (rows: { clicks: number }[]) => sum(rows.map((r) => r.clicks));
  const brand = wm.rows.filter(isKind('brand')), rare = wm.rows.filter(isKind('rare'));
  const kpi: [string, string, string][] = [
    ['Запросов с показами', num(wm.rows.length), d(wm.rows.length, was?.length)],
    ['Брендовые', num(brand.length), `${num(shows(brand))} показов · ${num(clicks(brand))} кликов`],
    ['Редкие', num(rare.length), `меньше ${RARE} показов за месяц · ${num(shows(rare))} показов`],
    ['Показов', num(shows(wm.rows)), d(shows(wm.rows), was ? shows(was) : undefined)],
    ['Кликов', num(clicks(wm.rows)), d(clicks(wm.rows), was ? clicks(was) : undefined) || 'переходов на сайт'],
    ['В топ-3', num(top(wm.rows, 3)), d(top(wm.rows, 3), was ? top(was, 3) : undefined)],
    ['В топ-10', num(top(wm.rows, 10)), d(top(wm.rows, 10), was ? top(was, 10) : undefined)],
    ['Средняя позиция', pos(avg(wm.rows)), was ? `была ${pos(avg(was))} · с весом по показам` : 'с весом по показам'],
  ];
  const keep = (r: Row) => {
    const s = shift(r);
    return only === 'all' || (only === 'near' ? r.position >= 4 && r.position < 21 : only === 'top' ? inTop(r.position, 3)
      : only === 'up' ? s != null && s >= 1 : only === 'down' ? s != null && s <= -1 : only === 'new' ? r.prev_position == null : false);
  };
  const rows = wm.rows.filter((r) => (!dir || r.direction === dir) && isKind(kind)(r) && keep(r));
  if (only === 'up' || only === 'down') rows.sort((a, b) => Math.abs(shift(b)!) - Math.abs(shift(a)!));
  const gone = wm.gone.filter(isKind(kind));
  const filters: [Only, string][] = [['all', 'Все'], ['near', 'Места 4–20 – подтянуть'], ['top', 'Топ-3 – держать'],
    ...(wm.prev ? [['up', 'Выросли'], ['down', 'Упали'], ['new', 'Новые'], ['gone', `Пропали (${num(gone.length)})`]] as [Only, string][] : [])];
  const kinds: [Kind, string][] = [['all', 'Все запросы'], ['brand', 'Брендовые'], ['plain', `Небрендовые от ${RARE} показов`], ['rare', 'Редкие']];
  const seg = <T extends string,>(list: [T, string][], cur: T, set: (x: T) => void, label: string) => (
    <nav class="ps-seg" aria-label={label}>{list.map(([k, t]) => <a href="#" class={cur === k ? 'on' : ''} onClick={(ev) => { ev.preventDefault(); set(k); setLimit(PAGE); }}>{t}</a>)}</nav>
  );
  return (
    <>
      {tabs}
      <p class="ps-muted" style="margin:0"><b>{view.title} за {span(wm)}</b>
        {wm.prev ? ` – сравнение с ${span(wm.prev)}.` : ' – прошлого месяца для сравнения нет.'} Все запросы, по которым сайт показывался,
        вместе с редкими. Брендовые – TEYES в любом написании и адрес на Сухарной. Средняя позиция за месяц по всем показам.</p>
      <section class="ps-kpis">{kpi.map(([t, v, x]) => <div class="ps-kpi"><span class="ps-muted">{t}</span><b>{v}</b><span class="ps-d">{x}</span></div>)}</section>
      <div class="ps-row">
        {seg(kinds, kind, setKind, 'Тип запросов')}
        {seg(filters, only, setOnly, 'Показать')}
        {only !== 'gone' && dirs.length > 1 && <nav class="ps-seg" aria-label="Направление">
          <a href="#" class={dir ? '' : 'on'} onClick={(ev) => { ev.preventDefault(); setDir(''); }}>Все направления</a>
          {dirs.map((x) => <a href="#" class={dir === x ? 'on' : ''} onClick={(ev) => { ev.preventDefault(); setDir(x); setLimit(PAGE); }}>{x}</a>)}
        </nav>}
      </div>
      <div class="ps-wrap">
        {only === 'gone' ? (
          <table>
            <thead><tr><th class="l">Запрос, по которому были показы в прошлом месяце, а в этом нет</th><th>Показов было</th><th>Место было</th></tr></thead>
            <tbody>
              {gone.slice(0, limit).map((r) => <tr class={!r.brand && r.impressions < RARE ? 'ps-rare' : ''}><td class="q l">{r.query}{r.brand && <span class="mark brand">бренд</span>}</td><td>{num(r.impressions)}</td><td class={`p ${cls(r.position)}`}>{pos(r.position)}</td></tr>)}
              {!gone.length && <tr><td colSpan={3} class="ps-muted">Нет запросов</td></tr>}
            </tbody>
          </table>
        ) : (
          <table>
            <thead><tr><th class="l">Запрос</th><th>Показы</th><th>Клики</th><th>Ср. место</th>{wm.prev && <th>Было</th>}</tr></thead>
            <tbody>
              {rows.slice(0, limit).map((r) => {
                const s = shift(r);
                return (
                  <tr class={!r.brand && r.impressions < RARE ? 'ps-rare' : ''}>
                    <td class="q l">{r.query}{r.brand ? <span class="mark brand">бренд</span> : r.impressions < RARE && <span class="mark rare">редкий</span>}<small>{r.direction}</small></td>
                    <td>{num(r.impressions)}{r.prev_impressions != null && r.prev_impressions !== r.impressions && <small class="ps-muted"> было {num(r.prev_impressions)}</small>}</td>
                    <td>{num(r.clicks)}</td>
                    <td class={`p ${cls(r.position)}`}>{pos(r.position)}{s != null && Math.abs(s) >= 1 && <sup class={s > 0 ? 'ps-d up' : 'ps-d down'}>{s > 0 ? `+${pos(s)}` : pos(s)}</sup>}</td>
                    {wm.prev && <td class="ps-muted">{r.prev_position == null ? 'новый' : pos(r.prev_position)}</td>}</tr>
                );
              })}
              {!rows.length && <tr><td colSpan={5} class="ps-muted">Нет запросов</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {(only === 'gone' ? gone.length : rows.length) > limit && (
        <p class="ps-muted" style="margin:0">Показано {num(limit)} из {num(only === 'gone' ? gone.length : rows.length)} ·{' '}
          <a href="#" onClick={(ev) => { ev.preventDefault(); setLimit(limit + PAGE * 3); }}>показать ещё</a></p>
      )}
    </>
  );
}
