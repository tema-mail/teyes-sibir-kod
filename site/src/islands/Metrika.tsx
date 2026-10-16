// «Метрика и каналы» на сайте (макет утверждён владельцем 14.10.2026: claude.ai/artifact/WtEehZNxGbygqodQbHDUFL).
// Отчёт собирает SEO-админка раз в день; страница берёт его с admin.teyes-sibir.ru/api/metrika по логину и паролю
// админки. Пароль живёт только в памяти вкладки: localStorage и sessionStorage общие у всех сайтов
// tema-mail.github.io. Весь текст из отчёта выводится через Preact (экранируется), без innerHTML.
import { useEffect, useState } from 'preact/hooks';

const API = 'https://admin.teyes-sibir.ru/api/metrika';
type R = any; // форма отчёта – seo_admin/providers/metrika_report.py (build, merge_previous)

const PERIODS = [['week', 'Неделя'], ['month', 'Месяц'], ['quarter', 'Квартал'], ['year', 'Год']];
const MODES = [['yoy', 'Год к году'], ['mom', 'Месяц к месяцу'], ['qoq', 'Квартал к кварталу'], ['wow', 'Неделя к неделе']];
const nf = new Intl.NumberFormat('ru-RU');
const fmt = (n: number | null | undefined) => (n == null ? '–' : nf.format(Math.round(n)));
const num = (n: number, d = 1) => n.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n: number, d = 1) => num(n, d) + '%';
const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const dm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const range = (a: string, b: string) => `${dm(a)}${a.slice(0, 4) === b.slice(0, 4) ? '' : '.' + a.slice(0, 4)} – ${dm(b)}.${b.slice(0, 4)}`;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;
const ch = (a: number, b: number) => (b ? (a / b - 1) * 100 : NaN);
const conv = (s: R) => (s.visits && s.lead_goal != null ? (s.lead_goal / s.visits) * 100 : NaN);
const stamp = (iso: string) => new Date(iso).toLocaleString('ru-RU', {
  timeZone: 'Asia/Novosibirsk', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))); // пароль может быть кириллицей

function Delta({ v, unit = '%', lower = false }: { v: number; unit?: string; lower?: boolean }) {
  if (!isFinite(v)) return <span class="d flat">–</span>;
  if (Math.abs(v) < 0.05) return <span class="d flat">0{unit}</span>;
  const good = lower ? v < 0 : v > 0;
  return <span class={`d ${good ? 'up' : 'down'}`}>{v > 0 ? '▲ +' : '▼ −'}{num(Math.abs(v))}{unit}</span>;
}
const Bar = ({ w, c, thin }: { w: number; c: string; thin?: boolean }) =>
  <span class={`b b--${c}${thin ? ' b--thin' : ''}`} style={{ width: w > 0 ? `max(3px, calc((100% - 64px) * ${w.toFixed(4)}))` : '0' }} />; // доля от места без подписи
const Missing = () => <p class="meta">Этот блок не пришёл при последнем сборе – причина внизу страницы.</p>;
const Legend = ({ items }: { items: [string, string][] }) => (
  <div class="legend">{items.map(([c, t]) => <span><i class={`lg lg--${c}`} />{t}</span>)}</div>
);
const BARS: [string, string][] = [['visits', 'визиты'], ['leads', 'отправки форм · конверсия']];
/** Сводка, взятая из прошлого отчёта (сбой на этом блоке), – с датой, иначе её цифры выглядят как сегодняшние. */
const OldNote = ({ at }: { at?: string }) => (at ? <p class="warn">Сводка – из отчёта от {stamp(at)}: при последнем сборе Метрика её не отдала, даты могут не совпадать с подписью периода.</p> : null);

function Panel({ title, sub, chip, old, children }: { title: string; sub?: string; chip?: string; old?: string; children: any }) {
  return (
    <section class="panel">
      <h2>{title}{chip && <span class="chip">{chip}</span>}{old && <span class="chip chip--old">из отчёта от {stamp(old)}</span>}</h2>
      {sub && <p class="sub">{sub}</p>}
      {children}
    </section>
  );
}

function Kpis({ s, p }: { s: R; p?: R }) {
  const items: [string, string, any, boolean?][] = [
    ['Визиты', fmt(s.visits), p && <Delta v={ch(s.visits, p.visits)} />],
    ['Посетители', fmt(s.users), p && <Delta v={ch(s.users, p.users)} />],
    ['Отправки форм', fmt(s.lead_goal), p && <Delta v={ch(s.lead_goal || 0, p.lead_goal || 0)} />, true],
    ['Конверсия в форму', isFinite(conv(s)) ? pct(conv(s), 2) : '–', p && <Delta v={conv(s) - conv(p)} unit=" п.п." />],
    ['Отказы', pct(s.bounce), p && <Delta v={s.bounce - p.bounce} unit=" п.п." lower />],
    ['Глубина просмотра', num(s.depth), p && <Delta v={ch(s.depth, p.depth)} />],
    ['Время на сайте', time(s.duration), p && <Delta v={ch(s.duration, p.duration)} />],
    ['Новые посетители', pct(s.new_pct, 0), null],
  ];
  return (
    <section class="kpis" aria-label="Сводка">
      {items.map(([label, value, d, main]) => (
        <div class={`kpi${main ? ' kpi--main' : ''}`}><span class="kpi__label">{label}</span><span class="kpi__value">{value}</span>{d}</div>
      ))}
    </section>
  );
}

function Channels({ rows, cmp }: { rows: R[]; cmp?: boolean }) {
  const maxV = Math.max(1, ...rows.map((x) => x.visits)), maxL = Math.max(1, ...rows.map((x) => x.leads));
  return (
    <div class={`ch${cmp ? '' : ' ch--noc'}`}>
      <span class="h">Канал</span><span class="h hv">Визиты</span><span class="h hl">Формы · конверсия</span>
      {cmp && <span class="h hd">К сравнению</span>}
      {rows.map((x) => (
        <>
          <span class="name">{x.name}{x.name === 'Нейросети' && <span class="chip">GEO</span>}</span>
          <span class="track"><Bar w={x.visits / maxV} c="visits" /><em>{fmt(x.visits)}</em></span>
          <span class="track"><Bar w={x.leads / maxL} c="leads" />
            <em>{fmt(x.leads)} <small>· {x.visits ? pct((x.leads / x.visits) * 100) : '–'}</small></em></span>
          {cmp && <span class="delta"><Delta v={ch(x.visits, x.prev_visits)} /></span>}
        </>
      ))}
    </div>
  );
}

function Series({ now, prev }: { now: R; prev?: R }) {
  const L = 44, RR = 744, T = 14, B = 184;
  const n = Math.max(now.starts.length, prev ? prev.starts.length : 0);
  const step = n > 1 ? (RR - L) / (n - 1) : 0;
  const raw = Math.max(1, ...now.yandex, ...now.google, ...(prev ? [...prev.yandex, ...prev.google] : []));
  const unit = Math.max(1, 10 ** Math.floor(Math.log10(raw)) / 2);
  const top = Math.ceil(raw / (4 * unit)) * 4 * unit;
  const y = (v: number) => B - (v / top) * (B - T);
  const path = (arr: number[]) => arr.map((v, i) => `${i ? 'L' : 'M'}${L + i * step},${y(v)}`).join(' ');
  const every = Math.ceil(n / 8);
  return (
    <div class="chartwrap">
      <svg viewBox="0 0 760 210" role="img" aria-label="Визиты из поиска: Яндекс и Google">
        {[0, 1, 2, 3, 4].map((g) => (
          <>
            <line class="grid" x1={L} x2={RR} y1={y((top * g) / 4)} y2={y((top * g) / 4)} />
            <text class="ax-y" x={L - 8} y={y((top * g) / 4) + 4}>{fmt((top * g) / 4)}</text>
          </>
        ))}
        {prev && <path class="ln ln--ya ln--prev" d={path(prev.yandex)} />}
        {prev && <path class="ln ln--go ln--prev" d={path(prev.google)} />}
        <path class="ln ln--ya" d={path(now.yandex)} />
        <path class="ln ln--go" d={path(now.google)} />
        {now.starts.map((s: string, i: number) => i % every === 0 && (
          <text class="ax-x" x={L + i * step} y={204}>{now.unit === 'week' ? `с ${dm(s)}` : dm(s)}</text>
        ))}
      </svg>
    </div>
  );
}

function Entry({ rows }: { rows: R[] }) {
  const v = (x: R) => (x.yandex || 0) + (x.google || 0) + (x.other || 0);
  const max = Math.max(1, ...rows.map(v)), maxL = Math.max(1, ...rows.map((x) => x.leads));
  return (
    <div class="hb">
      {rows.map((x) => (
        <>
          <div class="p" title={x.path}>{x.path}
            <small>{x.yandex == null ? 'Яндекс и Google вместе' : `Яндекс ${fmt(x.yandex)} · Google ${fmt(x.google)}`}</small></div>
          <div class="t t--two">
            <span class="row"><Bar w={v(x) / max} c="visits" />{fmt(v(x))}</span>
            <span class="row"><Bar w={x.leads / maxL} c="leads" thin />{fmt(x.leads)}</span>
          </div>
        </>
      ))}
    </div>
  );
}

function EntryCmp({ rows }: { rows: R[] }) {
  const max = Math.max(1, ...rows.map((x) => x.visits));
  return (
    <div class="hb">
      {rows.map((x) => (
        <>
          <div class="p" title={x.path}>{x.path}</div>
          <div class="t"><Bar w={x.visits / max} c="visits" />{fmt(x.visits)} <Delta v={ch(x.visits, x.prev)} /></div>
        </>
      ))}
    </div>
  );
}

function Diff({ rows }: { rows: R[] }) {
  if (!rows.length) return <p class="meta">Таких страниц нет.</p>;
  const max = Math.max(1, ...rows.map((x) => Math.abs(x.diff)));
  return (
    <div class="hb">
      {rows.map((x) => (
        <>
          <div class="p" title={x.path}>{x.path}</div>
          <div class="t"><Bar w={Math.abs(x.diff) / max} c={x.diff < 0 ? 'bad' : 'good'} />{x.diff > 0 ? '+' : '−'}{fmt(Math.abs(x.diff))}</div>
        </>
      ))}
    </div>
  );
}

function Heat({ h }: { h: R }) {
  if (!h.sources.length) return <p class="meta">Нет источников с 30 и больше визитами за период.</p>;
  return (
    <div class="tablewrap">
      <table class="heat">
        <thead><tr><th>Цель</th>{h.sources.map((s: string) => <th class="c">{s}</th>)}</tr></thead>
        <tbody>
          {h.goals.map((g: string, i: number) => {
            const m = Math.max(...h.cells[i]) || 1;
            return (
              <tr><td>{g}</td>{h.cells[i].map((v: number) => (
                <td class={`c${v / m > 0.62 ? ' c--hot' : ''}`} style={{ background: `rgba(var(--heat),${((v / m) * 0.85).toFixed(2)})` }}>{v ? pct(v) : '–'}</td>
              ))}</tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Phrases({ y }: { y: R }) {
  return (
    <>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Фраза</th><th>Визиты</th><th>Формы</th></tr></thead>
          <tbody>{y.rows.map((x: R) => <tr><td>{x.phrase}</td><td>{fmt(x.visits)}</td><td>{fmt(x.leads)}</td></tr>)}</tbody>
        </table>
      </div>
      <p class="meta">Всего из Яндекса {fmt(y.total)} визитов, форм {fmt(y.leads)}; фраза скрыта Яндексом у {fmt(y.hidden)}.</p>
    </>
  );
}

function Google({ g, cmp }: { g: R; cmp?: boolean }) {
  const t = g.now, p = g.prev;
  const mini: [string, string, any][] = [
    ['Клики', fmt(t.clicks), p && <Delta v={ch(t.clicks, p.clicks)} />],
    ['Показы', fmt(t.impressions), p && <Delta v={ch(t.impressions, p.impressions)} />],
    ['CTR', pct(t.ctr), p && <Delta v={t.ctr - p.ctr} unit=" п.п." />],
    ['Позиция', t.position == null ? '–' : num(t.position), p && p.position != null && t.position != null && <Delta v={p.position - t.position} unit="" />],
  ];
  return (
    <>
      <p class="meta">Google: {range(g.dates.date1, g.dates.date2)}{cmp && g.dates.prev1 ? ` против ${range(g.dates.prev1, g.dates.prev2)}` : ''} · последние 3 дня Google ещё досчитывает</p>
      <div class="mini">{mini.map(([l, v, d]) => <div><small>{l}</small><b>{v}</b>{d}</div>)}</div>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Запрос</th><th>Клики</th><th>Показы</th><th>Позиция</th><th>{cmp ? 'Изменение позиции' : 'CTR'}</th></tr></thead>
          <tbody>
            {g.queries.map((q: R) => {
              const up = q.prev_position != null ? q.prev_position - q.position : null;
              return (
                <tr><td>{q.query}</td><td>{fmt(q.clicks)}</td><td>{fmt(q.impressions)}</td><td>{num(q.position)}</td>
                  {cmp ? <td class={`pos${up == null ? '' : up > 0 ? ' up' : up < 0 ? ' down' : ''}`}>
                    {up == null ? 'новый' : up > 0 ? `▲ ${num(up)}` : up < 0 ? `▼ ${num(-up)}` : '0'}</td>
                    : <td>{pct(q.ctr)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Seg({ items, value, set, label }: { items: string[][]; value: string; set: (v: string) => void; label: string }) {
  return (
    <div class="seg" role="group" aria-label={label}>
      {items.map(([k, t]) => <button type="button" aria-pressed={value === k} onClick={() => set(k)}>{t}</button>)}
    </div>
  );
}

function Report({ d, busy, error, reload, exit }: { d: R; busy: boolean; error: string; reload: () => void; exit: () => void }) {
  const r = d.report;
  const [tab, setTab] = useState('ind');
  const [per, setPer] = useState('month');
  const [mode, setMode] = useState('yoy');
  const [side, setSide] = useState('lost');
  const old = (path: string) => r.stale?.[path];
  const P = r.periods[per], M = r.modes[mode];
  const failed = d.last_try && d.last_try.status === 'error' ? d.last_try : null;
  return (
    <>
      <div class="bar">
        <h1>Метрика и каналы</h1>
        <div class="fresh">
          <span>Данные на {stamp(r.fetched_at)} · обновляются раз в день</span>
          <button type="button" class="btn btn--ghost" disabled={busy} onClick={reload}>Загрузить заново</button>
          <button type="button" class="btn btn--ghost" onClick={exit}>Выйти</button>
        </div>
      </div>
      {error && <p class="err" role="alert">{error} Показаны данные, загруженные раньше.</p>}
      {failed && <p class="warn">Последний сбор {stamp(failed.created_at)} не удался: {failed.error}. Показан отчёт от {stamp(d.saved_at)}.</p>}
      {r.lag_days?.length > 0 && <p class="warn">Метрика ещё досчитывает {r.lag_days.map(dm).join(', ')} – эти дни не берём, период заканчивается раньше.</p>}

      <div class="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'ind'} onClick={() => setTab('ind')}>Показатели</button>
        <button type="button" role="tab" aria-selected={tab === 'cmp'} onClick={() => setTab('cmp')}>Сравнение</button>
      </div>

      {tab === 'ind' ? (
        <section class="pane">
          <div class="controls">
            <span class="lbl">Период:</span>
            <Seg items={PERIODS} value={per} set={setPer} label="Период" />
            <span class="meta">{range(P.date1, P.date2)} · {days(P.date1, P.date2)} дн.</span>
          </div>
          <p class="meta">Счётчик {r.counter} · только люди, без роботов · по вчерашний день</p>
          <OldNote at={old(`periods.${per}.summary`)} />
          {P.summary ? <Kpis s={P.summary} /> : <Missing />}
          <Panel title="Каналы: откуда приходят и кто отправляет формы" old={old(`periods.${per}.channels`)}
            sub={`Визиты и отправки форм по каналам. Своей базы заявок у сайта нет (формы уходят в Tilda), поэтому заявки – цель Метрики «${r.lead_label}».`}>
            <Legend items={BARS} />
            {P.channels ? <Channels rows={P.channels} /> : <Missing />}
          </Panel>
          <Panel title="Визиты из поиска: Яндекс и Google" old={old(`periods.${per}.series`)}
            sub={`Две линии – отдельно Яндекс и Google, ${P.series?.unit === 'week' ? 'по неделям' : 'по дням'}.`}>
            <Legend items={[['ya', 'Яндекс'], ['go', 'Google']]} />
            {P.series ? <Series now={P.series} /> : <Missing />}
          </Panel>
          <Panel title="Страницы входа из поиска" sub="Куда приходят из поиска и сколько форм отправляют с этих визитов."
            old={old(`periods.${per}.pages`)}>
            <Legend items={[['visits', 'визиты'], ['leads', 'отправки форм']]} />
            {P.pages ? <Entry rows={P.pages} /> : <Missing />}
          </Panel>
          <div class="grid2">
            <Panel title="Поиск в Яндексе" chip="из Метрики" old={old(`periods.${per}.phrases`)}
              sub="Фразы, по которым пришли из Яндекса. Показов и позиций Яндекс через Метрику не отдаёт.">
              {P.phrases ? <Phrases y={P.phrases} /> : <Missing />}
            </Panel>
            <Panel title="Поиск в Google" chip="Search Console" old={old('gsc_periods')}
              sub="Клики, показы и позиция в Google.">
              {r.gsc_periods?.[per] ? <Google g={r.gsc_periods[per]} /> : <Missing />}
            </Panel>
          </div>
        </section>
      ) : (
        <section class="pane">
          <div class="controls">
            <span class="lbl">Сравнить:</span>
            <Seg items={MODES} value={mode} set={setMode} label="Сравнение" />
          </div>
          <div class="periods">
            <div class="per per--now"><small>Период</small><b>{range(M.date1, M.date2)}</b><small>{days(M.date1, M.date2)} дн.</small></div>
            <span class="vs">против</span>
            <div class="per"><small>{M.prev_label}</small><b>{range(M.prev1, M.prev2)}</b>
              <small>{mode === 'yoy' ? 'те же дни недели' : `${days(M.prev1, M.prev2)} дн.`}</small></div>
          </div>
          <OldNote at={old(`modes.${mode}.summary`)} />
          {M.summary ? <Kpis s={M.summary.now} p={M.summary.prev} /> : <Missing />}
          <Panel title="Каналы: откуда приходят и кто отправляет формы" sub="Справа – изменение визитов к периоду сравнения."
            old={old(`modes.${mode}.channels`)}>
            <Legend items={BARS} />
            {M.channels ? <Channels rows={M.channels} cmp /> : <Missing />}
          </Panel>
          <Panel title="Визиты из поиска: этот период и период сравнения" old={old(`modes.${mode}.series`)}
            sub="Сплошная – этот период, пунктир – сравнение; Яндекс и Google отдельно.">
            <Legend items={[['ya', 'Яндекс'], ['go', 'Google'], ['prev', 'пунктир – период сравнения']]} />
            {M.series ? <Series now={M.series.now} prev={M.series.prev} /> : <Missing />}
          </Panel>
          <div class="grid2">
            <Panel title="Страницы входа из поиска" sub="Визиты из поиска за период и изменение к сравнению." old={old(`modes.${mode}.pages`)}>
              {M.pages ? <EntryCmp rows={M.pages.entry} /> : <Missing />}
            </Panel>
            <Panel title="Где переходов из поиска стало меньше или больше" old={old(`modes.${mode}.pages`)}
              sub="С потерявших начинаем разбор: позиции, сниппет, что менялось на странице.">
              <Seg items={[['lost', 'Потеряли'], ['won', 'Набрали']]} value={side} set={setSide} label="Что показать" />
              {M.pages ? <Diff rows={M.pages[side]} /> : <Missing />}
            </Panel>
          </div>
          <Panel title="Цели × источники" old={old(`modes.${mode}.heat`)}
            sub="Конверсия источника в цель за этот период. Темнее – где у цели конверсия выше. Источники от 30 визитов.">
            {M.heat ? <Heat h={M.heat} /> : <Missing />}
          </Panel>
          <Panel title="Поиск в Google" chip="Search Console" old={old('gsc')}
            sub="Запросы Search Console: клики, показы, позиция и её изменение к периоду сравнения.">
            {r.gsc?.[mode] ? <Google g={r.gsc[mode]} cmp /> : <Missing />}
          </Panel>
        </section>
      )}
      {r.errors?.length > 0 && (
        <details class="panel errs">
          <summary>Что не пришло при последнем сборе ({r.errors.length})</summary>
          <ul>{r.errors.map((e: string) => <li>{e}</li>)}</ul>
        </details>
      )}
    </>
  );
}

export default function Metrika() {
  const [login, setLogin] = useState('');
  const [pass, setPass] = useState('');
  const [auth, setAuth] = useState('');
  const [data, setData] = useState<R | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async (header: string) => {
    setBusy(true); setError('');
    try {
      const res = await fetch(API, { headers: { Authorization: header }, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (res.status === 401) { setError('Неверный логин или пароль админки.'); setAuth(''); setData(null); return; }
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error?.message || `Админка ответила ${res.status}.`); return;
      }
      setData(await res.json()); setAuth(header); setPass('');
    } catch {
      setError('Админка не ответила. Проверьте интернет или откройте admin.teyes-sibir.ru.');
    } finally { setBusy(false); }
  };
  const exit = () => { setAuth(''); setData(null); setPass(''); };
  // Вход в кабинет (scripts/lock-admin.mjs) – тем же логином и паролем, что у SEO-админки: отчёт открывается сразу
  useEffect(() => {
    try {
      const a = JSON.parse(sessionStorage.getItem('tx_admin_auth') || 'null');
      if (a?.login && a?.pass) load('Basic ' + b64(`${a.login}:${a.pass}`));
    } catch { /* нет входа – форма ниже */ }
  }, []);

  if (data && auth) {
    if (!data.report) {
      return (
        <section class="panel login">
          <h1>Метрика и каналы</h1>
          <p>Отчёт ещё не собран: админка собирает его раз в день, после 07:00 по Новосибирску.
            {data.last_try?.error ? ` Последняя попытка не удалась: ${data.last_try.error}.` : ''}</p>
          <button type="button" class="btn btn--ghost" onClick={exit}>Выйти</button>
        </section>
      );
    }
    return <Report d={data} busy={busy} error={error} reload={() => load(auth)} exit={exit} />;
  }
  return (
    <form class="panel login" onSubmit={(e) => { e.preventDefault(); if (login && pass) load('Basic ' + b64(`${login}:${pass}`)); }}>
      <h1>Метрика и каналы</h1>
      <p>Вход – логин и пароль SEO-админки admin.teyes-sibir.ru. Пароль не сохраняется: после закрытия вкладки нужно войти снова.</p>
      <label class="fld"><span>Логин</span>
        <input name="username" autocomplete="username" value={login} onInput={(e) => setLogin((e.target as HTMLInputElement).value)} /></label>
      <label class="fld"><span>Пароль</span>
        <input name="password" type="password" autocomplete="current-password" value={pass} onInput={(e) => setPass((e.target as HTMLInputElement).value)} /></label>
      {error && <p class="err" role="alert">{error}</p>}
      <button type="submit" class="btn" disabled={busy || !login || !pass}>{busy ? 'Загружаю…' : 'Войти'}</button>
    </form>
  );
}
