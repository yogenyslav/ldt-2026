/* ============================================================
   Контроль качества ДРА — прототип 2

   Работает только на тех ручках, которые есть в бекенде
   (context/swagger.yaml). Разбор связки — context/system_flows.md.

   Соответствие экранов и ручек:
     вход .................. POST /user/login
     пост, очередь ......... GET  /job/info
     карточка .............. GET  /job/info/{job_id}
     снимок ................ GET  /dicom/{dicom_id}/image
     решение ............... POST /job/result/decision
     пакетная обработка .... POST /dicom/upload/batch
     отчёты ................ POST /report/generate, GET /report, GET /report/{id}
     служебное ............. GET  /user/{user_id}
   ============================================================ */

(function () {
  'use strict';

  var JOBS = window.DEMO_JOBS || [];

  /* ----------------------------------------------------------
     Справочники. Весь текст интерфейса — русский, включая
     названия критериев и статусов: наружу не выходит ни один
     ключ API.
     ---------------------------------------------------------- */

  var CRITERIA = {
    spine_axis: {
      name: 'Ось позвоночника',
      fix: 'Выровняйте пациента по центральной линии стола и повторите укладку.',
      hint: 'Допустимое отклонение — до 5°.'
    },
    pelvis_crest: {
      name: 'Гребни подвздошных костей',
      fix: 'Сместите зону сканирования ниже, чтобы верхние края подвздошных костей попали в кадр.',
      hint: 'Оба гребня должны быть видны в нижних углах снимка.'
    },
    foreign_objects: {
      name: 'Посторонние предметы',
      fix: 'Попросите пациента снять бельё с металлическими элементами и застёжки, затем переснимите.',
      hint: 'Чаще всего это дужка бюстгальтера или застёжка.'
    },
    hip_margins: {
      name: 'Область интереса',
      fix: 'Сместите зону сканирования: от кости до края кадра нужно не менее 3 см сверху и снизу и 2 см сбоку.',
      hint: 'Отступы: сверху ≥ 3 см, снизу ≥ 3 см, сбоку ≥ 2 см.'
    },
    hip_keypoints: {
      name: 'Ключевые точки бедра',
      fix: 'Уложите конечность прямо, без наклона, и повторите снимок — модель не нашла опорные точки.',
      hint: 'Вертел, шейка бедра и седалищная кость.'
    },
    lesser_trochanter: {
      name: 'Ротация бедра',
      fix: 'Разверните стопу внутрь до упора в фиксаторе — малый вертел должен быть едва различим.',
      hint: 'Норма расстояния до бугра — 1,0–4,4 мм.'
    }
  };

  /* Маркеры на снимке: одна русская буква, расшифровка — в легенде сбоку. */
  var POINT_MARK = {
    greater_trochanter_apex: { mark: 'В', name: 'Большой вертел' },
    femoral_neck: { mark: 'Ш', name: 'Шейка бедра' },
    ischium: { mark: 'С', name: 'Седалищная кость' },
    crest_left: { mark: 'Г', name: 'Гребень слева' },
    crest_right: { mark: 'Г', name: 'Гребень справа' }
  };

  var REGION = {
    spine: 'Поясничный отдел позвоночника',
    hip_left: 'Левое бедро',
    hip_right: 'Правое бедро'
  };

  var REGION_SHORT = { spine: 'Позвоночник', hip_left: 'Левое бедро', hip_right: 'Правое бедро' };

  var STATUS = {
    pending: 'В очереди',
    processing: 'Обрабатывается',
    completed: 'Обработано',
    failed: 'Ошибка обработки'
  };

  var DECISION = {
    approved: 'Принято',
    rejected: 'Отклонено, переснять',
    force_approved: 'Принято вопреки рекомендации'
  };

  /* ----------------------------------------------------------
     Мелкие помощники
     ---------------------------------------------------------- */

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Русские числа: запятая как разделитель, настоящий минус. */
  function nm(v, digits) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    var s = Number(v).toFixed(digits === undefined ? 1 : digits);
    return s.replace('.', ',').replace('-', '−');
  }

  function icon(id, cls) {
    return '<svg class="ico' + (cls ? ' ' + cls : '') + '"><use href="#' + id + '"/></svg>';
  }

  function timeOf(iso) { return iso.slice(11, 16); }

  function dateOf(iso) {
    var d = iso.slice(0, 10).split('-');
    return d[2] + '.' + d[1];
  }

  function whenOf(iso) {
    var today = '2026-09-27';
    return (iso.slice(0, 10) === today ? 'сегодня' : dateOf(iso)) + ', ' + timeOf(iso);
  }

  /* ----------------------------------------------------------
     Вердикт: см. раздел 3 в context/system_flows.md.
     Жёлтый уровень собирается из details двух критериев —
     у вертела «проверить» это ok:1, у предметов ok:0.
     Правило живёт ТОЛЬКО здесь.
     ---------------------------------------------------------- */

  function verdictOf(job) {
    if (job.status === 'failed') return { k: 'failed' };
    if (job.status !== 'completed') return { k: 'wait' };

    var md = job.metadata || {};
    var c = md.criteria || {};
    if (md.verdict === null || md.verdict === undefined) return { k: 'none' };

    var troch = c.lesser_trochanter;
    var foreign = c.foreign_objects;
    var trochCheck = !!(troch && troch.details && troch.details.status === 'проверить');
    var foreignCheck = !!(foreign && foreign.details && foreign.details.verdict === 'проверить');

    if (md.verdict === 1) return trochCheck ? { k: 'warn' } : { k: 'ok' };

    var broken = Object.keys(c).filter(function (n) { return c[n].ok === 0; });
    if (broken.length === 1 && broken[0] === 'foreign_objects' && foreignCheck) return { k: 'warn' };
    return { k: 'bad' };
  }

  var VERDICT_POST = {
    ok: { t: 'КОРРЕКТНО', i: 'i-check', c: 'ok' },
    warn: { t: 'НУЖЕН ВЗГЛЯД СПЕЦИАЛИСТА', i: 'i-alert', c: 'warn' },
    bad: { t: 'ПЕРЕСНЯТЬ', i: 'i-refresh', c: 'bad' },
    none: { t: 'НЕ ОЦЕНЕНО', i: 'i-help', c: '' },
    failed: { t: 'ОШИБКА', i: 'i-alert-circle', c: 'bad' },
    wait: { t: 'ОБРАБОТКА', i: 'i-clock', c: '' }
  };

  var VERDICT_LIST = {
    ok: { t: 'Корректно', c: 'ok', i: 'i-check-circle' },
    warn: { t: 'Нужен взгляд специалиста', c: 'warn', i: 'i-alert' },
    bad: { t: 'Переснять', c: 'bad', i: 'i-x' },
    none: { t: 'Не оценено', c: '', i: 'i-help' },
    failed: { t: 'Ошибка', c: 'bad', i: 'i-alert-circle' },
    wait: { t: 'В обработке', c: '', i: 'i-clock' }
  };

  /* Цвет элемента разметки выводится из ответа так же, как в render.py. */
  function levelOfCriterion(c) {
    if (!c || c.ok === null || c.ok === undefined) return '';
    var d = c.details || {};
    if (d.status === 'проверить' || d.verdict === 'проверить') return 'warn';
    return c.ok === 1 ? 'ok' : 'bad';
  }

  /* ----------------------------------------------------------
     Разметка поверх снимка.
     Координаты — пиксели исходного снимка, поэтому viewBox
     совпадает с metadata.shape и всё масштабируется само.
     ---------------------------------------------------------- */

  function svgOverlay(job) {
    var md = job.metadata || {};
    if (!md.shape || !md.criteria) return '';
    var H = md.shape[0], W = md.shape[1];
    var c = md.criteria;
    var out = [];

    function g(level, body) {
      return '<g class="mk' + (level ? ' mk--' + level : '') + '">' + body + '</g>';
    }
    function dot(p, r) { return '<circle class="mk__dot" cx="' + p[0] + '" cy="' + p[1] + '" r="' + (r || 2.4) + '"/>'; }
    function ring(p, r) { return '<circle class="mk__ring" cx="' + p[0] + '" cy="' + p[1] + '" r="' + (r || 4) + '"/>'; }
    function label(x, y, t, anchor) {
      return '<text class="mk__label" x="' + x + '" y="' + y + '"' +
        (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(t) + '</text>';
    }
    function marker(p, t) {
      return '<text class="mk__marker" x="' + (p[0] + 6) + '" y="' + (p[1] + 4) + '">' + esc(t) + '</text>';
    }
    function poly(pts, cls) {
      return '<polygon class="' + cls + '" points="' + pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '"/>';
    }

    /* --- ось позвоночника: линия между серединами пар точек --- */
    var a = c.spine_axis;
    if (a && a.points && a.points.top_left) {
      var P = a.points;
      var mid = function (u, v) { return [(P[u][0] + P[v][0]) / 2, (P[u][1] + P[v][1]) / 2]; };
      var t = mid('top_left', 'top_right'), b = mid('bottom_left', 'bottom_right');
      var body = '<line class="mk__line" x1="' + t[0] + '" y1="' + t[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>';
      Object.keys(P).forEach(function (n) { body += dot(P[n], 2.2); });
      if (a.value !== null && a.value !== undefined) {
        body += label((t[0] + b[0]) / 2 + 7, (t[1] + b[1]) / 2, nm(a.value, 1) + '°');
      }
      out.push(g(levelOfCriterion(a), body));
    }

    /* --- гребни: два окна в нижних углах, цвет у каждой стороны свой --- */
    var cr = c.pelvis_crest;
    if (cr && cr.details && cr.details.square) {
      var sq = cr.details.square, ww = sq.width_px, hh = sq.height_px;
      [['left', 0, sq.left_ok], ['right', W - ww, sq.right_ok]].forEach(function (s) {
        out.push(g(s[2] ? 'ok' : 'bad',
          '<rect class="mk__box" x="' + s[1] + '" y="' + (H - hh) + '" width="' + ww + '" height="' + hh + '"/>'));
      });
      Object.keys(cr.points || {}).forEach(function (n) {
        var p = cr.points[n], m = POINT_MARK[n];
        var flip = p[0] > W * 0.6;                       /* у правого края подпись слева от точки */
        out.push(g('ok', ring(p, 4) +
          '<text class="mk__marker" x="' + (p[0] + (flip ? -8 : 8)) + '" y="' + (p[1] + 4) + '"' +
          (flip ? ' text-anchor="end"' : '') + '>' + m.mark + '</text>'));
      });
    }

    /* --- посторонние предметы: контуры с заливкой --- */
    var f = c.foreign_objects;
    if (f && f.regions && f.regions.length) {
      out.push(g(levelOfCriterion(f), f.regions.map(function (r) { return poly(r, 'mk__area'); }).join('')));
    }

    /* --- отступы бедра: перпендикуляры до краёв кадра --- */
    var hm = c.hip_margins;
    if (hm && hm.points && Object.keys(hm.points).length) {
      var d = hm.details || {}, P2 = hm.points, body2 = '';
      var segs = [];
      if (P2.apex) segs.push([P2.apex, [P2.apex[0], 0], d.top_cm, 'сверху']);
      if (P2.lateral) segs.push([P2.lateral, [P2.lateral[0] < W / 2 ? 0 : W - 1, P2.lateral[1]], d.side_cm, 'сбоку']);
      if (P2.ischium) segs.push([P2.ischium, [P2.ischium[0], H - 1], d.bottom_cm, 'снизу']);
      segs.forEach(function (s) {
        body2 += '<line class="mk__thin" x1="' + s[0][0] + '" y1="' + s[0][1] + '" x2="' + s[1][0] + '" y2="' + s[1][1] + '"/>';
        body2 += dot(s[0], 2);
        if (s[2] !== null && s[2] !== undefined) {
          var mx = (s[0][0] + s[1][0]) / 2, my = (s[0][1] + s[1][1]) / 2;
          var near = mx > W * 0.68;                      /* у правого края подпись разворачиваем внутрь */
          body2 += label(near ? mx - 5 : mx + 5, my - 3, nm(s[2], 1) + ' см', near ? 'end' : null);
        }
      });
      out.push(g(levelOfCriterion(hm), body2));
    }

    /* --- три ключевые точки бедра: кружок + русская буква --- */
    var kp = c.hip_keypoints;
    if (kp && kp.points && Object.keys(kp.points).length) {
      var body3 = '';
      Object.keys(kp.points).forEach(function (n) {
        var p = kp.points[n], m = POINT_MARK[n];
        body3 += ring(p, 5) + marker(p, m ? m.mark : '?');
      });
      out.push(g(levelOfCriterion(kp), body3));
    }

    /* --- область малого вертела --- */
    var lt = c.lesser_trochanter;
    if (lt && lt.regions && lt.regions.length) {
      var body4 = lt.regions.map(function (r) { return poly(r, 'mk__area'); }).join('');
      if (lt.value) {
        var p0 = lt.regions[0][0];
        body4 += label(p0[0] + 7, p0[1] - 2, nm(lt.value, 1) + ' мм');
      }
      out.push(g(levelOfCriterion(lt), body4));
    }

    return '<svg class="viewer__svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' + out.join('') + '</svg>';
  }

  /* Окно снимка: изображение + разметка. Растягивание по вертикали —
     ответ на анизотропный пиксель ДРА (0,6 мм по X против 1,05 мм по Y). */
  var viewState = { overlay: true, aspect: false };

  function viewerHTML(job, opts) {
    opts = opts || {};
    if (!job || !job.scan) {
      return '<div class="viewer__empty">' + icon('i-image', 'ico--l') + '<div>Снимок недоступен</div></div>';
    }
    var md = job.metadata || {};
    var H = md.shape ? md.shape[0] : 300, W = md.shape ? md.shape[1] : 300;
    /* пиксель ДРА неквадратный: 0,6 мм по X против 1,05 мм по Y.
       В режиме «Пропорции» растягиваем и снимок, и разметку одинаково,
       поэтому совмещение не нарушается. */
    var ar = viewState.aspect ? (W * 0.6) / (H * 1.05) : W / H;
    var hasMarks = !!(md.criteria && Object.keys(md.criteria).length);

    return '' +
      '<div class="viewer__area">' +
        '<div class="viewer__stage" style="aspect-ratio:' + ar.toFixed(4) + ';max-width:' + (opts.max || 560) + 'px">' +
          '<img class="viewer__img" src="assets/' + esc(job.scan) + '" alt="Снимок ДРА" />' +
          (viewState.overlay && hasMarks ? svgOverlay(job) : '') +
        '</div>' +
      '</div>' +
      '<div class="viewer__tools">' +
        (hasMarks ? '<button class="tool" type="button" data-view="overlay" aria-pressed="' + viewState.overlay + '">' +
          icon('i-eye', 'ico--s') + 'Разметка</button>' : '') +
        '<button class="tool" type="button" data-view="aspect" aria-pressed="' + viewState.aspect + '">' +
          icon('i-ruler', 'ico--s') + 'Пропорции</button>' +
      '</div>';
  }

  /* ----------------------------------------------------------
     Легенда разметки: расшифровка маркеров и значения критериев
     ---------------------------------------------------------- */

  function legendHTML(job) {
    var md = job.metadata || {};
    var c = md.criteria || {};
    var keys = Object.keys(c);
    if (!keys.length) return '';

    var rows = keys.map(function (n) {
      var cr = c[n], dict = CRITERIA[n] || { name: n }, lv = levelOfCriterion(cr);
      var sym = { ok: '✓', warn: '!', bad: '✕' }[lv] || '–';
      var value = '—', note = '';

      if (n === 'spine_axis' && cr.value !== null && cr.value !== undefined) {
        value = nm(cr.value, 1) + '°';
      } else if (n === 'hip_margins') {
        var d = cr.details || {};
        value = [d.top_cm, d.side_cm, d.bottom_cm].map(function (v) { return v == null ? '—' : nm(v, 1); }).join(' · ');
        note = 'сверху · сбоку · снизу, см';
      } else if (n === 'lesser_trochanter') {
        value = cr.value ? nm(cr.value, 1) + ' мм' : '—';
        note = (cr.details || {}).status || '';
      } else if (n === 'pelvis_crest') {
        var sq = (cr.details || {}).square || {};
        value = (sq.left_ok ? 'есть' : 'нет') + ' · ' + (sq.right_ok ? 'есть' : 'нет');
        note = 'слева · справа';
      } else if (n === 'foreign_objects') {
        value = (cr.details || {}).verdict || '—';
      } else if (n === 'hip_keypoints') {
        var pts = Object.keys(cr.points || {});
        value = pts.length + ' из 3';
        note = pts.map(function (p) { return POINT_MARK[p] ? POINT_MARK[p].mark + ' — ' + POINT_MARK[p].name.toLowerCase() : p; }).join(', ');
      }

      if (cr.note) note = cr.note;

      return '' +
        '<div class="legend__item">' +
          '<span class="legend__mark' + (lv ? ' legend__mark--' + lv : '') + '">' + sym + '</span>' +
          '<span><span class="legend__name">' + esc(dict.name) + '</span>' +
            (note ? '<span class="legend__note">' + esc(note) + '</span>' : '') +
          '</span>' +
          '<span class="legend__value">' + esc(value) + '</span>' +
        '</div>';
    }).join('');

    return rows;
  }

  /* ----------------------------------------------------------
     Замечания с рекомендацией — сердце экрана лаборанта
     ---------------------------------------------------------- */

  function issuesOf(job) {
    var c = (job.metadata || {}).criteria || {};
    var list = [];

    Object.keys(c).forEach(function (n) {
      var cr = c[n], lv = levelOfCriterion(cr), dict = CRITERIA[n] || { name: n, fix: '' };
      if (lv !== 'bad' && lv !== 'warn') return;

      var value = '';
      if (n === 'spine_axis') value = 'Отклонение ' + nm(cr.value, 1) + '° при допуске 5°';
      if (n === 'lesser_trochanter') value = 'Расстояние до бугра ' + nm(cr.value, 1) + ' мм, норма 1,0–4,4 мм';
      if (n === 'foreign_objects') value = (cr.details || {}).verdict === 'проверить'
        ? 'Признак слабый: возможна застёжка' : 'Найдена дужка';
      if (n === 'hip_margins') {
        var d = cr.details || {}, bad = [];
        if (d.top_cm != null && d.top_cm < 3) bad.push('сверху ' + nm(d.top_cm, 1) + ' см при норме 3');
        if (d.bottom_cm == null) bad.push('снизу: седалищная кость не найдена');
        else if (d.bottom_cm < 3) bad.push('снизу ' + nm(d.bottom_cm, 1) + ' см при норме 3');
        if (d.side_cm != null && d.side_cm < 2) bad.push('сбоку ' + nm(d.side_cm, 1) + ' см при норме 2');
        value = bad.join('; ');
      }
      if (n === 'pelvis_crest') {
        var sq = (cr.details || {}).square || {};
        value = !sq.left_ok && !sq.right_ok ? 'Оба гребня вне кадра'
          : (!sq.left_ok ? 'Гребень слева вне кадра' : 'Гребень справа вне кадра');
      }
      if (cr.note) value = cr.note;

      list.push({ level: lv, title: dict.name, fix: dict.fix, value: value });
    });

    /* не больше трёх замечаний: на посту читают за секунды */
    list.sort(function (a, b) { return (a.level === 'bad' ? 0 : 1) - (b.level === 'bad' ? 0 : 1); });
    return list.slice(0, 3);
  }

  /* ============================================================
     КОНТУР А — пост рентгенолаборанта
     ============================================================ */

  var POST_SCENARIOS = [
    { id: '7c1f4a20', label: 'Корректно' },
    { id: '5d0c7b31', label: 'Ось отклонена' },
    { id: '8b2e9d55', label: 'Посторонний предмет' },
    { id: '4c9d2e63', label: 'Ротация бедра' },
    { id: '6f2a0d19', label: 'Нужен взгляд' },
    { id: '0b6c3f92', label: 'Область интереса' },
    { id: 'e26a7c93', label: 'Ошибка обработки' }
  ];

  var post = { idx: -1, phase: 'idle', total: 24, redo: 3, last: '' };

  function jobById(id) {
    for (var i = 0; i < JOBS.length; i++) if (JOBS[i].id === id) return JOBS[i];
    return null;
  }

  function renderPost() {
    var viewer = $('#post-viewer'), side = $('#post-side');

    if (post.phase === 'idle') {
      viewer.innerHTML = '<div class="waiting">' + icon('i-scan', 'ico--l') +
        '<div class="waiting__title">Ожидание снимка с аппарата</div>' +
        '<div>Экран обновится сам через 2–3 секунды после сканирования.<br />Загружать ничего не нужно.</div></div>';
      side.innerHTML = '<div class="card"><div class="card__body">' +
        '<div class="waiting" style="padding:24px 0">' + icon('i-activity', 'ico--l') +
        '<div class="waiting__title">Пост готов к работе</div>' +
        '<div>Смена: Иванова А. П. · кабинет 3</div></div></div></div>';
      return;
    }

    if (post.phase === 'loading') {
      viewer.innerHTML = '<div class="waiting"><div class="waiting__ring"></div>' +
        '<div class="waiting__title">Снимок получен, идёт проверка укладки</div></div>';
      side.innerHTML = '<div class="card"><div class="card__body"><div class="waiting" style="padding:24px 0">' +
        '<div class="waiting__ring"></div><div class="waiting__title">Анализ…</div></div></div></div>';
      return;
    }

    var job = jobById(POST_SCENARIOS[post.idx].id);
    var v = verdictOf(job), vd = VERDICT_POST[v.k];

    viewer.innerHTML = viewerHTML(job, { max: 520 });

    var sub;
    if (v.k === 'failed') sub = 'Снимок не удалось обработать';
    else sub = REGION[job.anatomical_region] || 'Область не определена';

    var html = '<div class="verdict' + (vd.c ? ' verdict--' + vd.c : '') + '">' +
      '<div class="verdict__icon">' + icon(vd.i) + '</div>' +
      '<div class="verdict__text">' +
        '<div class="verdict__big">' + vd.t + '</div>' +
        '<div class="verdict__sub">' + esc(sub) + '</div>' +
      '</div></div>';

    if (v.k === 'failed') {
      html += '<div class="issue issue--bad">' +
        '<span class="issue__num">!</span><div>' +
        '<div class="issue__title">Обработка не завершена</div>' +
        '<div class="issue__fix">Переснимите исследование. Если ошибка повторится — сообщите в центр обработки.</div>' +
        '<div class="issue__value">' + esc(job.error || '') + '</div></div></div>';
    } else {
      var issues = issuesOf(job);
      if (issues.length) {
        html += '<div class="issues">' + issues.map(function (it, i) {
          return '<div class="issue issue--' + it.level + '">' +
            '<span class="issue__num">' + (i + 1) + '</span><div>' +
            '<div class="issue__title">' + esc(it.title) + '</div>' +
            '<div class="issue__fix">' + esc(it.fix) + '</div>' +
            (it.value ? '<div class="issue__value">' + esc(it.value) + '</div>' : '') +
            '</div></div>';
        }).join('') + '</div>';
      } else {
        html += '<div class="issue"><span class="issue__num">' + icon('i-check', 'ico--s') + '</span><div>' +
          '<div class="issue__title">Замечаний нет</div>' +
          '<div class="issue__fix">Укладка соответствует требованиям. Пациента можно отпускать.</div></div></div>';
      }
    }

    /* действия: рекомендация системы не запрещает принять снимок */
    var acts;
    if (v.k === 'ok') {
      acts = '<button class="btn btn--ok btn--l acts__wide" data-decide="approved">' + icon('i-check') + 'Пациент свободен</button>' +
        '<button class="btn acts__wide" data-decide="rejected">' + icon('i-refresh') + 'Всё же переснять</button>';
    } else if (v.k === 'warn') {
      acts = '<button class="btn btn--ok btn--l" data-decide="approved">' + icon('i-check') + 'Принять</button>' +
        '<button class="btn btn--l" data-decide="rejected">' + icon('i-refresh') + 'Переснять</button>';
    } else {
      acts = '<button class="btn btn--bad btn--l acts__wide" data-decide="rejected">' + icon('i-refresh') + 'Переснять сейчас</button>' +
        '<button class="btn acts__wide" data-decide="force_approved">Всё равно принять</button>';
    }
    html += '<div class="acts">' + acts + '</div>';

    /* что ещё проверено — чтобы лаборант видел полный список, а не только замечания */
    if ((job.metadata || {}).criteria) {
      html += '<div class="card"><div class="card__head">' +
        '<span class="card__title">Что проверено</span>' +
        '<span class="spacer"></span>' +
        '<span class="card__sub">' + Object.keys(job.metadata.criteria).length + ' критерия</span></div>' +
        '<div class="card__body" style="padding:6px">' + legendHTML(job) + '</div></div>';
    }

    side.innerHTML = html;
  }

  function postDemobar() {
    var bar = $('#post-demobar');
    bar.innerHTML = '<span class="demobar__tag">' + icon('i-play', 'ico--s') + 'Сценарий демонстрации</span>' +
      POST_SCENARIOS.map(function (s, i) {
        return '<button class="demobar__btn" type="button" data-post-case="' + i + '" aria-pressed="' + (i === post.idx) + '">' +
          esc(s.label) + '</button>';
      }).join('') +
      '<span class="spacer"></span>' +
      '<button class="demobar__btn" type="button" data-post-next>Пришёл новый снимок →</button>';
  }

  function postShow(i) {
    post.idx = (i + POST_SCENARIOS.length) % POST_SCENARIOS.length;
    post.phase = 'loading';
    renderPost();
    postDemobar();
    setTimeout(function () {
      post.phase = 'done';
      renderPost();
    }, 700);
  }

  /* ============================================================
     КОНТУР Б — центр обработки
     ============================================================ */

  var route = 'queue';
  var studyId = null;
  var filters = { region: '', verdict: '', decision: '', q: '' };
  var picked = {};
  var pageLimit = 8;
  var batch = null;
  var reports = [
    { id: 41, created_at: '2026-09-26T17:02:11', count: 24, url: 'reports/report-41.csv' },
    { id: 40, created_at: '2026-09-25T18:40:55', count: 112, url: 'reports/report-40.csv' }
  ];

  function visibleJobs() {
    return JOBS.filter(function (j) {
      var v = verdictOf(j).k;
      if (filters.region && j.anatomical_region !== filters.region) return false;
      if (filters.verdict && v !== filters.verdict) return false;
      if (filters.decision === '_none' && j.specialist_decision) return false;
      if (filters.decision && filters.decision !== '_none' && j.specialist_decision !== filters.decision) return false;
      if (filters.q && j.id.indexOf(filters.q) === -1 && j.dicom_id.indexOf(filters.q) === -1) return false;
      return true;
    });
  }

  function badge(v, extra) {
    var d = VERDICT_LIST[v];
    return '<span class="badge' + (d.c ? ' badge--' + d.c : '') + (extra ? ' ' + extra : '') + '">' +
      icon(d.i, 'ico--s') + esc(d.t) + '</span>';
  }

  /* --- очередь --- */
  function viewQueue() {
    var list = visibleJobs();
    var shown = list.slice(0, pageLimit);
    var sel = Object.keys(picked).filter(function (k) { return picked[k]; });

    var rows = shown.map(function (j) {
      var v = verdictOf(j).k;
      var viol = j.violations && j.violations.length
        ? esc(j.violations.slice(0, 2).join('; ')) + (j.violations.length > 2
          ? ' <span class="table__more">и ещё ' + (j.violations.length - 2) + '</span>' : '')
        : '<span class="table__more">—</span>';
      return '<tr data-open="' + j.id + '"' + (picked[j.id] ? ' class="is-picked"' : '') + '>' +
        '<td class="table__pick"><input type="checkbox" data-pick="' + j.id + '"' + (picked[j.id] ? ' checked' : '') + ' /></td>' +
        '<td class="table__num">' + whenOf(j.created_at) + '</td>' +
        '<td class="table__main">' + esc(REGION_SHORT[j.anatomical_region] || '—') + '</td>' +
        '<td>' + badge(v) + '</td>' +
        '<td class="table__viol">' + viol + '</td>' +
        '<td>' + (j.specialist_decision
          ? '<span class="badge badge--ghost">' + esc(DECISION[j.specialist_decision]) + '</span>'
          : '<span class="table__more">не разобрано</span>') + '</td>' +
        '<td class="table__id">' + esc(j.id) + '</td>' +
        '<td>' + icon('i-chevron-right', 'ico--s') + '</td>' +
      '</tr>';
    }).join('');

    return '' +
      '<div class="work__head"><h1 class="work__title">Очередь исследований</h1>' +
      '<span class="work__sub">' + list.length + ' из ' + JOBS.length + '</span></div>' +

      '<div class="filters">' +
        '<span class="filters__label">Область</span>' +
        '<select class="filters__select" data-filter="region">' +
          opt('', 'любая', filters.region) + opt('spine', 'позвоночник', filters.region) +
          opt('hip_left', 'левое бедро', filters.region) + opt('hip_right', 'правое бедро', filters.region) +
        '</select>' +
        '<span class="filters__label">Вердикт</span>' +
        '<select class="filters__select" data-filter="verdict">' +
          opt('', 'любой', filters.verdict) + opt('ok', 'корректно', filters.verdict) +
          opt('warn', 'нужен взгляд', filters.verdict) + opt('bad', 'переснять', filters.verdict) +
          opt('wait', 'в обработке', filters.verdict) + opt('failed', 'ошибка', filters.verdict) +
        '</select>' +
        '<span class="filters__label">Решение</span>' +
        '<select class="filters__select" data-filter="decision">' +
          opt('', 'любое', filters.decision) + opt('_none', 'не разобрано', filters.decision) +
          opt('approved', 'принято', filters.decision) + opt('rejected', 'отклонено', filters.decision) +
          opt('force_approved', 'принято вопреки', filters.decision) +
        '</select>' +
        '<span class="filters__search">' + icon('i-search', 'ico--s') +
          '<input type="text" placeholder="номер задачи" data-filter="q" value="' + esc(filters.q) + '" /></span>' +
        '<span class="filters__note">фильтры применяются к загруженной странице</span>' +
      '</div>' +

      (sel.length ? '<div class="bulk">' +
        '<span class="bulk__count">Выбрано <b>' + sel.length + '</b></span>' +
        '<button class="btn" data-bulk="approved">' + icon('i-check') + 'Принять</button>' +
        '<button class="btn" data-bulk="rejected">' + icon('i-x') + 'Отклонить</button>' +
        '<button class="btn" data-report-selected>' + icon('i-file') + 'Сформировать отчёт</button>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn--quiet" data-bulk-clear>Снять выделение</button>' +
      '</div>' : '') +

      '<div class="card"><table class="table"><thead><tr>' +
        '<th class="table__pick"></th><th>Поступило</th><th>Область</th><th>Вердикт</th>' +
        '<th>Нарушения</th><th>Решение</th><th>Задача</th><th></th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="8"><div class="empty">' +
        '<div class="empty__icon">' + icon('i-search', 'ico--l') + '</div>' +
        '<div class="empty__title">Ничего не найдено</div>' +
        '<div class="empty__text">Измените фильтры или загрузите следующую страницу.</div></div></td></tr>') +
      '</tbody></table></div>' +

      '<div class="listfoot">' +
        '<span>Показано ' + shown.length + ' из ' + list.length + '</span>' +
        (shown.length < list.length ? '<button class="btn" data-more>Показать ещё</button>' : '') +
        '<span class="spacer"></span>' +
        '<span>Постраничная выборка: <span class="num">offset</span> / <span class="num">limit</span></span>' +
      '</div>';
  }

  function opt(v, t, cur) {
    return '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + t + '</option>';
  }

  /* --- карточка исследования --- */
  function viewStudy() {
    var job = jobById(studyId);
    if (!job) return viewQueue();
    var v = verdictOf(job), vl = VERDICT_LIST[v.k];
    var md = job.metadata || {};

    /* дорожка этапов */
    var steps = [
      { t: 'Загружено', s: whenOf(job.created_at) },
      { t: 'Обработано', s: job.status === 'completed' ? nm(job.duration_ms / 1000, 1) + ' с' : STATUS[job.status] },
      { t: 'Решение специалиста', s: job.specialist_decision ? DECISION[job.specialist_decision] : 'ожидается' },
      { t: 'В отчёте', s: job.specialist_decision ? 'готово к выгрузке' : '—' }
    ];
    var now = job.status !== 'completed' ? 1 : (job.specialist_decision ? 3 : 2);

    var html = '' +
      '<div class="work__head">' +
        '<button class="btn btn--quiet" data-go="queue">' + icon('i-chevron-left') + 'Очередь</button>' +
        '<h1 class="work__title">' + esc(REGION[job.anatomical_region] || 'Исследование') + '</h1>' +
        badge(v.k) +
        '<span class="spacer"></span>' +
        '<span class="work__sub">задача <span class="num">' + esc(job.id) + '</span></span>' +
      '</div>' + stepsHTML(steps, now);

    html += '<div class="study">';

    /* левая колонка — снимок */
    html += '<div><div class="viewer study__viewer" id="study-viewer">' + viewerHTML(job, { max: 620 }) + '</div>';
    if (job.status === 'failed') {
      html += '<div class="card" style="margin-top:14px"><div class="card__body">' +
        '<div class="issue issue--bad"><span class="issue__num">!</span><div>' +
        '<div class="issue__title">Обработка завершилась ошибкой</div>' +
        '<div class="issue__value">' + esc(job.error || '') + '</div></div></div></div></div>';
    }
    html += '</div>';

    /* правая колонка — разбор */
    html += '<div style="display:flex;flex-direction:column;gap:14px">';

    html += '<div class="meta">' +
      cell('Область', REGION[job.anatomical_region] || '—') +
      cell('Поступило', whenOf(job.created_at)) +
      cell('Состояние', STATUS[job.status]) +
      cell('Направившая организация', 'Поликлиника № 218') +
      cell('Снимок', job.dicom_id, true) +
      cell('Задача', job.id, true) +
    '</div>';

    if (md.criteria && Object.keys(md.criteria).length) {
      html += '<div class="card">' +
        '<div class="card__head"><span class="card__title">Критерии укладки</span>' +
        '<span class="spacer"></span><span class="card__sub">' + esc(vl.t) + '</span></div>' +
        '<div class="card__body" style="padding:8px">' + legendHTML(job) + '</div>' +
        quietLine(job) +
      '</div>';
    }

    html += '<div class="card"><div class="card__head"><span class="card__title">Решение специалиста</span></div>' +
      '<div class="card__body">' + decideHTML(job) + '</div></div>';

    html += '</div></div>';
    return html;
  }

  function cell(k, v, mono) {
    return '<div class="meta__cell"><div class="meta__key">' + esc(k) + '</div>' +
      '<div class="meta__val' + (mono ? ' meta__val--mono' : '') + '">' + esc(v) + '</div></div>';
  }

  /* служебная строка: уверенность показываем здесь и только здесь,
     с подписью, которая не даёт спутать её с уверенностью в вердикте */
  function quietLine(job) {
    var md = job.metadata || {};
    var cl = md.classification || {};
    var parts = [];
    if (job.confidence != null) parts.push('уверенность в определении области <b>' + nm(job.confidence * 100, 0) + '%</b>');
    if (cl.agreement != null) parts.push('согласие методов <b>' + nm(cl.agreement * 100, 0) + '%</b>');
    if (job.duration_ms) parts.push('обработка <b>' + nm(job.duration_ms / 1000, 1) + ' с</b>');
    if (!parts.length) return '';
    return '<div class="quiet">' + icon('i-help', 'ico--s') + '<span class="quiet__val">' + parts.join(' · ') + '</span></div>';
  }

  function decideHTML(job) {
    if (job.specialist_decision) {
      var d = job.specialist_decision;
      var lv = d === 'rejected' ? 'bad' : (d === 'force_approved' ? 'warn' : 'ok');
      return '<div class="decide__done">' +
        '<span class="legend__mark legend__mark--' + lv + '">' + (d === 'rejected' ? '✕' : '✓') + '</span>' +
        '<div><div class="legend__name">' + esc(DECISION[d]) + '</div>' +
        '<div class="decide__who">' + esc(job.specialist_name || '') + '</div>' +
        (job.comment ? '<div class="decide__comment">' + esc(job.comment) + '</div>' : '') +
        '</div></div>' +
        '<div style="margin-top:12px"><button class="btn" data-undecide="' + job.id + '">Изменить решение</button></div>';
    }
    if (job.status !== 'completed') {
      return '<div class="empty__text">Решение можно принять после того, как задача обработана.</div>';
    }
    return '<div class="decide">' +
      '<label class="field"><span class="field__label">Комментарий (необязательно)</span>' +
        '<textarea class="field__textarea" id="decide-comment" placeholder="Например: артефакт вне зоны интереса"></textarea></label>' +
      '<div class="acts">' +
        '<button class="btn btn--ok" data-decide="approved">' + icon('i-check') + 'Принять</button>' +
        '<button class="btn btn--bad" data-decide="rejected">' + icon('i-x') + 'Отклонить</button>' +
        '<button class="btn acts__wide" data-decide="force_approved">Принять вопреки рекомендации</button>' +
      '</div></div>';
  }

  function stepsHTML(steps, now) {
    var w = (100 * now) / (steps.length - 1);
    return '<div class="steps"><div class="steps__track">' +
      '<div class="steps__line"></div><div class="steps__fill" style="width:' + w + '%"></div>' +
      '<div class="steps__nodes">' + steps.map(function (s, i) {
        var cls = i < now ? ' steps__node--done' : (i === now ? ' steps__node--now' : '');
        return '<span class="steps__node' + cls + '">' + (i < now ? icon('i-check') : '') + '</span>';
      }).join('') + '</div></div>' +
      '<div class="steps__labels">' + steps.map(function (s, i) {
        return '<div class="steps__label' + (i === now ? ' steps__label--now' : '') + '">' +
          '<b>' + esc(s.t) + '</b><span class="steps__time">' + esc(s.s) + '</span></div>';
      }).join('') + '</div></div>';
  }

  /* --- пакетная обработка --- */
  function viewBatch() {
    if (!batch) {
      return '<div class="work__head"><h1 class="work__title">Пакетная обработка</h1>' +
        '<span class="work__sub">архив с исследованиями</span></div>' +
        '<div class="drop" data-batch-start>' +
          '<div class="drop__icon">' + icon('i-upload', 'ico--l') + '</div>' +
          '<div class="drop__title">Перетащите .zip с DICOM-файлами</div>' +
          '<div class="drop__hint">или нажмите, чтобы выбрать архив. Каждый файл станет отдельной задачей.</div>' +
        '</div>' +
        '<p class="foot">Архив уходит одним запросом, в ответ приходит список задач. ' +
        'Состояние каждой отслеживается опросом до готовности.</p>';
    }

    var done = batch.jobs.filter(function (j) { return j.status === 'completed'; });
    var failed = batch.jobs.filter(function (j) { return j.status === 'failed'; });
    var bad = done.filter(function (j) { return verdictOf(j).k === 'bad'; });
    var pct = Math.round((100 * (done.length + failed.length)) / batch.jobs.length);

    return '<div class="work__head"><h1 class="work__title">Пакетная обработка</h1>' +
      '<span class="work__sub">' + esc(batch.name) + '</span>' +
      '<span class="spacer"></span>' +
      '<button class="btn" data-batch-reset>' + icon('i-upload') + 'Новый архив</button></div>' +

      '<div class="tiles">' +
        tile('Всего файлов', batch.jobs.length) +
        tile('Обработано', done.length, 'ok') +
        tile('К пересъёмке', bad.length, bad.length ? 'bad' : '') +
        tile('Ошибки', failed.length, failed.length ? 'warn' : '') +
      '</div>' +

      '<div class="card"><div class="card__head">' +
        '<span class="card__title">Ход обработки</span>' +
        '<span class="spacer"></span><span class="card__sub num">' + pct + '%</span></div>' +
        '<div class="card__body" style="padding:14px 18px"><div class="progress">' +
          '<div class="progress__bar" style="width:' + pct + '%"></div></div></div>' +
        '<table class="table"><thead><tr><th>Файл</th><th>Область</th><th>Состояние</th><th>Вердикт</th><th>Задача</th></tr></thead><tbody>' +
        batch.jobs.map(function (j) {
          var v = verdictOf(j).k;
          return '<tr data-open="' + j.id + '">' +
            '<td class="table__main">' + esc(j.file) + '</td>' +
            '<td>' + esc(REGION_SHORT[j.anatomical_region] || '—') + '</td>' +
            '<td>' + esc(STATUS[j.status]) + '</td>' +
            '<td>' + badge(v) + '</td>' +
            '<td class="table__id">' + esc(j.id) + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<div class="card__foot">' +
          '<button class="btn btn--primary" data-report-batch' + (pct < 100 ? ' disabled' : '') + '>' +
            icon('i-file') + 'Сформировать отчёт по архиву</button>' +
          '<span class="card__sub">' + (pct < 100 ? 'доступно после обработки всех файлов' : 'готово') + '</span>' +
        '</div>' +
      '</div>';
  }

  function tile(k, v, lv) {
    return '<div class="tile' + (lv ? ' tile--' + lv : '') + '">' +
      '<div class="tile__key">' + esc(k) + '</div><div class="tile__val">' + v + '</div></div>';
  }

  /* --- отчёты --- */
  function viewReports() {
    return '<div class="work__head"><h1 class="work__title">Отчёты</h1>' +
      '<span class="work__sub">выгрузка результатов</span>' +
      '<span class="spacer"></span>' +
      '<button class="btn btn--primary" data-go="queue">' + icon('i-list') + 'Выбрать задачи в очереди</button></div>' +

      '<div class="card"><table class="table"><thead><tr>' +
        '<th>Сформирован</th><th>Исследований</th><th>Файл</th><th></th></tr></thead><tbody>' +
      reports.map(function (r) {
        return '<tr><td class="table__num">' + whenOf(r.created_at) + '</td>' +
          '<td class="table__num">' + r.count + '</td>' +
          '<td class="table__id">' + esc(r.url) + '</td>' +
          '<td><button class="btn" data-download="' + r.id + '">' + icon('i-download') + 'Скачать</button></td></tr>';
      }).join('') + '</tbody></table></div>' +

      '<p class="foot">Отчёт формируется по выбранным задачам и выгружается файлом .csv по ссылке из ответа. ' +
      'Форматы .xlsx и архив с дополнительными сериями появятся, когда их поддержит бекенд.</p>';
  }

  /* --- служебный экран --- */
  function viewService() {
    var withMeta = JOBS.filter(function (j) { return (j.metadata || {}).models; })[0] || {};
    var models = (withMeta.metadata || {}).models || {};
    var settings = (withMeta.metadata || {}).settings || {};

    return '<div class="work__head"><h1 class="work__title">Служебное</h1>' +
      '<span class="work__sub">учётная запись и состояние моделей</span></div>' +

      '<div class="study">' +
      '<div class="card"><div class="card__head"><span class="card__title">Учётная запись</span></div>' +
        '<div class="meta" style="border:none;border-radius:0">' +
          cell('Специалист', 'Соколова М. И.') +
          cell('Роль', 'Врач-рентгенолог') +
          cell('Организация', 'Центр диагностики и телемедицины') +
          cell('Идентификатор', '17', true) +
        '</div></div>' +

      '<div class="card"><div class="card__head"><span class="card__title">Модели анализа</span>' +
        '<span class="spacer"></span><span class="card__sub num">dxa-qc 0.4.2</span></div>' +
        '<div class="card__body" style="padding:8px">' +
        Object.keys(models).map(function (m) {
          var ok = String(models[m]).indexOf('подключ') === 0;
          return '<div class="legend__item">' +
            '<span class="legend__mark' + (ok ? ' legend__mark--ok' : '') + '">' + (ok ? '✓' : '–') + '</span>' +
            '<span class="legend__name">' + esc(modelName(m)) + '</span>' +
            '<span class="legend__value legend__value--muted">' + esc(models[m]) + '</span></div>';
        }).join('') +
        '</div>' +
        (Object.keys(settings).length ? '<div class="card__foot"><span class="card__sub">Пороги: ' +
          esc(Object.keys(settings).map(function (k) { return settingName(k) + ' ' + nm(settings[k], 1); }).join(' · ')) +
          '</span></div>' : '') +
      '</div></div>';
  }

  function modelName(m) {
    return {
      region: 'Определение области съёмки',
      hip_keypoints: 'Ключевые точки бедра',
      pelvis_crest: 'Гребни подвздошных костей',
      pelvis_presence: 'Наличие гребня в окне',
      foreign_seg: 'Посторонние предметы'
    }[m] || m;
  }

  function settingName(k) {
    return {
      trochanter_center_mm: 'центр нормы вертела, мм',
      trochanter_tol_percent: 'допуск, %',
      trochanter_yellow_percent: 'полоса проверки, %'
    }[k] || k;
  }

  /* --- разделы в разработке --- */
  var SOON = {
    markup: {
      title: 'Разметка',
      icon: 'i-pen',
      text: 'Ручная правка найденной оси позвоночника и ключевых точек бедра с сохранением исправленной геометрии.',
      need: ['координаты правок передаются обратно в сервис', 'ручка сохранения исправленной разметки', 'версионность: чья правка и когда']
    },
    analytics: {
      title: 'Аналитика качества',
      icon: 'i-chart',
      text: 'Доля брака по сети, разбивка по аппаратам, зонам и типам нарушений, динамика по неделям.',
      need: ['агрегаты на стороне сервера', 'фильтр по организации и периоду', 'сравнение поликлиник между собой']
    },
    cases: {
      title: 'Библиотека кейсов',
      icon: 'i-folder',
      text: 'Отобранные примеры нарушений для обучения лаборантов и для демонстрации возможностей сервиса.',
      need: ['отметка исследования как учебного примера', 'хранилище подборок', 'публичная ссылка на разбор']
    }
  };

  function viewSoon(key) {
    var s = SOON[key];
    return '<div class="work__head"><h1 class="work__title">' + esc(s.title) + '</h1>' +
      '<span class="work__sub">раздел в разработке</span></div>' +
      '<div class="card"><div class="empty">' +
        '<div class="empty__icon">' + icon(s.icon, 'ico--l') + '</div>' +
        '<div class="empty__title">Раздел в разработке</div>' +
        '<div class="empty__text">' + esc(s.text) + '</div>' +
        '<ul class="empty__list">' + s.need.map(function (n) {
          return '<li>' + icon('i-minus', 'ico--s') + esc(n) + '</li>';
        }).join('') + '</ul>' +
      '</div></div>';
  }

  /* ----------------------------------------------------------
     Отрисовка рабочей области и навигации
     ---------------------------------------------------------- */

  function renderWork() {
    var html;
    if (route === 'queue') html = viewQueue();
    else if (route === 'study') html = viewStudy();
    else if (route === 'batch') html = viewBatch();
    else if (route === 'reports') html = viewReports();
    else if (route === 'service') html = viewService();
    else html = viewSoon(route);

    $('#work').innerHTML = html;
    $('#work').scrollTop = 0;

    $$('.side__link').forEach(function (b) {
      var r = b.getAttribute('data-go');
      if (r === route || (route === 'study' && r === 'queue')) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    $('#nav-queue-count').textContent = JOBS.filter(function (j) { return !j.specialist_decision; }).length;
  }

  function go(r, id) {
    route = r;
    if (id) studyId = id;
    renderWork();
  }

  /* ----------------------------------------------------------
     Сообщения и диалоги
     ---------------------------------------------------------- */

  var toastTimer;
  function toast(text, ico) {
    var el = $('#toast');
    el.innerHTML = icon(ico || 'i-check') + esc(text);
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 2600);
  }

  function closeModal() { $('#modal').classList.remove('is-on'); }

  function showReport(count) {
    var id = reports.length ? reports[0].id + 1 : 1;
    reports.unshift({ id: id, created_at: '2026-09-27T12:40:00', count: count, url: 'reports/report-' + id + '.csv' });
    $('#modal-box').innerHTML = '<div class="card__head"><span class="card__title">Отчёт сформирован</span>' +
      '<span class="spacer"></span><button class="btn btn--quiet btn--icon" data-close>' + icon('i-x') + '</button></div>' +
      '<div class="card__body">' +
        '<div class="meta">' + cell('Исследований', String(count)) + cell('Формат', 'CSV') +
        cell('Номер отчёта', String(id), true) + '</div>' +
        '<p class="empty__text" style="margin:14px 0 0">Файл доступен по ссылке из ответа сервиса. ' +
        'Отчёт также появился в разделе «Отчёты».</p>' +
      '</div>' +
      '<div class="card__foot"><button class="btn btn--primary" data-close>' + icon('i-download') + 'Скачать .csv</button>' +
      '<button class="btn" data-close>Закрыть</button></div>';
    $('#modal').classList.add('is-on');
  }

  /* ----------------------------------------------------------
     Вход и переключение контуров
     ---------------------------------------------------------- */

  function enter(role) {
    $('#screen-login').classList.remove('is-on');
    $('#screen-post').classList.toggle('is-on', role === 'laborant');
    $('#screen-center').classList.toggle('is-on', role === 'doctor');
    if (role === 'laborant') {
      post.idx = -1;
      post.phase = 'idle';
      renderPost();
      postDemobar();
    } else {
      go('queue');
    }
  }

  function logout() {
    $('#screen-post').classList.remove('is-on');
    $('#screen-center').classList.remove('is-on');
    $('#screen-login').classList.add('is-on');
  }

  /* ----------------------------------------------------------
     Обработка действий: один слушатель на документ
     ---------------------------------------------------------- */

  document.addEventListener('click', function (e) {
    var t;

    /* вход */
    if ((t = e.target.closest('[data-role]'))) { enter(t.getAttribute('data-role')); return; }
    if (e.target.closest('[data-logout]')) { logout(); return; }

    /* навигация */
    if ((t = e.target.closest('[data-go]'))) { go(t.getAttribute('data-go')); return; }

    /* окно снимка */
    if ((t = e.target.closest('[data-view]'))) {
      var key = t.getAttribute('data-view');
      viewState[key] = !viewState[key];
      if ($('#screen-post').classList.contains('is-on')) renderPost();
      else renderWork();
      return;
    }

    /* демонстрация на посту */
    if ((t = e.target.closest('[data-post-case]'))) { postShow(+t.getAttribute('data-post-case')); return; }
    if (e.target.closest('[data-post-next]')) { postShow(post.idx + 1); return; }

    /* решение специалиста */
    if ((t = e.target.closest('[data-decide]'))) {
      var dec = t.getAttribute('data-decide');
      if ($('#screen-post').classList.contains('is-on')) {
        var j = jobById(POST_SCENARIOS[post.idx].id);
        j.specialist_decision = dec;
        post.total += 1;
        if (dec === 'rejected') post.redo += 1;
        post.last = 'Последнее: ' + DECISION[dec].toLowerCase() + ', ' + timeOf('2026-09-27T14:22:00');
        $('#post-total').textContent = post.total;
        $('#post-redo').textContent = post.redo;
        $('#post-last').textContent = post.last;
        post.phase = 'idle';
        renderPost();
        toast(DECISION[dec], dec === 'rejected' ? 'i-refresh' : 'i-check');
      } else {
        var job = jobById(studyId);
        var cm = $('#decide-comment');
        job.specialist_decision = dec;
        job.comment = cm ? cm.value : '';
        job.specialist_name = 'Соколова М. И.';
        renderWork();
        toast(DECISION[dec], dec === 'rejected' ? 'i-x' : 'i-check');
      }
      return;
    }

    if ((t = e.target.closest('[data-undecide]'))) {
      var ju = jobById(t.getAttribute('data-undecide'));
      ju.specialist_decision = null;
      ju.comment = '';
      renderWork();
      return;
    }

    /* выбор строк и пакетные действия */
    if ((t = e.target.closest('[data-pick]'))) {
      var pid = t.getAttribute('data-pick');
      picked[pid] = !picked[pid];
      renderWork();
      e.stopPropagation();
      return;
    }
    if ((t = e.target.closest('[data-bulk]'))) {
      var d2 = t.getAttribute('data-bulk'), n = 0;
      Object.keys(picked).forEach(function (k) {
        if (!picked[k]) return;
        var jb = jobById(k);
        if (jb && jb.status === 'completed') { jb.specialist_decision = d2; jb.specialist_name = 'Соколова М. И.'; n++; }
      });
      picked = {};
      renderWork();
      toast('Решение принято по ' + n + ' задачам');
      return;
    }
    if (e.target.closest('[data-bulk-clear]')) { picked = {}; renderWork(); return; }
    if (e.target.closest('[data-report-selected]')) {
      var cnt = Object.keys(picked).filter(function (k) { return picked[k]; }).length;
      picked = {};
      renderWork();
      showReport(cnt);
      return;
    }
    if (e.target.closest('[data-more]')) { pageLimit += 8; renderWork(); return; }

    /* пакетная обработка */
    if (e.target.closest('[data-batch-start]')) { startBatch(); return; }
    if (e.target.closest('[data-batch-reset]')) { batch = null; renderWork(); return; }
    if (e.target.closest('[data-report-batch]')) { showReport(batch.jobs.length); return; }

    /* отчёты и диалоги */
    if ((t = e.target.closest('[data-download]'))) { toast('Файл отчёта выгружен', 'i-download'); return; }
    if (e.target.closest('[data-close]')) { closeModal(); renderWork(); return; }
    if (e.target === $('#modal')) { closeModal(); return; }

    /* открыть карточку */
    if ((t = e.target.closest('[data-open]'))) { go('study', t.getAttribute('data-open')); return; }
  });

  document.addEventListener('change', function (e) {
    var t = e.target.closest('[data-filter]');
    if (!t) return;
    filters[t.getAttribute('data-filter')] = t.value;
    pageLimit = 8;
    renderWork();
  });

  document.addEventListener('input', function (e) {
    var t = e.target.closest('[data-filter="q"]');
    if (!t) return;
    filters.q = t.value;
    renderWork();
    var f = $('[data-filter="q"]');
    if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); }
  });

  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    enter('doctor');
  });

  /* ----------------------------------------------------------
     Демонстрация пакетной обработки
     ---------------------------------------------------------- */

  function startBatch() {
    var src = JOBS.filter(function (j) { return j.status === 'completed'; });
    batch = {
      name: 'исследования_2026-09-27.zip',
      jobs: src.slice(0, 8).map(function (j, i) {
        var copy = Object.assign({}, j);
        copy.file = 'CR' + String(100 + i) + '_' +
          ({ spine: 'ПОП', hip_left: 'ЛПОБ', hip_right: 'ППОБ' }[j.anatomical_region] || 'DXA') + '.dcm';
        copy.status = 'pending';
        return copy;
      })
    };
    renderWork();

    /* задачи доходят по одной, как при опросе состояния */
    batch.jobs.forEach(function (j, i) {
      setTimeout(function () {
        if (!batch) return;
        j.status = 'processing';
        if (route === 'batch') renderWork();
      }, 260 * i + 150);
      setTimeout(function () {
        if (!batch) return;
        j.status = 'completed';
        if (route === 'batch') renderWork();
      }, 260 * i + 900);
    });
  }

  /* ----------------------------------------------------------
     Часы на посту
     ---------------------------------------------------------- */

  (function clock() {
    var el = $('#post-clock');
    function tick() {
      var d = new Date();
      el.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    tick();
    setInterval(tick, 20000);
  })();

})();
