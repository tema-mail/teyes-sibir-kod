// «Позиции» кабинета – вид перенесён из EV SIBIR (server/positions_view.py: плитки, сегменты, таблица с цветом
// топ-3 / топ-10 / 11–30, вкладка «Нейросети»). Данные – с admin.teyes-sibir.ru/api/positions по логину кабинета:
// Яндекс – Вебмастер по Новосибирску за месяц (WmMonth.tsx), Яндекс и Google – снимок выдачи XMLRiver,
// нейросети – последний прогон (scripts/llm_visibility.py).
import { useEffect, useMemo, useState } from 'preact/hooks';
import WmMonth, { type Wm } from './WmMonth';
import { cls, dm, num, pos } from './posUtil';

const API = 'https://admin.teyes-sibir.ru/api/positions';
type Engine = unknown; // Search Console и архив Вебмастера – по всем регионам; в кабинете не показываются (нужен только Новосибирск)
type Answer = { mentioned?: boolean; linked?: boolean; snippet?: string; sources?: string[]; error?: string };
type Ai = { saved_at: string; date: string; models: string[]; cost_usd?: number; questions?: number; summary: Record<string, number>;
  rows: { question: string; answers: Record<string, Answer> }[] } | null;
type Spot = { position: number | null; depth: number | null; url: string | null; at: string; prev: number | null; had_prev: boolean } | null;
type NskRow = { query: string; demand: number | null; direction: string; yandex: Spot; google: Spot };
type Nsk = { rows: NskRow[]; measured_from: string | null; measured_to: string | null };
type Data = { nsk: Nsk; wm_nsk: Wm; google: Engine; yandex: Engine; ai: Ai };
type Eng = 'yandex' | 'google';
const ENG: Record<Eng, string> = { yandex: 'Яндекс', google: 'Google' };

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const auth = () => { try { const a = JSON.parse(sessionStorage.getItem('tx_admin_auth') || 'null'); return a ? 'Basic ' + b64(`${a.login}:${a.pass}`) : ''; } catch { return ''; } };
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

/** Доля кликов по месту в выдаче (средние данные по рунету, для оценки – не точные цифры для этого сайта). */
const CTR = [0, 0.28, 0.15, 0.11, 0.08, 0.06, 0.05, 0.04, 0.03, 0.03, 0.02];
const ctr = (p: number | null) => (p == null ? 0 : p <= 10 ? CTR[p] : p <= 20 ? 0.01 : 0);
const TOP3 = (CTR[1] + CTR[2] + CTR[3]) / 3; // цель – войти в топ-3
/** Прогноз трафика: сколько людей в месяц придёт сейчас и сколько добавит топ-3 (спрос × доля кликов). */
const now = (r: NskRow, e: Eng) => Math.round((r.demand || 0) * ctr(r[e]?.position ?? null));
const gain = (r: NskRow, e: Eng) => Math.max(0, Math.round((r.demand || 0) * TOP3) - now(r, e));

/** Плашки по Новосибирску: только запросы, по которым есть замер. */
function nskTiles(rows: NskRow[], e: Eng) {
  const got = rows.filter((r) => r[e]);
  const pos = got.map((r) => r[e]!.position).filter((p): p is number => p != null);
  return { checked: got.length, found: pos.length, top3: pos.filter((p) => p <= 3).length, top10: pos.filter((p) => p <= 10).length,
    avg: pos.length ? pos.reduce((a, b) => a + b, 0) / pos.length : null,
    demandTop3: got.filter((r) => r[e]!.position != null && r[e]!.position! <= 3).reduce((s, r) => s + (r.demand || 0), 0) };
}

/** Яндекс + Google вместе по Новосибирску – между «Позиции / Нейросети» и «Яндекс / Google» (владелец 17.10). */
function NskTotal({ n }: { n: Nsk }) {
  const y = nskTiles(n.rows, 'yandex'), g = nskTiles(n.rows, 'google');
  const sp = (a: string | number, b: string | number) => `Яндекс ${a} · Google ${b}`;
  const all = n.rows.flatMap((r) => [r.yandex?.position, r.google?.position]).filter((p): p is number => p != null);
  const kpi: [string, string, string][] = [
    ['Запросов проверено', num(y.checked + g.checked), sp(num(y.checked), num(g.checked))],
    ['В топ-3', num(y.top3 + g.top3), sp(num(y.top3), num(g.top3))],
    ['В топ-10', num(y.top10 + g.top10), sp(num(y.top10), num(g.top10))],
    ['Средняя позиция', pos(all.length ? all.reduce((a, b) => a + b, 0) / all.length : null), `по найденным в топ-20 · ${sp(pos(y.avg), pos(g.avg))}`],
    ['Спрос по запросам из топ-3', num(y.demandTop3 + g.demandTop3), `в месяц в Новосибирске · ${sp(num(y.demandTop3), num(g.demandTop3))}`],
  ];
  return (
    <>
      <p class="ps-muted" style="margin:0"><b>Новосибирск, Яндекс + Google вместе – снимок выдачи XMLRiver.</b> {n.measured_to ? `Замер ${dm(n.measured_from!)}${n.measured_from!.slice(0, 10) !== n.measured_to.slice(0, 10) ? ` – ${dm(n.measured_to)}` : ''}` : 'Замера ещё нет'} · выдача как у человека в Новосибирске, компьютер, топ-20.</p>
      <section class="ps-kpis">{kpi.map(([t, v, d]) => <div class="ps-kpi"><span class="ps-muted">{t}</span><b>{v}</b><span class="ps-d">{d}</span></div>)}</section>
    </>
  );
}

function NskView({ n, e }: { n: Nsk; e: Eng }) {
  const [dir, setDir] = useState('');
  const [only, setOnly] = useState<'all' | 'top' | 'near' | 'none'>('all');
  const dirs = useMemo(() => [...new Set(n.rows.map((r) => r.direction))], [n]);
  const rows = n.rows.filter((r) => r[e] && (!dir || r.direction === dir)).filter((r) => {
    const p = r[e]!.position;
    return only === 'all' || (only === 'top' ? p != null && p <= 3 : only === 'near' ? p != null && p > 3 && p <= 20 : p == null);
  });
  const filters: [typeof only, string][] = [['all', 'Все'], ['near', 'Рядом с топом – подтянуть'], ['none', 'Спрос есть – нас нет'], ['top', 'Уже в топе – держать']];
  const HINT: Record<typeof only, string> = {
    all: 'Все запросы со спросом в Новосибирске, по которым есть замер.',
    near: 'Места 4–20: страница уже в выдаче – подтянуть её до топ-3 быстрее всего. Сортировка – по прибавке людей.',
    none: 'Нас нет в топ-20: нужна своя страница под запрос или серьёзная доработка существующей.',
    top: 'Уже в топ-3: удерживать – не ломать страницу, обновлять цены и фото.',
  };
  if (only === 'near' || only === 'none') rows.sort((a, b) => gain(b, e) - gain(a, e));
  const sumNow = rows.reduce((s, r) => s + now(r, e), 0), sumGain = rows.reduce((s, r) => s + gain(r, e), 0);
  return (
    <>
      <div class="ps-row">
        <nav class="ps-seg" aria-label="Показать">{filters.map(([k, t]) => <a href="#" class={only === k ? 'on' : ''} onClick={(ev) => { ev.preventDefault(); setOnly(k); }}>{t}</a>)}</nav>
        <nav class="ps-seg" aria-label="Направление">
          <a href="#" class={dir ? '' : 'on'} onClick={(ev) => { ev.preventDefault(); setDir(''); }}>Все направления</a>
          {dirs.map((d) => <a href="#" class={dir === d ? 'on' : ''} onClick={(ev) => { ev.preventDefault(); setDir(d); }}>{d}</a>)}
        </nav>
      </div>
      <p class="ps-muted" style="margin:0">{HINT[only]} В списке {num(rows.length)} запросов: сейчас дают ≈ <b>{num(sumNow)}</b> чел. в месяц, в топ-3 добавят ≈ <b>{num(sumGain)}</b>.</p>
      <div class="ps-wrap">
        <table>
          <thead><tr><th class="l">Запрос · страница в выдаче</th><th>Спрос в НСК, мес.</th><th>{ENG[e]}, место</th><th>Было</th><th>Сейчас, чел./мес.</th><th>+ в топ-3</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const s = r[e]!;
              const d = s.position != null && s.prev != null ? s.prev - s.position : null;
              return (
                <tr><td class="q l">{r.query}<small>{r.direction}{s.url ? ' · ' : ''}{s.url && <a href={s.url} target="_blank" rel="noopener">{s.url.replace(/^https?:\/\/(www\.)?/, '')}</a>}</small></td>
                  <td>{r.demand == null ? '–' : num(r.demand)}</td>
                  <td class={`p ${cls(s.position)}`}>{s.position ?? `нет в топ-${s.depth || 20}`}{d != null && Math.abs(d) >= 1 && <sup class={d > 0 ? 'ps-d up' : 'ps-d down'}>{d > 0 ? `+${d}` : d}</sup>}</td>
                  <td class="ps-muted">{s.had_prev ? (s.prev ?? 'нет') : '–'}</td><td>{num(now(r, e))}</td><td><b>{gain(r, e) ? `+${num(gain(r, e))}` : '–'}</b></td></tr>
              );
            })}
            {!rows.length && <tr><td colSpan={6} class="ps-muted">Нет запросов</td></tr>}
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
  const [eng, setEng] = useState<Eng>('yandex');
  useEffect(() => {
    fetch(API, { headers: { Authorization: auth() }, cache: 'no-store', credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 401 ? 'сервер не принял логин кабинета' : `сервер ответил ${r.status}`))))
      .then(setD, (e) => setErr(`Позиции не загрузились: ${e.message}`));
  }, []);
  return (
    <div class="ps">
      <div class="ps-bar"><h1>Позиции в Новосибирске</h1></div>
      {err && <div class="ps-err">{err}</div>}
      <nav class="ps-seg" aria-label="Вкладка">
        {(['pos', 'ai'] as const).map((t) => <a href="#" class={tab === t ? 'on' : ''} onClick={(ev) => { ev.preventDefault(); setTab(t); }}>{t === 'pos' ? 'Позиции' : 'Нейросети'}</a>)}
      </nav>
      {!d && !err && <p class="ps-muted">Загружаю…</p>}
      {d && tab === 'ai' && <AiView ai={d.ai} />}
      {d && tab === 'pos' && (
        <>
          <NskTotal n={d.nsk} />
          <nav class="ps-seg" aria-label="Поисковик">
            {(['yandex', 'google'] as const).map((x) => <a href="#" class={eng === x ? 'on' : ''} onClick={(ev) => { ev.preventDefault(); setEng(x); }}>{ENG[x]}</a>)}
          </nav>
          {eng === 'yandex' && <WmMonth wm={d.wm_nsk} />}
          <div class="ps-note">Снимок выдачи XMLRiver – в моменте, не за месяц. Место в выдаче {ENG[eng]} для человека в Новосибирске (XMLRiver, компьютер, первые 20 результатов) по запросам со спросом в Новосибирске. Цвет: синий – топ-3, зелёный – топ-10, светлый – 11–20. «Было» – замер не ближе месяца назад (август – пилот по главным запросам), недельные замеры не сравниваем. Маленькая цифра – сколько мест прибавили. Прогноз: спрос × доля кликов места (1-е – 28%, 3-е – 11%, 10-е – 2%, средние данные по рунету) – оценка, а не обещание.</div>
          <NskView n={d.nsk} e={eng} />
        </>
      )}
    </div>
  );
}
