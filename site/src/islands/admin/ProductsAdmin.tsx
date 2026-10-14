// Раздел «Товары» админки (перенесён из админки Elite Rose, данные – магазин TEYES SIBIR): разделы-марки слева,
// поиск, сортировка, массовые действия, редактор товара. С ключом GitHub изменения одним коммитом попадают
// в site/src/data/products.json (+ фото в site/public/img/p), и сайт пересобирается сам. Без ключа – просмотр.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Product } from '../../lib/catalog';
import ProductEditor from './ProductEditor';
import GhConnect from './GhConnect';
import { PRODUCTS_PATH, IMG_DIR, buildOf, commit, humanError, getToken, readJson, productsText, slugify, type FileChange } from './gh';

type Sec = { slug: string; name: string };
type Status = { kind: 'idle' | 'saving' | 'building' | 'done' | 'error'; text: string; url?: string; sha?: string };
const rub = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
const minPrice = (p: Product) => (p.editions.length ? Math.min(...p.editions.map((e) => e.price || p.price)) : p.price);
/** Адрес новой карточки – как у Tilda: /store/catalog/<марка>/tproduct/<id>-<имя>. */
const pathFor = (section: string, id: string, title: string) =>
  `${section === 'teyes' ? '/store/catalog_teyes' : section === 'catalog' ? '/store/catalog' : `/store/catalog/${section}`}/tproduct/${id}-${slugify(title)}`;

export default function ProductsAdmin({ sections, base }: { sections: Sec[]; base: string }) {
  const [raw, setRaw] = useState<Product[] | null>(null);
  const [connected, setConnected] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [sec, setSec] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('site');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Product | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: '' });
  const name = (slug: string) => sections.find((s) => s.slug === slug)?.name ?? slug;
  // brand – как пишет products.py: марка, а у «Магнитол Teyes» и «Комплектов Teyes» – пусто
  const brandOf = (slug: string) => (slug === 'teyes' || slug === 'catalog' ? '' : name(slug));
  const saving = useRef(false);
  const [busy, setBusy] = useState(false); // идёт сохранение: кнопки сохранения неактивны, правка в редакторе не теряется
  const wait = () => (saving.current ? (setStatus({ kind: 'error', text: 'Подождите: прошлое сохранение ещё идёт' }), true) : false);

  // С ключом – свежие данные прямо из репозитория (собранный сайт отстаёт на время сборки), без ключа – с сайта.
  const load = async () => {
    try {
      const list = getToken() ? await readJson<Product[]>(PRODUCTS_PATH)
        : await (await fetch(`${base}/admin/products.json`, { cache: 'no-store' })).json();
      setRaw(list);
      const id = location.hash.slice(1);
      if (id) { const p = list.find((x: Product) => x.id === id); if (p) setEdit(p); }
    } catch (e: any) {
      setStatus({ kind: 'error', text: `Не удалось загрузить товары: ${humanError(e)}` });
    }
  };
  useEffect(() => { setConnected(!!getToken()); load(); }, []);
  // «изменить» со страницы «Страницы сайта» (#<id>) – и когда «Товары» уже открыты
  useEffect(() => {
    const open = () => { const p = raw?.find((x) => x.id === location.hash.slice(1)); if (p) setEdit(p); };
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, [raw]);

  // Следим за сборкой сайта, которую запустил именно наш коммит.
  useEffect(() => {
    if (status.kind !== 'building' || !status.sha) return;
    const sha = status.sha;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const b = await buildOf(sha);
        if (b && b.status === 'completed') {
          setStatus(b.conclusion === 'success' ? { kind: 'done', text: 'Сайт обновлён – изменения уже на сайте', url: b.url }
            : { kind: 'error', text: 'Сборка сайта упала – откройте журнал', url: b.url });
          return;
        }
        if (b) setStatus((s) => ({ ...s, url: b.url }));
      } catch { /* сеть – попробуем на следующем шаге */ }
      setTimeout(tick, 10000);
    };
    const t = setTimeout(tick, 10000);
    return () => { stop = true; clearTimeout(t); };
  }, [status.kind, status.sha]);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    (raw || []).forEach((p) => c.set(p.section, (c.get(p.section) || 0) + 1));
    return c;
  }, [raw]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    let out = (raw || []).filter((p) => (sec === 'all' || (sec === 'hidden' ? p.hidden : p.section === sec))
      && (!s || p.title.toLowerCase().includes(s) || p.id.includes(s) || p.model.toLowerCase().includes(s)));
    if (sort === 'price-asc') out = [...out].sort((a, b) => minPrice(a) - minPrice(b));
    if (sort === 'price-desc') out = [...out].sort((a, b) => minPrice(b) - minPrice(a));
    if (sort === 'name') out = [...out].sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    return out;
  }, [raw, sec, q, sort]);
  const [limit, setLimit] = useState(100);
  useEffect(() => setLimit(100), [sec, q, sort]);

  /** Сохранить изменение одним коммитом. mutate применяется к свежему products.json из репозитория (а не к
   *  загруженному при открытии): правки с другого устройства не откатываются. Пока товары не загружены или идёт
   *  прошлое сохранение – не сохраняем; убрать больше одного товара за раз сохранение не может (защита). */
  const persist = async (mutate: (list: Product[]) => Product[], message: string, extra: FileChange[] = []) => {
    if (!raw) return;
    if (saving.current) return setStatus({ kind: 'error', text: 'Подождите: прошлое сохранение ещё идёт' });
    setRaw(mutate(raw));
    if (!connected) { setStatus({ kind: 'error', text: 'Изменение видно только у вас – подключите сохранение, чтобы оно попало на сайт' }); return; }
    saving.current = true; setBusy(true);
    setStatus({ kind: 'saving', text: 'Сохраняем…' });
    try {
      let saved: Product[] = [];
      const sha = await commit(async (head) => {
        const fresh = await readJson<Product[]>(PRODUCTS_PATH, head);
        const next = mutate(fresh);
        if (next.length < fresh.length - 1) throw new Error('защита: сохранение убрало бы больше одного товара – ничего не записано');
        saved = next;
        return [{ path: PRODUCTS_PATH, text: productsText(next) }, ...extra];
      }, `Админка: ${message}`);
      setRaw(saved);
      setStatus({ kind: 'building', text: 'Сохранено. Сайт обновляется – обычно 3–5 минут', sha });
    } catch (e: any) {
      setStatus({ kind: 'error', text: `Не сохранилось: ${humanError(e)}` });
    } finally {
      saving.current = false; setBusy(false);
    }
  };

  const save = async (p: Product, photos: { name: string; base64: string }[]) => {
    if (!p.title.trim()) return setStatus({ kind: 'error', text: 'Укажите название товара' });
    if (wait()) return; // редактор остаётся открытым с правкой
    const isNew = !p.id;
    const id = isNew ? String(Date.now()) : p.id;
    const next: Product = { ...p, id, title: p.title.trim(), brand: brandOf(p.section),
      path: p.path || pathFor(p.section, id, p.title) };
    setEdit(null); history.replaceState(null, '', location.pathname);
    await persist((list) => (list.some((x) => x.id === id) ? list.map((x) => (x.id === id ? next : x)) : [next, ...list]),
      `${isNew ? 'новый товар' : 'товар'} «${next.title}»`, photos.map((f) => ({ path: `${IMG_DIR}/${f.name}`, base64: f.base64 })));
  };
  const remove = async (p: Product) => {
    if (wait() || !confirm(`Удалить товар «${p.title}» с сайта насовсем? Скрыть его можно переключателем «На сайте».`)) return;
    setEdit(null);
    await persist((list) => list.filter((x) => x.id !== p.id), `удалён товар «${p.title}»`);
  };
  const setHidden = (ids: string[], hidden: boolean) =>
    persist((list) => list.map((x) => (ids.includes(x.id) ? { ...x, hidden } : x)), `${hidden ? 'скрыто' : 'показано'} на сайте: ${ids.length} шт.`);
  const moveTo = (ids: string[], slug: string) =>
    persist((list) => list.map((x) => (ids.includes(x.id) ? { ...x, section: slug, brand: brandOf(slug) } : x)), `в раздел «${name(slug)}»: ${ids.length} шт.`);

  const allOn = shown.length > 0 && shown.slice(0, limit).every((p) => sel.has(p.id));
  const toggle = (id: string) => { const s = new Set(sel); s.has(id) ? s.delete(id) : s.add(id); setSel(s); };
  const blank = (): Product => ({ id: '', path: '', section: sec !== 'all' && sec !== 'hidden' ? sec : 'teyes', brand: '', title: '',
    descr: '', text: '', price: 0, priceOld: 0, mark: '', model: '', sort: 0, options: [], editions: [], addons: [],
    characteristics: [], images: [], parts: [] });

  return (
    <div>
      <div class={`sync sync--${connected ? 'on' : 'off'}`}>
        <span class="sync__dot" />
        {connected ? <span>Сохранение подключено – изменения попадают на сайт</span> : <span>Режим просмотра: изменения не сохраняются.</span>}
        {status.kind !== 'idle' && <span class={`sync__st sync__st--${status.kind}`}>{status.text}{status.url && <> · <a href={status.url} target="_blank" rel="noopener">журнал сборки</a></>}</span>}
        <button class={`btn ${connected ? 'ghost' : 'primary'}`} onClick={() => setShowConnect(true)}>{connected ? 'Ключ' : 'Подключить сохранение'}</button>
      </div>

      <div class="pa">
        <aside class="pa__side">
          <p class="pa__cap">Разделы</p>
          <button class={sec === 'all' ? 'on' : ''} onClick={() => setSec('all')}>Все товары<span>{raw?.length ?? '…'}</span></button>
          {sections.map((s) => (
            <button class={sec === s.slug ? 'on' : ''} onClick={() => setSec(s.slug)}>{s.name}<span>{counts.get(s.slug) || 0}</span></button>
          ))}
          <button class={sec === 'hidden' ? 'on' : ''} onClick={() => setSec('hidden')}>Скрытые<span>{(raw || []).filter((p) => p.hidden).length}</span></button>
        </aside>

        <section class="pa__main">
          <div class="tools">
            <h1>{sec === 'all' ? 'Все товары' : sec === 'hidden' ? 'Скрытые товары' : name(sec)} <span class="muted" style="font-size:15px;font-weight:400">{shown.length}</span></h1>
            <input type="search" placeholder="Название, модель или номер" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
            <select value={sort} onChange={(e) => setSort((e.target as HTMLSelectElement).value)} aria-label="Сортировка">
              <option value="site">Как на сайте</option><option value="name">По названию</option>
              <option value="price-asc">Сначала дешевле</option><option value="price-desc">Сначала дороже</option>
            </select>
            <button class="btn primary" disabled={!raw} onClick={() => setEdit(blank())}>+ Добавить товар</button>
          </div>

          {sel.size > 0 && (
            <div class="pa__bulk">
              <b>Выбрано: {sel.size}</b>
              <button class="btn" disabled={busy} onClick={() => { setHidden([...sel], true); setSel(new Set()); }}>Скрыть с сайта</button>
              <button class="btn" disabled={busy} onClick={() => { setHidden([...sel], false); setSel(new Set()); }}>Показать на сайте</button>
              <select class="btn" value="" disabled={busy} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; if (v) { moveTo([...sel], v); setSel(new Set()); } }}>
                <option value="">Перенести в раздел…</option>{sections.map((s) => <option value={s.slug}>{s.name}</option>)}
              </select>
              <button class="btn ghost" onClick={() => setSel(new Set())}>Снять выбор</button>
            </div>
          )}

          <div class="pt">
            <div class="pt__head">
              <label><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(shown.slice(0, limit).map((p) => p.id)))} aria-label="Выбрать все на экране" /></label>
              <span></span><span>Товар</span><span>Раздел</span><span>Цена</span><span>Версии</span><span>На сайте</span>
            </div>
            {raw === null && <p class="muted" style="padding:28px;text-align:center">Загружаю товары…</p>}
            {shown.slice(0, limit).map((p) => (
              <div class={`pt__row${sel.has(p.id) ? ' is-sel' : ''}${p.hidden ? ' is-off' : ''}`} onClick={() => setEdit(p)}>
                <label onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Выбрать ${p.title}`} /></label>
                {p.images[0] ? <img class="thumb" src={`${base}/img/p/${p.images[0]}`} alt="" loading="lazy" /> : <span class="thumb" />}
                <div><span class="pname">{p.title}</span><span class="muted pt__sku">{p.model ? `Teyes ${p.model}` : p.id}{p.mark && <i class="pt__mark">{p.mark}</i>}{p.hidden && <i class="pt__off">скрыт</i>}</span><span class="pt__mprice">{p.editions.length > 1 ? 'от ' : ''}{rub(minPrice(p))}</span></div>
                <div><span class="chip">{name(p.section)}</span></div>
                <div class="pt__price"><b>{p.editions.length > 1 ? 'от ' : ''}{rub(minPrice(p))}</b>{!p.editions.length && p.priceOld > p.price && <s>{rub(p.priceOld)}</s>}</div>
                <span class="muted">{p.editions.length || '–'}</span>
                <label class="sw" onClick={(e) => e.stopPropagation()} title={p.hidden ? 'Показать на сайте' : 'Скрыть с сайта'}>
                  <input type="checkbox" checked={!p.hidden} disabled={busy} onChange={() => setHidden([p.id], !p.hidden)} /><span />
                </label>
              </div>
            ))}
            {raw !== null && shown.length === 0 && <p class="muted" style="padding:28px;text-align:center">Ничего не найдено</p>}
            {shown.length > limit && <p style="padding:14px;text-align:center"><button class="btn" onClick={() => setLimit(limit + 200)}>Показать ещё ({shown.length - limit})</button></p>}
          </div>
        </section>
      </div>

      {edit && <ProductEditor product={edit} sections={sections} base={base} busy={busy} onClose={() => { setEdit(null); history.replaceState(null, '', location.pathname); }} onSave={save} onDelete={remove} />}
      {showConnect && <GhConnect onClose={() => setShowConnect(false)} onConnected={(ok) => { setConnected(ok); setShowConnect(false); load(); }} />}
    </div>
  );
}
