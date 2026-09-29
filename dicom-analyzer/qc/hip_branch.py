"""Ветка «бедро»: отступы в см, три ключевые точки, малый вертел (бугор). Математика — из vendor/, точки — из модели (если весов нет — запасной путь по маске)."""
from __future__ import annotations

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter

from .hub import HIP_POINTS, ModelHub
from .settings import DEFAULTS
from .types import Criterion

import hip_roi_margins as hm          # vendor
import lesser_trochanter_math as lt   # vendor
from . import implant_trochanter as impl_lt   # снаружи vendor: другой метод только для протеза-«глыбы» (branch="implant")

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


def _half_max_edge(canon, y, x_start, search=25):
    """От сырого края (x_start) ищем вправо точку полувысоты яркости - "видимую" (прижатую к кости) границу, для базовой линии."""
    row_pix = gaussian_filter(canon[y].astype(float), 1.0)
    x0 = max(int(round(x_start)) - 2, 0)
    seg = row_pix[x0:x0 + search]
    if len(seg) < 3:
        return float(x_start)
    bg, mx = seg[0], seg.max()
    if mx - bg < 20:
        return float(x_start)
    half = bg + 0.5 * (mx - bg)
    idx = int(np.argmax(seg >= half))
    return float(x0 + idx)


def _exact_region(meas, canon, shape):
    """Область бугра: внутренняя сторона - реальный (выпуклый) край кости построчно; внешняя - прямая линия между
    верхом и низом области "как будто бугра нет", прижатая к видимой кости (полувысота яркости), а не покадровый
    сигнал яркости. Закрашивается всё превышение реального края над этой прямой."""
    R = np.zeros(shape, bool)
    res = meas.get("res")
    if res is None or meas.get("peak_y") is None:
        return R
    ys = np.asarray(res["ys"]).astype(int); ex = np.clip(res["ex"], 0, None); edge = res["edge"]
    i = int(np.argmin(np.abs(ys - meas["peak_y"])))
    pk = ex[i]
    if pk <= 0:
        return R
    t = i
    while t > 0 and ex[t - 1] >= lt.REGION_FRAC * pk:
        t -= 1
    u = i
    while u < len(ys) - 1 and ex[u + 1] >= lt.REGION_FRAC * pk:
        u += 1
    t, u = max(t, i - lt.REGION_MAX_HALF_ROWS), min(u, i + lt.REGION_MAX_HALF_ROWS)
    tp, up = max(t - lt.REGION_PAD_ROWS, 0), min(u + lt.REGION_PAD_ROWS, len(ys) - 1)
    line_top = _half_max_edge(canon, ys[tp], edge[tp])
    line_bot = _half_max_edge(canon, ys[up], edge[up])
    for idx, k in enumerate(range(tp, up + 1)):
        frac = idx / max(up - tp, 1)
        line_k = line_top + (line_bot - line_top) * frac
        x_lo, x_hi = sorted((int(round(edge[k])), int(round(line_k))))
        R[ys[k], max(x_lo, 0):x_hi + 1] = True
    return R


def trochanter_criterion(img: np.ndarray, side: str, kp: Criterion, found: dict, settings: dict | None = None) -> Criterion:
    """Малый вертел: расстояние (мм), область, признак импланта и вердикт (ok + цвет). Внутреннюю логику наружу не отдаём."""
    if kp.ok == 0:                                        # модель точек есть, три точки не найдены: ротацию не меряем (0: снимок непригоден)
        return Criterion("lesser_trochanter", 0, "gate", note="три ключевые точки не найдены — ротацию не меряем", details={"status": "не измерен"})
    canon, flipped = hm.to_canonical(img, side)
    neck_y = found["femoral_neck"][1] if "femoral_neck" in found else None
    meas = lt.measure_ridge(canon, neck_y=neck_y)
    if not meas["ok"]:
        return Criterion("lesser_trochanter", None, source="math", note=meas.get("reason") or "бугор не измерен", details={"status": "не измерен", "implant": bool(meas["implant"])})

    if meas["implant"]:   # любой протез (и «глыба», и стержень) — метод по силуэту кости, без яркости/металла (проверено: совпадает с экспертом на всех 3)
        # протез: гребень белого (или подставная прямая) цепляется за сам металл — метод по силуэту кости (qc/implant_trochanter.py), без обращения к яркости
        bone_mask = lt.bone_mask(canon)
        impl_res = impl_lt.measure(canon, bone_mask, neck_y)
        if impl_res is None:
            return Criterion("lesser_trochanter", None, source="math", note="бугор не измерен (протез)", details={"status": "не измерен", "implant": True})
        region_mask = impl_lt.region(impl_res, canon.shape)
        peak_y = impl_res["peak"]
    else:
        region_mask = _exact_region(meas, canon, canon.shape)                      # реальный край + прямая база (полувысота яркости), ширина = ровно value
        peak_y = meas.get("peak_y")

    pts = {}
    if peak_y is not None and region_mask[peak_y].any():
        xs = np.nonzero(region_mask[peak_y])[0]
        w = canon.shape[1]
        pts = {"near": [_px(float(xs.min()), w, flipped), float(peak_y)], "far": [_px(float(xs.max()), w, flipped), float(peak_y)]}
    d = float(np.hypot(pts["near"][0] - pts["far"][0], pts["near"][1] - pts["far"][1]) * lt.MM_X) if pts else 0.0   # расстояние строго между точками контура

    s = settings or DEFAULTS
    st = lt.distance_status(d, center=s["trochanter_center_mm"], tol=s["trochanter_tol_percent"] / 100.0, yellow=s["trochanter_yellow_percent"] / 100.0)
    ok, status = int(st["status"] != "плохой"), st["status"]      # норма и «проверить» (жёлтый) — не нарушение: красных 35% при экспертной доле брака ротации ~30%, с жёлтыми было бы 63%
    return Criterion("lesser_trochanter", ok, "math", d, "mm", points=pts, regions=_contours(region_mask, flipped), details={"status": status, "implant": bool(meas["implant"])})


def analyze_hip(img: np.ndarray, side: str, hub: ModelHub, settings: dict | None = None) -> list[Criterion]:
    kp, found = keypoints_criterion(img, side, hub)
    return [margins_criterion(img, side, found), kp, trochanter_criterion(img, side, kp, found, settings)]
