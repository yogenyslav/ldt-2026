"""Голосование критериев для классификатора региона: сеть + математика (маска кости и периодичность, classify.py) + ширина снимка.
Самодостаточный файл (numpy, cv2, scipy): этот же текст встраивается в ноутбук train_region_classifier_vote.ipynb (build_train_region_vote_nb.py), одна версия кода на всё.

Голоса по региону (spine | hip):
  1) сеть: класс из {spine, hip_left, hip_right} -> регион; уверенность сети отдельно;
  2) математика: маска кости (CLAHE + Otsu + наибольшая компонента) -> число вертикальных пиков ширины кости: >= 6 позвоночник, иначе бедро; сторона бедра по смещению массы кости в верхней трети кадра;
  3) ширина снимка: 300±5 -> spine, 280±5 -> hip, другая ширина -> воздерживается (2 из 252 бёдер имеют 248).
Итог: регион, за который проголосовало не меньше двух; при ничьей (один воздержался) решает сеть, а без сети — математика. Сторона бедра: если сеть и математика согласны — она; при разногласии побеждает тот, у кого выше уверенность (у сети — её вероятность, у математики 0.5 + 0.7·|смещение массы|); если регион сети не совпал с итоговым — математика.
"""
import cv2
import numpy as np
from scipy.signal import find_peaks

SPINE_WIDTHS = (300,)
HIP_WIDTHS = (280,)
WIDTH_TOL = 5                   # допуск по ширине, px
CLAHE_CLIP_LIMIT = 3.0
CLAHE_TILE_GRID = (8, 8)
PEAK_SMOOTH_WINDOW = 7
PEAK_PROMINENCE = 0.05
PEAK_MIN_DISTANCE = 6
SPINE_PEAK_THRESHOLD = 6        # >= этого числа пиков -> позвоночник
SIDE_TOP_FRACTION = 0.35        # верхняя часть кадра, по которой считается смещение массы кости
SIDE_CONF_SCALE = 0.7           # уверенность стороны по математике = 0.5 + 0.7·|смещение| (как side_margin_confidence в classify.py)


def segment_bone(image_u8):
    """Бинарная маска (0/255) наибольшей связной светлой области."""
    eq = cv2.createCLAHE(clipLimit=CLAHE_CLIP_LIMIT, tileGridSize=CLAHE_TILE_GRID).apply(image_u8)
    _, th = cv2.threshold(cv2.GaussianBlur(eq, (5, 5), 0), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    k = np.ones((3, 3), np.uint8)
    th = cv2.morphologyEx(cv2.morphologyEx(th, cv2.MORPH_OPEN, k), cv2.MORPH_CLOSE, k)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(th, connectivity=8)
    if n <= 1:
        return th
    return (labels == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype("uint8") * 255


def count_vertical_peaks(mask):
    w = (mask > 0).sum(axis=1).astype(float)
    if w.max() <= 0:
        return 0
    sm = np.convolve(w, np.ones(PEAK_SMOOTH_WINDOW) / PEAK_SMOOTH_WINDOW, mode="same")
    return len(find_peaks(sm / sm.max(), prominence=PEAK_PROMINENCE, distance=PEAK_MIN_DISTANCE)[0])


def mask_vote(img):
    """Математика: регион по периодичности кости и сторона бедра (image_left | image_right) по смещению массы в верхней части."""
    mask = segment_bone(img)
    n_peaks = count_vertical_peaks(mask)
    region = "spine" if n_peaks >= SPINE_PEAK_THRESHOLD else "hip"
    ys, xs = np.nonzero(mask[: int(mask.shape[0] * SIDE_TOP_FRACTION)])
    score = None if len(xs) == 0 else float((xs.mean() - mask.shape[1] / 2) / (mask.shape[1] / 2))
    side = None if score is None else ("image_left" if score < 0 else "image_right")
    return dict(region=region, n_peaks=int(n_peaks), side=side, side_score=score)


def width_vote(img):
    w = img.shape[1]
    if any(abs(w - x) <= WIDTH_TOL for x in SPINE_WIDTHS):
        return "spine"
    return "hip" if any(abs(w - x) <= WIDTH_TOL for x in HIP_WIDTHS) else None


def _region_of(label):
    return None if label is None else ("spine" if label == "spine" else "hip")


def vote(img, cnn_label=None, cnn_conf=None):
    """cnn_label: spine | hip_left | hip_right (или None, если модели нет). Возвращает итоговый класс, регион, стороны, голоса и согласие."""
    m = mask_vote(img)
    votes = {"cnn": _region_of(cnn_label), "mask": m["region"], "width": width_vote(img)}
    active = {k: v for k, v in votes.items() if v is not None}
    counts = {r: sum(1 for v in active.values() if v == r) for r in ("spine", "hip")}
    if counts["spine"] != counts["hip"]:
        region = max(counts, key=counts.get)
    else:                                                    # ничья: сеть, а без сети — математика
        region = votes["cnn"] or votes["mask"]
    agreement = counts[region] / len(active)
    cnn_side = {"hip_left": "image_left", "hip_right": "image_right"}.get(cnn_label)
    side = None
    if region == "hip":
        mask_conf = None if m["side_score"] is None else min(0.99, 0.5 + SIDE_CONF_SCALE * abs(m["side_score"]))     # уверенность математики: чем дальше масса кости от центра, тем увереннее
        if cnn_side and m["side"] and cnn_side != m["side"] and cnn_conf is not None:
            side = cnn_side if float(cnn_conf) >= mask_conf else m["side"]        # сторона: при разногласии побеждает тот, кто увереннее
        else:
            side = cnn_side if (votes["cnn"] == "hip" and cnn_side) else m["side"]
    label = "spine" if region == "spine" else ("hip_left" if side == "image_left" else "hip_right")      # side is None у бедра ловит пайплайн: fail
    conf = agreement if cnn_conf is None else 0.5 * agreement + 0.5 * float(cnn_conf)
    return dict(label=label, region=region, side=side, votes=votes, n_peaks=m["n_peaks"], side_mask=m["side"], agreement=float(agreement),
                unanimous=len(set(active.values())) == 1, confidence=float(conf))
