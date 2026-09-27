"""Отдельный, самостоятельный детектор импланта — не трогает основной алгоритм измерения.
Признак металла: пиксели насыщаются ЖЁСТКО до максимума сенсора (255), почти без разброса
и почти все ровно 255. Яркая плотная кость на этих снимках тоже может доходить до ~250-254,
но мягче: разброс (std) заметно больше и доля пикселей РОВНО 255 заметно меньше — проверено
на реальных данных (кость: std 2.6-3.2, доля 255 ~0.4-0.7; металл: std 1.2-2.2, доля 255 ~0.85-0.94).
"""
import cv2
import numpy as np

THRESH = 245          # порог для поиска кандидатных пятен (сам порог не решает — только std/frac255)
MIN_AREA_PX = 40
MAX_STD = 2.0
MIN_FRAC255 = 0.85

BLOB_MIN_PX = 3000     # крупное пятно металла (головка/большая ножка) — форма не важна
ROD_MIN_LEN_PX = 25    # тонкий стержень (винт/спица/тонкая ножка) — важна форма
ROD_MAX_WIDTH_PX = 22


def detect_implant(img: np.ndarray) -> tuple[bool, str]:
    sat = (img >= THRESH).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(sat, connectivity=8)
    if n <= 1:
        return False, "none"

    for k in range(1, n):
        area = stats[k, cv2.CC_STAT_AREA]
        if area < MIN_AREA_PX:
            continue
        ys, xs = np.where(labels == k)
        vals = img[ys, xs].astype(np.float32)
        # признак металла: жёсткое насыщение до 255, почти без разброса — проверяем ВСЕГДА,
        # и для крупных пятен, и для тонких стержней
        if vals.std() > MAX_STD or (vals == 255).mean() < MIN_FRAC255:
            continue

        if area >= BLOB_MIN_PX:
            return True, "blob"

        pts = np.column_stack([xs, ys]).astype(np.float32)
        (cx, cy), (w, h), angle = cv2.minAreaRect(pts)
        length, width = max(w, h), min(w, h)
        if length >= ROD_MIN_LEN_PX and width <= ROD_MAX_WIDTH_PX:
            return True, "rod"

    return False, "none"
