// Сохранение админки в репозиторий GitHub (перенесено из админки Elite Rose): товары – site/src/data/products.json
// (по товару на строку), фото – site/public/img/p/*.webp; после коммита GitHub Actions собирает страницы на коде
// и выкладывает сайт (~3–5 минут: сайт большой). Ключ доступа хранится только в браузере владельца.
export const REPO = 'tema-mail/teyes-sibir-kod';
export const BRANCH = 'main';
export const PRODUCTS_PATH = 'site/src/data/products.json';
export const IMG_DIR = 'site/public/img/p';
const KEY = 'tx_admin_gh_token';

export const getToken = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const setToken = (t: string) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch {} };

async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  // no-store: иначе браузер отдаёт из кэша старый «последний коммит», и следующее сохранение не проходит.
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    cache: 'no-store',
    ...init,
    headers: { Authorization: `Bearer ${getToken()}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? (undefined as T) : res.json();
}

const b64utf8 = (s: string) => { const bytes = new TextEncoder().encode(s); let bin = ''; bytes.forEach((b) => (bin += String.fromCharCode(b))); return btoa(bin); };

/** Проверка ключа на деле: читаем репозиторий и пробуем записать пустой объект (на сайт он не попадает).
 *  permissions.push в ответе GitHub – права аккаунта, а не ключа, поэтому одной его проверки мало. */
export async function checkAccess(): Promise<void> {
  await api('');
  try {
    await api('/git/blobs', { method: 'POST', body: JSON.stringify({ content: '', encoding: 'utf-8' }) });
  } catch (e: any) {
    if (String(e.message).includes('403')) throw new Error('У ключа нет права записи: в настройках ключа у Contents выберите «Read and write» (Edit → Permissions → Repositories → Contents) и нажмите Update');
    throw e;
  }
  try {
    await api('/actions/runs?per_page=1'); // без этого права статус «Сайт обновляется» не узнает, что сборка кончилась
  } catch (e: any) {
    if (String(e.message).includes('403')) throw new Error('У ключа нет права читать сборки: в настройках ключа у Actions выберите «Read-only» и нажмите Update');
    throw e;
  }
}

/** Понятный текст ошибки GitHub для владельца. */
export function humanError(e: any): string {
  const m = String(e?.message ?? e);
  if (m.includes('401')) return 'Ключ не подошёл или истёк срок – подключите новый';
  if (m.includes('403') && m.includes('not accessible')) return 'У ключа нет права записи: в настройках ключа у Contents выберите «Read and write» и нажмите Update';
  if (m.includes('403')) return 'GitHub отказал в доступе – проверьте права ключа';
  return m;
}

/** Свежий JSON из ветки main (а не из собранного сайта – он отстаёт на время сборки). Файл товаров ~8 МБ:
 *  обычный ответ contents отдаёт содержимое только до 1 МБ, поэтому – «сырой» вид (до 100 МБ). */
export async function readJson<T>(path: string, ref: string = BRANCH): Promise<T> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}?ref=${ref}&t=${Date.now()}`, {
    cache: 'no-store', headers: { Authorization: `Bearer ${getToken()}`, Accept: 'application/vnd.github.raw' },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Товары в том же виде, что пишет scripts/products.py: по товару на строку (правки видны в git построчно). */
export const productsText = (items: unknown[]) => `[\n${items.map((p) => JSON.stringify(p)).join(',\n')}\n]\n`;

/** Фото из админки → WebP 720 px (как у остальных товаров) прямо в браузере; имя – по содержимому. */
export async function toWebp(f: File): Promise<{ name: string; base64: string }> {
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, 720 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob: Blob = await new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('Браузер не смог сжать фото'))), 'image/webp', 0.72));
  const buf = new Uint8Array(await blob.arrayBuffer());
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-1', buf))].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
  let bin = ''; buf.forEach((b) => (bin += String.fromCharCode(b)));
  return { name: `${hash}.webp`, base64: btoa(bin) };
}

export interface FileChange { path: string; text?: string; base64?: string }

/** Все изменения – одним коммитом (Git Data API), чтобы сайт пересобирался один раз. files – функция от
 *  последнего коммита ветки: изменения применяются к свежему файлу, а не к открытому когда-то – иначе
 *  сохранение с давно открытой вкладки откатило бы правки с другого устройства. */
export async function commit(files: (headSha: string) => Promise<FileChange[]>, message: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ref = await api<{ object: { sha: string } }>(`/git/ref/heads/${BRANCH}`);
    const head = await api<{ tree: { sha: string } }>(`/git/commits/${ref.object.sha}`);
    const tree = [];
    for (const f of await files(ref.object.sha)) {
      const blob = await api<{ sha: string }>('/git/blobs', { method: 'POST', body: JSON.stringify({ content: f.base64 ?? b64utf8(f.text ?? ''), encoding: 'base64' }) });
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const t = await api<{ sha: string }>('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
    const c = await api<{ sha: string }>('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: t.sha, parents: [ref.object.sha] }) });
    try {
      await api(`/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
      return c.sha;
    } catch (e) {
      if (attempt === 2) throw e; // ветку успели сдвинуть – ещё раз поверх свежей (и свежего файла)
    }
  }
  throw new Error('Не удалось сохранить');
}

/** Статус сборки сайта, запущенной конкретным коммитом (пока её нет – null). */
export async function buildOf(sha: string): Promise<{ status: string; conclusion: string | null; url: string } | null> {
  const r = await api<{ workflow_runs: { status: string; conclusion: string | null; html_url: string; head_sha: string }[] }>(`/actions/runs?branch=${BRANCH}&per_page=10`);
  const run = r.workflow_runs.find((x) => x.head_sha === sha);
  return run ? { status: run.status, conclusion: run.conclusion, url: run.html_url } : null;
}


const MAP: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export const slugify = (s: string) => s.toLowerCase().split('').map((c) => MAP[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
