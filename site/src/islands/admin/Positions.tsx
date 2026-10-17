// «Позиции» кабинета – вид перенесён из EV SIBIR (server/positions_view.py: плитки, сегменты, таблица с цветом
// топ-3 / топ-10 / 11–30, вкладка «Нейросети»). Данные – с admin.teyes-sibir.ru/api/positions по логину кабинета:
// Google – Search Console (раз в день), Яндекс – последний архив, нейросети – последний прогон (scripts/llm_visibility.py).
import { useEffect, useMemo, useState } from 'preact/hooks';

const API = 'https://admin.teyes-sibir.ru/api/positions';
type Row = { query: string; impressions: number | null; clicks: number | null; position: number | null; position_long: number | null; direction: string };
type Engine = { origin: string; date_from: string; date_to: string; collected_at: string; rows: Row[] } | null;
type Answer = { mentioned?: boolean; linked?: boolean; snippet?: string; sources?: string[]; error?: string };
type Ai = { saved_at: string; date: string; models: string[]; cost_usd?: number; questions?: number; summary: Record<string, number>;
  rows: { question: string; answers: Record<string, Answer> }[] } | null;
type Data = { google: Engine; yandex: Engine; ai: Ai };

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const auth = () => { try { const a = JSON.parse(sessionStorage.getItem('tx_admin_auth') || 'null'); return a ? 'Basic ' + b64(`${a.login}:${a.pass}`) : ''; } catch { return ''; } };
const dm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}`;
const num = (n: number) => n.toLocaleString('ru-RU');
const pos = (p: number | null) => (p == null ? '–' : p.toFixed(1).replace('.', ','));
// Топ-N – как в прошлом дашборде и Вебмастере: «позиция 3» = средняя от 3,0 до 3,9, то есть топ-3 – меньше 4
const inTop = (p: number | null, n: number) => p != null && p < n + 1;
const cls = (p: number | null) => (p == null ? 'out' : inTop(p, 3) ? 't3' : inTop(p, 10) ? 't10' : inTop(p, 30) ? 't30' : 'out');
/** Пять плашек раздела: запросы с показами, топ-3, топ-10, средняя позиция, клики. */
function tiles(rows: Row[]) {
  const top = (n: number) => rows.filter((r) => inTop(r.position, n)).length;
  const withPos = rows.filter((r) => r.position != null);
  return {
    queries: rows.length, top3: top(3), top10: top(10), clicks: rows.reduce((s, r) => s + (r.clicks || 0), 0),
    impressions: rows.reduce((s, r) => s + (r.impressions || 0), 0),
    avg: withPos.length ? withPos.reduce((s, r) => s + r.position!, 0) / withPos.length : null,
  };
}
const pct = (a: number, b: number) => `${b ? Math.round((a / b) * 100) : 0}%`;

/** Яндекс + Google вместе – между вкладками «Позиции / Нейросети» и «Google / Яндекс» (владелец 17.10). */
function Total({ g, y }: { g: Engine; y: Engine }) {
  const a = tiles(g?.rows || []), b = tiles(y?.rows || []);
  const sum = { queries: a.queries + b.queries, top3: a.top3 + b.top3, top10: a.top10 + b.top10, clicks: a.clicks + b.clicks };
  const all = [...(g?.rows || []), ...(y?.rows || [])].filter((r) => r.position != null);
  const avg = all.length ? all.reduce((s, r) => s + r.position!, 0) / all.length : null;
  const split = (ya: string | number, go: string | number) => `Яндекс ${ya} · Google ${go}`;
  const kpi: [string, string, string][] = [
    ['Запросов с показами', num(sum.queries), split(num(b.queries), num(a.queries))],
    ['В топ-3', num(sum.top3), `${pct(sum.top3, sum.queries)} · ${split(num(b.top3), num(a.top3))}`],
    ['В топ-10', num(sum.top10), `${pct(sum.top10, sum.queries)} · ${split(num(b.top10), num(a.top10))}`],
    ['Средняя позиция', pos(avg), split(pos(b.avg), pos(a.avg))],
    ['Клики', num(sum.clicks), split(num(b.clicks), num(a.clicks))],
  ];
  return (
    <>
      <p class="ps-muted" style="margin:0"><b>Яндекс + Google вместе.</b> Периоды разные: Google – {g ? `${dm(g.date_from)} – ${dm(g.date_to)}` : 'нет данных'}, Яндекс – {y ? `${dm(y.date_from)} – ${dm(y.date_to)} (архив)` : 'нет данных'}.</p>
      <section class="ps-kpis">{kpi.map(([t, v, d]) => <div class="ps-kpi"><span class="ps-muted">{t}</span><b>{v}</b><span class="ps-d">{d}</span></div>)}</section>
    </>
  );
}

function EngineView({ e, name }: { e: Engine; name: string }) {
  const [dir, setDir] = useState('');
  const dirs = useMemo(() => [...new Set((e?.rows || []).map((r) => r.direction))], [e]);
  if (!e) return <div class="ps-note">{name}: данных нет.</div>;
  const rows = e.rows.filter((r) => !dir || r.direction === dir);
  const t = tiles(rows);
  const kpi: [string, string, string][] = [
    ['Запросов с показами', num(t.queries), `за ${dm(e.date_from)} – ${dm(e.date_to)}`],
    ['В топ-3', num(t.top3), `${pct(t.top3, t.queries)} запросов`],
    ['В топ-10', num(t.top10), `${pct(t.top10, t.queries)} запросов`],
    ['Средняя позиция', pos(t.avg), 'по запросам с показами'],
    ['Клики', num(t.clicks), `показы ${num(t.impressions)}`],
  ];
  return (
    <>
      <nav class="ps-seg" aria-label="Направление">
        <a href="#" class={dir ? '' : 'on'} onClick={(ev) => { ev.preventDefault(); setDir(''); }}>Все направления</a>
        {dirs.map((d) => <a href="#" class={dir === d ? 'on' : ''} onClick={(ev) => { ev.preventDefault(); setDir(d); }}>{d}</a>)}
      </nav>
      <section class="ps-kpis">{kpi.map(([t, v, d]) => <div class="ps-kpi"><span class="ps-muted">{t}</span><b>{v}</b><span class="ps-d">{d}</span></div>)}</section>
      <div class="ps-wrap">
        <table>
          <thead><tr><th class="l">Запрос · направление</th><th>Показы</th><th>Клики</th><th>Позиция, 30 дн.</th><th>За 3 мес.</th><th>Сдвиг</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const d = r.position != null && r.position_long != null ? r.position_long - r.position : null;
              return (
                <tr><td class="q l">{r.query}<small>{r.direction}</small></td><td>{r.impressions == null ? '–' : num(r.impressions)}</td><td>{r.clicks == null ? '–' : num(r.clicks)}</td>
                  <td class={`p ${cls(r.position)}`}>{pos(r.position)}</td><td class="ps-muted">{pos(r.position_long)}</td>
                  <td class={`ps-d ${d == null || Math.abs(d) < 0.5 ? '' : d > 0 ? 'up' : 'down'}`}>{d == null || Math.abs(d) < 0.5 ? '–' : `${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1).replace('.', ',')}`}</td></tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AiView({ ai }: { ai: Ai }) {
  if (!ai) return <section class="ps-note">Прогона по нейросетям ещё не было.</section>;
  return (
    <>
      <p class="ps-muted" style="margin:0">Прогон {ai.date}: вопросы, которые задаёт клиент, – называет ли нейросеть TEYES Sibir
        (в любом написании, в том числе «Тиайс Сибирь») или сайт teyes-sibir.ru. Слово «Teyes» без «Сибирь» не считается: это марка
        магнитол. Наведите на ячейку – кусок ответа и на какие сайты нейросеть ссылалась.{ai.cost_usd != null && ` Стоимость прогона – ${String(ai.cost_usd).replace('.', ',')} $.`}</p>
      <section class="ps-kpis">{ai.models.map((m) => <div class="ps-kpi"><span class="ps-muted">{m}</span><b>{ai.summary[m] ?? 0} из {ai.rows.length}</b><span class="ps-d">ответов называют нас</span></div>)}</section>
      <div class="ps-wrap">
        <table>
          <thead><tr><th class="l">Вопрос</th>{ai.models.map((m) => <th>{m}</th>)}</tr></thead>
          <tbody>
            {ai.rows.map((r) => (
              <tr><td class="q l">{r.question}</td>
                {ai.models.map((m) => {
                  const a = r.answers[m] || {};
                  const tip = [a.snippet, a.sources?.length ? `Источники: ${a.sources.join(', ')}` : ''].filter(Boolean).join('\n\n');
                  return a.error ? <td class="p err" title={a.error}>?</td>
                    : a.mentioned ? <td class="p t10" title={tip}>да{a.linked ? ' · ссылка' : ''}</td>
                      : <td class="p out" title={tip}>нет</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function Positions() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'pos' | 'ai'>('pos');
  const [eng, setEng] = useState<'google' | 'yandex'>('google');
  useEffect(() => {
    fetch(API, { headers: { Authorization: auth() }, cache: 'no-store', credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 401 ? 'сервер не принял логин кабинета' : `сервер ответил ${r.status}`))))
      .then(setD, (e) => setErr(`Позиции не загрузились: ${e.message}`));
  }, []);
  const e = d ? d[eng] : null;
  return (
    <div class="ps">
      <div class="ps-bar"><h1>Позиции</h1>
        <div class="ps-fresh"><span class="ps-muted">{d?.google ? `Google – данные на ${dm(d.google.date_to)}, обновляются раз в день` : ''}</span></div></div>
      {err && <div class="ps-err">{err}</div>}
      <nav class="ps-seg" aria-label="Вкладка">
        {(['pos', 'ai'] as const).map((t) => <a href="#" class={tab === t ? 'on' : ''} onClick={(ev) => { ev.preventDefault(); setTab(t); }}>{t === 'pos' ? 'Позиции' : 'Нейросети'}</a>)}
      </nav>
      {!d && !err && <p class="ps-muted">Загружаю…</p>}
      {d && tab === 'ai' && <AiView ai={d.ai} />}
      {d && tab === 'pos' && (
        <>
          <Total g={d.google} y={d.yandex} />
          <nav class="ps-seg" aria-label="Поисковик">
            {(['google', 'yandex'] as const).map((x) => <a href="#" class={eng === x ? 'on' : ''} onClick={(ev) => { ev.preventDefault(); setEng(x); }}>{x === 'google' ? 'Google' : 'Яндекс'}</a>)}
          </nav>
          {eng === 'google'
            ? <div class="ps-note">Google – по данным Search Console: средняя позиция сайта по запросу за 30 дней и за 3 месяца, по всем регионам. Цвет: синий – топ-3, зелёный – топ-10, светлый – 11–30.</div>
            : <div class="ps-note">Яндекс – последний архив Вебмастера ({e ? `${dm(e.date_from)} – ${dm(e.date_to)}` : 'нет'}): с 12.10 API Вебмастера не отвечает ни с сервера, ни с мака (соединение зависает), поэтому свежих данных Яндекса нет. Живой съём позиций в Яндексе по Новосибирску – XMLRiver, платно: включим по смете.</div>}
          <EngineView e={e} name={eng === 'google' ? 'Google' : 'Яндекс'} />
        </>
      )}
    </div>
  );
}
