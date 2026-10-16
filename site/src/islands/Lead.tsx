// «Записаться на установку» на страницах на коде: окно с именем, телефоном и машиной → приёмник Tilda (те же
// получатели, что у попапа записи сайта). Открывается по ссылкам [data-lead] (в data-lead – товар) и по кнопке
// «Записаться» мега-меню ([data-book]): на этих страницах нет попапа Tilda, без окна она вела бы на «Контакты».
import { useEffect, useRef, useState } from 'preact/hooks';
import { sendForm, sendLead, phoneOk } from '../lib/forms';

export default function Lead({ policyHref, phone }: { policyHref: string; phone: string }) {
  const [open, setOpen] = useState(false);
  const [about, setAbout] = useState('');
  const [name, setName] = useState('');
  const [tel, setTel] = useState('');
  const [car, setCar] = useState('');
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-lead], [data-book]');
      if (!t || e.defaultPrevented) return;
      e.preventDefault();
      opener.current = t;
      setAbout(t.getAttribute('data-lead') || '');
      setDone(false); setError(''); setOpen(true);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  useEffect(() => {
    if (!open) return;
    box.current?.querySelector<HTMLInputElement>('input')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const close = () => {
    setOpen(false);
    const o = opener.current; // кнопка мега-меню к этому времени скрыта вместе с меню – туда фокус не вернуть
    if (o && o.isConnected && o.getClientRects().length) o.focus();
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!name.trim() || !phoneOk(tel)) { setError('Нужны имя и номер телефона, например +7 999 123-45-67'); return; }
    if (!agree) { setError('Нужно согласие на обработку данных'); return; }
    setBusy(true);
    const ok = await sendForm('Запись на установку', {
      'Имя': name.trim(), 'Телефон': tel.trim(), 'Товар': about, 'Автомобиль и комментарий': car.trim(),
      'Источник': 'сайт на коде (копия teyes-sibir.ru)', 'Согласие': 'yes',
    });
    if (ok) await sendLead({ form: 'Запись на установку', name: name.trim(), phone: tel.trim(), comment: car.trim(),
      items: about ? [{ id: '', title: about, path: location.pathname.replace(/^\/teyes-sibir-kod/, '').replace(/\/$/, ''), variant: '', addons: [], qty: 1, price: 0 }] : [] });
    setBusy(false);
    if (!ok) { setError(`Не получилось отправить. Позвоните нам: ${phone}`); return; }
    setDone(true);
  };

  if (!open) return null;
  return (
    <div class="lead" role="dialog" aria-modal="true" aria-label="Запись на установку">
      <button type="button" class="drawer__shade" aria-label="Закрыть" onClick={close} />
      <div class="lead__box" ref={box}>
        <button type="button" class="drawer__close lead__x" aria-label="Закрыть" onClick={close}>×</button>
        {done ? (
          <div class="lead__done" role="status">
            <h2>Заявка отправлена</h2>
            <p>Мы свяжемся с вами, чтобы подобрать время установки.</p>
            <button type="button" class="btn btn--ghost" onClick={close}>Закрыть</button>
          </div>
        ) : (
          <form class="lead__form" onSubmit={submit} noValidate>
            <h2>Запись на установку</h2>
            {about && <p class="lead__about">{about}</p>}
            <label class="field"><span>Имя *</span><input type="text" autocomplete="name" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
            <label class="field"><span>Телефон *</span><input type="tel" inputmode="tel" autocomplete="tel" value={tel} onInput={(e) => setTel((e.target as HTMLInputElement).value)} /></label>
            <label class="field"><span>Машина и комментарий</span><input type="text" placeholder="Марка, модель, год" value={car} onInput={(e) => setCar((e.target as HTMLInputElement).value)} /></label>
            <label class="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree((e.target as HTMLInputElement).checked)} />
              <span>Согласен на обработку персональных данных по <a href={policyHref}>политике конфиденциальности</a></span></label>
            {error && <em class="field__err" role="alert">{error}</em>}
            <button type="submit" class="btn btn--accent" disabled={busy}>{busy ? 'Отправляем…' : 'Записаться'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
