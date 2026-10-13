#!/bin/sh
# Полный пересбор копии teyes-sibir.ru: страницы → ресурсы → сжатие картинок → сборка public/
# → снимок каталогов и лент (сам собирает копию без него) → докачка обложек постов из лент
# → данные мега-меню → сборка со снимком и меню → проверка.
# Повторный запуск докачивает только недостающее; ./run.sh --fresh – заново скачать HTML страниц.
set -e
cd "$(dirname "$0")"
[ -x .venv/bin/python ] || { python3 -m venv .venv && .venv/bin/pip install -q Pillow; }
PY=.venv/bin/python
$PY scripts/pages.py "$@"
$PY scripts/assets.py
$PY scripts/images.py
$PY scripts/store.py
$PY scripts/assets.py
$PY scripts/images.py
$PY scripts/menu.py
$PY scripts/build.py
$PY scripts/verify.py
