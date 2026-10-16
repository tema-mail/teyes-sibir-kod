// «Заявки» кабинета TEYES SIBIR – вид перенесён из ALEX KROWN (src/v1/admin/Orders.tsx, LeadsView: доска EV SIBIR,
// «Доска / Списком», этап – перетаскиванием, CSV). Магазин без эквайринга: заказ = заявка, поэтому у заявки –
// товары с категорией (правило владельца 16.10). Данные – живые с сервера admin.teyes-sibir.ru (/api/leads,
// seo_admin/leads.py) по логину и паролю кабинета; в репозитории сайта заявок нет.
import { useEffect, useState } from 'preact/hooks';

const API = 'https://admin.teyes-sibir.ru/api/leads';
type Stage = 'новая' | 'в работе' | 'выполнена' | 'отказ';
type Item = { id: string; title: string; path: string; variant: string; addons: string[]; qty: number; price: number };
type Lead = { id: number; created_at: string; form: string; name: string; phone: string; email: string; comment: string;
  items: Item[]; total: number | null; page: string; source: string; stage: Stage; history: { at: string; text: string }[] };
const STAGES: Stage[] = ['новая', 'в работе', 'выполнена', 'отказ'];
const STAGE_TITLE: Record<Stage, string> = { 'новая': 'Новые', 'в работе': 'В работе', 'выполнена': 'Выполнена', 'отказ': 'Отказ' };
const rub = (n: number) => n.toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₽';
const dt = (s: string) => new Date(s).toLocaleString('ru-RU', { timeZone: 'Asia/Novosibirsk', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const auth = () => { try { const a = JSON.parse(sessionStorage.getItem('tx_admin_auth') || 'null'); return a ? 'Basic ' + b64(`${a.login}:${a.pass}`) : ''; } catch { return ''; } };

export default function Leads({ sections, extra }: { sections: Record<string, string>; extra: Record<string, string> }) {
  // категория товара: марка из адреса (/store/catalog/<марка>/tproduct/…), у товаров без раздела Tilda – из данных
  const category = (i: Item) => {
    const m = i.path.match(/^\/store\/catalog\/([^/]+)\/tproduct\//);
    const slug = m ? m[1] : i.path.startsWith('/store/catalog_teyes/') ? 'teyes' : extra[i.id] || (i.path.startsWith('/store/') ? 'catalog' : '');
    return slug ? sections[slug] || slug : 'услуга';
  };
  const [list, setList] = useState<Lead[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [src, setSrc] = useState('');
  const [cat, setCat] = useState('');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [open, setOpen] = useState<Lead | null>(null);

  const load = async () => {
    setErr('');
    try {
      const r = await fetch(API, { headers: { Authorization: auth() }, cache: 'no-store', credentials: 'omit' });
      if (!r.ok) throw new Error(r.status === 401 ? 'сервер не принял логин и пароль кабинета' : `сервер ответил ${r.status}`);
      setList((await r.json()).leads);
    } catch (e: any) { setErr(`Заявки не загрузились: ${e.message}`); setList([]); }
  };
  useEffect(() => { load(); }, []);

  const move = async (id: number, stage: Stage) => {
    const prev = list;
    setList((list || []).map((x) => (x.id === id ? { ...x, stage } : x)));
    try {
      const r = await fetch(`${API}/${id}`, { method: 'PATCH', headers: { Authorization: auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ stage }), credentials: 'omit' });
      if (!r.ok) throw new Error(String(r.status));
      const saved: Lead = await r.json();
      setList((l) => (l || []).map((x) => (x.id === id ? saved : x)));
      if (open?.id === id) setOpen(saved);
    } catch (e: any) { setList(prev); setErr(`Этап не сохранился (${e.message})`); }
  };

  const all = list || [];
  const needle = q.trim().toLowerCase();
  const shown = all.filter((l) => (!src || l.source === src) && (!cat || l.items.some((i) => category(i) === cat))
    && (!needle || [l.id, l.name, l.phone, ...l.items.map((i) => i.title)].join(' ').toLowerCase().includes(needle)));
  const sources = [...new Set(all.map((l) => l.source))];
  const cats = [...new Set(all.flatMap((l) => l.items.map(category)))];
  const drop = (stg: Stage) => { if (drag != null) move(drag, stg); setDrag(null); setOver(null); };
  const csv = () => {
    const c = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['номер', 'дата', 'форма', 'имя', 'телефон', 'товары', 'категории', 'сумма', 'этап', 'источник', 'комментарий'];
    const body = shown.map((l) => [l.id, dt(l.created_at), l.form, l.name, l.phone, l.items.map((i) => `${i.title}${i.variant ? ` (${i.variant})` : ''} × ${i.qty}`).join('; '),
      [...new Set(l.items.map(category))].join(', '), l.total ?? '', STAGE_TITLE[l.stage], l.source, l.comment].map(c).join(';'));
    return 'data:text/csv;charset=utf-8,' + encodeURIComponent('﻿' + [head.join(';'), ...body].join('\r\n'));
  };
  const Card = ({ l }: { l: Lead }) => (
    <article class={`kb__card${drag === l.id ? ' is-drag' : ''}`} draggable onDragStart={(e) => { e.dataTransfer?.setData('text/plain', String(l.id)); setDrag(l.id); }} onDragEnd={() => setDrag(null)} onClick={() => setOpen(l)}>
      <p class="kb__top"><b>№ {l.id}</b><span class="chip">{l.form}</span></p>
      <p class="kb__who">{l.name} · {l.phone}</p>
      {l.items.map((i) => <p>{i.title}{i.variant && `, ${i.variant}`} <span class="chip">{category(i)}</span></p>)}
      <p class="kb__meta"><span>{dt(l.created_at)}</span>{l.total ? <b>{rub(l.total)}</b> : <span class="muted">{l.source}</span>}</p>
    </article>
  );

  return (
    <div>
      {err && <p class="demo-note">{err}<button class="btn" style="margin-left:auto" onClick={load}>Повторить</button></p>}
      {list && !all.length && !err && <p class="demo-note">Заявок пока нет. Сюда падают заказы и записи с сайта на коде. Формы живого teyes-sibir.ru на Tilda уходят в Telegram и на почту – чтобы они приходили и сюда, в настройках форм Tilda нужен приёмник (это запись в Tilda – только с вашего «да»).</p>}
      <div class="tools">
        <h1>Заявки <span class="muted" style="font-size:15px;font-weight:400">{list ? all.length : '…'}</span></h1>
        <span class="seg">
          <button class={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>Доска</button>
          <button class={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>Списком</button>
        </span>
        <input type="search" placeholder="Номер, имя, телефон, товар" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        <select value={cat} onChange={(e) => setCat((e.target as HTMLSelectElement).value)} aria-label="Категория"><option value="">Все категории</option>{cats.map((s) => <option>{s}</option>)}</select>
        <select value={src} onChange={(e) => setSrc((e.target as HTMLSelectElement).value)} aria-label="Источник"><option value="">Все источники</option>{sources.map((s) => <option>{s}</option>)}</select>
        <a class="btn" href={csv()} download="leads.csv">⇩ CSV</a>
      </div>
      {list === null ? <p class="muted">Загружаю заявки…</p> : view === 'board' ? (
        <div class="kb">
          {STAGES.map((stg) => (
            <section class={`kb__col${over === stg ? ' is-over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(stg); }} onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); drop(stg); }}>
              <h2>{STAGE_TITLE[stg]} <span>{shown.filter((l) => l.stage === stg).length}</span></h2>
              {shown.filter((l) => l.stage === stg).map((l) => <Card l={l} />)}
              {shown.filter((l) => l.stage === stg).length === 0 && <p class="muted" style="font-size:12.5px;text-align:center;padding:16px 0">Пусто</p>}
            </section>
          ))}
        </div>
      ) : (
        <div class="tw">
          <table class="vt" style="width:100%">
            <thead><tr><th>Когда</th><th>Имя</th><th>Телефон</th><th>Товар и категория</th><th>Источник</th><th>Этап</th></tr></thead>
            <tbody>
              {shown.map((l) => <tr style="cursor:pointer" onClick={() => setOpen(l)}><td>{dt(l.created_at)}</td><td>{l.name}</td><td>{l.phone}</td>
                <td>{l.items.map((i) => <div>{i.title} <span class="chip">{category(i)}</span></div>)}</td><td class="muted">{l.source}</td><td><span class="chip">{STAGE_TITLE[l.stage]}</span></td></tr>)}
              {!shown.length && <tr><td colSpan={6} class="muted" style="text-align:center;padding:20px">Заявок нет</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <div class="ed" role="dialog" aria-modal="true" aria-label={`Заявка ${open.id}`}>
          <div class="ed__bg" onClick={() => setOpen(null)} />
          <div class="ed__panel">
            <header class="ed__head">
              <div><p class="muted" style="margin:0;font-size:12px">Заявки → {open.form}</p><h2>Заявка № {open.id}</h2></div>
              <button class="btn" onClick={() => setOpen(null)}>Закрыть</button>
            </header>
            <div class="ed__body">
              <div class="fgrid"><label class="f"><span>Этап</span><select value={open.stage} onChange={(e) => move(open.id, (e.target as HTMLSelectElement).value as Stage)}>{STAGES.map((s) => <option value={s}>{STAGE_TITLE[s]}</option>)}</select></label></div>
              <h3 class="ed__h3">Клиент</h3>
              <p>{open.name} · <a href={`tel:${open.phone}`}>{open.phone}</a>{open.email && <> · {open.email}</>}</p>
              {open.items.length > 0 && <><h3 class="ed__h3">Товары</h3>
                <table class="vt" style="width:100%"><tbody>
                  {open.items.map((i) => <tr><td>{i.title}{i.variant && <div class="muted">{i.variant}</div>}{i.addons.length > 0 && <div class="muted">+ {i.addons.join(', ')}</div>}</td><td><span class="chip">{category(i)}</span></td><td>{i.qty} шт.</td><td style="text-align:right">{i.price ? rub(i.price * i.qty) : ''}</td></tr>)}
                  {open.total ? <tr><td colSpan={3}><b>Итого</b></td><td style="text-align:right"><b>{rub(open.total)}</b></td></tr> : null}
                </tbody></table></>}
              {open.comment && <><h3 class="ed__h3">Машина и комментарий</h3><p>{open.comment}</p></>}
              <h3 class="ed__h3">Источник</h3><p class="muted">{open.source} · страница {open.page}</p>
              <h3 class="ed__h3">История</h3>
              {open.history.map((h) => <p class="muted" style="margin:2px 0">{dt(h.at)} – {h.text}</p>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
