// Карточка товара в сетке (каталог, похожие, избранное): фото, метка, модель Teyes, название, цена, сердечко.
import type { Card } from '../lib/catalog';
import { favs, isFav, toggleFav } from '../lib/store';

const rub = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';

export default function ProductCard({ card, href }: { card: Card; href: string }) {
  favs.value; // подписка на избранное
  const on = isFav(card.id);
  return (
    <article class="card">
      <a class="card__link" href={href}>
        <span class="card__img">
          {card.image ? <img src={card.image} alt={card.title} loading="lazy" decoding="async" width="720" height="720" /> : null}
          {card.mark && <span class={`card__mark${card.mark === 'SALE' ? ' is-sale' : ''}`}>{card.mark === 'SALE' ? 'Скидка' : 'Новинка'}</span>}
        </span>
        <span class="card__body">
          {card.model && <span class="card__model">Teyes {card.model}</span>}
          <span class="card__title">{card.title}</span>
          <span class="card__price">
            <b>{card.from ? 'от ' : ''}{rub(card.price)}</b>
            {card.priceOld > card.price && <s>{rub(card.priceOld)}</s>}
          </span>
        </span>
      </a>
      <button type="button" class={`card__fav${on ? ' is-on' : ''}`} aria-pressed={on}
        aria-label={on ? 'Убрать из избранного' : 'В избранное'} onClick={() => toggleFav(card.id)}>
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 5 6.5 5c2 0 3.3 1 4.1 2.2.1.1.3.1.4 0C11.8 6 13.1 5 15.1 5 18.6 5 20.7 8.4 19.2 11.8 17.1 16.4 12 21 12 21z" fill="currentColor" /></svg>
      </button>
    </article>
  );
}
