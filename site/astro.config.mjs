import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

// Этап 2 сайта teyes-sibir.ru на Astro (начат с раздела товаров). Сборка в site/dist вливается в ../public
// скриптом scripts/build.py поверх копии Tilda.
// site – боевой домен: canonical страниц смотрит на teyes-sibir.ru (как у копии), копия закрыта noindex.
// base – подпапка GitHub Pages; при своём домене станет '/'. Должна совпадать с BASE в scripts/build.py.
const SITE = process.env.PUBLIC_SITE_URL || 'https://teyes-sibir.ru';
const BASE = process.env.PUBLIC_BASE || '/teyes-sibir-kod';

export default defineConfig({
  site: SITE,
  base: BASE,
  integrations: [preact()],
  trailingSlash: 'ignore',
  build: { format: 'directory', inlineStylesheets: 'auto' },
  devToolbar: { enabled: false },
});
