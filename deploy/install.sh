#!/bin/zsh
# Выкладка боевой сборки teyes-sibir.ru на VPS FirstVDS Москва (повторный запуск безопасен).
# С 04.11.2026: Beget 45.12.72.227 лёг 02.11, сайт переехал на 168.113.179.49 (общий Caddy в контейнере caddy).
#   ./deploy/install.sh            – выложить boevoy/ и проверочный адрес https://teyes.168.113.179.49.nip.io (noindex)
#   DOMAIN=1 ./deploy/install.sh   – то же + блок teyes-sibir.ru и www в Caddy (в день переключения DNS)
# Сначала: cd site && PUBLIC_BASE=/ npm run build && cd .. && python3 scripts/boevaya.py
set -euo pipefail
HOST="root@168.113.179.49"
KEY="$HOME/.ssh/firstvds_msk_ed25519"
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/../boevoy"
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes "$HOST")
STAMP=$(date +%Y%m%d-%H%M%S)
[ -f "$SRC/sitemap.xml" ] || { echo "нет boevoy/ – сначала scripts/boevaya.py" >&2; exit 1; }

# 1. Место: на сервере живут CRM и магазины – после выкладки должно остаться не меньше 500 МБ.
# Повторная выкладка кладёт новыми только изменённые файлы (остальное – жёсткие ссылки на прошлую): считаем их.
"${SSH[@]}" "mkdir -p /opt/teyes-sibir-site/releases"
PREV=$("${SSH[@]}" "readlink /opt/teyes-sibir-site/releases/current || true")
if [ -n "$PREV" ]; then
  NEED=$(rsync -anc --out-format='%l' -e "ssh -i $KEY -o IdentitiesOnly=yes" "$SRC/" "$HOST:/opt/teyes-sibir-site/releases/$PREV/" \
    | awk '{s+=$1} END {print int(s/1048576)+1}')
else
  NEED=$(( $(du -sk "$SRC" | cut -f1) / 1024 ))
fi
FREE=$("${SSH[@]}" "df -Pm / | awk 'NR==2{print \$4}'")
echo "новых данных ${NEED} МБ, свободно на сервере ${FREE} МБ"
(( FREE - NEED >= 500 )) || { echo "СТОП: после выкладки останется меньше 500 МБ – сначала освободить место" >&2; exit 1; }

# 2. Файлы: сервер сам копирует прошлую выкладку жёсткими ссылками (cp -al), rsync докладывает только изменения.
# --link-dest не годится: openrsync на маке его принимает, но кладёт полную копию (проверено 01.11.2026: −200 МБ).
# rsync пишет изменённый файл во временный и переименовывает – общий с прошлой выкладкой файл не портится.
[ -n "$PREV" ] && "${SSH[@]}" "cp -al /opt/teyes-sibir-site/releases/$PREV /opt/teyes-sibir-site/releases/$STAMP"
rsync -azc --delete -e "ssh -i $KEY -o IdentitiesOnly=yes" "$SRC/" "$HOST:/opt/teyes-sibir-site/releases/$STAMP/"
scp -q -i "$KEY" -o IdentitiesOnly=yes "$HERE/compose.yml" "$HERE/nginx.conf" "$HERE/redirects.map" "$HOST:/opt/teyes-sibir-site/"
"${SSH[@]}" "set -e
  cd /opt/teyes-sibir-site/releases && chmod -R a+rX $STAMP && ln -sfn $STAMP current.new && mv -Tf current.new current
  ls -1d 20* | sort | head -n -2 | xargs -r rm -rf   # храним две последние выкладки (вторая – жёсткие ссылки, откат)
  df -h / | tail -1
  cd /opt/teyes-sibir-site && docker compose up -d --remove-orphans >/dev/null
  docker exec teyes-sibir-web nginx -t 2>&1 | tail -1 && docker exec teyes-sibir-web nginx -s reload
  docker ps --filter name=teyes-sibir-web --format '{{.Names}} {{.Status}}'"

# 3. Блок в общем Caddy – только при парных метках, с проверкой и откатом (как у avtoball)
{
  echo "# >>> teyes-sibir: teyes-sibir.ru – сайт на коде; блок ставит deploy/install.sh репозитория teyes-sibir-kod"
  echo "# Проверочный адрес до переключения DNS, закрыт от поисковиков. Порт 80 у nginx ispmanager – сертификат через TLS-ALPN на 443."
  echo "teyes.168.113.179.49.nip.io {"
  echo "	tls {"
  echo "		issuer acme {"
  echo "			disable_http_challenge"
  echo "		}"
  echo "	}"
  echo "	encode gzip zstd"
  echo "	header X-Robots-Tag \"noindex, nofollow\""
  echo "	reverse_proxy teyes-sibir-web:8080"
  echo "}"
  if [ "${DOMAIN:-0}" = 1 ]; then
    echo "teyes-sibir.ru {"
    echo "	tls {"
    echo "		issuer acme {"
    echo "			disable_http_challenge"
    echo "		}"
    echo "	}"
    echo "	encode gzip zstd"
    echo "	header {"
    echo "		Strict-Transport-Security \"max-age=31536000\""
    echo "		X-Content-Type-Options \"nosniff\""
    echo "		Referrer-Policy \"strict-origin-when-cross-origin\""
    echo "		-Server"
    echo "	}"
    echo "	reverse_proxy teyes-sibir-web:8080"
    echo "}"
    echo "# зеркала – кодом 301: Caddy по умолчанию отдаёт 308, его Яндекс не склеивает; http → https – у nginx сервера (порт 80)"
    echo "www.teyes-sibir.ru {"
    echo "	tls {"
    echo "		issuer acme {"
    echo "			disable_http_challenge"
    echo "		}"
    echo "	}"
    echo "	redir https://teyes-sibir.ru{uri} 301"
    echo "}"
  fi
  echo "# <<< teyes-sibir"
} | "${SSH[@]}" '
  set -e
  F=/opt/caddy/Caddyfile   # bind-mount файла: пишем в тот же файл (cat >), inode не меняем
  BAK=/opt/caddy/Caddyfile.bak-teyes-sibir-$(date +%Y%m%d%H%M%S)
  cp "$F" "$BAK"
  [ "$(grep -c "^# >>> teyes-sibir" "$F")" = "$(grep -c "^# <<< teyes-sibir" "$F")" ] || { echo "Caddy: метки без пары, файл не изменён" >&2; exit 1; }
  awk "/^# >>> teyes-sibir/{skip=1} !skip{print} /^# <<< teyes-sibir/{skip=0}" "$F" > /tmp/Caddyfile.teyes
  cat >> /tmp/Caddyfile.teyes
  if docker exec -i caddy caddy validate --adapter caddyfile --config /dev/stdin < /tmp/Caddyfile.teyes >/tmp/caddy-validate-teyes.log 2>&1; then
    cat /tmp/Caddyfile.teyes > "$F"
    if docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; then
      echo "Caddy: блок teyes-sibir применён"
    else
      cat "$BAK" > "$F"; docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile || true
      echo "Caddy: перезагрузка не прошла, прежний файл возвращён" >&2; exit 1
    fi
  else
    echo "Caddy: проверка не прошла, файл не изменён" >&2; tail -5 /tmp/caddy-validate-teyes.log >&2; exit 1
  fi'
echo "готово: https://teyes.168.113.179.49.nip.io"
