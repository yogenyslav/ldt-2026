"""Математический голос «подвздошный гребень в кадре» — перенос из services/region_classifier/training/train_pelvis_crest_vote.ipynb (ячейки 25, 27, 39) без изменения логики.
Окно: нижняя треть кадра, боковой угол SIDE_FRAC; позвоночник в окне закрашивается построчно по маске столба (+9 px); балл = доля яркого (> MATH_REL от 90-го перцентиля кости)
в нижних MATH_ROWS строках внешней части окна. Порог MATH_THRESHOLD подобран по разметке (scripts: fit_crest_threshold.py)."""
from __future__ import annotations

import cv2
import numpy as np
import pandas as pd

CROP_TOP_FRAC = 0.667
SIDE_FRAC = 0.36
MATH_ROWS = 6
MATH_OUTER = 0.7
MATH_REL = 0.15
MATH_THRESHOLD = 0.0587       # fit_crest_threshold.py на 198 сторонах разметки: AUC 1.000, у «есть» мин 0.091, у «нет» макс 0.038 (порог = середина зазора; на тех же данных, честная оценка leave-one-image-out — в ноутбуке)


def spine_mask(img: np.ndarray) -> np.ndarray:
    sm = cv2.GaussianBlur(img.astype(np.float32), (0, 0), 1.5)
    h, w = img.shape
    cx0, cx1 = int(w * 0.25), int(w * 0.75)
    bg = np.percentile(sm[:, :int(w * 0.12)], 70) if w > 50 else 0
    col = sm[:, cx0:cx1]
    thr = bg + 0.5 * (np.percentile(col, 90) - bg)
    mask = (sm >= thr).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if n <= 1:
        return mask.astype(bool)
    best, best_area = 0, 0
    for k in range(1, n):
        x, y, bw, bh, area = stats[k]
        if x <= w // 2 <= x + bw and area > best_area:
            best, best_area = k, area
    return labels == best


def spine_edges(img: np.ndarray, margin: int = 9):
    h, w = img.shape
    sp = spine_mask(img)
    left = np.full(h, np.nan); right = np.full(h, np.nan)
    for y in range(h):
        xs = np.where(sp[y])[0]
        if len(xs):
            left[y] = xs.min() - margin
            right[y] = xs.max() + 1 + margin
    left = pd.Series(left).ffill().bfill().to_numpy()
    right = pd.Series(right).ffill().bfill().to_numpy()
    if np.isnan(left).any():
        left[:], right[:] = 0.36 * w, 0.64 * w
    return np.clip(left, 0.28 * w, 0.5 * w), np.clip(right, 0.5 * w, 0.72 * w)


def masked_window(img: np.ndarray, side: str, edges=None) -> np.ndarray:
    h, w = img.shape
    y0, wx = int(CROP_TOP_FRAC * h), int(SIDE_FRAC * w)
    x0, x1 = (0, wx) if side == "left" else (w - wx, w)
    win = img[y0:, x0:x1].copy()
    left_e, right_e = edges if edges is not None else spine_edges(img)
    rows = np.arange(y0, h)
    cols = np.arange(win.shape[1])[None, :]
    if side == "left":
        cut = np.clip(left_e[rows].astype(int) - x0, 0, win.shape[1]); win[cols >= cut[:, None]] = 0
    else:
        cut = np.clip(right_e[rows].astype(int) - x0, 0, win.shape[1]); win[cols < cut[:, None]] = 0
    return win if side == "left" else win[:, ::-1]


def math_score(img: np.ndarray, side: str, edges=None) -> float:
    win = masked_window(img, side, edges).astype(np.float32)
    sm = cv2.GaussianBlur(win, (0, 0), 1.5)
    ref = float(np.percentile(img[img > 0], 90)) if (img > 0).any() else 1.0
    bot = sm[-MATH_ROWS:, : int(MATH_OUTER * sm.shape[1])] > MATH_REL * ref
    return float(bot.mean())


def fit_threshold(pos, neg) -> float:
    lo, hi = (float(max(neg)) if len(neg) else 0.0), float(min(pos))
    return float(np.sqrt(max(lo, 1e-4) * hi)) if hi > lo else (lo + hi) / 2
