"""
Ось позвоночника: угол прямой между горизонтальными центрами столба в
САМОМ ВЕРХНЕМ и САМОМ НИЖНЕМ ряду пикселей снимка (методика экспертов),
отсчитанный от вертикали (перпендикуляра к нижнему краю снимка).

Пациент лежит ровно, поэтому верхний край верхнего позвонка и нижний край
нижнего — это края снимка; искривление (сколиоз) посередине на угол не
влияет: берутся только границы столба в крайнем ряду.

1. Маска кости — segment_bone из classify.py (CLAHE + Otsu + наибольшая
   связная область). Она очерчивает столб позвонков целиком.
2. В середине снимка маска чисто очерчивает позвонки: там берём левый и
   правый край столба (медиана по строкам) и его ширину.
3. От середины к верхнему и к нижнему краю снимка края столба ведутся
   построчно: каждая граница сдвигается за маской не больше чем на
   TRACK_STEP_PX за строку, а столб не может стать шире TRACK_WIDTH_CAP от
   исходной ширины. Так, когда у края к столбу подключаются рёбра или
   крылья таза (маска там сливается с ними), граница продолжает идти по
   позвонку, а не по соседней кости. Вырез крестца и тёмная "дырка"
   позвонка не мешают: учитываются все отрезки маски, перекрывающие столб.
4. Центр края = середина между левой и правой границей (по расстоянию),
   медиана по последним EDGE_USE_ROWS строкам у самого края снимка.
   Верхний край дополнительно уточняется по профилю яркости в REFINE_ROWS
   строках: границы — пара самых резких перепадов (подъём слева, спад
   справа) вокруг найденного центра. К позвонку сверху в маске липнут
   серые рёбра и мягкие ткани, а резче всего перепад именно на краю самого
   позвонка. Для нижнего края уточнение ухудшает результат (таз, вырез
   крестца), поэтому там границы берутся по маске.
5. Угол = atan2(x_низ - x_верх, y_низ - y_верх). Знак: "+" — нижний центр
   правее верхнего. Норма по ТЗ: |угол| <= 5°.

Сверка с экспертной колонкой "ось" из разметка.xlsx (99 снимков, 10
нарушений): AUC по |углу| ~0.82, при пороге 5° алгоритм отмечает 10
снимков. Прежний подбор по яркости давал AUC 0.90, но у нижнего края
центр уезжал на левую/правую часть позвонка или на подвздошную кость, а
глазами эта версия точнее — колонка "ось" неточная опора, поэтому
решающим считался просмотр снимков (в том числе со сколиозом).

Использование:
    python spine_axis.py <файл|папка> [--manifest manifest.csv] [--out папка] [--sheet]
"""

from __future__ import annotations

import argparse
import csv
import dataclasses
import glob
import math
import os
from typing import Optional

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter, gaussian_filter1d

from classify import segment_bone

AXIS_TOLERANCE_DEG = 5.0

REF_BRIDGE_PX = 21
SEED_SPAN = (0.45, 0.55)
TRACK_STEP_PX = 3
TRACK_MARGIN_PX = 3
TRACK_WIDTH_CAP = 1.35
BRIGHT_FRAC = 0.5
BRIGHT_PERCENTILE = 60
SMOOTH_SIGMA = 1.5
EDGE_USE_ROWS = 16
REFINE_ROWS = 30
REFINE_SMOOTH = 3.0
REFINE_WIDTH_RANGE = (0.7, 1.5)
REFINE_CENTER_SHIFT = 0.3
REFINE_ENDS = ("top",)

OVERLAY_SCALE = 2
CLAHE_CLIP_LIMIT = 3.0
CLAHE_TILE_GRID = (8, 8)


@dataclasses.dataclass
class AxisResult:
    angle_deg: Optional[float]
    top_x: Optional[float]
    top_y: Optional[float]
    bottom_x: Optional[float]
    bottom_y: Optional[float]
    note: str
    top_span: Optional[tuple] = dataclasses.field(repr=False, default=None)
    bottom_span: Optional[tuple] = dataclasses.field(repr=False, default=None)
    mask: Optional[np.ndarray] = dataclasses.field(repr=False, default=None)


def imread_gray(path: str) -> np.ndarray:
    if path.lower().endswith(".dcm"):
        from classify import load_pixel_array
        return load_pixel_array(path)
    with open(path, "rb") as f:
        buf = np.frombuffer(f.read(), dtype="uint8")
    return cv2.imdecode(buf, cv2.IMREAD_GRAYSCALE)


def central_run(row: np.ndarray, center: float, bridge: float) -> Optional[tuple[int, int]]:
    """Отрезок маски в строке, ближайший к центру кадра (при равенстве — шире);
    разрывы не шире bridge склеиваются."""
    xs = np.nonzero(row)[0]
    if len(xs) == 0:
        return None
    breaks = np.nonzero(np.diff(xs) > 1)[0]
    starts = np.concatenate([[xs[0]], xs[breaks + 1]])
    ends = np.concatenate([xs[breaks], [xs[-1]]])
    merged = [[starts[0], ends[0]]]
    for a, b in zip(starts[1:], ends[1:]):
        if a - merged[-1][1] - 1 <= bridge:
            merged[-1][1] = b
        else:
            merged.append([a, b])
    runs = np.array(merged)
    inside = (runs[:, 0] <= center) & (center <= runs[:, 1])
    dist = np.where(inside, 0.0, np.minimum(np.abs(runs[:, 0] - center), np.abs(runs[:, 1] - center)))
    k = np.lexsort((-(runs[:, 1] - runs[:, 0]), dist))[0]
    return int(runs[k, 0]), int(runs[k, 1])


def seed_edges(mask: np.ndarray) -> Optional[tuple[int, int]]:
    """Левый и правый край столба в середине снимка (медиана по строкам)."""
    h, w = mask.shape
    lefts, rights = [], []
    for y in range(int(SEED_SPAN[0] * h), int(SEED_SPAN[1] * h) + 1):
        run = central_run(mask[y], w / 2, REF_BRIDGE_PX)
        if run is not None:
            lefts.append(run[0])
            rights.append(run[1])
    if not lefts:
        return None
    return int(np.median(lefts)), int(np.median(rights))


def raw_runs(row: np.ndarray) -> list[tuple[int, int]]:
    xs = np.nonzero(row)[0]
    if len(xs) == 0:
        return []
    breaks = np.nonzero(np.diff(xs) > 1)[0]
    starts = np.concatenate([[xs[0]], xs[breaks + 1]])
    ends = np.concatenate([xs[breaks], [xs[-1]]])
    return list(zip(starts.tolist(), ends.tolist()))


def refine_edges(intensity: np.ndarray, top: bool, center: float, seed_width: float) -> Optional[tuple[float, float]]:
    """Левый и правый край столба в полосе у края снимка — пара самых резких
    перепадов яркости (подъём слева, спад справа) вокруг center, с шириной в
    пределах ширины столба. Серые рёбра и мягкие ткани, слипшиеся с позвонком
    в маске, дают более слабый перепад, чем сам край позвонка."""
    h, w = intensity.shape
    rows = slice(0, REFINE_ROWS) if top else slice(h - REFINE_ROWS, h)
    grad = np.gradient(gaussian_filter1d(intensity[rows].mean(axis=0), REFINE_SMOOTH))
    best, best_score = None, -np.inf
    for width in range(int(REFINE_WIDTH_RANGE[0] * seed_width), int(REFINE_WIDTH_RANGE[1] * seed_width) + 1):
        for left in range(int(center - width / 2 - REFINE_CENTER_SHIFT * seed_width),
                          int(center - width / 2 + REFINE_CENTER_SHIFT * seed_width) + 1):
            right = left + width
            if left < 0 or right >= w:
                continue
            score = grad[left] - grad[right]
            if score > best_score:
                best, best_score = (float(left), float(right)), score
    return best


def edge_center(mask: np.ndarray, intensity: np.ndarray, top: bool,
                seed: tuple[int, int]) -> tuple[float, float, tuple[float, float]]:
    """Ведёт края столба от середины к верхнему/нижнему краю снимка и возвращает
    (x центра, y, (левый край, правый край)) в крайних строках."""
    h, _w = mask.shape
    left, right = seed
    max_width = TRACK_WIDTH_CAP * (right - left + 1)
    ys = range(h // 2 - 1, -1, -1) if top else range(h // 2 + 1, h)

    trace = []
    for y in ys:
        row = mask[y]
        if BRIGHT_FRAC > 0:
            level = np.percentile(intensity[y, left:right + 1], BRIGHT_PERCENTILE)
            row = row & (intensity[y] >= BRIGHT_FRAC * level)
        near = [(a, b) for a, b in raw_runs(row) if b >= left - TRACK_MARGIN_PX and a <= right + TRACK_MARGIN_PX]
        if near:
            new_left = min(max(min(a for a, _ in near), left - TRACK_STEP_PX), left + TRACK_STEP_PX)
            new_right = min(max(max(b for _, b in near), right - TRACK_STEP_PX), right + TRACK_STEP_PX)
            if new_right - new_left + 1 > max_width:
                new_left, new_right = max(new_left, left), min(new_right, right)
            left, right = new_left, new_right
        trace.append((y, left, right))

    last = trace[-EDGE_USE_ROWS:]
    centers = [(l + r) / 2 for _, l, r in last]
    x_center = float(np.median(centers))
    y_center = float(np.mean([y for y, _, _ in last]))
    span = (float(np.median([l for _, l, _ in last])), float(np.median([r for _, _, r in last])))
    if ("top" if top else "bottom") in REFINE_ENDS:
        refined = refine_edges(intensity, top, x_center, seed[1] - seed[0] + 1)
        if refined is not None:
            span = refined
            x_center = (refined[0] + refined[1]) / 2
    return x_center, y_center, span


def axis_angle_deg(top: tuple[float, float], bottom: tuple[float, float]) -> float:
    return math.degrees(math.atan2(bottom[0] - top[0], bottom[1] - top[1]))


def analyze(image_u8: np.ndarray) -> AxisResult:
    mask = segment_bone(image_u8) > 0
    eq = cv2.createCLAHE(clipLimit=CLAHE_CLIP_LIMIT, tileGridSize=CLAHE_TILE_GRID).apply(image_u8)
    intensity = gaussian_filter(eq.astype(np.float32), SMOOTH_SIGMA)

    seed = seed_edges(mask)
    if seed is None:
        return AxisResult(None, None, None, None, None, "не найден столб кости в маске", mask=mask)

    top = edge_center(mask, intensity, True, seed)
    bottom = edge_center(mask, intensity, False, seed)
    return AxisResult(axis_angle_deg(top[:2], bottom[:2]), top[0], top[1], bottom[0], bottom[1], "ok",
                      top[2], bottom[2], mask)


def draw_overlay(image_u8: np.ndarray, result: AxisResult) -> np.ndarray:
    s = OVERLAY_SCALE
    eq = cv2.createCLAHE(clipLimit=CLAHE_CLIP_LIMIT, tileGridSize=CLAHE_TILE_GRID).apply(image_u8)
    vis = cv2.cvtColor(cv2.resize(eq, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC), cv2.COLOR_GRAY2BGR)
    h, _w = image_u8.shape

    if result.mask is not None:
        big_mask = cv2.resize(result.mask.astype(np.uint8), None, fx=s, fy=s, interpolation=cv2.INTER_NEAREST)
        contours, _ = cv2.findContours(big_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        cv2.drawContours(vis, contours, -1, (0, 200, 0), 1)

    if result.angle_deg is None:
        cv2.putText(vis, result.note, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 255), 1, cv2.LINE_AA)
        return vis

    for (left, right), y in ((result.top_span, result.top_y), (result.bottom_span, result.bottom_y)):
        yy = int(y * s)
        cv2.line(vis, (int(left * s), yy), (int(right * s), yy), (255, 255, 0), 2, cv2.LINE_AA)
        for x in (left, right):
            cv2.line(vis, (int(x * s), yy - 6), (int(x * s), yy + 6), (255, 255, 0), 2, cv2.LINE_AA)

    top = (int(result.top_x * s), int(result.top_y * s))
    bot = (int(result.bottom_x * s), int(result.bottom_y * s))
    cv2.line(vis, (top[0], top[1]), (top[0], bot[1]), (0, 255, 255), 1, cv2.LINE_AA)
    cv2.line(vis, top, bot, (0, 0, 255), 2, cv2.LINE_AA)
    for p in (top, bot):
        cv2.circle(vis, p, 5, (0, 165, 255), -1, cv2.LINE_AA)
        cv2.circle(vis, p, 5, (0, 0, 0), 1, cv2.LINE_AA)

    verdict = "OK" if abs(result.angle_deg) <= AXIS_TOLERANCE_DEG else "> 5 deg"
    cv2.putText(vis, f"{result.angle_deg:+.1f} deg  {verdict}", (8, h * s - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 255), 2, cv2.LINE_AA)
    return vis


def _collect_paths(path: str, manifest: Optional[str]) -> list[str]:
    if os.path.isfile(path):
        return [path]
    if manifest:
        with open(manifest, encoding="utf-8") as f:
            names = [r["image_filename"] for r in csv.DictReader(f) if r["region"] == "spine"]
        return [os.path.join(path, n) for n in names]
    found = []
    for ext in ("*.png", "*.dcm"):
        found += glob.glob(os.path.join(path, "**", ext), recursive=True)
    return sorted(found)


def _contact_sheet(overlays: list[np.ndarray], cols: int = 4) -> np.ndarray:
    hmax = max(o.shape[0] for o in overlays)
    wmax = max(o.shape[1] for o in overlays)
    tiles = [cv2.copyMakeBorder(o, 0, hmax - o.shape[0], 0, wmax - o.shape[1], cv2.BORDER_CONSTANT, value=0)
             for o in overlays]
    while len(tiles) % cols:
        tiles.append(np.zeros_like(tiles[0]))
    return np.vstack([np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("path", help="PNG/DICOM файл или папка с изображениями")
    parser.add_argument("--manifest", help="manifest.csv из training_package — брать только region=spine")
    parser.add_argument("--out", default="spine_axis_out", help="папка для картинок и CSV")
    parser.add_argument("--sheet", action="store_true", help="дополнительно собрать общий контактный лист")
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    rows, overlays = [], []
    for p in _collect_paths(args.path, args.manifest):
        name = os.path.splitext(os.path.basename(p))[0]
        try:
            img = imread_gray(p)
            result = analyze(img)
            overlay = draw_overlay(img, result)
        except Exception as exc:  # noqa: BLE001 — CLI-диагностика
            print(f"{name}\tERROR\t{exc}")
            continue
        ok, buf = cv2.imencode(".png", overlay)
        with open(os.path.join(args.out, f"{name}_axis.png"), "wb") as f:
            f.write(buf.tobytes())
        overlays.append(overlay)

        found = result.angle_deg is not None
        rows.append(dict(
            image=os.path.basename(p),
            angle_deg=round(result.angle_deg, 2) if found else None,
            axis_ok=abs(result.angle_deg) <= AXIS_TOLERANCE_DEG if found else None,
            top_x=round(result.top_x, 1) if found else None,
            top_y=round(result.top_y, 1) if found else None,
            bottom_x=round(result.bottom_x, 1) if found else None,
            bottom_y=round(result.bottom_y, 1) if found else None,
            note=result.note,
        ))
        print(f"{name}\tугол={'—' if not found else format(result.angle_deg, '+.1f') + '°'}\t{result.note}")

    if rows:
        with open(os.path.join(args.out, "spine_axis_results.csv"), "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)
    if args.sheet and overlays:
        ok, buf = cv2.imencode(".png", _contact_sheet(overlays))
        with open(os.path.join(args.out, "sheet.png"), "wb") as f:
            f.write(buf.tobytes())
    print(f"Готово: {len(rows)} снимков -> {args.out}")


if __name__ == "__main__":
    main()
