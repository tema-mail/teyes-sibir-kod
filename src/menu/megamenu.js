/* Мега-меню «Услуги» и «Магазин» для копии Tilda (по образцу меню EV Sibir).
   Пункты шапки Tilda остаются: на компьютере наведение на «Услуги» (#submenu:more) и «Магазин»/«Каталог»
   (#submenu:catalog) открывает панель под шапкой вместо маленьких списков Tilda; на телефоне тап по
   «Услугам»/«Каталогу» в боковом меню T450 открывает экран по шагам. Данные – window.TSB_MENU (data/menu.json,
   встраивает build.py). ?menu=services|store[:раздел] открывает меню сразу – для проверки снимками. */
(function () {
  var D = window.TSB_MENU;
  if (!D) return;
  var TRIGGERS = { '#submenu:more': 'services', '#submenu:catalog': 'store' };
  var MOBILE_LABELS = { 'Услуги': 'services', 'Каталог': 'store', 'Магазин': 'store' };
  var panel = null, sheet = null, state = { menu: null, section: null, trigger: null };
  var hideTimer = 0, showTimer = 0;

  var ICON = {
    arrow: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"/></svg>',
    next: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function find(menu, id) {
    var list = D.menus[menu].sections;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function tile(s, extra) {
    var inner = '<img class="tsbm-tile__img" src="' + esc(s.img) + '" alt="" loading="lazy" decoding="async">' +
      '<span class="tsbm-tile__body"><span class="tsbm-tile__text"><span class="tsbm-tile__title">' + esc(s.title) +
      '</span>' + (s.meta ? '<span class="tsbm-tile__meta">' + esc(s.meta) + '</span>' : '') + '</span></span>' +
      '<span class="tsbm-tile__arrow">' + ICON.arrow + '</span>';
    return s.groups
      ? '<button type="button" class="tsbm-tile' + extra + '" data-section="' + esc(s.id) + '">' + inner + '</button>'
      : '<a class="tsbm-tile' + extra + '" href="' + esc(s.href) + '">' + inner + '</a>';
  }
  function actions(light) {
    return '<a class="tsbm-btn tsbm-btn--accent" href="' + esc(D.book) + '" data-book>Записаться на установку</a>' +
      '<a class="tsbm-btn tsbm-btn--ghost' + (light ? '' : ' tsbm-only-wide') + '" href="' + esc(D.tel) + '">Позвонить</a>';
  }
  function start(menu) {
    var m = D.menus[menu];
    return '<div class="tsbm-start"><div class="tsbm-all"><div>' +
      '<a class="tsbm-all__title" href="' + esc(m.all.href) + '">' + esc(m.all.title) + ICON.arrow + '</a>' +
      '<p class="tsbm-all__text">' + esc(m.all.text) + '</p></div>' +
      '<div class="tsbm-all__contacts"><span class="tsbm-all__phone">' + esc(D.phone) + '</span>' +
      '<span>' + esc(D.hours) + '</span><span>' + esc(D.address) + '</span></div>' +
      '<div class="tsbm-all__actions">' + actions(false) + '</div></div>' +
      '<div class="tsbm-tiles">' + m.sections.map(function (s) { return tile(s, ''); }).join('') + '</div></div>';
  }
  function groups(s) {
    return '<div class="tsbm-groups">' + s.groups.map(function (g) {
      var name = g.name ? (g.href ? '<a class="tsbm-group__name" href="' + esc(g.href) + '">' + esc(g.name) + ' →</a>'
        : '<p class="tsbm-group__name">' + esc(g.name) + '</p>') : '';
      return '<div class="tsbm-group">' + name + '<ul class="tsbm-links">' + g.items.map(function (i) {
        return '<li><a class="tsbm-link" href="' + esc(i.href) + '"><span>' + esc(i.name) + '</span>' +
          (i.meta ? '<span class="tsbm-link__meta">' + esc(i.meta) + '</span>' : ICON.next) + '</a></li>';
      }).join('') + '</ul></div>';
    }).join('') + '</div>';
  }
  function drill(menu, s) {
    var m = D.menus[menu];
    return '<div class="tsbm-drill"><div class="tsbm-drill__bar">' +
      '<button type="button" class="tsbm-back" data-section="">' + ICON.back + esc(m.all.title) + '</button>' +
      '<p class="tsbm-crumbs">' + esc(m.label) + ' / <b>' + esc(s.title) + '</b></p></div>' +
      '<div class="tsbm-drill__body"><div class="tsbm-rail">' + m.sections.map(function (x) {
        var on = x.id === s.id ? ' is-active' : '';
        var body = '<img src="' + esc(x.img) + '" alt="" loading="lazy" decoding="async"><span class="tsbm-rail__title">' +
          esc(x.title) + '</span>' + (x.meta ? '<span class="tsbm-rail__meta">' + esc(x.meta) + '</span>' : '');
        return x.groups
          ? '<button type="button" class="tsbm-rail__item' + on + '" data-section="' + esc(x.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + body + '</button>'
          : '<a class="tsbm-rail__item" href="' + esc(x.href) + '">' + body + '</a>';
      }).join('') + '</div><div class="tsbm-main">' +
      (s.href ? '<a class="tsbm-main__all" href="' + esc(s.href) + '">Перейти в раздел «' + esc(s.title) + '» ' + ICON.next + '</a>' : '') +
      groups(s) + '<div class="tsbm-cta"><div class="tsbm-cta__text"><span>' + esc(s.title) + '</span><b>' + esc(D.cta) +
      '</b></div>' + actions(true) + '</div></div></div></div>';
  }

  /* ---------- Компьютер: панель под шапкой ---------- */
  function place() {
    if (!panel || !state.trigger) return;
    var rec = state.trigger.closest('.t-rec') || state.trigger;
    var r = rec.getBoundingClientRect(), w = Math.min(1160, document.documentElement.clientWidth - 48);
    panel.style.top = Math.round(r.bottom + window.scrollY + 8) + 'px';
    panel.style.left = Math.round((document.documentElement.clientWidth - w) / 2 + window.scrollX) + 'px';
    panel.style.width = w + 'px';
  }
  function renderPanel() {
    panel.innerHTML = state.section ? drill(state.menu, find(state.menu, state.section)) : start(state.menu);
    panel.setAttribute('aria-label', D.menus[state.menu].label);
  }
  function openPanel(menu, trigger, section) {
    clearTimeout(hideTimer);
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'tsbm tsbm-panel';
      panel.lang = 'ru';  // переносы длинных слов (у страниц Tilda нет lang)
      panel.setAttribute('role', 'region');
      panel.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
      panel.addEventListener('mouseleave', scheduleHide);
      panel.addEventListener('click', onInnerClick);
      document.body.appendChild(panel);
    }
    if (state.trigger && state.trigger !== trigger) state.trigger.setAttribute('aria-expanded', 'false');
    var changed = state.menu !== menu || !panel.isConnected || panel.hidden;
    state.menu = menu; state.trigger = trigger;
    if (changed || section !== undefined) { state.section = section || null; renderPanel(); }
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    place();
  }
  function closePanel(focusBack) {
    clearTimeout(hideTimer); clearTimeout(showTimer);
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    if (state.trigger) {
      state.trigger.setAttribute('aria-expanded', 'false');
      if (focusBack) state.trigger.focus();
    }
  }
  function scheduleHide() {
    clearTimeout(hideTimer); clearTimeout(showTimer);
    hideTimer = setTimeout(function () { closePanel(false); }, 250);
  }
  function wide(trigger) {
    var r = trigger.getBoundingClientRect();
    return r.width > 0 && r.left >= 0 && r.right <= document.documentElement.clientWidth;
  }

  /* ---------- Телефон: экран по шагам ---------- */
  function renderSheet() {
    var m = D.menus[state.menu], s = state.section ? find(state.menu, state.section) : null;
    var tabs = Object.keys(D.menus).map(function (k) {
      return '<button type="button" class="tsbm-tab' + (k === state.menu ? ' is-active' : '') + '" data-menu="' + k +
        '" aria-pressed="' + (k === state.menu) + '">' + esc(D.menus[k].label) + '</button>';
    }).join('');
    sheet.innerHTML = '<div class="tsbm-sheet__bar">' +
      (s ? '<button type="button" class="tsbm-icon tsbm-icon--plain" data-section="" aria-label="Назад">' + ICON.back + '</button>' +
           '<p class="tsbm-sheet__title">' + esc(s.title) + '</p>'
         : '<div class="tsbm-tabs">' + tabs + '</div>') +
      '<button type="button" class="tsbm-icon" data-close aria-label="Закрыть меню">' + ICON.close + '</button></div>' +
      '<div class="tsbm-sheet__body">' + (s
        ? (s.href ? '<a class="tsbm-hero" href="' + esc(s.href) + '"><img src="' + esc(s.img) + '" alt="">' +
            (s.meta ? '<span class="tsbm-hero__meta">' + esc(s.meta) + '</span>' : '') +
            '<span class="tsbm-hero__all">Перейти в раздел →</span></a>' : '') + groups(s)
        : start(state.menu)) + '</div>' +
      '<div class="tsbm-sheet__cta"><a class="tsbm-btn tsbm-btn--ghost" href="' + esc(D.tel) + '">Позвонить</a>' +
      '<a class="tsbm-btn tsbm-btn--accent" href="' + esc(D.book) + '" data-book>Записаться</a></div>';
    sheet.setAttribute('aria-label', m.label);
    sheet.focus();  // фокус в экран меню (без рамки); дальше Tab идёт по его кнопкам
  }
  function openSheet(menu, section) {
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.className = 'tsbm tsbm-sheet';
      sheet.lang = 'ru';
      sheet.setAttribute('role', 'dialog');
      sheet.setAttribute('aria-modal', 'true');
      sheet.tabIndex = -1;
      sheet.addEventListener('click', onInnerClick);
      document.body.appendChild(sheet);
    }
    state.menu = menu; state.section = section || null;
    sheet.hidden = false;
    document.documentElement.classList.add('tsbm-lock');
    renderSheet();
  }
  function closeSheet() {
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    document.documentElement.classList.remove('tsbm-lock');
  }

  /* ---------- Общие клики внутри меню ---------- */
  function onInnerClick(e) {
    var t = e.target.closest('[data-section],[data-menu],[data-close],[data-book]');
    if (!t) return;
    var inSheet = sheet && sheet.contains(t);
    if (t.hasAttribute('data-book')) {
      // попап записи Tilda: закрыть меню и нажать ссылку на попап, которая уже есть на странице
      var link = [].filter.call(document.querySelectorAll('a[href="' + D.book + '"]'), function (a) {
        return !a.closest('.tsbm');
      })[0];
      if (!link) return;  // попапа на странице нет – обычный переход по якорю
      e.preventDefault();
      closePanel(false); closeSheet();
      link.click();
      return;
    }
    e.preventDefault();
    if (t.hasAttribute('data-close')) { closeSheet(); return; }
    if (t.hasAttribute('data-menu')) { state.menu = t.getAttribute('data-menu'); state.section = null; renderSheet(); return; }
    state.section = t.getAttribute('data-section') || null;
    if (inSheet) { renderSheet(); sheet.querySelector('.tsbm-sheet__body').scrollTop = 0; }
    else { renderPanel(); var f = panel.querySelector('.tsbm-back, .tsbm-tile'); if (f && e.detail === 0) f.focus(); }
  }

  /* ---------- Подключение к шапке Tilda ---------- */
  function triggerOf(el) {
    var a = el.closest && el.closest('a[href]');
    if (!a || a.closest('.tsbm')) return null;
    var menu = TRIGGERS[a.getAttribute('href')];
    if (menu) return { a: a, menu: menu, mobile: false };
    if (a.classList.contains('t450__link-item_submenu') || a.closest('.t450')) {
      var label = MOBILE_LABELS[a.textContent.trim()];
      if (label && a.classList.contains('t450__link-item_submenu')) return { a: a, menu: label, mobile: true };
    }
    return null;
  }
  // захват раньше обработчиков Tilda: её маленькие списки и раскрытие подпунктов T450 не срабатывают
  document.addEventListener('click', function (e) {
    var t = triggerOf(e.target);
    if (t) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (t.mobile || !wide(t.a)) { openSheet(t.menu); return; }
      // с мышью панель уже открыта наведением – клик её не закрывает; на сенсорном экране клик переключает
      var hover = window.matchMedia('(hover: hover)').matches;
      if (!hover && panel && !panel.hidden && state.trigger === t.a) closePanel(false);
      else { openPanel(t.menu, t.a); if (e.detail === 0) { var f = panel.querySelector('a, button'); if (f) f.focus(); } }
      return;
    }
    if (panel && !panel.hidden && !panel.contains(e.target)) closePanel(false);
  }, true);
  document.addEventListener('mouseover', function (e) {
    var t = triggerOf(e.target);
    if (!t || t.mobile || !wide(t.a) || !window.matchMedia('(hover: hover)').matches) return;
    clearTimeout(hideTimer); clearTimeout(showTimer);
    showTimer = setTimeout(function () { openPanel(t.menu, t.a); }, panel && !panel.hidden ? 0 : 90);
  }, true);
  document.addEventListener('mouseout', function (e) {
    var t = triggerOf(e.target);
    if (t && !t.mobile && !(panel && panel.contains(e.relatedTarget))) scheduleHide();
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (sheet && !sheet.hidden) closeSheet();
    else closePanel(true);
  });
  document.addEventListener('focusin', function (e) {
    if (panel && !panel.hidden && !panel.contains(e.target) && e.target !== state.trigger) closePanel(false);
  });
  window.addEventListener('resize', function () { place(); if (sheet && !sheet.hidden && window.innerWidth >= 960) closeSheet(); });

  document.documentElement.classList.add('tsbm-on');
  [].forEach.call(document.querySelectorAll('a[href="#submenu:more"], a[href="#submenu:catalog"]'), function (a) {
    a.setAttribute('aria-haspopup', 'true');
    a.setAttribute('aria-expanded', 'false');
  });

  // ?menu=services|store[:раздел] – открыть меню сразу (проверка снимками, ссылка «с открытым меню»)
  var q = /[?&]menu=(services|store)(?::([a-z]+))?/.exec(location.search);
  if (q) {
    var go = function () {
      var a = [].filter.call(document.querySelectorAll('a[href="' + (q[1] === 'services' ? '#submenu:more' : '#submenu:catalog') + '"]'), wide)[0];
      if (a) openPanel(q[1], a, q[2] || null); else openSheet(q[1], q[2] || null);
    };
    if (document.readyState === 'complete') setTimeout(go, 300); else window.addEventListener('load', function () { setTimeout(go, 300); });
  }
})();
