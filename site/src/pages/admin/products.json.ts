// Товары для админки без ключа GitHub (режим просмотра): та же выгрузка, что в site/src/data/products.json,
// включая скрытые. С ключом админка читает свежий файл прямо из репозитория.
import { ALL_PRODUCTS } from '../../lib/catalog';

export const GET = () => new Response(JSON.stringify(ALL_PRODUCTS), { headers: { 'Content-Type': 'application/json' } });
