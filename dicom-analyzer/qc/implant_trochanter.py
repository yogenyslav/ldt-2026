"""Малый вертел у протеза («blob»-металл): расстояние и область по силуэту кости (маска фон/кость), БЕЗ обращения к яркости/металлу.
Живёт отдельно от vendor/lesser_trochanter_math.py (не трогаем общую математику) — только использует его как утилиты (bone_mask, track_eval, _peak_window, _half_width_bounds).

Метод (проверен на всех 3 протезах в данных: площадь совпала с экспертным полигоном — 2.43/2.49, 3.53/3.86, 3.29/3.40 см²):
  1) трасируем реальный край кости (граница фон/кость, маска) по всему треку снизу вверх;
  2) грубо (сильное сглаживание) находим, где на этой линии резкий излом — черновое окно бугра;
  3) выбрасываем строки этого окна (с запасом ROUGH_MARGIN) и соединяем чистый низ и чистый верх ПРЯМОЙ (интерполяция) — это и есть «как будто бугра нет»;
  4) настоящее превышение = эта прямая минус реальный край; область и расстояние — из него, ничего из яркости/металла не участвует.
Только для branch="implant" (крупный металл). Для стержневого импланта (branch="implant_edge") не подходит (пик не находится) — там остаётся _fit_edge_bump из vendor, не трогаем.
"""
from __future__ import annotations

import numpy as np
from scipy.ndimage import gaussian_filter1d
from scipy.signal import find_peaks

import lesser_trochanter_math as lt  # vendor: используем как утилиты, не меняем

ROUGH_SIGMA = 15     # черновое сглаживание, чтобы найти окно бугра (шаг 2)
ROUGH_MARGIN = 14    # запас вокруг чернового окна, который выбрасывается перед соединением прямой (шаг 3); подобран по 3 протезам, плато 10-18 даёт близкий результат


def measure(canon_img: np.ndarray, mask: np.ndarray, neck_y: float | None) -> dict | None:
    """Возвращает dict в формате, близком к lt._ridge_result (ys, edge, ridge=прямая-подстановка, ex, peak, peak_y, y0, y1, t, u), или None, если бугор не найден."""
    rows = lt.track_eval(mask)
    if len(rows) < 50:
        return None
    ys = np.array(sorted(rows))
    xm = np.array([rows[y][0] for y in ys], float)
    edge = gaussian_filter1d(xm, 1.5)                        # реальный край кости (лёгкое сглаживание шума пикселя)
    lt._NECK_Y[0] = float(neck_y) if neck_y is not None else None
    win = lt._peak_window(ys, lt.shaft_width(rows))
    lt._NECK_Y[0] = None

    rough_base = gaussian_filter1d(edge, ROUGH_SIGMA)
    rough_ex = np.clip(rough_base - edge, 0, None)
    pk, pr = find_peaks(rough_ex, prominence=lt.PROM_MM_RIDGE / lt.MM_X)
    keep = win[pk]
    pk, pr = pk[keep], {k: v[keep] for k, v in pr.items()}
    if len(pk) == 0:
        return None
    p = pk[int(np.argmax(pr["prominences"]))]
    t0, u0 = lt._half_width_bounds(rough_ex, p)
    t, u = max(0, t0 - ROUGH_MARGIN), min(len(ys) - 1, u0 + ROUGH_MARGIN)

    keep_idx = np.array([i for i in range(len(ys)) if i < t or i > u])
    if len(keep_idx) < 2:
        return None
    baseline = np.interp(np.arange(len(ys)), keep_idx, edge[keep_idx])   # прямая, соединяющая чистый низ и верх — «как будто бугра нет»
    ex = np.clip(baseline - edge, 0, None)
    pk2, pr2 = find_peaks(ex, prominence=lt.PROM_MM_RIDGE / lt.MM_X)
    keep2 = win[pk2]
    pk2, pr2 = pk2[keep2], {k: v[keep2] for k, v in pr2.items()}
    if len(pk2) == 0:
        return None
    p2 = pk2[int(np.argmax(pr2["prominences"]))]
    tt, uu = lt._half_width_bounds(ex, p2)
    return dict(ys=ys, edge=edge, ridge=baseline, ex=ex, base=0.0, peak=int(ys[p2]), peak_mm=float(ex[p2] * lt.MM_X),
               y0=int(ys[tt]), y1=int(ys[uu]), t=int(tt), u=int(uu),
               area_cm2=float(np.sum(np.clip(ex[tt:uu + 1], 0, None)) * lt.MM_X * lt.MM_Y / 100))


def region(res: dict, shape: tuple) -> np.ndarray:
    """Область для закраски (БЕЗ отступа на прорисовку — ширина на строке пика в точности равна peak_mm), тот же принцип, что и для обычной кости."""
    R = np.zeros(shape, bool)
    if res is None or res.get("peak") is None:
        return R
    ys = np.asarray(res["ys"]).astype(int)
    ex = np.clip(res["ex"], 0, None)
    edge = res["edge"]
    i = int(np.argmin(np.abs(ys - res["peak"])))
    pk = ex[i]
    if pk <= 0:
        return R
    t, u = res["t"], res["u"]
    for k in range(max(t - lt.REGION_PAD_ROWS, 0), min(u + lt.REGION_PAD_ROWS, len(ys) - 1) + 1):
        x0 = max(int(round(edge[k])), 0)
        x1 = max(int(round(edge[k] + ex[k])), 0)
        R[ys[k], x0:x1 + 1] = True
    return R
