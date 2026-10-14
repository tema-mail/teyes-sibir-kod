// Константы сайта TEYES Sibir для страниц на коде (этап 2) и адреса внутри копии.
// Контакты, ссылки и картинки шапки – с живого сайта (шапка и подвал страниц магазина Tilda).

/** Подпапка сайта (GitHub Pages: /teyes-sibir-kod, свой домен: пусто). */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
/** Адрес внутри копии: u('/store/') → /teyes-sibir-kod/store/. Якоря (#…) и внешние – как есть. */
export const u = (path: string) => (/^(#|https?:|tel:|mailto:)/.test(path) ? path : BASE + (path.startsWith('/') ? path : '/' + path));
/** Живой сайт – для canonical. */
export const LIVE = 'https://teyes-sibir.ru';
/** Точно та же строка, что ставит копии scripts/build.py (её ищет verify.py). */
export const NOINDEX = '<meta name="robots" content="noindex, nofollow" />';

export const SITE = {
  name: 'TEYES SIBIR',
  slogan: 'Официальный дилер бренда Teyes в Сибири',
  phone: '+7 (995) 437-92-66',
  tel: 'tel:+79954379266',
  email: 'teyes.sibir@gmail.com',
  address: 'г. Новосибирск, ул. Сухарная 35, корпус 13, 1 этаж, помещение 110',
  hours: 'пн–пт: с 11:00 до 19:00',
  weekend: 'сб–вс: выходной',
  telegram: 'https://t.me/teyesnsk',
  max: 'https://max.ru/u/f9LHodD0cOIZA7d2zjv9u58KlP3UrPMBNzvz2AvowOpzOTYuiVKkocPZTXo',
};

/** Картинки и шрифт берутся из уже скачанных файлов копии (public/assets). */
export const ASSET = {
  logo: '/assets/tild3935-3364-4936-b736-333661316232/Group_1171274900_1.webp',
  telegram: '/assets/tild3434-6632-4061-b664-656138396261/div_5.png',
  max: '/assets/tild6634-3635-4533-a639-663732316638/div222.webp',
  phone: '/assets/tild6235-3234-4565-a365-313434306133/div_3.png',
  century: '/assets/tild3838-6532-4461-a162-633633616134/CenturyGothic.woff',
  tildaSans: '/assets/fonts/tildasans/',
};

/** Пункты шапки как на сайте; «Услуги» и «Магазин» открывают мега-меню (src/menu/megamenu.js). */
export const NAV: [string, string][] = [
  ['Главная', '/'],
  ['Установка Teyes', '/services/installation_teyes/'],
  ['Услуги', '#submenu:more'],
  ['Магазин', '#submenu:catalog'],
  ['Отзывы', '/reviews/'],
  ['FAQ', '/faq/'],
  ['Контакты', '/contacts/'],
];

export const FOOTER = {
  links: [['Установка Teyes', '/services/installation_teyes/'], ['Услуги', '/services/'], ['Каталог', '/store/'],
    ['Отзывы', '/reviews/'], ['FAQ', '/faq/'], ['Контакты', '/contacts/']] as [string, string][],
  docs: [['Политика конфиденциальности', '/politica/'], ['Договор оферты', '/oferta/']] as [string, string][],
};

/** 50600 → «50 600 ₽». */
export const rub = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
