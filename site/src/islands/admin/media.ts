// Фото и видео товара в админке: проверка файла до загрузки (формат, вес, размер, длительность) с понятной
// ошибкой и подготовка к коммиту. Фото сжимаются в браузере в WebP 720 px (как остальные фото товаров),
// видео кладётся как есть – поэтому для него строгий потолок по весу: сайт на GitHub Pages ограничен 1 ГБ.
import { toWebp } from './gh';

export const PHOTO = { types: ['image/jpeg', 'image/png', 'image/webp'], maxMb: 15, minSide: 400, maxCount: 20 };
export const VIDEO = { types: ['video/mp4', 'video/webm'], maxMb: 20, maxSec: 90, maxCount: 3 };
/** Подсказка под кнопками загрузки – те же цифры, что в проверке. */
export const RULES = {
  photo: `Фото: JPG, PNG или WebP, до ${PHOTO.maxMb} МБ, не меньше ${PHOTO.minSide} px по короткой стороне, до ${PHOTO.maxCount} шт. Сжимаются до 720 px.`,
  video: `Видео: MP4 (H.264) или WebM, до ${VIDEO.maxMb} МБ и ${VIDEO.maxSec} секунд, до ${VIDEO.maxCount} шт. Длиннее или тяжелее – сожмите или загрузите на YouTube.`,
};

export type Ready = { name: string; base64: string; url: string };
const mb = (b: number) => (b / 2 ** 20).toFixed(1).replace('.', ',');
const ext = (f: File) => (f.name.split('.').pop() || '').toLowerCase();

/** Фото: проверка и сжатие. Ошибка – текстом для владельца, с именем файла. */
export async function preparePhoto(f: File): Promise<Ready> {
  if (ext(f) === 'heic' || ext(f) === 'heif' || f.type.includes('heic'))
    throw new Error(`«${f.name}»: формат HEIC (фото с iPhone) браузер не открывает – сохраните как JPG и загрузите снова`);
  if (!PHOTO.types.includes(f.type)) throw new Error(`«${f.name}»: не фото в JPG, PNG или WebP`);
  if (f.size > PHOTO.maxMb * 2 ** 20) throw new Error(`«${f.name}»: ${mb(f.size)} МБ – больше ${PHOTO.maxMb} МБ`);
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(f); } catch { throw new Error(`«${f.name}»: файл повреждён или это не картинка`); }
  if (Math.min(bmp.width, bmp.height) < PHOTO.minSide)
    throw new Error(`«${f.name}»: ${bmp.width}×${bmp.height} px – слишком маленькое, нужно не меньше ${PHOTO.minSide} px по короткой стороне`);
  const w = await toWebp(f);
  return { ...w, url: URL.createObjectURL(f) };
}

/** Видео: формат, вес, длительность и то, что браузер его реально проигрывает. */
export async function prepareVideo(f: File): Promise<Ready> {
  if (ext(f) === 'mov' || f.type === 'video/quicktime')
    throw new Error(`«${f.name}»: MOV (видео с iPhone) играет не во всех браузерах – сохраните как MP4 (H.264)`);
  if (!VIDEO.types.includes(f.type)) throw new Error(`«${f.name}»: не видео в MP4 или WebM`);
  if (f.size > VIDEO.maxMb * 2 ** 20) throw new Error(`«${f.name}»: ${mb(f.size)} МБ – больше ${VIDEO.maxMb} МБ, сожмите видео`);
  const url = URL.createObjectURL(f);
  const bad = (text: string) => { URL.revokeObjectURL(url); return new Error(`«${f.name}»: ${text}`); };
  const sec = await new Promise<number>((ok, fail) => {
    const v = document.createElement('video');
    const t = setTimeout(() => fail(bad('браузер не смог прочитать видео за 15 секунд – сохраните как MP4 (H.264)')), 15000);
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => { clearTimeout(t); ok(v.duration); };
    v.onerror = () => { clearTimeout(t); fail(bad('браузер не может проиграть это видео – нужен MP4 с кодеком H.264')); };
    v.src = url;
  });
  if (!isFinite(sec)) throw bad('у видео не записана длительность (так бывает у записи экрана) – пересохраните его как MP4');
  if (sec > VIDEO.maxSec) throw bad(`${Math.round(sec)} с – длиннее ${VIDEO.maxSec} секунд`);
  const buf = new Uint8Array(await f.arrayBuffer());
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-1', buf))].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { name: `${hash}.${f.type === 'video/webm' ? 'webm' : 'mp4'}`, base64: btoa(bin), url };
}

/** Переставить элемент списка: from → to (перетаскивание и стрелки). */
export const moveItem = <T,>(list: T[], from: number, to: number) => {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = list.slice();
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
};
