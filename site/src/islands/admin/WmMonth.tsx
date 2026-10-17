// Яндекс по Новосибирску за месяц – «Статистика запросов» Вебмастера (регион 65), месяц к прошлому месяцу.
// Владелец 17.10: «мне нужны наши цифры с Вебмастера… только Новосибирск», «замеры за месяц собираются».
// Данные – POST /api/positions/webmaster (снимает мак из кабинета владельца: API Вебмастера из сети не отвечает).
import { useMemo, useState } from 'preact/hooks';
import { cls, dm, inTop, num, pos } from './posUtil';

type Row = { query: string; position: number; impressions: number; clicks: number; prev_position: number | null;
  prev_impressions: number | null; prev_clicks: number | null; direction: string };
type Period = { date_from: string; date_to: string; collected_at: string };
export type Wm = (Period & { region: number; prev: Period | null; rows: Row[];
  gone: { query: string; position: number; impressions: number; clicks: number }[] }) | null;
type Only = 'all' | 'near' | 'top' | 'up' | 'down' | 'new' | 'gone';

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
/** Средняя позиция с весом по показам – как общая «средняя позиция» в Вебмастере. */
const avg = (rows: { position: number; impressions: number }[]) => {
  const w = sum(rows.map((r) => r.impressions));
  return w ? sum(rows.map((r) => r.position * r.impressions)) / w : null;
};
const span = (p: Period) => `${dm(p.date_from)} – ${dm(p.date_to)}`;
const shift = (r: Row) => (r.prev_position == null ? null : Math.round((r.prev_position - r.position) * 10) / 10); // плюс – выше

export default function WmMonth({ wm }: { wm: Wm }) {
  const [only, setOnly] = useState<Only>('all');
  const [dir, setDir] = useState('');
  const dirs = useMemo(() => (wm ? [...new Set(wm.rows.map((r) => r.direction))] : []), [wm]);
  if (!wm) return <div class="ps-note">Месячного замера Вебмастера по Новосибирску ещё нет.</div>;
  const prevRows = wm.rows.filter((r) => r.prev_position != null)
    .map((r) => ({ position: r.prev_position!, impressions: r.prev_impressions || 0, clicks: r.prev_clicks || 0 })).concat(wm.gone);
  const was = wm.prev ? { n: prevRows.length, shows: sum(prevRows.map((r) => r.impressions)), clicks: sum(prevRows.map((r) => r.clicks)) } : null;
  const d = (a: number, b: number | undefined) => {
    if (b == null) return '';
    const x = a - b;
    return x === 0 ? 'без изменений' : `${x > 0 ? '▲ +' : '▼ '}${num(Math.round(x * 10) / 10)} к прошлому месяцу`;
  };
  const top = (rows: { position: number }[], n: number) => rows.filter((r) => inTop(r.position, n)).length;
  const kpi: [string, string, string][] = [
    ['Запросов с показами', num(wm.rows.length), d(wm.rows.length, was?.n)],
    ['Показов', num(sum(wm.rows.map((r) => r.impressions))), d(sum(wm.rows.map((r) => r.impressions)), was?.shows)],
    ['Кликов', num(sum(wm.rows.map((r) => r.clicks))), d(sum(wm.rows.map((r) => r.clicks)), was?.clicks) || 'переходов на сайт'],
    ['В топ-3', num(top(wm.rows, 3)), d(top(wm.rows, 3), was ? top(prevRows, 3) : undefined)],
    ['В топ-10', num(top(wm.rows, 10)), d(top(wm.rows, 10), was ? top(prevRows, 10) : undefined)],
    ['Средняя позиция', pos(avg(wm.rows)), was ? `была ${pos(avg(prevRows))} · с весом по показам` : 'с весом по показам'],
  ];
  const keep = (r: Row) => {
    const s = shift(r);
    return only === 'all' || (only === 'near' ? r.position >= 4 && r.position < 21 : only === 'top' ? inTop(r.position, 3)
      : only === 'up' ? s != null && s >= 1 : only === 'down' ? s != null && s <= -1 : only === 'new' ? r.prev_position == null : false);
  };
  const rows = wm.rows.filter((r) => (!dir || r.direction === dir) && keep(r));
  if (only === 'up' || only === 'down') rows.sort((a, b) => Math.abs(shift(b)!) - Math.abs(shift(a)!));
  const filters: [Only, string][] = [['all', 'Все'], ['near', 'Места 4–20 – подтянуть'], ['top', 'Топ-3 – держать'], ['up', 'Выросли'],
    ['down', 'Упали'], ['new', 'Новые'], ['gone', `Пропали (${wm.gone.length})`]];
  return (
    <>
      <p class="ps-muted" style="margin:0"><b>Яндекс Вебмастер, город Новосибирск, за месяц {span(wm)}</b>
        {wm.prev ? ` – сравнение с ${span(wm.prev)}.` : ' – прошлого месяца для сравнения нет.'} Средняя позиция за месяц по всем показам,
        показы и клики – реальные, из кабинета Вебмастера.</p>
      <section class="ps-kpis">{kpi.map(([t, v, x]) => <div class="ps-kpi"><span class="ps-muted">{t}</span><b>{v}</b><span class="ps-d">{x}</span></div>)}</section>
      <div class="ps-row">
        <nav class="ps-seg" aria-label="Показать">{filters.map(([k, t]) => <a href="#" class={only === k ? 'on' : ''} onClick={(ev) => { ev.preventDefault(); setOnly(k); }}>{t}</a>)}</nav>
        {only !== 'gone' && <nav class="ps-seg" aria-label="Направление">
          <a href="#" class={dir ? '' : 'on'} onClick={(ev) => { ev.preventDefault(); setDir(''); }}>Все направления</a>
          {dirs.map((x) => <a href="#" class={dir === x ? 'on' : ''} onClick={(ev) => { ev.preventDefault(); setDir(x); }}>{x}</a>)}
        </nav>}
      </div>
      <div class="ps-wrap">
        {only === 'gone' ? (
          <table>
            <thead><tr><th class="l">Запрос, по которому были показы в прошлом месяце, а в этом нет</th><th>Показов было</th><th>Место было</th></tr></thead>
            <tbody>
              {wm.gone.map((r) => <tr><td class="q l">{r.query}</td><td>{num(r.impressions)}</td><td class={`p ${cls(r.position)}`}>{pos(r.position)}</td></tr>)}
              {!wm.gone.length && <tr><td colSpan={3} class="ps-muted">Нет запросов</td></tr>}
            </tbody>
          </table>
        ) : (
          <table>
            <thead><tr><th class="l">Запрос</th><th>Показы</th><th>Клики</th><th>Ср. место</th><th>Было</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const s = shift(r);
                return (
                  <tr><td class="q l">{r.query}<small>{r.direction}</small></td>
                    <td>{num(r.impressions)}{r.prev_impressions != null && r.prev_impressions !== r.impressions && <small class="ps-muted"> было {num(r.prev_impressions)}</small>}</td>
                    <td>{num(r.clicks)}</td>
                    <td class={`p ${cls(r.position)}`}>{pos(r.position)}{s != null && Math.abs(s) >= 1 && <sup class={s > 0 ? 'ps-d up' : 'ps-d down'}>{s > 0 ? `+${pos(s)}` : pos(s)}</sup>}</td>
                    <td class="ps-muted">{r.prev_position == null ? 'новый' : pos(r.prev_position)}</td></tr>
                );
              })}
              {!rows.length && <tr><td colSpan={5} class="ps-muted">Нет запросов</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
