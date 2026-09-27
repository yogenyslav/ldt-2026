"""Ветка «бедро»: отступы в см, три ключевые точки, малый вертел (бугор). Математика — из vendor/, точки — из модели (если весов нет — запасной путь по маске)."""
from __future__ import annotations

import cv2
import numpy as np

from .hub import HIP_POINTS, ModelHub
from .settings import DEFAULTS
from .types import Criterion

import hip_roi_margins as hm          # vendor
import lesser_trochanter_math as lt   # vendor

KP_MIN_CONF = 0.5


def _px(x, w, flipped):
    """x из канонической ориентации (боковая сторона справа) -> в исходный снимок."""
    return float(w - 1 - x) if flipped else float(x)


def _contours(mask: np.ndarray, flipped: bool) -> list:
    w = mask.shape[1]
    cnts, _ = cv2.findContours(mask.astype("uint8"), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    return [[[_px(x, w, flipped), float(y)] for x, y in c[:, 0, :]] for c in cnts if len(c) >= 3]


def keypoints_criterion(img: np.ndarray, side: str, hub: ModelHub) -> tuple[Criterion, dict]:
    """Три точки бедра ПОСЛЕ отсева (оценка присутствия >= порога и точка внутри маски кости). Снимок годен, если взяты все три; иначе точек не отдаём."""
    m = hub.get("hip_keypoints")
    if m is None:
        return Criterion("hip_keypoints", None, source="none", note="модель точек не подключена"), {}
    out = m.predict(img, side)
    found = out["points"]
    ok = int(out["found_all"])
    pts = {n: [float(v[0]), float(v[1])] for n, v in found.items()} if ok else {}
    return (Criterion("hip_keypoints", ok, "model", points=pts,
                      details={"confidence": {n: float(r["conf"]) for n, r in out["raw"].items()}}), found if ok else {})


def margins_criterion(img: np.ndarray, side: str, found: dict) -> Criterion:
    h, w = img.shape
    m = hm.measure_margins(img, side)
    apex = (_px(m.apex[0], w, m.flipped), m.apex[1])
    lateral = (_px(m.lateral[0], w, m.flipped), m.lateral[1])
    ischium = None if m.ischium is None else (_px(m.ischium[0], w, m.flipped), m.ischium[1])
    src = "math"                                          # точки модели не подменяют края кости: разметка вертела/седалищной != крайние точки для отступов (расхождение 2-3 см)
    top, bottom, sidecm = m.top_cm, m.bottom_cm, m.side_cm
    ok_top, ok_side = top >= hm.MIN_TOP_CM, sidecm >= hm.MIN_SIDE_CM
    ok_bottom = bottom is not None and bottom >= hm.MIN_BOTTOM_CM
    ok = int(ok_top and ok_side and ok_bottom)
    pts = {"apex": list(apex), "lateral": list(lateral)}
    if ischium is not None:
        pts["ischium"] = list(ischium)
    return Criterion("hip_margins", ok, src, unit="cm", points=pts,
                     details={"top_cm": top, "bottom_cm": bottom, "side_cm": sidecm, "implant": bool(m.implant)}, note=m.note)


def trochanter_criterion(img: np.ndarray, side: str, kp: Criterion, found: dict, settings: dict | None = None) -> Criterion:
    """Малый вертел: расстояние (мм), область, признак импланта и вердикт (ok + цвет). Внутреннюю логику наружу не отдаём."""
    if kp.ok == 0:                                        # модель точек есть, три точки не найдены: ротацию не меряем (0: снимок непригоден)
        return Criterion("lesser_trochanter", 0, "gate", note="три ключевые точки не найдены — ротацию не меряем", details={"status": "не измерен"})
    canon, flipped = hm.to_canonical(img, side)
    neck_y = found["femoral_neck"][1] if "femoral_neck" in found else None
    meas = lt.measure_ridge(canon, neck_y=neck_y)
    if not meas["ok"]:
        return Criterion("lesser_trochanter", None, source="math", note=meas.get("reason") or "бугор не измерен", details={"status": "не измерен", "implant": bool(meas["implant"])})
    d = 0.0 if not meas["has_peak"] else float(meas["dist_mm"])
    s = settings or DEFAULTS
    st = lt.distance_status(d, center=s["trochanter_center_mm"], tol=s["trochanter_tol_percent"] / 100.0, yellow=s["trochanter_yellow_percent"] / 100.0)
    ok = int(st["status"] != "плохой")                         # норма и «проверить» (жёлтый) — не нарушение: красных 35% при экспертной доле брака ротации ~30%, с жёлтыми было бы 63%
    return Criterion("lesser_trochanter", ok, "math", d, "mm", regions=_contours(lt.bump_region(meas, canon.shape), flipped), details={"status": st["status"], "implant": bool(meas["implant"])})


def analyze_hip(img: np.ndarray, side: str, hub: ModelHub, settings: dict | None = None) -> list[Criterion]:
    kp, found = keypoints_criterion(img, side, hub)
    return [margins_criterion(img, side, found), kp, trochanter_criterion(img, side, kp, found, settings)]
