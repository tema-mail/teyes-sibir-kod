"""Проверка мега-меню (вызывает verify.py): данные, поведение в браузере, снимки экрана.

1. Каждая ссылка и картинка из data/menu.json – существующий файл копии (с точным регистром).
2. Поведение – синтетическими событиями в headless Chrome на двух видах шапки (главная, страница магазина):
   компьютер – наведение открывает панель, клик её не закрывает, списки Tilda T794 не видны, разворот и «назад»
   работают, уход курсора и Esc закрывают, «Записаться» открывает попап записи Tilda, который есть на странице; телефон (500 px) – тап по «Услугам» в меню Tilda T450 открывает экран,
   вкладки, разворот и закрытие работают, подпункты Tilda не раскрываются. Только на локальном сервере:
   для теста рядом со страницей временно кладётся её копия со скриптом проверки.
3. Снимки: raw/verify/menu/<страница>-<меню>-<ширина>.png (телефон – во фрейме 390 px).
"""
import html
import json
import pathlib
import re
import subprocess
import tempfile

import verify

MENU_SHOTS = verify.SHOTS / "menu"
PAGES = ["index.html", "store/closers/index.html"]  # тёмная закреплённая шапка и светлая шапка магазина
EXPECT = {
    "desktop": {"hoverOpens": True, "ariaExpanded": "true", "tildaDropdownVisible": 0, "clickPrevented": True,
                "stillOpenAfterClick": True, "drill": True, "backToStart": True, "closesOnLeave": True,
                "ariaAfter": "false", "escCloses": True, "bookOpensPopup": True},
    "mobile": {"t450item": True, "clickPrevented": True, "sheetOpens": True, "tildaSubmenuOpened": False,
               "tabSwitch": "Все товары", "drill": True, "closed": True},
}
TEST = r"""<script>window.addEventListener('load',function(){setTimeout(function(){
var R={},q=function(s){return document.querySelector(s)};
function ev(el,type,rel){var e=new MouseEvent(type,{bubbles:true,cancelable:true,relatedTarget:rel||null,detail:1});el.dispatchEvent(e);return e}
var vis=function(el){return !!el&&!el.hidden&&el.getBoundingClientRect().height>0};
var more=[].filter.call(document.querySelectorAll('a[href="#submenu:more"]'),function(a){var r=a.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth})[0];
var done=function(){document.body.setAttribute('data-test',JSON.stringify(R))};
try{ if(more){ R.mode='desktop'; ev(more,'mouseover'); setTimeout(function(){
  var p=q('.tsbm-panel'); R.hoverOpens=vis(p); R.ariaExpanded=more.getAttribute('aria-expanded');
  R.tildaDropdownVisible=[].filter.call(document.querySelectorAll('.t794__tooltip-menu'),vis).length;
  var c=ev(more,'click'); R.clickPrevented=c.defaultPrevented; R.stillOpenAfterClick=vis(p);
  p.querySelector('button.tsbm-tile').click(); R.drill=!!p.querySelector('.tsbm-drill')&&p.querySelectorAll('.tsbm-link').length>0;
  p.querySelector('.tsbm-back').click(); R.backToStart=!!p.querySelector('.tsbm-start');
  ev(more,'mouseout',document.body); setTimeout(function(){ R.closesOnLeave=!vis(p); R.ariaAfter=more.getAttribute('aria-expanded');
   ev(more,'mouseover'); setTimeout(function(){ document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    R.escCloses=!vis(p); ev(more,'mouseover'); setTimeout(function(){ p.querySelector('[data-book]').click();
     setTimeout(function(){ R.bookOpensPopup=!!document.querySelector('.t-popup.t-popup_show'); done(); },900)},200)},200)},400)},300);
 } else { R.mode='mobile';
  var sub=[].filter.call(document.querySelectorAll('.t450__link-item_submenu'),function(a){return a.textContent.trim()==='Услуги'})[0];
  R.t450item=!!sub; var c=ev(sub,'click'); R.clickPrevented=c.defaultPrevented;
  var s=q('.tsbm-sheet'); R.sheetOpens=vis(s); R.tildaSubmenuOpened=!!document.querySelector('.t450__submenu_opened, .t-menusub__menu_show');
  s.querySelector('[data-menu="store"]').click(); R.tabSwitch=s.querySelector('.tsbm-all__title').textContent.trim();
  s.querySelector('button.tsbm-tile').click(); R.drill=!!s.querySelector('.tsbm-links');
  s.querySelector('[data-close]').click(); R.closed=!vis(s); done(); }
}catch(e){R.error=String(e);done()}},1500)});</script>"""


def check_data():
    data = json.loads((verify.DATA / "menu.json").read_text("utf-8"))
    refs = []
    for menu in data["menus"].values():
        refs.append(menu["all"]["href"])
        for s in menu["sections"]:
            refs += [s["img"]] + ([s["href"]] if s.get("href") else [])
            for g in s.get("groups", []):
                refs += ([g["href"]] if g.get("href") else []) + [i["href"] for i in g["items"]]
    broken = sorted({r for r in refs if not verify.exists(r)})
    print(f"Меню: ссылок и картинок {len(refs)}, не найдено в копии {len(broken)}")
    for r in broken[:10]:
        print(f"    {r}")
    return not broken


def dump(url, width):
    with tempfile.TemporaryDirectory() as prof:
        res = subprocess.run([verify.CHROME, "--headless=new", "--disable-gpu", f"--user-data-dir={prof}",
                              f"--window-size={width},900", "--virtual-time-budget=9000", "--dump-dom", url],
                             capture_output=True, text=True, timeout=180)
    m = re.search(r'data-test="([^"]+)"', res.stdout)
    return json.loads(html.unescape(m.group(1))) if m else {"error": "нет результата"}


def check_behaviour(site):
    ok = True
    for page in PAGES:
        src = verify.PUBLIC / page
        test = src.with_name("_menutest.html")
        test.write_text(src.read_text("utf-8").replace("</body>", TEST + "</body>"), "utf-8")
        try:
            for width, mode in ((1440, "desktop"), (500, "mobile")):
                got = dump(f"{site}/{page.removesuffix('index.html')}_menutest.html", width)
                wrong = {k: got.get(k) for k, v in EXPECT[mode].items() if got.get(k) != v}
                if got.get("mode") != mode or wrong or got.get("error"):
                    ok = False
                    print(f"  поведение {page} {width}: НЕ ТАК – {got.get('error') or wrong or got.get('mode')}")
                else:
                    print(f"  поведение {page} {width}: всё как задумано")
        finally:
            test.unlink(missing_ok=True)
    return ok


def shots(site, local):
    MENU_SHOTS.mkdir(parents=True, exist_ok=True)
    for page, menu in (("", "services"), ("", "services:teyes"), ("store/closers/", "store"), ("store/closers/", "store:kits")):
        name = f"{(page.strip('/') or 'index').replace('/', '_')}-{menu.replace(':', '_')}"
        verify.chrome(f"{site}/{page}?menu={menu}", 1440, 900, MENU_SHOTS / f"{name}-1440.png")
        if local:  # телефон: страница во фрейме 390 px (окно headless Chrome не уже 500 px)
            frame = verify.PUBLIC / "_phone.html"
            frame.write_text(f'<html><body style="margin:0"><iframe src="{site}/{page}?menu={menu}" '
                             'style="width:390px;height:844px;border:0;display:block"></iframe></body></html>', "utf-8")
            try:
                verify.chrome(f"{site}/_phone.html", 500, 844, MENU_SHOTS / f"{name}-390.png")
            finally:
                frame.unlink(missing_ok=True)
            try:  # обрезать до фрейма; Pillow есть в .venv, без него снимок остаётся шириной 500
                from PIL import Image
                with Image.open(MENU_SHOTS / f"{name}-390.png") as im:
                    im.crop((0, 0, 390, 844)).save(MENU_SHOTS / f"{name}-390.png")
            except ImportError:
                pass
    print(f"  снимки меню: {MENU_SHOTS.relative_to(verify.ROOT)}")


def check_menu(site=None):
    if not (verify.DATA / "menu.json").exists():
        print("Меню: data/menu.json нет – меню не собрано")
        return False
    ok = check_data()
    local = site is None
    if local:
        site, _ = verify.serve()
        ok = check_behaviour(site) and ok
    shots(site, local)
    return ok
