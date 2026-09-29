/* ============================================================
   Annotation screen, drawn from real model output
   (annotation.data.js, exported by
   dicom-analyzer/examples/annotation/export_for_ui.py).

   The reader is a radiologist, not an ML engineer: nothing here
   names a model, a threshold, a coordinate system or a payload.

   The screen is a conveyor, not a form. One point is active at a
   time, only its allowed region is shown (softly, so it reads as
   a hint and not as a button), the primary action sits at the top
   of the panel, and the keyboard carries the whole cycle:
   digits switch point, space marks it absent, Enter sends.

   Static mock: nothing is dragged or drawn by hand. Positions are
   real, so a marker sits where a real submission would put it
   (SVG viewBox = the original frame).
   ============================================================ */

(function (global) {
  'use strict';

  var CASES = global.ANNOT || [];
  var byKey = {};

  /* Which queue the doctor is walking right now (set by mount). */
  var QUEUE = null;

  CASES.forEach(function (c) { byKey[c.key] = c; });

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var REGION = { hip_left: 'Левое бедро', hip_right: 'Правое бедро', spine: 'Поясничный отдел' };

  /* Point names as a doctor says them, not as the model files spell them. */
  var POINT_NAME = {
    greater_trochanter_apex: 'Верхушка большого вертела',
    femoral_neck: 'Центр шейки бедра',
    ischium: 'Нижний край седалищной кости',
    crest_left: 'Гребень подвздошной кости слева',
    crest_right: 'Гребень подвздошной кости справа'
  };

  /* Which suggestions somebody has already looked at. Behind the two words
     sit the contract's origin values (human / model_confirmed versus model). */
  var CHECKED = {
    hip_left: ['checked', 'checked', 'checked'],
    hip_right: ['checked', 'suggested', 'suggested'],
    spine_ok: ['checked', 'checked'],
    spine_bad: ['checked', 'checked']
  };

  /* Per point:
       absent    — the anatomy is cut off by the frame edge
       suggested — there is a guess nobody has confirmed yet
       checked   — settled
       empty     — nothing on the image, the doctor places it
     The marker follows the same state, so badge and image never disagree. */
  function pointState(c, i) {
    if (c.blank) return 'empty';
    var p = c.items[i].prefill;
    if (!p) return 'empty';
    if (!p.present) return p.confidence >= 0.5 ? 'suggested' : 'absent';
    return (CHECKED[c.key] || [])[i] || 'checked';
  }

  /* The conveyor always has one point in hand: the first that still needs
     attention, or the last one when everything is done. */
  function activeIndex(c) {
    if (!c.items) return -1;
    for (var i = 0; i < c.items.length; i++) {
      var s = pointState(c, i);
      if (s === 'suggested' || s === 'empty') return i;
    }
    return c.items.length - 1;
  }

  function blank(c) {
    var b = JSON.parse(JSON.stringify(c));
    b.blank = true;
    if (b.items) b.items.forEach(function (it) { it.prefill = null; });
    if (b.polygons) b.polygons = [];
    b.verdict = null;
    return b;
  }

  /* ---------- canvas ---------- */

  function svgPoint(x, y, cls, label) {
    return '<g class="mark ' + cls + '">' +
      '<circle class="mark__ring" cx="' + x + '" cy="' + y + '" r="6" />' +
      '<circle class="mark__dot" cx="' + x + '" cy="' + y + '" r="2.4" />' +
      '<path class="mark__cross" d="M' + (x - 11) + ' ' + y + 'h22M' + x + ' ' + (y - 11) + 'v22" />' +
      '<text class="mark-label" x="' + (x + 9) + '" y="' + (y - 8) + '" fill="currentColor">' + esc(label) + '</text>' +
      '</g>';
  }

  function overlay(c) {
    var s = '';
    var active = activeIndex(c);

    if (c.items) {
      c.items.forEach(function (it, i) {
        var b = it.allowed_box;
        s += '<rect class="zone' + (i === active ? ' zone--active' : '') +
          '" x="' + b[0] + '" y="' + b[1] + '" width="' + (b[2] - b[0]) +
          '" height="' + (b[3] - b[1]) + '" rx="2" />';
      });
    }
    if (c.task === 'foreign_seg') {
      /* No restricted area here: a foreign object anywhere on the frame is
         worth having, even where today's model does not look. */
      c.polygons.forEach(function (p) {
        s += '<polygon class="poly--' + p.cls + '" points="' +
          p.points.map(function (pt) { return pt[0] + ',' + pt[1]; }).join(' ') + '" />';
      });
    }
    if (c.items) {
      c.items.forEach(function (it, i) {
        var p = it.prefill;
        var state = pointState(c, i);
        if (!p || state === 'absent') return;
        s += svgPoint(p.x, p.y,
          (state === 'suggested' ? 'mark--model' : '') + (i === active ? ' mark--active' : ''),
          String(i + 1));
      });
    }
    return s;
  }

  function canvas(c) {
    var active = activeIndex(c);
    var now = c.items && active >= 0
      ? (POINT_NAME[c.items[active].name] || c.items[active].title)
      : 'Обведите посторонние предметы';

    return '<div class="canvas annot__canvas">' +
      '<div class="canvas__bar">' +
        '<b>' + esc(REGION[c.region] || c.region) + '</b>' +
        '<span>' + esc(c.file) + '</span>' +
        '<span class="spacer"></span>' +
        (c.blank
          ? '<span class="tag">отметки ставите вы</span>'
          : '<span class="tag tag--warn">предварительная разметка моделью</span>') +
      '</div>' +
      '<div class="canvas__now">' +
        (c.items && active >= 0 ? '<span class="canvas__step">' + (active + 1) + '</span>' : '') +
        '<b>' + esc(now) + '</b>' +
        '<span class="spacer"></span>' +
        (c.items && active >= 0
          ? '<span class="canvas__tip">подсвечена область, где эта точка бывает</span>'
          : '<span class="canvas__tip">обводить можно в любой части снимка</span>') +
      '</div>' +
      '<div class="canvas__stage"><div class="canvas__scan" style="width:' + (c.cols * c.scale) + 'px">' +
        '<img src="' + c.png + '" alt="" />' +
        '<svg viewBox="0 0 ' + c.cols + ' ' + c.rows + '" preserveAspectRatio="none">' + overlay(c) + '</svg>' +
      '</div></div>' +
    '</div>';
  }

  /* ---------- panel ---------- */

  function kbd(k) { return '<kbd>' + esc(k) + '</kbd>'; }

  function actionBar(c) {
    var left = c.items
      ? c.items.map(function (it, i) { return pointState(c, i); })
          .filter(function (s) { return s === 'suggested' || s === 'empty'; }).length
      : (c.blank ? 1 : 0);

    return '<div class="act">' +
      '<div class="act__state">' +
        (left ? '<span class="tag tag--warn">осталось отметить: ' + left + '</span>'
              : '<span class="tag tag--ok">снимок готов</span>') +
        '<span class="act__count num">' + esc(place()) + '</span>' +
      '</div>' +
      '<button class="btn btn--primary btn--wide" type="button">Готово, следующий ' + kbd('Enter') + '</button>' +
      '<div class="act__minor">' +
        '<button class="btn btn--s btn--quiet" type="button">сомневаюсь</button>' +
        '<button class="btn btn--s btn--quiet" type="button">пропустить</button>' +
      '</div>' +
    '</div>';
  }

  /* Position inside the queue the doctor actually came from: if the queue was
     filtered down to one source, "next" walks that filtered list, not all of it. */
  function place() {
    if (!QUEUE) return '';
    var i = QUEUE.keys.indexOf(QUEUE.current) + 1;
    return i + ' из ' + (QUEUE.total || QUEUE.keys.length);
  }

  function pointRow(it, i, state, isActive) {
    var name = POINT_NAME[it.name] || it.title;

    var badge = state === 'empty' ? '<span class="tag tag--dead">не поставлена</span>'
      : state === 'absent' ? '<span class="tag tag--bad">нет на снимке</span>'
        : state === 'suggested' ? '<span class="tag tag--warn">проверьте</span>'
          : '<span class="tag tag--ok">готово</span>';

    return '<div class="pt' + (isActive ? ' is-active' : '') + '">' +
      '<div class="pt__top">' +
        '<span class="pt__key">' + (i + 1) + '</span>' +
        '<span class="pt__name">' + esc(name) + '</span>' +
        badge +
      '</div>' +
      (isActive
        ? '<div class="pt__row">' +
            '<span class="check' + (state === 'absent' ? ' is-on' : '') + '">' +
              '<i>' + (state === 'absent' ? '✓' : '') + '</i>нет на снимке ' + kbd('пробел') + '</span>' +
            (state === 'suggested' ? '<button class="btn btn--s" type="button">всё верно</button>' : '') +
          '</div>'
        : '') +
    '</div>';
  }

  function pointsCard(c) {
    var active = activeIndex(c);
    var states = c.items.map(function (it, i) { return pointState(c, i); });

    return '<div class="card"><div class="card__head"><h3>Точки на снимке</h3>' +
      '<span class="spacer"></span>' +
      '<span class="card__note">переключение — ' + kbd('1') + kbd('2') +
        (c.items.length > 2 ? kbd('3') : '') + '</span>' +
      '</div><div class="card__body">' +
      c.items.map(function (it, i) { return pointRow(it, i, states[i], i === active); }).join('') +
      '<p class="hint">Точка ставится на кость. Если анатомия обрезана краем снимка — ' +
      '«нет на снимке»: такие снимки нужны не меньше остальных.</p>' +
      '</div></div>';
  }

  function foreignCard(c) {
    var drawn = c.polygons.length;
    var verdicts = [
      ['ПРЕДМЕТ', 'Предмет есть'],
      ['проверить', 'Нужно посмотреть'],
      ['чисто', 'Снимок чистый']
    ];

    return '<div class="card"><div class="card__head"><h3>Посторонние предметы</h3>' +
      '<span class="spacer"></span>' +
      '<span class="tag' + (drawn ? '' : ' tag--dead') + '">обведено: ' + drawn + '</span>' +
      '</div><div class="card__body">' +
      '<div class="pt is-active"><div class="pt__top">' +
        '<span class="pt__key" style="background:var(--bad-bg);color:var(--bad)">1</span>' +
        '<span class="pt__name">Дужка бюстгальтера</span>' +
        '<button class="btn btn--s" type="button">обвести ' + kbd('1') + '</button></div></div>' +
      '<div class="pt"><div class="pt__top">' +
        '<span class="pt__key" style="background:var(--ok-bg);color:var(--ok)">2</span>' +
        '<span class="pt__name">Застёжка, пуговица, кулон</span>' +
        '<button class="btn btn--s" type="button">обвести ' + kbd('2') + '</button></div></div>' +
      '<div class="pt"><div class="pt__top"><span class="pt__name">Что в итоге на снимке</span></div>' +
        '<div class="pt__row" style="margin-left:0;flex-wrap:wrap">' +
        verdicts.map(function (v) {
          return '<button class="pick" type="button" aria-pressed="' +
            (!c.blank && v[0] === c.verdict) + '">' + esc(v[1]) + '</button>';
        }).join('') + '</div></div>' +
      '<p class="hint">Обводите предметы в любой части снимка. ' +
      'Чистый снимок тоже отмечайте: это такой же нужный ответ.</p>' +
      '</div></div>';
  }

  function notesCard() {
    return '<div class="card"><div class="card__head">' +
      '<h3>Особенности снимка</h3>' +
      '</div><div class="card__body">' +
      '<div class="chips">' +
        ['не та область тела', 'эндопротез', 'брак снимка'].map(function (f) {
          return '<button class="pick" type="button" aria-pressed="false">' + f + '</button>';
        }).join('') + '</div>' +
      '<label class="field"><span class="field__label">Комментарий</span>' +
        '<textarea rows="2" placeholder="если что-то смущает"></textarea></label>' +
      '</div></div>';
  }

  function sidePanel(c) {
    return '<div class="annot__side">' +
      actionBar(c) +
      (c.task === 'foreign_seg' ? foreignCard(c) : pointsCard(c)) +
      notesCard() +
    '</div>';
  }

  /* ---------- public ---------- */

  function renderCase(host, key, opts) {
    var c = byKey[key] || CASES[0];
    if (!c) { host.innerHTML = '<div class="card"><div class="card__body">Нет снимков</div></div>'; return; }
    if (opts && opts.blank) c = blank(c);
    host.innerHTML = '<div class="annot">' + canvas(c) + sidePanel(c) + '</div>';
  }

  function caseTabs(current, keys) {
    var titles = {
      hip_left: 'Левое бедро',
      hip_right: 'Правое бедро',
      spine_ok: 'Поясничный отдел',
      spine_bad: 'Поясничный отдел · гребень обрезан',
      spine_foreign: 'Поясничный отдел · предмет'
    };
    return keys.map(function (k) {
      return '<button class="pick" type="button" data-case="' + k + '" aria-pressed="' +
        (k === current) + '">' + esc(titles[k] || k) + '</button>';
    }).join('');
  }

  function modeTabs(isBlank) {
    return '<span style="width:100%;height:0"></span>' +
      '<button class="pick" type="button" data-mode="pre" aria-pressed="' + !isBlank +
        '">с предварительной разметкой</button>' +
      '<button class="pick" type="button" data-mode="blank" aria-pressed="' + isBlank +
        '">без подсказок</button>';
  }

  /* opts: blank — frame arrived without a prefill;
            keys  — the queue to walk, already filtered by source;
            total — how long that queue really is (the mock holds five frames);
            blankByKey — per-frame prefill state, so switching frames is honest. */
  function mount(tabsHost, canvasHost, initial, opts) {
    opts = opts || {};
    var keys = (opts.keys && opts.keys.length ? opts.keys : CASES.map(function (c) { return c.key; }))
      .filter(function (k) { return byKey[k]; });
    var current = keys.indexOf(initial) >= 0 ? initial : keys[0];
    var state = { blank: !!opts.blank };

    function draw() {
      QUEUE = { keys: keys, current: current, total: opts.total };
      if (tabsHost) tabsHost.innerHTML = caseTabs(current, keys) + modeTabs(state.blank);
      renderCase(canvasHost, current, state);
    }
    if (tabsHost) {
      tabsHost.addEventListener('click', function (e) {
        var b = e.target.closest('[data-case]');
        if (b) {
          current = b.dataset.case;
          if (opts.blankByKey && current in opts.blankByKey) state.blank = opts.blankByKey[current];
          draw();
          return;
        }
        var m = e.target.closest('[data-mode]');
        if (m) { state.blank = m.dataset.mode === 'blank'; draw(); }
      });
    }
    draw();
    return { redraw: draw, get current() { return current; }, get blank() { return state.blank; } };
  }

  global.AnnotUI = { cases: CASES, byKey: byKey, mount: mount, renderCase: renderCase, esc: esc };
})(window);
