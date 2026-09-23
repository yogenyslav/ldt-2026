from __future__ import annotations
import dataclasses
import numpy as np

@dataclasses.dataclass
class RoiMarginsPx:
    top_px: float
    bottom_px: float
    lateral_px: float

@dataclasses.dataclass
class RoiResult:
    top_cm: float
    bottom_cm: float
    lateral_cm: float
    roi_violation: bool
    note: str = 'ПРОТОТИП, не в quality_class: масштаб есть (Exposed Area), но 0 положительных примеров в held-out — порог не проверен'

def margins_px(image_shape: tuple[int, int], keypoints, side: str) -> RoiMarginsPx | None:
    visible = [kp for kp in keypoints if kp.visible and kp.x is not None]
    if not visible:
        return None
    h, w = image_shape
    ys = [kp.y for kp in visible]
    xs = [kp.x for kp in visible]
    top_px = float(min(ys))
    bottom_px = float(h - max(ys))
    if side == 'image_left':
        lateral_px = float(min(xs))
    else:
        lateral_px = float(w - max(xs))
    return RoiMarginsPx(top_px=top_px, bottom_px=bottom_px, lateral_px=lateral_px)

def analyze(image_shape: tuple[int, int], keypoints, side: str, spacing_mm: float | None) -> RoiResult | None:
    margins = margins_px(image_shape, keypoints, side)
    if margins is None or not spacing_mm:
        return None
    top_cm = margins.top_px * spacing_mm / 10
    bottom_cm = margins.bottom_px * spacing_mm / 10
    lateral_cm = margins.lateral_px * spacing_mm / 10
    violation = top_cm < 3.0 or bottom_cm < 3.0 or lateral_cm < 2.0
    return RoiResult(top_cm=top_cm, bottom_cm=bottom_cm, lateral_cm=lateral_cm, roi_violation=violation)
