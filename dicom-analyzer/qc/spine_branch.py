"""Ветка «позвоночник»: ось, подвздошные кости (голосование), посторонние предметы."""
from __future__ import annotations

import math

import cv2
import numpy as np

from .hub import ModelHub
from .types import Criterion
from . import crest_math

import classify                # vendor
import spine_axis              # vendor

AXIS_TOL_DEG = spine_axis.AXIS_TOLERANCE_DEG      # 5°

# --- подвздошный гребень: математический голос (НЕ откалиброван на разметке, порог ориентировочный) ---


def axis_criterion(img: np.ndarray) -> Criterion:
    r = spine_axis.analyze(img)
    if r.angle_deg is None:
        return Criterion("spine_axis", None, source="math", note=r.note)
    pts = {}
    if r.top_span and r.bottom_span:            # две точки сверху и две снизу — края столба кости на крайних рядах
        pts = {"top_left": [r.top_span[0], r.top_y], "top_right": [r.top_span[1], r.top_y],
               "bottom_left": [r.bottom_span[0], r.bottom_y], "bottom_right": [r.bottom_span[1], r.bottom_y]}
    ok = int(abs(r.angle_deg) <= AXIS_TOL_DEG)
    return Criterion("spine_axis", ok, "math", float(r.angle_deg), "deg", points=pts)


def _squares(shape, present):
    """Окно, в котором ищется гребень, одного размера для обеих сторон (как рисовал ноутбук): левое прижато к нижнему левому углу кадра, правое к нижнему правому.
    Отдаём размер окна (px) и есть ли гребень слева/справа."""
    h, w = shape
    return {"width_px": float(int(crest_math.SIDE_FRAC * w)), "height_px": float(h - int(crest_math.CROP_TOP_FRAC * h)),
            "left_ok": bool(present["left"]), "right_ok": bool(present["right"])}


def pelvis_criterion(img: np.ndarray, hub: ModelHub) -> Criterion:
    """Подвздошные гребни: по каждой стороне голосуют доступные методы (keypoint-модель, классификатор «гребень в окне», математика); решение по большинству
    (все три -> 2 из 3). Пороги — из pelvis_crest_gate.json. Точка отдаётся, если решено «гребень есть» и keypoint-модель подключена (координату даёт она)."""
    kp, cls = hub.get("pelvis_crest"), hub.get("pelvis_presence")
    gate = hub.gate("pelvis_crest_gate.json") or {}
    math_thr = float(gate.get("math_threshold", crest_math.MATH_THRESHOLD))
    kp_out = kp.predict(img) if kp else None
    cls_out = cls.predict(img) if cls else None
    edges = crest_math.spine_edges(img)
    pts, conf, present = {}, {}, {}
    for side in ("left", "right"):
        v = [crest_math.math_score(img, side, edges) >= math_thr]
        if kp_out is not None:
            x, y, p = kp_out[side]
            conf[side] = float(p)
            v.append(p >= kp.thr)
        if cls_out is not None:
            v.append(cls_out[side] >= cls.thr)
        present[side] = sum(v) >= len(v) // 2 + 1                          # большинство доступных голосов
        if present[side] and kp_out is not None:
            pts[f"crest_{side}"] = [float(kp_out[side][0]), float(kp_out[side][1])]
    ok = int(present["left"] and present["right"])
    return Criterion("pelvis_crest", ok, "vote", points=pts, details={"confidence": conf, "square": _squares(img.shape, present)})


def foreign_criterion(img: np.ndarray, hub: ModelHub) -> Criterion:
    """Посторонние предметы (дужки лифчика, застёжки): сегментация верха кадра + очистка масок (как в ноутбуке).
    «ПРЕДМЕТ» (осталась красная маска дужки) -> ok 0, красный; «проверить» (только зелёная область, застёжка) -> ok 0, жёлтый (слабее: подсказка); «чисто» -> ok 1."""
    m = hub.get("foreign_seg")
    if m is None:
        return Criterion("foreign_objects", None, source="none", note="модель сегментации не подключена")
    out = m.predict(img)
    regions = []
    for key in ("wire", "object"):
        cnts, _ = cv2.findContours(out["masks"][key].astype("uint8"), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        regions += [c[:, 0, :].tolist() for c in cnts if len(c) >= 3]
    verdict = out["verdict"]
    if verdict == "чисто":
        return Criterion("foreign_objects", 1, "model", regions=regions, details={"verdict": verdict})
    return Criterion("foreign_objects", 0, "model", regions=regions, details={"verdict": verdict})


def analyze_spine(img: np.ndarray, hub: ModelHub) -> list[Criterion]:
    return [axis_criterion(img), pelvis_criterion(img, hub), foreign_criterion(img, hub)]
