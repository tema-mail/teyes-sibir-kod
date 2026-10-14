"""Страницы на коде (site/dist) – поверх копии Tilda в public/.

Вызывают build.py (локальный пересбор) и GitHub Actions (после каждого сохранения в админке сайта): файлы прошлой
сборки сайта (их список – public/.site-dist.txt) удаляются – так товар, скрытый или удалённый в админке, пропадает
и с сайта, – затем копируется свежий site/dist и пишется новый список. Страницы Tilda, которых в списке нет, не трогаем.
"""
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST, PUBLIC = ROOT / "site" / "dist", ROOT / "public"
LIST = PUBLIC / ".site-dist.txt"


def overlay():
    if not DIST.exists():
        raise SystemExit("нет site/dist – сначала cd site && npm run build")
    removed = 0
    if LIST.exists():
        for rel in LIST.read_text("utf-8").splitlines():
            if rel and ".." not in rel.split("/") and (PUBLIC / rel).is_file():
                (PUBLIC / rel).unlink()
                removed += 1
    files = sorted(f.relative_to(DIST).as_posix() for f in DIST.rglob("*") if f.is_file())
    for rel in files:
        out = PUBLIC / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(DIST / rel, out)
    LIST.write_text("\n".join(files) + "\n", "utf-8")
    return removed, files


if __name__ == "__main__":
    removed, files = overlay()
    print(f"страницы на коде: убрано прошлых файлов {removed}, записано {len(files)}")
    sys.exit(0)
