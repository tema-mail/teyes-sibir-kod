// Строка под хлебными крошками: серия, к сравнению, в избранное, поделиться.
import { favs, isFav, showToast, toggleFav, useMounted } from '../lib/store';

export default function ProductMeta({ id, model, title, compare }: { id: string; model: string; title: string; compare: boolean }) {
  favs.value; // подписка на избранное
  const fav = useMounted() && isFav(id);
  const share = async () => {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); showToast('Ссылка скопирована'); }
    } catch { /* покупатель закрыл окно «Поделиться» */ }
  };
  return (
    <div class="pmeta">
      {model && <span>Серия: <b>{model}</b></span>}
      {compare && <a href="#compare"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 20V10m7 10V4m7 16v-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>К сравнению</a>}
      <button type="button" class={fav ? 'is-on' : ''} aria-pressed={fav} onClick={() => toggleFav(id)}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 5 6.5 5c2 0 3.3 1 4.1 2.2.1.1.3.1.4 0C11.8 6 13.1 5 15.1 5 18.6 5 20.7 8.4 19.2 11.8 17.1 16.4 12 21 12 21z" fill={fav ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" /></svg>
        {fav ? 'В избранном' : 'В избранное'}
      </button>
      <button type="button" onClick={share}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 15V4m0 0L8 8m4-4 4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        Поделиться
      </button>
    </div>
  );
}
