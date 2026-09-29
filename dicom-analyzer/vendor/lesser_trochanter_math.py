"""Малый вертел (бугор на внутреннем крае диафиза): математические методы БЕЗ обучения. Самодостаточный модуль:
код целиком встраивается в ноутбук train_lesser_trochanter_combined.ipynb (на Kaggle репозиторий недоступен), поэтому только numpy/cv2/scipy.

Снимок подаётся в КАНОНИЧЕСКОЙ ориентации (боковая сторона справа; image_right зеркалится заранее). Внутренний (медиальный) край диафиза — слева.
Масштаб пикселя: 0.6 мм по X, 1.05 мм по Y (один сканер).

Метод (lt_ridge2 + lt_rescue + обрезка по ножке импланта, перенесён без изменения логики): расстояние от края кости до гребня самых ярких пикселей
минус «нормальная» толщина; досчёт трека, если бугор обрезан границей слежения; для импланта маска обрезается выше ножки протеза.
measure_ridge возвращает словарь: ok, branch, implant, has_peak, dist_mm (0 если бугра нет), peak_y, y0, y1, area_cm2, polygon (для закрашивания, канонические координаты) и профили для картинки.
(Прежний метод «край против прямой» отвергнут: ошибался на бугре, если он не резко выступает.)
"""
import numpy as np
import cv2
from scipy.signal import find_peaks
from scipy.ndimage import gaussian_filter, gaussian_filter1d, median_filter

MM_X, MM_Y = 0.6, 1.05

# --- маска кости (hip_roi_margins.py / classify.py) ---
CLAHE_CLIP_LIMIT = 3.0
CLAHE_TILE_GRID = (8, 8)
MASK_SMOOTH_SIGMA = 1.0
MASK_MIN_THRESHOLD = 12.0
MASK_REL_THRESHOLD = 0.2
BACKGROUND_PERCENTILE = 80
BACKGROUND_RING_PX = 20
MIN_EXTRA_COMPONENT_PX = 1200
IMPLANT_SATURATION = 250
METAL_LEVEL_CAP = 245
IMPLANT_BLOB_PX = 3000

# --- слежение за диафизом и профили ---
JUMP_PX = 5                  # резкий скачок внутреннего края между строками = слились с тазом
STEM_MIN_W, STEM_MAX_W = 15, 60
STEM_STABLE_WIN = 20
STEM_STABLE_STD = 4.0
WIN_FRAC = 0.5               # гребень белого ищем в медиальной половине сечения диафиза (ветка B)
WIN_MAX_PX = 30
WHITE_FRAC = 0.9
RIDGE_MEDIAN = 9              # сглаживание линии гребня по строкам: медиана (окно, строк) и гаусс (сигма)
RIDGE_SIGMA = 2.5
RESCUE_JUMP_PX = 20
RESCUE_WIDTH_BLOWUP = 2.2
RESCUE_MAX_EXTRA = 100
TRUNC_MIN_MM = 1.2
TRUNC_RISE_MM = 0.3
PROM_MM_RIDGE = 0.5          # минимальная выраженность пика, мм
NECK_DY_MIN, NECK_DY_MAX = 45, 100  # окно поиска пика по вертикали относительно точки шейки бедра, px ниже неё (по разметке центр бугра на 60-85 px ниже шейки, std 8; запас на ошибку модели точек)
BONE_WIDTH_MIN_PX = 18      # и не уже (11 мм)
BONE_WIDTH_MAX_PX = 80      # ширина кости по маске больше (48 мм; ствол бедра 25-35 мм, у всех снимков с бедром в кадре максимум 75 px) — маска слилась с тазом, бедро не в кадре: измерять нельзя
PEAK_MAX_OFFSET_W = 2.0      # пик ищется только у «поворота»: от верха прослеженной кости (где край маски поворачивает к шейке) вниз не дальше стольких ширин кости (ширина — по маске этого снимка); по полигонам экспертов центр бугра на 0.6-2.0 ширины ниже верха, максимум 1.99, поэтому 2.0: дальше пик — шум (напр. b30b63: настоящий бугор на 0.94, ложный пик на 2.02)
# область бугра для закраски (подобрана по полигонам экспертов, Dice ~0.66; устойчивое плато: порог 0.5-0.6, отступ 8-10 px)
REGION_FRAC = 0.5           # строки бугра: где превышение >= доли пика
REGION_PAD_ROWS = 8         # отступ вверх и вниз, строк
REGION_ADD_PX = 4.0         # ширина в строке = превышение + добавка (px), от внутреннего края кости
REGION_MULT = 1.0
REGION_MAX_HALF_ROWS = 40    # область не длиннее ±40 строк от пика (у полигонов экспертов высота до 53 px): иначе на слабом бугре она растягивается вдоль кости


def imread_gray(path: str) -> np.ndarray:
    with open(path, "rb") as f:
        buf = np.frombuffer(f.read(), dtype="uint8")
    return cv2.imdecode(buf, cv2.IMREAD_GRAYSCALE)


def to_canonical(image: np.ndarray, side: str):
    """Боковая сторона бедра — справа. Для image_right зеркалим снимок."""
    if side == "image_right":
        return image[:, ::-1].copy(), True
    return image, False


def segment_bone(image_u8: np.ndarray) -> np.ndarray:
    clahe = cv2.createCLAHE(clipLimit=CLAHE_CLIP_LIMIT, tileGridSize=CLAHE_TILE_GRID)
    blur = cv2.GaussianBlur(clahe.apply(image_u8), (5, 5), 0)
    _, th = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    kernel = np.ones((3, 3), np.uint8)
    th = cv2.morphologyEx(th, cv2.MORPH_OPEN, kernel)
    th = cv2.morphologyEx(th, cv2.MORPH_CLOSE, kernel)
    n_components, labels, stats, _ = cv2.connectedComponentsWithStats(th, connectivity=8)
    if n_components <= 1:
        return th
    return (labels == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype("uint8") * 255


def bone_mask(img: np.ndarray) -> np.ndarray:
    smooth = gaussian_filter(img.astype(np.float32), MASK_SMOOTH_SIGMA)
    seeds = segment_bone(img) > 0
    tissue = seeds & (img < METAL_LEVEL_CAP)
    level = float(np.median(smooth[tissue if tissue.sum() > 200 else seeds]))
    ring = cv2.dilate(seeds.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=BACKGROUND_RING_PX) > 0
    background = float(np.percentile(smooth[~ring], BACKGROUND_PERCENTILE)) if (~ring).sum() > 200 else 0.0
    threshold = background + max(MASK_MIN_THRESHOLD, MASK_REL_THRESHOLD * (level - background))
    _, labels, stats, _ = cv2.connectedComponentsWithStats((smooth >= threshold).astype(np.uint8), connectivity=8)
    keep = set(np.unique(labels[seeds]).tolist())
    keep |= {k for k in range(1, len(stats)) if stats[k, cv2.CC_STAT_AREA] >= MIN_EXTRA_COMPONENT_PX}
    keep.discard(0)
    return np.isin(labels, list(keep))


def _runs(row: np.ndarray, gap: int = 3):
    xs = np.nonzero(row)[0]
    if not len(xs):
        return []
    breaks = np.nonzero(np.diff(xs) > gap)[0]
    starts = np.concatenate([[xs[0]], xs[breaks + 1]])
    ends = np.concatenate([xs[breaks], [xs[-1]]])
    return list(zip(starts.tolist(), ends.tolist()))


# --- детектор импланта (implant_detect.py): жёсткое насыщение до 255 почти без разброса; «blob» — крупное пятно, «rod» — тонкий стержень ---
IMPL_THRESH = 245
IMPL_MIN_AREA_PX = 40
IMPL_MAX_STD = 2.0
IMPL_MIN_FRAC255 = 0.85
IMPL_BLOB_MIN_PX = 3000
IMPL_ROD_MIN_LEN_PX = 25
IMPL_ROD_MAX_WIDTH_PX = 22


def detect_implant(img: np.ndarray):
    sat = (img >= IMPL_THRESH).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(sat, connectivity=8)
    for k in range(1, n):
        area = stats[k, cv2.CC_STAT_AREA]
        if area < IMPL_MIN_AREA_PX:
            continue
        ys, xs = np.where(labels == k)
        vals = img[ys, xs].astype(np.float32)
        if vals.std() > IMPL_MAX_STD or (vals == 255).mean() < IMPL_MIN_FRAC255:
            continue
        if area >= IMPL_BLOB_MIN_PX:
            return True, "blob"
        (_, _), (w, h), _ = cv2.minAreaRect(np.column_stack([xs, ys]).astype(np.float32))
        if max(w, h) >= IMPL_ROD_MIN_LEN_PX and min(w, h) <= IMPL_ROD_MAX_WIDTH_PX:
            return True, "rod"
    return False, "none"


def fill_holes(mask: np.ndarray) -> np.ndarray:
    """Закрывает ВНУТРЕННИЕ дыры маски кости (тёмные пятна остеопороза): иначе край диафиза в одной строке перескакивает на границу дыры и трек обрывается."""
    inv = np.pad((~mask).astype(np.uint8), 1, constant_values=1)
    ff = np.zeros((inv.shape[0] + 2, inv.shape[1] + 2), np.uint8)
    cv2.floodFill(inv, ff, (0, 0), 2)
    return mask | (inv[1:-1, 1:-1] == 1)


def metal_suspected(img: np.ndarray) -> bool:
    """Металл эндопротеза: детектор пятно/стержень (находит все три импланта в данных) ИЛИ прежний признак крупного насыщенного пятна."""
    if detect_implant(img)[0]:
        return True
    n, _, stats, _ = cv2.connectedComponentsWithStats((img >= IMPLANT_SATURATION).astype(np.uint8), connectivity=8)
    return n > 1 and int(stats[1:, cv2.CC_STAT_AREA].max()) >= IMPLANT_BLOB_PX


def metal_top_row(img, mask):
    """(Не используется в измерении: оставлено для справки.) Верх ножки протеза (не круглой головки — та ещё сустав, не кость): по стабилизации ширины ножки."""
    metal = (img >= IMPLANT_SATURATION) & mask
    h = metal.shape[0]
    widths = []
    for y in range(h):
        cols = np.where(metal[y])[0]
        widths.append(float(cols.max() - cols.min()) if len(cols) else np.nan)
    widths = np.array(widths)
    for y in range(h - STEM_STABLE_WIN):
        seg = widths[y:y + STEM_STABLE_WIN]
        if np.isnan(seg).any():
            continue
        if seg.std() < STEM_STABLE_STD and STEM_MIN_W <= seg.mean() <= STEM_MAX_W:
            return int(y)
    return None


def track_shaft(mask, width_check=True):
    """Идём от низа вверх по диафизу. dict y -> (левый край, правый край); левый = внутренний/медиальный."""
    h, w = mask.shape
    rows = {}
    best = None
    for y in range(h - 1, max(h - 12, 0), -1):
        runs = [r for r in _runs(mask[y]) if r[1] - r[0] >= 12]
        if runs:
            best = (y, max(runs, key=lambda r: r[1] - r[0]))
            break
    if best is None:
        return rows
    y0, prev = best
    rows[y0] = prev
    widths = [prev[1] - prev[0]]
    for y in range(y0 - 1, -1, -1):
        cands = []
        for s, e in _runs(mask[y]):
            ov = min(e, prev[1] + 3) - max(s, prev[0] - 3)
            if ov > 0:
                cands.append((ov, s, e))
        if not cands:
            break
        _, s, e = max(cands)
        wmed = float(np.median(widths[-30:]))
        if width_check and (e - s) > 1.9 * wmed and len(widths) > 20:   # слились с тазом / шейкой
            break
        rows[y] = (s, e)
        prev = (s, e)
        widths.append(e - s)
    return rows


def shaft_width(rows):
    """Ширина кости по маске: медиана ширины прослеженных строк в нижней половине трека (собственно диафиз, без шейки)."""
    ys = sorted(rows)
    lower = ys[len(ys) // 2:]
    return float(np.median([rows[y][1] - rows[y][0] for y in lower])) if lower else 0.0


def _peak_window(ys, width):
    """Индексы строк профиля, в которых допустим пик. Есть точка шейки (neck_y) — строки на NECK_DY_MIN..NECK_DY_MAX px ниже неё; нет — до PEAK_MAX_OFFSET_W ширин кости ниже верха трека."""
    ys = np.asarray(ys)
    if _NECK_Y[0] is not None:
        return (ys >= _NECK_Y[0] + NECK_DY_MIN) & (ys <= _NECK_Y[0] + NECK_DY_MAX)
    lim = int(np.searchsorted(ys, ys[0] + PEAK_MAX_OFFSET_W * width, side="right")) if width > 0 else len(ys)
    return np.arange(len(ys)) < lim


_NECK_Y = [None]   # точка шейки (строка) для текущего измерения; задаётся measure_ridge(neck_y=...)


def _half_width_bounds(prof, p):
    half = prof[p] * 0.5
    n = len(prof)
    t = p
    while t > 0 and prof[t] > half:
        t -= 1
    u = p
    while u < n - 1 and prof[u] > half:
        u += 1
    return t, u


# ============================== метод B: гребень белого + rescue + имплант ==============================
def track_eval(mask, width_check=True):
    rows = track_shaft(mask, width_check)
    if not rows:
        return rows
    out = {}
    prev = None
    for y in sorted(rows, reverse=True):
        s = rows[y][0]
        if prev is not None and abs(s - prev) > JUMP_PX:
            break
        out[y] = rows[y]
        prev = s
    return out


def ridge_profile(img, rows):
    sm = gaussian_filter(img.astype(np.float32), 1.0)
    ys = np.array(sorted(rows))
    edge = np.array([rows[y][0] for y in ys], float)
    ridge = np.zeros(len(ys))
    for i, y in enumerate(ys):
        s, e = rows[y]
        hi = int(min(e, s + max(6, min(WIN_MAX_PX, WIN_FRAC * (e - s)))))
        seg = sm[y, s:hi + 1]
        m = seg.max()
        sel = seg >= WHITE_FRAC * m
        xs = np.arange(s, hi + 1)[sel]
        ridge[i] = float(np.average(xs, weights=seg[sel]))
    ridge = gaussian_filter1d(median_filter(ridge, RIDGE_MEDIAN, mode="nearest"), RIDGE_SIGMA)
    return ys, gaussian_filter1d(edge, 1.5), ridge


def _ridge_result(ys, edge, ridge, prom_mm, width=0.0):
    d = ridge - edge                                          # px: край -> гребень белого
    n = len(ys)
    base = float(np.median(d[int(n * 0.7):]))                 # «нормальная» толщина: нижние 30% участка
    ex = d - base
    out = dict(ys=ys, edge=edge, ridge=ridge, d=d, base=base, ex=ex, peak=None)
    win = _peak_window(ys, width)                                       # окно поиска: по точке шейки или по форме кости
    pk, pr = find_peaks(ex, prominence=prom_mm / MM_X)
    keep = win[pk]
    pk, pr = pk[keep], {kk: vv[keep] for kk, vv in pr.items()}
    if len(pk) == 0:
        return out
    k = int(np.argmax(pr["prominences"]))
    p = pk[k]
    t, u = _half_width_bounds(ex, p)
    out.update(peak=int(ys[p]), peak_mm=float(ex[p] * MM_X), prom_mm=float(pr["prominences"][k] * MM_X), y0=int(ys[t]), y1=int(ys[u]), t=int(t), u=int(u),
               area_cm2=float(np.sum(np.clip(ex[t:u + 1], 0, None)) * MM_X * MM_Y / 100))
    return out


def analyse_ridge_plain(img, mask, prom_mm=PROM_MM_RIDGE, width_check=True):
    rows = track_eval(mask, width_check)
    if len(rows) < 50:
        return None
    ys, edge, ridge = ridge_profile(img, rows)
    return _ridge_result(ys, edge, ridge, prom_mm, shaft_width(rows))


def _extend(mask, rows, direction):
    """Мягче обычного трека — только чтобы дотянуть до спада величины, а не блуждать бесконечно."""
    if direction == "up":
        y0 = min(rows)
        prev_s, prev_e = rows[y0]
        seq = range(y0 - 1, max(y0 - RESCUE_MAX_EXTRA, -1), -1)
    else:
        y0 = max(rows)
        prev_s, prev_e = rows[y0]
        seq = range(y0 + 1, y0 + RESCUE_MAX_EXTRA)
    widths = [prev_e - prev_s]
    out = dict(rows)
    for y in seq:
        if y < 0 or y >= mask.shape[0]:
            break
        cands = []
        for s, e in _runs(mask[y]):
            pad = 6
            ov = min(e, prev_e + pad) - max(s, prev_s - pad)
            if ov > 0:
                cands.append((ov, s, e))
        if not cands:
            break
        _, s, e = max(cands)
        w = e - s
        if abs(s - prev_s) > RESCUE_JUMP_PX:
            break
        wmed = float(np.median(widths[-20:]))
        if w > RESCUE_WIDTH_BLOWUP * wmed and len(widths) > 10:
            break
        out[y] = (s, e)
        prev_s, prev_e = s, e
        widths.append(w)
    return out


IMPL_METAL_LEVEL = 250       # металл: насыщенные пиксели
IMPL_MIN_METAL_ROWS = 30


def implant_profile(img, rows):
    """Для строк трека: край кости и внутренняя граница металла (первый насыщенный пиксель от края). Строки без металла достраиваются интерполяцией."""
    ys = np.array(sorted(rows))
    edge = np.array([rows[y][0] for y in ys], float)
    metal = np.full(len(ys), np.nan)
    for i, y in enumerate(ys):
        s_, e_ = rows[y]
        hit = np.nonzero(img[y, s_:e_ + 1] >= IMPL_METAL_LEVEL)[0]
        if len(hit):
            metal[i] = s_ + hit[0]
    if np.isnan(metal).all():
        return ys, edge, None
    ok = ~np.isnan(metal)
    metal = np.interp(ys, ys[ok], metal[ok])
    return ys, gaussian_filter1d(edge, 1.5), gaussian_filter1d(median_filter(metal, 9, mode="nearest"), 2.0)


def analyse_implant(img, mask, prom_mm=PROM_MM_RIDGE):
    rows = track_eval(mask)
    if len(rows) < 50:
        return None
    ys, edge, metal = implant_profile(img, rows)
    if metal is None:
        return None
    return _ridge_result(ys, edge, metal, prom_mm, shaft_width(rows))


def analyse_ridge(img, mask, prom_mm=PROM_MM_RIDGE, width_check=True):
    """branch: 'strict' | 'implant' | 'rescued_up' | 'rescued_down' | 'rescued_both' | 'none'."""
    if metal_suspected(img):
        # Имплант (детектор пятно/стержень). Гребень яркости тут цепляется за металл, а обрезка маски выше ножки отрезала сам бугор. Отдельная ветка:
        # «гребнем» служит внутренняя (медиальная) граница металла — серая полоса кости между краем кости и металлом расширяется на бугре.
        return analyse_implant(img, mask, prom_mm), "implant"
    res = analyse_ridge_plain(img, mask, prom_mm, width_check)
    if res is None:
        return None, "none"
    if res["peak"] is not None:
        return res, "strict"
    ex, n = res["ex"], len(res["ex"])
    top_trunc = ex[0] >= TRUNC_MIN_MM / MM_X and (ex[0] - ex[min(5, n - 1)]) > TRUNC_RISE_MM / MM_X
    bot_trunc = ex[-1] >= TRUNC_MIN_MM / MM_X and (ex[-1] - ex[max(n - 6, 0)]) > TRUNC_RISE_MM / MM_X
    if not (top_trunc or bot_trunc):
        return res, "strict"                                                   # честно «бугра нет»
    base_rows = track_eval(mask, width_check)
    branch = None
    if top_trunc:
        ext_rows = _extend(mask, base_rows, "up")
        branch = "rescued_up"
    else:
        ext_rows = base_rows
    if bot_trunc:
        ext_rows = _extend(mask, ext_rows, "down")
        branch = "rescued_down" if branch is None else "rescued_both"
    ys2, edge2, ridge2 = ridge_profile(img, ext_rows)
    if len(ys2) < 50:
        return res, "strict"
    return _ridge_result(ys2, edge2, ridge2, prom_mm, shaft_width(ext_rows)), branch


# ============================== единый интерфейс ==============================
def _bump_polygon(res):
    """Область бугра для закрашивания (канонические координаты снимка): между «нормальным» краем (край + база) и гребнем белого на строках [t..u], где превышение > 0.
    Это область, интеграл которой даёт площадь метода. Узкая полоска: для закраски лучше маска сегментации, это запасной вариант."""
    if res is None or res.get("peak") is None:
        return []
    t, u = res["t"], res["u"]
    ys = res["ys"][t:u + 1]
    left, right, w = res["edge"][t:u + 1] + res["base"], res["ridge"][t:u + 1], res["ex"][t:u + 1]
    keep = w > 0
    if keep.sum() < 3:
        return []
    ys, left, right = ys[keep], left[keep], right[keep]
    return [(float(x), float(y)) for x, y in zip(left, ys)] + [(float(x), float(y)) for x, y in zip(right[::-1], ys[::-1])]


def bone_sanity(mask):
    """Проверка «маска похожа на бедро» по ширине кости. Возвращает строку с причиной или None.
    Что меряем: идём по внутреннему краю кости снизу вверх (track_eval), в каждой строке ширина = правый край - левый край маски; берём медиану по нижней половине прослеженного
    участка (собственно диафиз, без шейки). У нормальных снимков 29 мм в среднем (максимум 45 мм), у мусора, где маска слилась с тазом, 51 мм. Границы 11-48 мм (18-80 px)."""
    rows = track_eval(mask)
    if not rows:
        return "диафиз не прослежен"
    w = shaft_width(rows)
    if w > BONE_WIDTH_MAX_PX:
        return "кость слишком широкая по маске (слилась с тазом / бедро не в кадре)"
    if w < BONE_WIDTH_MIN_PX:
        return "кость слишком узкая по маске"
    return None


def _fit_edge_bump(rows, min_rows=25, prom_mm=1.0):
    """Запасной путь для импланта (из lt_v6.fit_bump): край кости против робастной прямой диафиза; не зависит от яркости металла."""
    if len(rows) < min_rows:
        return None
    ys = np.array(sorted(rows))
    xm = gaussian_filter1d(np.array([rows[y][0] for y in ys], float), 1.5)
    n = len(ys)
    lo = int(n * 0.5)
    yy, xx = ys[lo:], xm[lo:]
    a, b = np.polyfit(yy, xx, 1)
    for _ in range(4):
        res = xx - (a * yy + b)
        keep = np.abs(res) < max(1.5, 1.5 * np.median(np.abs(res)) / 0.6745)
        if keep.sum() < 10:
            break
        a, b = np.polyfit(yy[keep], xx[keep], 1)
    base = a * ys + b
    prot = base - xm                                        # px, >0 — выступ края над линией диафиза
    win = _peak_window(ys, shaft_width(rows))
    pk, props = find_peaks(prot, prominence=prom_mm / MM_X)
    keep = win[pk]
    pk, props = pk[keep], {kk: vv[keep] for kk, vv in props.items()}
    if len(pk) == 0:
        return None
    k = int(np.argmax(props["prominences"]))
    p = pk[k]
    t, u = _half_width_bounds(prot, p)
    # такой же словарь, как у гребня: «гребнем» служит прямая диафиза, «превышением» — выступ края (для картинки и профиля)
    return dict(ys=ys, edge=xm, ridge=base, d=prot, base=0.0, ex=prot, peak=int(ys[p]), peak_mm=float(prot[p] * MM_X), y0=int(ys[t]), y1=int(ys[u]), t=int(t), u=int(u),
                area_cm2=float(np.sum(np.clip(prot[t:u + 1], 0, None)) * MM_X * MM_Y / 100))


def _polygon_edge(res):
    t, u = res["t"], res["u"]
    ys, left, right, w = res["ys"][t:u + 1], res["edge"][t:u + 1], res["ridge"][t:u + 1], res["ex"][t:u + 1]
    keep = w > 0
    if keep.sum() < 3:
        return []
    ys, left, right = ys[keep], left[keep], right[keep]
    return [(float(x), float(y)) for x, y in zip(left, ys)] + [(float(x), float(y)) for x, y in zip(right[::-1], ys[::-1])]


def measure_ridge(img_canon, mask=None, neck_y=None):
    """Расстояние кость -> бугор в мм (dist_mm; 0 — бугра нет; NaN — нет данных), область и профили для картинки.
    branch: 'strict' | 'rescued_up' | 'rescued_down' | 'rescued_both' | 'none' | 'implant' (граница металла вместо гребня) | 'implant_edge' (стержневой имплант или граница металла не сработала: край против прямой)."""
    mask = bone_mask(img_canon) if mask is None else mask
    _NECK_Y[0] = None if neck_y is None or neck_y != neck_y else float(neck_y)     # опорная точка шейки бедра (строка), если известна
    try:
        return _measure_ridge(img_canon, mask)
    finally:
        _NECK_Y[0] = None


def _measure_ridge(img_canon, mask):
    why = bone_sanity(mask)
    if why:                                                                   # маска кости не похожа на бедро: измерять нельзя
        return dict(method="ridge", branch="bad_mask", implant=False, res=None, ok=False, has_peak=False, dist_mm=np.nan, peak_y=None, y0=None, y1=None, area_cm2=0.0, polygon=[], reason=why)
    res, branch = analyse_ridge(img_canon, mask)
    if res is None and branch == "none":
        # трек диафиза не состоялся (короткий кроп снизу): запасные пути ТОЛЬКО для этих снимков, остальные не меняются
        #  1) закрыть внутренние дыры маски; 2) не проверять «раздувание ширины» (край чёрного прямоугольника кадра обрезает кость справа и ложно похож на слияние с тазом)
        for tag, m2, wc in (("rescued_holes", fill_holes(mask), True), ("rescued_relaxed", fill_holes(mask), False)):
            res2, br2 = analyse_ridge(img_canon, m2, width_check=wc)
            if res2 is not None:
                res, branch = res2, tag if br2 == "strict" else f"{tag}+{br2}"
                break
    is_rod = branch == "implant" and detect_implant(img_canon)[1] == "rod"          # тонкий стержень: граница металла рваная (несколько тонких ножек) -> сразу край против прямой
    if branch == "implant" and (is_rod or res is None or res.get("peak") is None or res["peak_mm"] <= 0):
        e = _fit_edge_bump(track_eval(mask))
        if e is not None:
            return dict(method="ridge", branch="implant_edge", implant=True, res=e, ok=True, has_peak=True, dist_mm=e["peak_mm"], peak_y=e["peak"], y0=e["y0"], y1=e["y1"],
                        area_cm2=e["area_cm2"], polygon=_polygon_edge(e))
    base = dict(method="ridge", branch=branch, implant=branch.startswith("implant"), res=res)
    if res is None:
        return dict(base, ok=False, has_peak=False, dist_mm=np.nan, peak_y=None, y0=None, y1=None, area_cm2=0.0, polygon=[])
    if res.get("peak") is None:
        return dict(base, ok=True, has_peak=False, dist_mm=0.0, peak_y=None, y0=None, y1=None, area_cm2=0.0, polygon=[])
    # Пик найден (выраженность >= 0.5 мм над шумом профиля) — бугор найден, даже если превышение над «нормальной» толщиной слабое или отрицательное (как в сохранённых листах по возрастанию):
    # знак расстояния сохраняется, слабый бугор просто даёт малое число -> «плохой» по порогу.

    return dict(base, ok=True, has_peak=True, dist_mm=res["peak_mm"], peak_y=res["peak"], y0=res["y0"], y1=res["y1"], area_cm2=res["area_cm2"], polygon=_bump_polygon(res))


def excess_profile(meas):
    """Профиль превышения (px) края->гребень над нормой по всем строкам трека, даже если пика нет: нужен, чтобы измерить расстояние внутри области,
    найденной сегментацией. Возвращает (ys, ex_px) или None."""
    res = meas.get("res")
    return None if res is None else (res["ys"], res["ex"])


def bump_region(meas, shape):
    """Область бугра для закраски (булева маска, канонические координаты): математика, без обучения. По строкам вокруг пика, где превышение >= REGION_FRAC пика (плюс отступ),
    от внутреннего края кости на ширину «превышение + добавка». Подобрано по полигонам экспертов (Dice ~0.66, обучаемая сегментация давала ~0.5)."""
    R = np.zeros(shape, bool)
    res = meas.get("res")
    if res is None or meas.get("peak_y") is None:
        return R
    ys = np.asarray(res["ys"]).astype(int)
    ex = np.clip(res["ex"], 0, None)
    edge = res["edge"]
    i = int(np.argmin(np.abs(ys - meas["peak_y"])))
    pk = ex[i]
    if pk <= 0:
        return R
    t = i
    while t > 0 and ex[t - 1] >= REGION_FRAC * pk:
        t -= 1
    u = i
    while u < len(ys) - 1 and ex[u + 1] >= REGION_FRAC * pk:
        u += 1
    t, u = max(t, i - REGION_MAX_HALF_ROWS), min(u, i + REGION_MAX_HALF_ROWS)
    for k in range(max(t - REGION_PAD_ROWS, 0), min(u + REGION_PAD_ROWS, len(ys) - 1) + 1):
        x0 = max(int(round(edge[k])), 0)
        x1 = max(int(round(edge[k] + ex[k] * REGION_MULT + REGION_ADD_PX)), 0)
        R[ys[k], x0:x1 + 1] = True
    return R


# ---------- оценка укладки по расстоянию: «мало — плохо, много — плохо, хорошо — посередине» ----------
DIST_CENTER_MM = 2.7     # середина окна нормы, мм (выберет врач/эксперт по листам; по экспертной колонке меньше всего ошибок при 0.6-4.5 мм)
DIST_TOL_FRAC = 0.63    # допуск нормы в долях центра, одинаковый в обе стороны: норма = центр ± 63% (1.0-4.4 мм)
DIST_YELLOW_FRAC = 0.30 # ширина жёлтой полосы за окном в долях центра, одинаковая в обе стороны (0.2-1.0 мм и 4.4-5.2 мм); дальше красный (ниже 0.2 мм — слишком плоский, выше 5.2 мм — слишком выпуклый)


def distance_status(d, center=DIST_CENTER_MM, tol=DIST_TOL_FRAC, yellow=DIST_YELLOW_FRAC):
    """Окно нормы = центр ± tol*центр — зелёный «норма»; за окном ещё на yellow*центр — жёлтый «проверить»; дальше — красный «плохой».
    reason: «мало» (бугор выражен слабо / скрыт) или «много» (выступает слишком сильно). Нет числа — «нет данных»."""
    if d is None or d != d:
        return dict(status="нет данных", color="серый", reason=None)
    dev = abs(d - center) / center
    reason = None if dev < tol else ("мало" if d < center else "много")
    if dev < tol:
        return dict(status="норма", color="зелёный", reason=None)
    if dev < tol + yellow:
        return dict(status="проверить", color="жёлтый", reason=reason)
    return dict(status="плохой", color="красный", reason=reason)
