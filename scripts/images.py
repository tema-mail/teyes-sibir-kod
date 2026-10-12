"""Шаг 3. Сжать картинки под лимит GitHub Pages (1 ГБ на сайт): WebP q85, длинная сторона ≤ 2560.

Берёт скачанные картинки из data/assets.csv (raw/assets), кладёт в raw/img/<путь в копии>, пишет data/images.csv.
Без изменений копируются: заглушки ленивой подгрузки, SVG/GIF/ICO/AVIF, анимация, файлы меньше 30 КБ
(иконки – в том числе apple-touch-icon, которому нужен PNG) и всё, что WebP не уменьшил хотя бы на 20 %.
Поворот по EXIF «впекается», цветовой профиль сохраняется – картинка выглядит как оригинал.
Нужен Pillow. Повторный запуск пропускает уже готовое.
"""
import csv
import os
import pathlib
import shutil
import sys
from concurrent.futures import ProcessPoolExecutor

from PIL import Image, ImageOps

from assets import raw_path

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT, DATA = ROOT / "raw" / "img", ROOT / "data"
QUALITY, MAX_SIDE = 85, 2560
KEEP_BELOW, MIN_GAIN = 30 * 1024, 0.8
CONVERT_EXT = (".png", ".jpg", ".jpeg", ".webp", ".bmp")
Image.MAX_IMAGE_PIXELS = 200_000_000


def webp_path(local, taken):
    stem = local.rsplit(".", 1)[0]
    out = f"{stem}.webp"
    return out if out == local or out not in taken else f"{local}.webp"


def convert(job):
    url, local, out_local = job
    src, size_in = raw_path(url), raw_path(url).stat().st_size
    copy = (local.startswith("assets/thb/") or not local.lower().endswith(CONVERT_EXT) or size_in < KEEP_BELOW)
    if not copy:
        dst = OUT / out_local
        if dst.exists():
            return url, local, out_local, size_in, dst.stat().st_size, "webp"
        try:
            with Image.open(src) as im:
                if getattr(im, "n_frames", 1) > 1:
                    raise ValueError("анимация")
                icc = im.info.get("icc_profile")
                alpha = im.mode in ("RGBA", "LA", "P", "PA") or "transparency" in im.info  # tRNS у RGB/L
                im = ImageOps.exif_transpose(im)
                im = im.convert("RGBA" if alpha else "RGB")
                im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
                dst.parent.mkdir(parents=True, exist_ok=True)
                tmp = dst.with_name(dst.name + ".part")
                im.save(tmp, "WEBP", quality=QUALITY, method=5, **({"icc_profile": icc} if icc else {}))
            if tmp.stat().st_size <= size_in * MIN_GAIN:
                tmp.replace(dst)
                return url, local, out_local, size_in, dst.stat().st_size, "webp"
            tmp.unlink()
        except Exception as exc:  # битый файл или анимация – оставляем оригинал
            print(f"  как есть ({exc}): {local}", flush=True)
    dst = OUT / local
    if not dst.exists():
        dst.parent.mkdir(parents=True, exist_ok=True)
        tmp = dst.with_name(dst.name + ".part")
        shutil.copyfile(src, tmp)
        tmp.replace(dst)  # прерванный запуск не оставит недокопированный файл «готовым»
    return url, local, local, size_in, size_in, "copy"


def main():
    with (DATA / "assets.csv").open(encoding="utf-8") as f:
        imgs = [r for r in csv.DictReader(f) if r["kind"] == "img" and r["status"] == "200"]
    taken = {r["local"] for r in imgs}
    jobs = []
    for r in imgs:
        out = webp_path(r["local"], taken)
        taken.add(out)
        jobs.append((r["url"], r["local"], out))
    rows = []
    with ProcessPoolExecutor(max(1, (os.cpu_count() or 2) - 1)) as pool:
        for n, res in enumerate(pool.map(convert, jobs, chunksize=8), 1):
            rows.append(dict(zip(["url", "local", "out", "bytes_in", "bytes_out", "mode"], res)))
            if n % 500 == 0:
                print(f"  {n} из {len(jobs)}", flush=True)
    with (DATA / "images.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["url", "local", "out", "bytes_in", "bytes_out", "mode"])
        w.writeheader()
        w.writerows(rows)
    mb_in = sum(r["bytes_in"] for r in rows) / 2**20
    mb_out = sum(r["bytes_out"] for r in rows) / 2**20
    print(f"картинок {len(rows)}: было {mb_in:.0f} МБ, стало {mb_out:.0f} МБ, в WebP {sum(r['mode'] == 'webp' for r in rows)}")


if __name__ == "__main__":
    sys.exit(main())
