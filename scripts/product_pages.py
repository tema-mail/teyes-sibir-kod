"""Товары магазина без раздела (876 на 16.10.2026): в Tilda они открываются по прямой ссылке, но ни в одном
каталоге их нет – поэтому снимок каталогов (store.py) их не видит. Адреса – data/tproduct_extra.txt (из обхода
сайта, репо teyes-sibir-slepok). Страница товара Tilda содержит JSON товара: забираем его оттуда (только
чтение живого сайта) и пишем raw/store/extra_products.json в том же виде, что ответ API getproductslist –
products.py добавляет их к остальным.
"""
import json
import pathlib
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIST, CACHE = ROOT / "data" / "tproduct_extra.txt", ROOT / "raw" / "tproduct"
OUT = ROOT / "raw" / "store" / "extra_products.json"
WORKERS = 6
AS_STRING = ("gallery", "json_options", "json_chars", "partuids")  # в API это строки с JSON внутри


def page(url):
    uid = re.search(r"/tproduct/(\d+)", url).group(1)
    f = CACHE / f"{uid}.html"
    if not (f.exists() and f.stat().st_size > 10000):
        res = subprocess.run(["curl", "-sS", "-L", "--max-time", "60", "--retry", "2", "-o", str(f), "-w", "%{http_code}", url],
                             capture_output=True, text=True)
        if res.stdout.strip() != "200":
            f.unlink(missing_ok=True)
            return uid, None
    html = f.read_text("utf-8", errors="ignore")
    at = html.find(f'"uid":{uid}')
    for m in reversed(list(re.finditer(r"\{", html[:at]))[-40:]):
        try:
            obj, _ = json.JSONDecoder().raw_decode(html[m.start():])
        except ValueError:
            continue
        if str(obj.get("uid")) == uid and "editions" in obj:
            for k in AS_STRING:
                if not isinstance(obj.get(k), str):
                    obj[k] = json.dumps(obj.get(k) or [], ensure_ascii=False)
            return uid, obj
    return uid, None


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    urls = [u for u in LIST.read_text("utf-8").split() if u]
    with ThreadPoolExecutor(WORKERS) as pool:
        got = list(pool.map(page, urls))
    products = [p for _, p in got if p]
    failed = [u for u, p in got if not p]
    OUT.write_text(json.dumps({"products": products}, ensure_ascii=False), "utf-8")
    print(f"товаров без раздела: адресов {len(urls)}, снято {len(products)}, не вышло {len(failed)} {failed[:5]}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
