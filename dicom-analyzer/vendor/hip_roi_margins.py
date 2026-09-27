"""
Отступы области интереса на снимке проксимального отдела бедра (п. 2.3 и рис. 6 ТЗ):
корректно, если от области интереса до краёв кадра не меньше

    3 см сверху, 3 см снизу, 2 см сбоку (со стороны, куда смотрит бедро).

Алгоритм для ОДНОЙ стороны: снимки с side == "image_right" перед расчётом
зеркалятся по горизонтали, так что боковая сторона бедра всегда справа (как на
рис. 6). Вход — только снимок и сторона (из классификатора Шага 1); никаких
ключевых точек не нужно, критерий отступов не зависит от их наличия.

Края находятся по маске кости в координатах зеркального снимка:

  бок    — самая правая точка кости в верхней части кадра (наружный край большого
           вертела) до правого края кадра;
  верх   — от верхнего края кадра до верхушки большого вертела: самой верхней
           точки кости в анатомическом окне над и левее боковой точки (верхушка
           на 36-56 px выше боковой точки и на 23-40 px левее); колонки, где кость
           упирается в верх окна (таз), пропускаются;
  низ    — от нижнего конца седалищной кости до нижнего края кадра: идём от нижней
           строки вверх и берём первую строку, где левее диафиза есть отдельный
           кусок кости.

Маска кости: ядро — segment_bone из classify.py (Otsu), но оно отрезает кость
низкой плотности по краям, поэтому область достраивается порогом относительно
фона (порог = фон + max(12, 0.2 * (яркость кости - фон)); снаружи кости в этих
снимках ровно 0, а на снимках с видимыми мягкими тканями фон оценивается отдельно).

Масштаб (ответ организаторов, один сканер во всех данных): 0.6 мм на пиксель по
оси X (ширина) и 1.05 мм по оси Y (высота): 3 см по вертикали ~29 px, 2 см по
горизонтали ~33 px.

Использование:
    python hip_roi_margins.py --manifest <training_package/manifest.csv> --images <папка PNG> --out <папка>
"""

from __future__ import annotations

import argparse
import csv
import dataclasses
import os
from typing import Optional

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter

from classify import segment_bone

MM_PER_PX_X = 0.6
MM_PER_PX_Y = 1.05

MIN_TOP_CM = 3.0
MIN_BOTTOM_CM = 3.0
MIN_SIDE_CM = 2.0

MASK_SMOOTH_SIGMA = 1.0
MASK_MIN_THRESHOLD = 12.0
MASK_REL_THRESHOLD = 0.2
BACKGROUND_PERCENTILE = 80
BACKGROUND_RING_PX = 20
MIN_EXTRA_COMPONENT_PX = 1200

LATERAL_ROWS_FRAC = 0.6
APEX_UP_PX = 75
APEX_LEFT_PX = 55
APEX_FALLBACK_UP_PX = 45

SHAFT_ROWS = 6
ISCHIUM_MIN_RUN_PX = 6
ISCHIUM_GAP_PX = 8
ISCHIUM_SEARCH_TOP_FRAC = 1 / 3
ISCHIUM_MAX_X_FRAC = 0.42
TIP_SLACK_PX = 3
ISCHIUM_REL_THRESHOLD = 0.5
ISCHIUM_ABOVE_BACKGROUND = 8.0
ISCHIUM_MAX_EXTEND_PX = 15

IMPLANT_SATURATION = 250
METAL_LEVEL_CAP = 245
IMPLANT_BLOB_PX = 3000

OVERLAY_SCALE = 2
CLAHE_CLIP_LIMIT = 3.0
CLAHE_TILE_GRID = (8, 8)


@dataclasses.dataclass
class Margins:
    top_cm: float
    bottom_cm: Optional[float]
    side_cm: float
    ok_top: bool
    ok_bottom: bool
    ok_side: bool
    flipped: bool
    apex: tuple
    lateral: tuple
    ischium: Optional[tuple]
    reliable: bool = True
    note: str = ""
    implant: bool = False
    image_shape: tuple = dataclasses.field(repr=False, default=None)

    @property
    def ok(self) -> bool:
        return self.ok_top and self.ok_bottom and self.ok_side

    @property
    def violations(self) -> list[str]:
        bottom = "низ: седалищная кость не найдена" if self.bottom_cm is None else "низ < 3 см"
        names = (("ok_top", "верх < 3 см"), ("ok_bottom", bottom), ("ok_side", "бок < 2 см"))
        return [text for attr, text in names if not getattr(self, attr)]


def imread_gray(path: str) -> np.ndarray:
    with open(path, "rb") as f:
        buf = np.frombuffer(f.read(), dtype="uint8")
    return cv2.imdecode(buf, cv2.IMREAD_GRAYSCALE)


def to_canonical(image: np.ndarray, side: str) -> tuple[np.ndarray, bool]:
    """Боковая сторона бедра — справа. Для image_right зеркалим снимок."""
    if side == "image_right":
        return image[:, ::-1].copy(), True
    return image, False


def bone_mask_full(img: np.ndarray) -> tuple[np.ndarray, np.ndarray, float, float]:
    smooth = gaussian_filter(img.astype(np.float32), MASK_SMOOTH_SIGMA)
    seeds = segment_bone(img) > 0
    tissue = seeds & (img < METAL_LEVEL_CAP)
    level = float(np.median(smooth[tissue if tissue.sum() > 200 else seeds]))
    ring = cv2.dilate(seeds.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=BACKGROUND_RING_PX) > 0
    background = float(np.percentile(smooth[~ring], BACKGROUND_PERCENTILE)) if (~ring).sum() > 200 else 0.0
    threshold = background + max(MASK_MIN_THRESHOLD, MASK_REL_THRESHOLD * (level - background))
    _, labels, stats, _ = cv2.connectedComponentsWithStats((smooth >= threshold).astype(np.uint8), connectivity=8)
    keep = set(np.unique(labels[seeds]).tolist())
    # тёмный ореол вокруг металла эндопротеза отрывает часть кости от ядра — берём и другие крупные области
    keep |= {k for k in range(1, len(stats)) if stats[k, cv2.CC_STAT_AREA] >= MIN_EXTRA_COMPONENT_PX}
    keep.discard(0)
    return np.isin(labels, list(keep)), smooth, threshold, background


def bone_mask(img: np.ndarray) -> np.ndarray:
    return bone_mask_full(img)[0]


def _runs(row: np.ndarray, gap: int = 3) -> list[tuple[int, int]]:
    xs = np.nonzero(row)[0]
    if not len(xs):
        return []
    breaks = np.nonzero(np.diff(xs) > gap)[0]
    starts = np.concatenate([[xs[0]], xs[breaks + 1]])
    ends = np.concatenate([xs[breaks], [xs[-1]]])
    return list(zip(starts.tolist(), ends.tolist()))


def _find_ischium(mask: np.ndarray, smooth: np.ndarray, threshold: float, background: float) -> Optional[tuple[float, float]]:
    h, _w = mask.shape
    shaft = []
    for y in range(h - SHAFT_ROWS, h):
        runs = _runs(mask[y])
        if runs:
            shaft.append(max(runs, key=lambda r: r[1] - r[0]))
    if not shaft:
        return None
    prev = (int(np.median([r[0] for r in shaft])), int(np.median([r[1] for r in shaft])))
    for y in range(h - 1, int(h * ISCHIUM_SEARCH_TOP_FRAC), -1):
        runs = _runs(mask[y])
        if not runs:
            continue
        overlap = [(min(r[1], prev[1]) - max(r[0], prev[0]), r) for r in runs]
        best_overlap, on_shaft = max(overlap, key=lambda t: t[0])
        if best_overlap <= 0:
            continue
        prev = on_shaft
        separate = [r for r in runs if r[1] < on_shaft[0] - ISCHIUM_GAP_PX and r[1] - r[0] + 1 >= ISCHIUM_MIN_RUN_PX
                    and (r[0] + r[1]) / 2 < ISCHIUM_MAX_X_FRAC * _w]
        if separate:
            return _lowest_point(mask, smooth, threshold, background, separate[-1], y, on_shaft[0])
    return None


def _lowest_point(mask: np.ndarray, smooth: np.ndarray, threshold: float, background: float, run: tuple[int, int], y: int,
                  shaft_left: int) -> tuple[float, float]:
    """Спуск по куску кости левее диафиза до его самой нижней строки. Кость низкой плотности
    обрезается общим порогом выше видимого края, поэтому для тусклого куска порог снижается до
    половины его яркости (но не выше общего). Диафиз исключён жёсткой границей справа."""
    h, w = mask.shape
    tip = smooth[max(0, y - 5):y + 1, run[0]:run[1] + 1]
    local = max(background + ISCHIUM_ABOVE_BACKGROUND, min(threshold, ISCHIUM_REL_THRESHOLD * float(np.median(tip[tip >= threshold] if (tip >= threshold).any() else tip))))
    grow = smooth >= local
    right_bound = shaft_left - ISCHIUM_GAP_PX // 2
    limit = ISCHIUM_MAX_X_FRAC * w
    cur = run
    bottom = y
    for yy in range(y + 1, min(h, y + 1 + ISCHIUM_MAX_EXTEND_PX)):
        nxt = [r for r in _runs(grow[yy], gap=1)
               if r[1] <= right_bound and (r[0] + r[1]) / 2 < limit
               and min(r[1], cur[1] + TIP_SLACK_PX) - max(r[0], cur[0] - TIP_SLACK_PX) >= 0]
        if not nxt:
            break
        cur = max(nxt, key=lambda r: min(r[1], cur[1]) - max(r[0], cur[0]))
        bottom = yy
    return (cur[0] + cur[1]) / 2, float(bottom)


def _descend_tip(mask: np.ndarray, run: tuple[int, int], y: int) -> tuple[float, float]:
    """Кончик седалищной кости сужается до нескольких пикселей и не проходит по ширине, поэтому
    от найденной строки спускаемся по тому же куску кости до его самого нижнего пикселя."""
    h = mask.shape[0]
    limit = ISCHIUM_MAX_X_FRAC * mask.shape[1]
    while y + 1 < h:
        nxt = [r for r in _runs(mask[y + 1], gap=1) if min(r[1], run[1] + TIP_SLACK_PX) - max(r[0], run[0] - TIP_SLACK_PX) >= 0
               and (r[0] + r[1]) / 2 < limit]
        if not nxt:
            break
        run = max(nxt, key=lambda r: min(r[1], run[1]) - max(r[0], run[0]))
        y += 1
    return (run[0] + run[1]) / 2, float(y)


def _metal_suspected(img: np.ndarray) -> bool:
    """Крупное насыщенное пятно (металл эндопротеза). Отступы при этом считаются как обычно
    (кость вокруг металла остаётся); флаг нужен только для информации. Небольшой металл
    (чашка и тонкая ножка) по яркости и форме не отличить от яркой корковой кости."""
    n, _, stats, _ = cv2.connectedComponentsWithStats((img >= IMPLANT_SATURATION).astype(np.uint8), connectivity=8)
    return n > 1 and int(stats[1:, cv2.CC_STAT_AREA].max()) >= IMPLANT_BLOB_PX


def measure_margins(image_u8: np.ndarray, side: str) -> Margins:
    img, flipped = to_canonical(image_u8, side)
    h, w = img.shape
    mask, smooth, threshold, background = bone_mask_full(img)

    upper = mask[: int(LATERAL_ROWS_FRAC * h)]
    x_lat = int(np.nonzero(upper.any(axis=0))[0].max())
    y_lat = float(np.nonzero(upper[:, x_lat])[0].mean())
    lateral = (float(x_lat), y_lat)

    y0, x0 = max(0, int(y_lat) - APEX_UP_PX), max(0, x_lat - APEX_LEFT_PX)
    apex = None
    notes = []
    for x in range(x0, x_lat + 1):
        ys = np.nonzero(mask[y0:int(y_lat) + 1, x])[0]
        if not len(ys) or ys[0] == 0:
            continue
        if apex is None or y0 + ys[0] < apex[1]:
            apex = (float(x), float(y0 + ys[0]))
    if apex is None:
        apex = (float(x_lat), y_lat - APEX_FALLBACK_UP_PX)
        notes.append("не найдена верхушка вертела")
    implant = _metal_suspected(img)

    ischium = _find_ischium(mask, smooth, threshold, background)

    top_cm = apex[1] * MM_PER_PX_Y / 10
    side_cm = (w - 1 - lateral[0]) * MM_PER_PX_X / 10
    bottom_cm = None if ischium is None else (h - 1 - ischium[1]) * MM_PER_PX_Y / 10
    if top_cm <= 0:
        notes.append("верхний отступ <= 0")
    return Margins(top_cm, bottom_cm, side_cm, top_cm >= MIN_TOP_CM,
                   bottom_cm is not None and bottom_cm >= MIN_BOTTOM_CM, side_cm >= MIN_SIDE_CM,
                   flipped, apex, lateral, ischium, not notes, "; ".join(notes), implant, (h, w))


def draw_overlay(image_u8: np.ndarray, side: str, m: Margins) -> np.ndarray:
    img, _ = to_canonical(image_u8, side)
    s = OVERLAY_SCALE
    h, w = img.shape
    eq = cv2.createCLAHE(clipLimit=CLAHE_CLIP_LIMIT, tileGridSize=CLAHE_TILE_GRID).apply(img)
    vis = cv2.cvtColor(cv2.resize(eq, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC), cv2.COLOR_GRAY2BGR)
    good, bad = (0, 200, 0), (0, 0, 255)
    P = lambda p: (int(p[0] * s), int(p[1] * s))

    def arrow(a, b, ok, label):
        color = good if ok else bad
        cv2.arrowedLine(vis, P(a), P(b), color, 2, cv2.LINE_AA, tipLength=0.08)
        cv2.arrowedLine(vis, P(b), P(a), color, 2, cv2.LINE_AA, tipLength=0.08)
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        cv2.putText(vis, label, (int(mid[0] * s) + 6, int(mid[1] * s)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2, cv2.LINE_AA)

    arrow((m.apex[0], 0), m.apex, m.ok_top, f"{m.top_cm:.1f} sm")
    arrow(m.lateral, (w - 1, m.lateral[1]), m.ok_side, f"{m.side_cm:.1f} sm")
    if m.ischium is not None:
        arrow(m.ischium, (m.ischium[0], h - 1), m.ok_bottom, f"{m.bottom_cm:.1f} sm")
    for p in (m.apex, m.lateral) + ((m.ischium,) if m.ischium is not None else ()):
        cv2.circle(vis, P(p), 4, (0, 165, 255), -1, cv2.LINE_AA)
    text = "OK" if m.ok else "NARUSHENIE: " + ", ".join(
        v.replace("верх", "top").replace("низ", "bottom").replace("бок", "side").replace("см", "cm")
         .replace(": седалищная кость не найдена", " (ischium not found)") for v in m.violations)
    cv2.putText(vis, text, (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55, good if m.ok else bad, 2, cv2.LINE_AA)
    if m.implant:
        cv2.putText(vis, "IMPLANT (metal)", (6, 38), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 165, 255), 2, cv2.LINE_AA)
    if not m.reliable:
        cv2.putText(vis, "UNRELIABLE (no apex)", (6, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 165, 255), 2, cv2.LINE_AA)
    return vis


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", required=True, help="manifest.csv из training_package (берутся снимки region=hip)")
    parser.add_argument("--images", required=True, help="папка с PNG (training_package/images)")
    parser.add_argument("--out", default="hip_roi_out", help="папка для картинок и CSV")
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    rows = []
    for r in csv.DictReader(open(args.manifest, encoding="utf-8")):
        if r["region"] != "hip":
            continue
        img = imread_gray(os.path.join(args.images, r["image_filename"]))
        m = measure_margins(img, r["side"])
        ok, buf = cv2.imencode(".png", draw_overlay(img, r["side"], m))
        with open(os.path.join(args.out, os.path.splitext(r["image_filename"])[0] + "_roi.png"), "wb") as f:
            f.write(buf.tobytes())
        rows.append(dict(image=r["image_filename"], side=r["side"], top_cm=round(m.top_cm, 2),
                         bottom_cm="" if m.bottom_cm is None else round(m.bottom_cm, 2), side_cm=round(m.side_cm, 2),
                         roi_ok=int(m.ok), reliable=int(m.reliable), implant=int(m.implant), note=m.note, violations="; ".join(m.violations)))
    with open(os.path.join(args.out, "hip_roi_results.csv"), "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    print(f"Готово: {len(rows)} снимков -> {args.out}; с нарушением отступов: {sum(1 - r['roi_ok'] for r in rows)}")


if __name__ == "__main__":
    main()
