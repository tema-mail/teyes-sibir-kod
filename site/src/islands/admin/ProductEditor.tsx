// Редактор товара TEYES SIBIR (по образцу редактора Elite Rose и магазина Тильды). Вкладки: «Основное», «Цены
// и версии» (версия – набор значений параметров, например «Память: 6+128Gb», со своей ценой), «Доп. опции»
// (галочки с доплатой), «Характеристики», «Фото». Всё сохраняется; новые фото сжимаются в браузере в WebP 720 px.
import { useEffect, useState } from 'preact/hooks';
import type { Product, Edition } from '../../lib/catalog';
import { toWebp } from './gh';

const TABS = ['Основное', 'Цены и версии', 'Доп. опции', 'Характеристики', 'Фото'] as const;
const MARKS = [['', 'Нет'], ['NEW', 'Новинка'], ['SALE', 'Скидка']];
/** Описание Tilda (p, strong, h3, ul, li, br) ↔ текст для правки с простой разметкой: «### » – заголовок,
 *  «• » – пункт списка, **так** – жирный, пустая строка – новый абзац. Туда и обратно без потери оформления. */
const toText = (h: string) => h.replace(/<h3>/gi, '\n### ').replace(/<\/h3>/gi, '\n').replace(/<\/?strong>/gi, '**')
  .replace(/<li>/gi, '• ').replace(/<\/li>|<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '')
  .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/\n{3,}/g, '\n\n').trim();
function toHtml(t: string) {
  const inline = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const out: string[] = [];
  for (const block of t.split(/\n\s*\n/)) {
    let para: string[] = [], list: string[] = [];
    const flush = () => {
      if (para.length) out.push(`<p>${para.join('<br />')}</p>`);
      if (list.length) out.push(`<ul>${list.map((x) => `<li>${x}</li>`).join('')}</ul>`);
      para = []; list = [];
    };
    for (const line of block.split('\n').map((x) => x.trim()).filter(Boolean)) {
      if (line.startsWith('### ')) { flush(); out.push(`<h3>${inline(line.slice(4))}</h3>`); }
      else if (line.startsWith('• ')) { if (para.length) flush(); list.push(inline(line.slice(2))); }
      else { if (list.length) flush(); para.push(inline(line)); }
    }
    flush();
  }
  return out.join('');
}
const int = (v: string) => Number(v.replace(/\D/g, '')) || 0;

type Photo = { name: string; base64: string; url: string };

export default function ProductEditor({ product, sections, base, busy, onClose, onSave, onDelete }: {
  product: Product; sections: { slug: string; name: string }[]; base: string; busy: boolean;
  onClose: () => void; onSave: (p: Product, photos: { name: string; base64: string }[]) => void; onDelete: (p: Product) => void;
}) {
  const [p, setP] = useState<Product>(product);
  const [text, setText] = useState(toText(product.text));
  const [titles, setTitles] = useState<string[]>(product.options.map((o) => o.title));
  const [newTitle, setNewTitle] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [note, setNote] = useState('');
  const [tab, setTab] = useState<(typeof TABS)[number]>('Основное');
  const isNew = !product.id;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const val = (e: Event) => (e.target as HTMLInputElement).value;
  const setEd = (i: number, patch: Partial<Edition>) => setP({ ...p, editions: p.editions.map((e, n) => (n === i ? { ...e, ...patch } : e)) });

  const save = () => {
    // Параметры версий: названия – из списка, значения – из самих версий, по порядку появления
    const options = titles.map((t) => ({ title: t, values: [...new Set(p.editions.map((e) => e.options[t]).filter(Boolean))] }));
    const changed = text !== toText(product.text);
    onSave({ ...p, options, text: changed ? toHtml(text.trim()) : product.text,
      images: [...p.images, ...photos.map((f) => f.name)] }, photos.map(({ name, base64 }) => ({ name, base64 })));
  };
  const addPhotos = async (files: File[]) => {
    setNote('Сжимаю фото…');
    try {
      const out: Photo[] = [];
      for (const f of files) { const w = await toWebp(f); out.push({ ...w, url: URL.createObjectURL(f) }); }
      setPhotos([...photos, ...out]);
      setNote('');
    } catch (e: any) { setNote(`Фото не добавлено: ${e.message}`); }
  };

  return (
    <div class="ed" role="dialog" aria-modal="true" aria-label={isNew ? 'Новый товар' : `Товар «${p.title}»`}>
      <div class="ed__bg" onClick={onClose} />
      <div class="ed__panel">
        <header class="ed__head">
          <div>
            <p class="muted" style="margin:0;font-size:12px">{isNew ? 'Магазин → новый товар' : `Магазин → товар № ${p.id}`}</p>
            <h2>{p.title || 'Новый товар'}</h2>
          </div>
          <label class="sw" title="Показывать на сайте">
            <input type="checkbox" checked={!p.hidden} onChange={(e) => setP({ ...p, hidden: !(e.target as HTMLInputElement).checked })} />
            <span />{p.hidden ? 'Скрыт' : 'На сайте'}
          </label>
          <button class="btn" onClick={onClose}>Закрыть</button>
          <button class="btn primary" onClick={save} disabled={busy || note.startsWith('Сжимаю')}>{busy ? 'Идёт прошлое сохранение…' : 'Сохранить'}</button>
        </header>
        <nav class="ed__tabs">{TABS.map((t) => <button class={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</nav>

        <div class="ed__body">
          {tab === 'Основное' && (
            <div class="fgrid">
              <label class="f f--wide"><span>Название товара</span><input value={p.title} onInput={(e) => setP({ ...p, title: val(e) })} placeholder="Штатная магнитола Teyes CC3L Toyota Camry 70" /></label>
              <label class="f"><span>Раздел</span><select value={p.section} onChange={(e) => setP({ ...p, section: val(e) })}>{sections.map((s) => <option value={s.slug}>{s.name}</option>)}</select></label>
              <label class="f"><span>Модель Teyes <em>для фильтра каталога</em></span><input value={p.model} onInput={(e) => setP({ ...p, model: val(e) })} placeholder="CC3L" /></label>
              <label class="f"><span>Метка на карточке</span><select value={p.mark} onChange={(e) => setP({ ...p, mark: val(e) })}>{MARKS.map(([v, t]) => <option value={v}>{t}</option>)}</select></label>
              <label class="f f--wide"><span>Краткое описание <em>под названием и для поиска</em></span><input value={p.descr} onInput={(e) => setP({ ...p, descr: val(e) })} /></label>
              <label class="f f--wide"><span>Описание <em>«### » – заголовок, «• » – пункт списка, **жирный**, пустая строка – абзац</em></span><textarea rows={10} value={text} onInput={(e) => setText(val(e))} /></label>
              {!isNew && <p class="muted f--wide" style="margin:0">Адрес: {p.path}</p>}
            </div>
          )}

          {tab === 'Цены и версии' && (
            <div>
              <div class="fgrid">
                <label class="f"><span>Цена, ₽ <em>если версий нет</em></span><input inputMode="numeric" value={p.price || ''} onInput={(e) => setP({ ...p, price: int(val(e)) })} /></label>
                <label class="f"><span>Старая цена, ₽ <em>для скидки</em></span><input inputMode="numeric" value={p.priceOld || ''} onInput={(e) => setP({ ...p, priceOld: int(val(e)) })} /></label>
              </div>
              <h3 class="ed__h3">Версии со своей ценой</h3>
              <p class="muted" style="margin:0 0 10px">Покупатель выбирает версию на странице товара, в каталоге цена – «от» самой дешёвой.</p>
              {titles.length > 0 && (
                <table class="vt">
                  <thead><tr>{titles.map((t) => <th>{t}</th>)}<th>Цена, ₽</th><th>Старая, ₽</th><th>Остаток</th><th></th></tr></thead>
                  <tbody>
                    {p.editions.map((e, i) => (
                      <tr>
                        {titles.map((t) => <td><input value={e.options[t] || ''} onInput={(ev) => setEd(i, { options: { ...e.options, [t]: val(ev) } })} /></td>)}
                        <td><input inputMode="numeric" value={e.price || ''} onInput={(ev) => setEd(i, { price: int(val(ev)) })} /></td>
                        <td><input inputMode="numeric" value={e.priceOld || ''} onInput={(ev) => setEd(i, { priceOld: int(val(ev)) })} /></td>
                        <td><input value={e.stock} onInput={(ev) => setEd(i, { stock: val(ev) })} placeholder="∞" /></td>
                        <td><button class="btn ghost" title="Убрать версию" onClick={() => setP({ ...p, editions: p.editions.filter((_, n) => n !== i) })}>×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div class="tools" style="margin-top:10px">
                {titles.length > 0 && <button class="btn" onClick={() => setP({ ...p, editions: [...p.editions, { id: String(Date.now()), options: {}, price: p.price, priceOld: 0, stock: '' }] })}>+ Добавить версию</button>}
                <input placeholder="Новый параметр, например «Память»" value={newTitle} onInput={(e) => setNewTitle(val(e))} />
                <button class="btn" disabled={!newTitle.trim() || titles.includes(newTitle.trim())} onClick={() => { setTitles([...titles, newTitle.trim()]); setNewTitle(''); }}>+ Параметр</button>
              </div>
            </div>
          )}

          {tab === 'Доп. опции' && (
            <div>
              <p class="muted" style="margin:0 0 10px">Галочки на странице товара: покупатель добавляет опцию к заказу, доплата прибавляется к цене.</p>
              <table class="vt">
                <thead><tr><th>Опция</th><th>Доплата, ₽</th><th></th></tr></thead>
                <tbody>
                  {p.addons.map((a, i) => (
                    <tr>
                      <td><input value={a.label} onInput={(e) => setP({ ...p, addons: p.addons.map((x, n) => (n === i ? { ...x, label: val(e) } : x)) })} /></td>
                      <td><input inputMode="numeric" value={a.price || ''} onInput={(e) => setP({ ...p, addons: p.addons.map((x, n) => (n === i ? { ...x, price: int(val(e)) } : x)) })} placeholder="0" /></td>
                      <td><button class="btn ghost" title="Убрать" onClick={() => setP({ ...p, addons: p.addons.filter((_, n) => n !== i) })}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button class="btn" style="margin-top:10px" onClick={() => setP({ ...p, addons: [...p.addons, { label: '', price: 0 }] })}>+ Добавить опцию</button>
            </div>
          )}

          {tab === 'Характеристики' && (
            <div>
              <table class="vt">
                <thead><tr><th>Характеристика</th><th>Значение</th><th></th></tr></thead>
                <tbody>
                  {p.characteristics.map((c, i) => (
                    <tr>
                      <td><input value={c.title} onInput={(e) => setP({ ...p, characteristics: p.characteristics.map((x, n) => (n === i ? { ...x, title: val(e) } : x)) })} /></td>
                      <td><input value={c.value} onInput={(e) => setP({ ...p, characteristics: p.characteristics.map((x, n) => (n === i ? { ...x, value: val(e) } : x)) })} /></td>
                      <td><button class="btn ghost" title="Убрать" onClick={() => setP({ ...p, characteristics: p.characteristics.filter((_, n) => n !== i) })}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button class="btn" style="margin-top:10px" onClick={() => setP({ ...p, characteristics: [...p.characteristics, { title: '', value: '' }] })}>+ Добавить характеристику</button>
            </div>
          )}

          {tab === 'Фото' && (
            <div>
              <p class="muted" style="margin:0 0 12px">Первое фото – обложка в каталоге. Новые фото сжимаются до 720 px и загружаются при сохранении.</p>
              <div class="gal">
                {p.images.map((im, i) => (
                  <figure class="gal__item">
                    <img src={`${base}/img/p/${im}`} alt="" />
                    {i === 0 && <span class="gal__cover">Обложка</span>}
                    {i > 0 && <button class="gal__badge" title="Сделать обложкой" onClick={() => setP({ ...p, images: [im, ...p.images.filter((_, n) => n !== i)] })}>сделать обложкой</button>}
                    <button class="gal__del" title="Убрать фото" onClick={() => setP({ ...p, images: p.images.filter((_, n) => n !== i) })}>×</button>
                  </figure>
                ))}
                {photos.map((f, i) => (
                  <figure class="gal__item gal__item--new">
                    <img src={f.url} alt="" />
                    {p.images.length === 0 && i === 0 && <span class="gal__cover">Обложка</span>}
                    <span class="gal__badge">загрузится при сохранении</span>
                    <button class="gal__del" title="Убрать фото" onClick={() => setPhotos(photos.filter((_, n) => n !== i))}>×</button>
                  </figure>
                ))}
                <label class="gal__add">
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { const fl = [...((e.target as HTMLInputElement).files || [])]; (e.target as HTMLInputElement).value = ''; addPhotos(fl); }} />
                  <b>+</b><span>Загрузить фото</span>
                </label>
              </div>
              {note && <p class="muted" style="margin:10px 0 0">{note}</p>}
            </div>
          )}
        </div>
        {!isNew && <footer class="ed__foot"><button class="btn ghost" style="color:#b0333f" onClick={() => onDelete(p)}>Удалить товар</button>{!p.hidden && <a class="btn" href={`${base}${p.path}/`} target="_blank">Открыть на сайте ↗</a>}</footer>}
      </div>
    </div>
  );
}
