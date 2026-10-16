"""Одинаковые блоки <style> страниц Tilda (шапка, подвал, попапы) – в общие файлы assets/css-shared/<хеш>.css.

16.10.2026: из 343 МиБ HTML страниц Tilda 163 МиБ – встроенные стили, и 145 МиБ из них – одни и те же блоки,
повторённые на сотнях страниц; с 3 043 товарами сайт подошёл к лимиту GitHub Pages (1 ГБ). Блок, который
встречается на MIN_PAGES страницах и длиннее MIN_SIZE, заменяется на <link rel="stylesheet"> на том же месте
(порядок правил не меняется). Страницы на коде (public/.site-dist.txt) не трогаем. Повторный запуск безопасен:
уже вынесенных блоков в HTML нет. Запускать после build.py (run.sh).
"""
import collections
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
OUT = PUBLIC / "assets" / "css-shared"
BASE = "/teyes-sibir-kod"
MIN_PAGES, MIN_SIZE = 3, 2000
STYLE = re.compile(r"<style\b[^>]*>(.*?)</style>", re.S)


def main():
    listed = PUBLIC / ".site-dist.txt"
    code = set(listed.read_text("utf-8").split()) if listed.exists() else set()
    pages = [f for f in PUBLIC.rglob("*.html") if f.relative_to(PUBLIC).as_posix() not in code]
    count = collections.Counter()
    for f in pages:
        count.update({hashlib.sha1(m.group(1).encode()).hexdigest()[:16] for m in STYLE.finditer(f.read_text("utf-8"))
                      if len(m.group(1)) >= MIN_SIZE})
    shared = {h for h, n in count.items() if n >= MIN_PAGES}
    OUT.mkdir(parents=True, exist_ok=True)
    before = after = 0
    for f in pages:
        text = f.read_text("utf-8")

        def swap(m):
            if len(m.group(1)) < MIN_SIZE:
                return m.group(0)
            h = hashlib.sha1(m.group(1).encode()).hexdigest()[:16]
            if h not in shared:
                return m.group(0)
            css = OUT / f"{h}.css"
            if not css.exists():
                css.write_text(m.group(1), "utf-8")
            return f'<link rel="stylesheet" href="{BASE}/assets/css-shared/{h}.css">'

        new = STYLE.sub(swap, text)
        before += len(text.encode())
        after += len(new.encode())
        if new != text:
            f.write_text(new, "utf-8")
    files = sum(f.stat().st_size for f in OUT.glob("*.css"))
    print(f"общие стили: блоков {len(shared)}, файлов {len(list(OUT.glob('*.css')))} ({files / 2**20:.1f} МиБ); "
          f"HTML страниц Tilda {before / 2**20:.0f} → {after / 2**20:.0f} МиБ")
    return 0


if __name__ == "__main__":
    sys.exit(main())
