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
    crest_left: { mark: 'Г', name: 'Гребень подвздошной кости' },
    crest_right: { mark: 'Г', name: 'Гребень подвздошной кости' }
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

    return '<svg class="viewer__svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' + out.join('') + '</svg>';
  }

  /* Окно снимка: изображение + разметка. Растягивание по вертикали —
     ответ на анизотропный пиксель ДРА (0,6 мм по X против 1,05 мм по Y). */
  var viewState = { overlay: true };

  function stageHTML(job) {
    var md = job.metadata || {};
    var hasMarks = !!(md.criteria && Object.keys(md.criteria).length);
    return '<div class="viewer__stage">' +
      '<img class="viewer__img" src="assets/' + esc(job.scan) + '" alt="Снимок ДРА" />' +
      (viewState.overlay && hasMarks ? svgOverlay(job) : '') +
    '</div>';
  }

  function viewerHTML(job, opts) {
    opts = opts || {};
    if (!job || !job.scan) {
      return '<div class="viewer__empty">' + icon('i-image', 'ico--l') + '<div>Снимок недоступен</div></div>';
    }
    var hasMarks = !!((job.metadata || {}).criteria && Object.keys(job.metadata.criteria).length);
    var prev = opts.prev;
    var area;

    if (prev) {
      /* сравнение: слева перелистываются предыдущие попытки, справа — новый снимок */
      var pv = verdictOf(prev.job).k;
      var onPrev = opts.focus === 'prev';
      area = '<div class="viewer__area viewer__area--split">' +
        '<div class="shot' + (onPrev ? ' shot--on' : '') + '" data-focus="prev">' +
          '<div class="shot__head">' +
            '<button class="shot__nav" type="button" data-hist="prev"' + (prev.idx === 0 ? ' disabled' : '') + '>' +
              icon('i-chevron-left', 'ico--s') + '</button>' +
            pickerHTML('hist', prev.job, prev.items, {
              dark: true,
              label: 'Попытка ' + (prev.idx + 1) + ' из ' + prev.total,
              count: 'выбрать'
            }) +
            '<button class="shot__nav" type="button" data-hist="next"' +
              (prev.idx === prev.total - 1 ? ' disabled' : '') + '>' + icon('i-chevron-right', 'ico--s') + '</button>' +
          '</div>' +
          stageHTML(prev.job) +
        '</div>' +
        '<div class="shot' + (onPrev ? '' : ' shot--on') + '" data-focus="now">' +
          '<div class="shot__head"><span class="shot__title">Новый снимок</span></div>' +
          stageHTML(job) +
        '</div>' +
      '</div>';
    } else {
      area = '<div class="viewer__area">' + stageHTML(job) + '</div>';
    }

    return area +
      '<div class="viewer__tools">' +
        markerKeyHTML(job) +
        '<span class="spacer"></span>' +
        (opts.canCompare ? '<button class="tool" type="button" data-view="compare" aria-pressed="' + !!prev + '">' +
          icon('i-layers', 'ico--s') + 'Сравнить с предыдущим</button>' : '') +
        (hasMarks ? '<button class="tool" type="button" data-view="overlay" aria-pressed="' + viewState.overlay + '">' +
          icon('i-eye', 'ico--s') + 'Разметка</button>' : '') +
      '</div>';
  }

  /* ----------------------------------------------------------
     Легенда разметки: расшифровка маркеров и значения критериев
     ---------------------------------------------------------- */

  /* Значение критерия человеческим языком: строка должна читаться
     сама по себе, без пояснения под ней. */
  function criterionValue(n, cr) {
    var d = cr.details || {};

    if (n === 'spine_axis') {
      return cr.value === null || cr.value === undefined ? 'не измерена' : nm(cr.value, 1) + '°';
    }
    if (n === 'pelvis_crest') {
      var sq = d.square || {};
      if (sq.left_ok && sq.right_ok) return 'обе стороны в кадре';
      if (sq.left_ok) return 'правый вне кадра';
      if (sq.right_ok) return 'левый вне кадра';
      return 'обе стороны вне кадра';
    }
    if (n === 'foreign_objects') {
      if (d.verdict === 'ПРЕДМЕТ') return 'найдена дужка';
      if (d.verdict === 'проверить') return 'возможна застёжка';
      return 'не обнаружены';
    }
    if (n === 'hip_margins') {
      var f = function (v) { return v == null ? '—' : nm(v, 1); };
      return 'верх ' + f(d.top_cm) + ', бок ' + f(d.side_cm) + ', низ ' + f(d.bottom_cm) + ' см';
    }
    if (n === 'hip_keypoints') {
      return Object.keys(cr.points || {}).length === 3 ? 'все три найдены' : 'не найдены';
    }
    if (n === 'lesser_trochanter') {
      if (d.status === 'не измерен' || !cr.value) return 'не измерена';
      return nm(cr.value, 1) + ' мм';
    }
    return '—';
  }

  /* Строки таблицы критериев. Отступы бедра разворачиваем в три строки:
     у каждого своя норма, и число рядом с нормой читается без пояснений. */
  function criteriaRows(job) {
    var c = (job.metadata || {}).criteria || {};
    var rows = [];

    function margin(key, name, side, val, min) {
      var ok = val != null && val >= min;
      var detail;
      if (val == null) {
        detail = 'Седалищная кость не найдена, поэтому отступ снизу измерить не удалось. ' +
          'Повторите снимок так, чтобы кость целиком попала в кадр.';
      } else if (ok) {
        detail = 'От кости до края кадра ' + side + ' ' + nm(val, 1) +
          ' см при норме от ' + nm(min, 0) + ' см. Запас достаточный.';
      } else {
        detail = 'От кости до края кадра ' + side + ' всего ' + nm(val, 1) +
          ' см, норма — от ' + nm(min, 0) + ' см. Сместите зону сканирования так, ' +
          'чтобы кость не подходила к краю кадра, и повторите снимок.';
      }
      rows.push({
        key: key, name: name, level: ok ? 'ok' : 'bad', detail: detail,
        value: val == null ? 'не измерен' : nm(val, 1) + ' см',
        norm: 'от ' + nm(min, 0) + ' см'
      });
    }

    Object.keys(c).forEach(function (n) {
      var cr = c[n], dict = CRITERIA[n] || { name: n }, lv = levelOfCriterion(cr);

      if (n === 'hip_margins') {
        var d = cr.details || {};
        margin('margin_top', 'Отступ сверху', 'сверху', d.top_cm, 3);
        margin('margin_side', 'Отступ сбоку', 'сбоку', d.side_cm, 2);
        margin('margin_bottom', 'Отступ снизу', 'снизу', d.bottom_cm, 3);
        return;
      }

      var norm = {
        spine_axis: 'до 5°',
        pelvis_crest: 'обе',
        foreign_objects: 'нет',
        hip_keypoints: '3 точки',
        lesser_trochanter: '1,0–4,4 мм'
      }[n] || '';

      rows.push({
        key: n, name: dict.name, level: lv,
        value: criterionValue(n, cr), norm: norm,
        detail: criterionDetail(n, cr, lv)
      });
    });

    return rows;
  }

  /* Пояснение к критерию — связный текст, который читается целиком:
     что измерено, как это соотносится с нормой и что делать. */
  function criterionDetail(n, cr, lv) {
    var d = cr.details || {};
    if (cr.note && lv !== 'ok') {
      return cr.note.charAt(0).toUpperCase() + cr.note.slice(1) + '.';
    }

    if (n === 'spine_axis') {
      if (cr.value == null) return 'Столб кости не найден, угол оси измерить не удалось.';
      if (lv === 'ok') {
        return 'Ось отклонена на ' + nm(Math.abs(cr.value), 1) +
          '° при допуске 5°. Укладка в норме.';
      }
      return 'Ось отклонена на ' + nm(Math.abs(cr.value), 1) + '° при допуске 5°. ' +
        'Выровняйте пациента по центральной линии стола и повторите укладку.';
    }

    if (n === 'pelvis_crest') {
      var sq = d.square || {};
      if (sq.left_ok && sq.right_ok) {
        return 'Верхние края подвздошных костей видны с обеих сторон снимка.';
      }
      var side = !sq.left_ok && !sq.right_ok ? 'Оба гребня'
        : (sq.left_ok ? 'Гребень справа' : 'Гребень слева');
      return side + ' не попал в кадр. Сместите зону сканирования ниже, ' +
        'чтобы верхние края подвздошных костей были видны, и повторите снимок.';
    }

    if (n === 'foreign_objects') {
      if (d.verdict === 'ПРЕДМЕТ') {
        return 'На снимке найдена дужка бюстгальтера — она искажает измерение плотности. ' +
          'Попросите пациента снять бельё с металлическими элементами и переснимите.';
      }
      if (d.verdict === 'проверить') {
        return 'Найден предмет, похожий на застёжку. Признак слабый, поэтому посмотрите ' +
          'на снимок сами: если предмет попадает в зону измерения, переснимите.';
      }
      return 'Посторонних предметов и артефактов на снимке не найдено.';
    }

    if (n === 'hip_keypoints') {
      if (lv === 'ok') {
        return 'Найдены все три опорные точки: большой вертел, шейка бедра и седалищная кость. ' +
          'На снимке они отмечены буквами В, Ш и С.';
      }
      return 'Модель не нашла опорные точки бедра, поэтому ротацию измерить не удалось. ' +
        'Уложите конечность прямо, без наклона и перекрытия тканями, и повторите снимок.';
    }

    if (n === 'lesser_trochanter') {
      if (d.status === 'не измерен' || !cr.value) {
        return 'Ротацию не измеряли: не найдены опорные точки бедра.';
      }
      if (d.status === 'проверить') {
        return 'Расстояние до малого вертела ' + nm(cr.value, 1) +
          ' мм — чуть за пределами нормы от 1,0 до 4,4 мм. Посмотрите на снимок сами: ' +
          'если бугор хорошо заметен, разверните стопу внутрь и переснимите.';
      }
      if (lv === 'ok') {
        return 'Расстояние до малого вертела ' + nm(cr.value, 1) +
          ' мм при норме от 1,0 до 4,4 мм. Стопа развёрнута правильно.';
      }
      return 'Расстояние до малого вертела ' + nm(cr.value, 1) +
        ' мм при норме от 1,0 до 4,4 мм — бедро развёрнуто наружу. ' +
        'Разверните стопу внутрь до упора в фиксаторе и переснимите.';
    }

    return '';
  }

  /* Раскрытые строки таблицы критериев. По умолчанию все закрыты. */
  var openCrit = {};

  function criteriaHTML(job) {
    var rows = criteriaRows(job);
    if (!rows.length) return '';

    return '<div class="crits">' +
      '<div class="crits__head">' +
        '<span></span><span>Критерий</span><span>Значение</span><span>Норма</span><span></span>' +
      '</div>' +
      rows.map(function (r) {
        var sym = { ok: '✓', warn: '!', bad: '✕' }[r.level] || '–';
        var open = !!openCrit[r.key];
        return '<div class="crit' + (open ? ' is-open' : '') + '" data-crit="' + r.key + '">' +
            '<span class="crit__state' + (r.level ? ' crit__state--' + r.level : '') + '">' + sym + '</span>' +
            '<span class="crit__name">' + esc(r.name) + '</span>' +
            '<span class="crit__value num">' + esc(r.value) + '</span>' +
            '<span class="crit__norm num">' + esc(r.norm) + '</span>' +
            '<svg class="ico crit__go"><use href="#i-chevron-right"/></svg>' +
          '</div>' +
          (open && r.detail ? '<p class="crit__detail">' + esc(r.detail) + '</p>' : '');
      }).join('') +
    '</div>';
  }

  /* ----------------------------------------------------------
     Выпадающий выбор. Снимков в исследовании и попыток пересъёмки
     может быть сколько угодно, поэтому список, а не ряд кнопок.
     ---------------------------------------------------------- */

  var openPicker = null;

  function zoneLabel(j) {
    return j.anatomical_region ? REGION_SHORT[j.anatomical_region] : STATUS[j.status];
  }

  function pickerHTML(id, current, items, opts) {
    opts = opts || {};
    var open = openPicker === id;
    var cd = VERDICT_LIST[verdictOf(current).k];

    var body = items.map(function (j) {
      var d = VERDICT_LIST[verdictOf(j).k];
      return '<button class="picker__item' + (j.id === current.id ? ' is-on' : '') +
          '" type="button" data-open="' + j.id + '">' +
          '<span class="state state--' + (d.c || 'none') + '">' + icon(d.i, 'ico--s') + '</span>' +
          '<span class="picker__item-text">' + esc(zoneLabel(j)) +
            '<span class="picker__item-sub">' + timeOf(j.created_at) + ', ' + esc(d.t.toLowerCase()) + '</span>' +
          '</span>' +
        '</button>';
    }).join('');

    return '<div class="picker' + (opts.dark ? ' picker--dark' : '') + (open ? ' is-open' : '') + '">' +
      '<button class="picker__btn" type="button" data-picker-toggle="' + id + '">' +
        '<span class="state state--' + (cd.c || 'none') + '">' + icon(cd.i, 'ico--s') + '</span>' +
        '<span class="picker__label">' + esc(opts.label || zoneLabel(current)) + '</span>' +
        '<span class="picker__count">' + esc(opts.count || '') + '</span>' +
        icon('i-chevron-down', 'ico--s picker__chevron') +
      '</button>' +
      (open ? '<div class="picker__menu">' + body + '</div>' : '') +
    '</div>';
  }

  /* Ключ маркеров — легенда к снимку, как у графика. */
  function markerKeyHTML(job) {
    var c = (job.metadata || {}).criteria || {};
    var used = [];
    ['hip_keypoints', 'pelvis_crest'].forEach(function (n) {
      Object.keys((c[n] || {}).points || {}).forEach(function (pn) {
        var m = POINT_MARK[pn];
        if (m && used.every(function (u) { return u.mark !== m.mark; })) used.push(m);
      });
    });
    if (!used.length) return '';
    return '<div class="key">' + used.map(function (m) {
      return '<span class="key__item"><i class="key__mark">' + m.mark + '</i>' +
        esc(m.name.toLowerCase()) + '</span>';
    }).join('') + '</div>';
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

  var post = { idx: -1, phase: 'idle', total: 24, redo: 3, last: '',
               history: [], histIdx: 0, compare: false, archived: true, focus: 'now' };

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

    var prev = null;
    if (post.compare && post.history.length) {
      post.histIdx = Math.min(post.histIdx, post.history.length - 1);
      prev = {
        job: jobById(post.history[post.histIdx]),
        idx: post.histIdx,
        total: post.history.length,
        items: post.history.map(jobById)
      };
    }
    if (!prev) post.focus = 'now';

    viewer.innerHTML = viewerHTML(job, {
      max: 520, prev: prev, focus: post.focus, canCompare: post.history.length > 0
    });

    /* справа разбирается тот снимок, который выбран в окне */
    var shown = post.focus === 'prev' && prev ? prev.job : job;
    if (shown !== job) {
      v = verdictOf(shown);
      vd = VERDICT_POST[v.k];
      job = shown;
    }

    /* подзаголовок вердикта коротко называет, что именно не так —
       подробности лежат в раскрывающихся строках таблицы */
    var sub;
    if (v.k === 'failed') {
      sub = 'Снимок не удалось обработать';
    } else {
      var region = REGION[job.anatomical_region] || 'Область не определена';
      var broken = criteriaRows(job).filter(function (r) { return r.level === 'bad' || r.level === 'warn'; });
      sub = broken.length
        ? region + ' — ' + broken.map(function (r) { return r.name.toLowerCase(); }).join(', ')
        : region + ' — замечаний нет';
    }

    var html = '<div class="panel">' +
      (post.focus === 'prev' && prev
        ? '<div class="panel__tag">Разбор предыдущей попытки, ' + timeOf(job.created_at) + '</div>'
        : '') +
      '<div class="verdict' + (vd.c ? ' verdict--' + vd.c : '') + '">' +
        '<div class="verdict__icon">' + icon(vd.i) + '</div>' +
        '<div class="verdict__text">' +
          '<div class="verdict__big">' + vd.t + '</div>' +
          '<div class="verdict__sub">' + esc(sub) + '</div>' +
        '</div>' +
      '</div>';

    if (v.k === 'failed') {
      html += '<div class="panel__body">' +
        '<p class="note">Переснимите исследование. Если ошибка повторится, сообщите в центр обработки.</p>' +
        '<p class="note note--tech">' + esc(job.error || '') + '</p></div>';
    } else if ((job.metadata || {}).criteria) {
      html += criteriaHTML(job);
    }

    /* действия: рекомендация системы не запрещает принять снимок */
    var acts;
    if (v.k === 'ok') {
      acts = '<button class="btn btn--ok btn--l" data-decide="approved">' + icon('i-check') + 'Пациент свободен</button>' +
        '<button class="btn btn--l" data-decide="rejected">' + icon('i-refresh') + 'Переснять</button>';
    } else if (v.k === 'warn') {
      acts = '<button class="btn btn--ok btn--l" data-decide="approved">' + icon('i-check') + 'Принять</button>' +
        '<button class="btn btn--l" data-decide="rejected">' + icon('i-refresh') + 'Переснять</button>';
    } else {
      acts = '<button class="btn btn--bad btn--l" data-decide="rejected">' + icon('i-refresh') + 'Переснять</button>' +
        '<button class="btn btn--l" data-decide="force_approved">Всё равно принять</button>';
    }
    if (post.focus === 'prev' && prev) {
      acts = '<button class="btn btn--l acts__wide" data-focus="now">' +
        icon('i-arrow-right') + 'Вернуться к новому снимку</button>';
    }
    html += '<div class="panel__foot"><div class="acts">' + acts + '</div></div></div>';

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

  /* Снимок уходит в историю попыток: слева его можно будет перелистать. */
  function postArchive() {
    if (post.archived || post.idx < 0) return;
    post.history.push(POST_SCENARIOS[post.idx].id);
    if (post.history.length > 6) post.history.shift();
    post.histIdx = post.history.length - 1;
    post.archived = true;
  }

  function postShow(i) {
    openCrit = {};
    post.focus = 'now';
    postArchive();
    post.idx = (i + POST_SCENARIOS.length) % POST_SCENARIOS.length;
    post.archived = false;
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

  /* Группировка по исследованию: одно посещение пациента, в котором
     снимают несколько зон. Поле study_id запрошено у бекендера —
     у него оно уже лежит в таблице dicom_file. */
  function studies(list) {
    var order = [], map = {};
    (list || JOBS).forEach(function (j) {
      var k = j.study_id || j.id;
      if (!map[k]) {
        map[k] = { study_id: k, patient_ref: j.patient_ref, created_at: j.created_at, jobs: [] };
        order.push(map[k]);
      }
      map[k].jobs.push(j);
      if (j.created_at < map[k].created_at) map[k].created_at = j.created_at;
    });
    return order;
  }

  function studyOf(sid) {
    var all = studies();
    for (var i = 0; i < all.length; i++) if (all[i].study_id === sid) return all[i];
    return null;
  }

  var RANK = { failed: 0, bad: 1, warn: 2, wait: 3, none: 4, ok: 5 };

  /* Вердикт посещения — худший из его снимков. */
  function studyVerdict(group) {
    var worst = 'ok';
    group.jobs.forEach(function (j) {
      var k = verdictOf(j).k;
      if (RANK[k] < RANK[worst]) worst = k;
    });
    return worst;
  }

  /* --- очередь --- */
  /* Строка посещения оформлена как выбор роли на экране входа:
     своя подложка, синяя рамка и синяя стрелка при наведении. */
  function viewQueue() {
    var list = visibleJobs();
    var groups = studies(list);
    var shown = groups.slice(0, pageLimit);
    var sel = Object.keys(picked).filter(function (k) { return picked[k]; });

    var rows = shown.map(function (g) {
      var v = studyVerdict(g);
      var decided = g.jobs.filter(function (j) { return j.specialist_decision; }).length;
      var decision = decided === g.jobs.length ? 'разобрано'
        : (decided ? decided + ' из ' + g.jobs.length : 'не разобрано');

      return '<div class="row' + (picked[g.study_id] ? ' is-picked' : '') + '" data-open="' + g.jobs[0].id + '">' +
        '<label class="row__pick" data-stop><input type="checkbox" data-pick="' + g.study_id + '"' +
          (picked[g.study_id] ? ' checked' : '') + ' /></label>' +
        '<div class="row__when num">' + whenOf(g.created_at) + '</div>' +
        '<div class="row__who">' + esc(g.patient_ref || '—') +
          '<span class="row__sub">' + g.jobs.length + ' ' + plural(g.jobs.length, 'снимок', 'снимка', 'снимков') + '</span>' +
        '</div>' +
        '<div class="row__zones">' + g.jobs.slice(0, 3).map(zoneChip).join('') +
          (g.jobs.length > 3 ? '<span class="zone zone--none">ещё ' + (g.jobs.length - 3) + '</span>' : '') +
        '</div>' +
        '<div class="row__verdict">' + badge(v) + '</div>' +
        '<div class="row__decision">' + esc(decision) + '</div>' +
        '<svg class="ico row__go"><use href="#i-chevron-right"/></svg>' +
      '</div>';
    }).join('');

    return '' +
      '<div class="work__head"><h1 class="work__title">Очередь исследований</h1>' +
      '<span class="work__sub">' + groups.length + ' ' + plural(groups.length, 'посещение', 'посещения', 'посещений') +
      ', ' + list.length + ' ' + plural(list.length, 'снимок', 'снимка', 'снимков') + '</span></div>' +

      '<div class="filters">' +
        '<select class="filters__select" data-filter="region">' +
          opt('', 'Все области', filters.region) + opt('spine', 'Позвоночник', filters.region) +
          opt('hip_left', 'Левое бедро', filters.region) + opt('hip_right', 'Правое бедро', filters.region) +
        '</select>' +
        '<select class="filters__select" data-filter="verdict">' +
          opt('', 'Любой вердикт', filters.verdict) + opt('ok', 'Корректно', filters.verdict) +
          opt('warn', 'Нужен взгляд специалиста', filters.verdict) + opt('bad', 'Переснять', filters.verdict) +
          opt('wait', 'В обработке', filters.verdict) + opt('failed', 'Ошибка', filters.verdict) +
        '</select>' +
        '<select class="filters__select" data-filter="decision">' +
          opt('', 'Любое решение', filters.decision) + opt('_none', 'Не разобрано', filters.decision) +
          opt('approved', 'Принято', filters.decision) + opt('rejected', 'Отклонено', filters.decision) +
          opt('force_approved', 'Принято вопреки', filters.decision) +
        '</select>' +
        '<span class="filters__search">' + icon('i-search') +
          '<input type="text" placeholder="пациент или номер задачи" data-filter="q" value="' + esc(filters.q) + '" /></span>' +
      '</div>' +

      (sel.length ? '<div class="bulk">' +
        '<span class="bulk__count">Выбрано <b>' + sel.length + '</b></span>' +
        '<button class="btn" data-bulk="approved">' + icon('i-check') + 'Принять</button>' +
        '<button class="btn" data-bulk="rejected">' + icon('i-x') + 'Отклонить</button>' +
        '<button class="btn" data-report-selected>' + icon('i-file') + 'Сформировать отчёт</button>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn--quiet" data-bulk-clear>Снять выделение</button>' +
      '</div>' : '') +

      '<div class="rows__head">' +
        '<span></span><span>Поступило</span><span>Пациент</span>' +
        '<span>Зоны исследования</span><span>Вердикт</span><span>Решение</span><span></span>' +
      '</div>' +

      (rows ? '<div class="rows">' + rows + '</div>'
        : '<div class="card"><div class="empty">' +
          '<div class="empty__icon">' + icon('i-search', 'ico--l') + '</div>' +
          '<div class="empty__title">Ничего не найдено</div>' +
          '<div class="empty__text">Измените фильтры или загрузите следующую страницу.</div></div></div>') +

      '<div class="listfoot">' +
        '<span>Показано ' + shown.length + ' из ' + groups.length + '</span>' +
        (shown.length < groups.length ? '<button class="btn" data-more>Показать ещё</button>' : '') +
      '</div>';
  }

  /* Чип зоны: пока снимок не обработан, вместо области показываем состояние. */
  function zoneChip(j) {
    var k = verdictOf(j).k, d = VERDICT_LIST[k];
    var text = j.anatomical_region ? REGION_SHORT[j.anatomical_region] : STATUS[j.status];
    return '<span class="zone zone--' + (d.c || 'none') + '" data-open="' + j.id + '">' +
      icon(d.i, 'ico--s') + esc(text) + '</span>';
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
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

    html += zoneTabsHTML(job);
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
      cell('Пациент', job.patient_ref || '—') +
      cell('Поступило', whenOf(job.created_at)) +
      cell('Область', REGION[job.anatomical_region] || '—') +
      cell('Состояние', STATUS[job.status]) +
      cell('Направившая организация', 'Поликлиника № 218') +
      cell('Аппарат', (job.metadata || {}).device || '—') +
    '</div>';

    if (md.criteria && Object.keys(md.criteria).length) {
      html += '<div class="crits-wrap">' + criteriaHTML(job) + quietLine(job) + '</div>';
    }

    html += '<div class="card"><div class="card__head"><span class="card__title">Решение специалиста</span></div>' +
      '<div class="card__body">' + decideHTML(job) + '</div></div>';

    html += '</div></div>';
    return html;
  }

  /* Зоны одного посещения: переключение между снимками пациента. */
  function zoneTabsHTML(job) {
    var group = studyOf(job.study_id);
    if (!group || group.jobs.length < 2) return '';
    var n = group.jobs.indexOf(job) + 1;
    return '<div class="picker-row">' +
      '<span class="picker-row__key">Снимок исследования</span>' +
      pickerHTML('zones', job, group.jobs, { count: n + ' из ' + group.jobs.length }) +
    '</div>';
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
    if (job.confidence == null) return '';
    return '<div class="quiet">Область определена с уверенностью <b>' +
      nm(job.confidence * 100, 0) + '%</b>, обработка заняла <b>' +
      nm(job.duration_ms / 1000, 1) + ' с</b></div>';
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
        '<button class="btn btn--ok btn--l" data-decide="approved">' + icon('i-check') + 'Принять</button>' +
        '<button class="btn btn--bad btn--l" data-decide="rejected">' + icon('i-x') + 'Отклонить</button>' +
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
        '</div>';
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
      }).join('') + '</tbody></table></div>';
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

  function rerender() {
    if ($('#screen-post').classList.contains('is-on')) renderPost();
    else renderWork();
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
      post.history = [];
      post.compare = false;
      post.archived = true;
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

    /* выпадающий список */
    if ((t = e.target.closest('[data-picker-toggle]'))) {
      var pid2 = t.getAttribute('data-picker-toggle');
      openPicker = openPicker === pid2 ? null : pid2;
      if (pid2 === 'hist') post.focus = 'prev';
      rerender();
      return;
    }
    if (openPicker && !e.target.closest('.picker__menu')) {
      openPicker = null;
      rerender();
      return;
    }
    /* на посту выбор из списка переключает попытку, а не открывает карточку */
    if (openPicker === 'hist' && (t = e.target.closest('.picker__menu [data-open]'))) {
      var hid = t.getAttribute('data-open');
      var at = post.history.indexOf(hid);
      if (at >= 0) post.histIdx = at;
      openPicker = null;
      post.focus = 'prev';
      renderPost();
      return;
    }
    if (e.target.closest('.picker__menu [data-open]')) openPicker = null;

    /* навигация */
    if ((t = e.target.closest('[data-go]'))) { go(t.getAttribute('data-go')); return; }

    /* строка критерия раскрывается по клику */
    if ((t = e.target.closest('[data-crit]'))) {
      var ck = t.getAttribute('data-crit');
      openCrit[ck] = !openCrit[ck];
      if ($('#screen-post').classList.contains('is-on')) renderPost();
      else renderWork();
      return;
    }

    /* окно снимка */
    if ((t = e.target.closest('[data-hist]'))) {
      post.histIdx += t.getAttribute('data-hist') === 'prev' ? -1 : 1;
      post.histIdx = Math.max(0, Math.min(post.histIdx, post.history.length - 1));
      post.focus = 'prev';
      renderPost();
      return;
    }

    /* клик по снимку делает его активным: справа показывается его разбор */
    if ((t = e.target.closest('[data-focus]'))) {
      post.focus = t.getAttribute('data-focus');
      renderPost();
      return;
    }

    if ((t = e.target.closest('[data-view]'))) {
      var key = t.getAttribute('data-view');
      if (key === 'compare') {
        post.compare = !post.compare;
        post.focus = 'now';
        renderPost();
        return;
      }
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
        postArchive();
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
    if (e.target.closest('[data-stop]')) { return; }
    if ((t = e.target.closest('[data-bulk]'))) {
      var d2 = t.getAttribute('data-bulk'), n = 0;
      Object.keys(picked).forEach(function (k) {
        if (!picked[k]) return;
        var g = studyOf(k);
        (g ? g.jobs : []).forEach(function (jb) {
          if (jb.status === 'completed') { jb.specialist_decision = d2; jb.specialist_name = 'Соколова М. И.'; n++; }
        });
      });
      picked = {};
      renderWork();
      toast('Решение принято по ' + n + ' снимкам');
      return;
    }
    if (e.target.closest('[data-bulk-clear]')) { picked = {}; renderWork(); return; }
    if (e.target.closest('[data-report-selected]')) {
      var cnt = 0;
      Object.keys(picked).forEach(function (k) {
        if (picked[k]) { var g = studyOf(k); cnt += g ? g.jobs.length : 0; }
      });
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
