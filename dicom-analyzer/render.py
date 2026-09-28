"""Эталонная отрисовка результата сервиса на снимке: как это должно выглядеть на фронте. Модели не запускаются: нужны снимок и готовый ответ (результат QCService.process).

    from render import render
    bgr = render(img_u8, result)              # img_u8: серый uint8 [H, W]; result: словарь ответа сервиса (или его metadata)

    python render.py <снимок.dcm|png> --result result.json -o out.png    # результат из файла
    python render.py <снимок.dcm|png> -o out.png                         # без --result: сначала прогоняет сервис (модели!)

Что рисуется (координаты — пиксели исходного снимка, подписи латиницей, цвет выводится из ok/status/verdict: зелёный/жёлтый/красный/серый):
  позвоночник: ось (линия между серединами верхней и нижней пар точек) + 4 точки, угол; два окна гребней в нижних углах (зелёное — гребень есть, красное — нет)
               и точки гребней; контуры посторонних предметов (красный — дужка, жёлтый — застёжка);
  бедро:       три точки модели (V вертел, N шейка, I седалищная), точки отступов с перпендикулярами к краям кадра и значениями в см, область малого вертела и расстояние в мм.
Сверху полоса: регион, уверенность, вердикт и список критериев (OK / FAIL / -)."""
from __future__ import annotations

import argparse
import json

import cv2
import numpy as np

COLORS = {"зелёный": (70, 200, 70), "жёлтый": (0, 210, 240), "красный": (60, 60, 235), "серый": (170, 170, 170)}
POINT_LABELS = {"greater_trochanter_apex": "V", "femoral_neck": "N", "ischium": "I"}
NAMES = {"spine_axis": "axis", "pelvis_crest": "crest", "foreign_objects": "foreign", "hip_margins": "margins", "hip_keypoints": "keypoints", "lesser_trochanter": "trochanter"}


def _col(c: dict) -> tuple:
    """Цвет рисования выводится из ответа (поля color в ответе нет): ok 1 — зелёный, 0 — красный, null — серый;
    вертел: details.status «проверить» — жёлтый; предметы: details.verdict «проверить» — жёлтый."""
    d = c.get("details", {})
    if c.get("ok") is None:
        return COLORS["серый"]
    if d.get("status") == "проверить" or d.get("verdict") == "проверить":
        return COLORS["жёлтый"]
    return COLORS["зелёный"] if c["ok"] == 1 else COLORS["красный"]


def _text(v, s, org, color, scale=0.5, thick=1, outline=True):
    if outline:
        cv2.putText(v, s, (int(org[0]), int(org[1])), cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), thick + 2, cv2.LINE_AA)   # чёрный контур вокруг букв для читаемости
    cv2.putText(v, s, (int(org[0]), int(org[1])), cv2.FONT_HERSHEY_SIMPLEX, scale, color, thick, cv2.LINE_AA)


def render(img_u8: np.ndarray, result: dict, scale: int = 2) -> np.ndarray:
    meta = result.get("metadata", result)
    crit = meta.get("criteria", {})
    h, w = img_u8.shape
    v = cv2.cvtColor(cv2.resize(img_u8, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC), cv2.COLOR_GRAY2BGR)
    S = lambda p: (int(round(p[0] * scale)), int(round(p[1] * scale)))

    # области (контуры) под остальным: бугор вертела, предметы
    for name in ("lesser_trochanter", "foreign_objects"):
        c = crit.get(name)
        if not c:
            continue
        for poly in c.get("regions", []):
            ov = v.copy()
            cv2.fillPoly(ov, [np.array([S(p) for p in poly], np.int32)], _col(c))
            v = cv2.addWeighted(ov, 0.35, v, 0.65, 0)
            cv2.polylines(v, [np.array([S(p) for p in poly], np.int32)], True, _col(c), 1, cv2.LINE_AA)
    c = crit.get("lesser_trochanter")
    if c and c.get("regions") and c.get("value") is not None:
        p0 = c["regions"][0][0]
        _text(v, "%.1f mm" % c["value"], (S(p0)[0] + 8, S(p0)[1]), _col(c), 0.5, 1)
    if c and c.get("points", {}).get("near") and c["points"].get("far"):
        e, r = c["points"]["near"], c["points"]["far"]                        # точки пересечения линии измерения с границей нарисованной области (regions)
        cv2.line(v, S(e), S(r), _col(c), 1, cv2.LINE_AA)
        cv2.circle(v, S(e), 3, _col(c), -1, cv2.LINE_AA)
        cv2.circle(v, S(r), 3, _col(c), -1, cv2.LINE_AA)

    # позвоночник: ось и четыре точки
    c = crit.get("spine_axis")
    if c and c.get("points"):
        P = c["points"]
        mid = lambda a, b: [(P[a][0] + P[b][0]) / 2, (P[a][1] + P[b][1]) / 2]
        cv2.line(v, S(mid("top_left", "top_right")), S(mid("bottom_left", "bottom_right")), _col(c), 2, cv2.LINE_AA)
        for n, p in P.items():
            cv2.circle(v, S(p), 5, _col(c), -1, cv2.LINE_AA)
        if c.get("value") is not None:
            am = S(mid("bottom_left", "bottom_right"))
            at = S(mid("top_left", "top_right"))
            _text(v, "axis %.1f deg" % c["value"], ((at[0] + am[0]) // 2 + 12, (at[1] + am[1]) // 2), _col(c), 0.55, 1)

    # гребни: два окна в нижних углах + точки
    c = crit.get("pelvis_crest")
    if c:
        sq = c.get("details", {}).get("square")
        if sq:
            ww, hh = sq["width_px"], sq["height_px"]
            for side, ok in (("left", sq["left_ok"]), ("right", sq["right_ok"])):
                x1 = ww - 1 if side == "left" else w - 1
                col = COLORS["зелёный"] if ok else COLORS["красный"]
                cv2.rectangle(v, S((x1 - ww + 1, h - hh)), S((x1, h - 1)), col, 2)
                _text(v, "crest " + ("OK" if ok else "none"), (S((x1 - ww + 1, h - hh))[0] + 6, S((x1 - ww + 1, h - hh))[1] + 18), col, 0.5, 1)
        for n, p in c.get("points", {}).items():
            cv2.circle(v, S(p), 6, COLORS["зелёный"], 2, cv2.LINE_AA)
            lab = n.replace("crest_", "C-")
            dx = -60 if S(p)[0] > v.shape[1] - 70 else 8                        # у правого края подпись слева от точки
            _text(v, lab, (S(p)[0] + dx, S(p)[1] - 6), COLORS["зелёный"], 0.45, 1)

    # бедро: отступы с перпендикулярами и значениями, три точки модели
    c = crit.get("hip_margins")
    if c and c.get("points"):
        P, D, col = c["points"], c.get("details", {}), _col(c)
        segs = []
        if "apex" in P:
            segs.append((P["apex"], [P["apex"][0], 0], D.get("top_cm")))
        if "lateral" in P:
            # до какого края тянуть — по СТОРОНЕ бедра (anatomical_region), не по тому, какой край ближе в пикселях: на кривом снимке точка
            # может оказаться ближе к чужому краю, и «ближайший» дал бы неверную сторону.
            side_edge = (w - 1) if result.get("anatomical_region") == "hip_left" else 0   # по нашим данным: hip_left -> lateral у правого края, hip_right -> у левого
            segs.append((P["lateral"], [side_edge, P["lateral"][1]], D.get("side_cm")))
        if "ischium" in P:
            segs.append((P["ischium"], [P["ischium"][0], h - 1], D.get("bottom_cm")))
        for a, b, cm in segs:
            cv2.line(v, S(a), S(b), col, 1, cv2.LINE_AA)
            cv2.circle(v, S(a), 4, col, -1, cv2.LINE_AA)
            if cm is not None:
                mid_ = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
                _text(v, "%.1f cm" % cm, (S(mid_)[0] + 6, S(mid_)[1]), col, 0.45, 1)
        if D.get("implant"):
            _text(v, "implant", (10 * scale, (h - 10) * scale), COLORS["жёлтый"], 0.5, 1)
    c = crit.get("hip_keypoints")
    if c and c.get("points"):
        for n, p in c["points"].items():
            cv2.circle(v, S(p), 7, _col(c), 2, cv2.LINE_AA)
            _text(v, POINT_LABELS.get(n, n), (S(p)[0] + 9, S(p)[1] + 4), _col(c), 0.6, 2)

    # верхняя полоса: регион, уверенность, вердикт, критерии
    cls = meta.get("classification", {})
    region = result.get("anatomical_region", "?")
    conf = result.get("confidence")
    verdict = meta.get("verdict")
    bar = np.full((34 + 20 * ((len(crit) + 2) // 3), v.shape[1], 3), 30, np.uint8)
    head = "%s  conf %s  verdict %s" % (region, "-" if conf is None else "%.2f" % conf, {1: "OK", 0: "FAIL", None: "-"}[verdict])
    _text(bar, head, (8, 22), COLORS["зелёный"] if verdict == 1 else (COLORS["красный"] if verdict == 0 else COLORS["серый"]), 0.65, 1, outline=False)
    for i, (n, c) in enumerate(crit.items()):
        st = {1: "OK", 0: "FAIL", None: "-"}[c.get("ok")]
        _text(bar, "%s: %s" % (NAMES.get(n, n), st), (8 + (i % 3) * (v.shape[1] // 3), 46 + 20 * (i // 3)), _col(c), 0.5, 1, outline=False)
    return np.vstack([bar, v])


def main():
    from qc.pipeline import read_image
    ap = argparse.ArgumentParser()
    ap.add_argument("image", help="снимок: .dcm или .png")
    ap.add_argument("--result", help="JSON с ответом сервиса; без него сервис будет запущен (загрузит модели)")
    ap.add_argument("-o", "--out", default="render.png")
    a = ap.parse_args()
    img = read_image(a.image)
    if a.result:
        result = json.load(open(a.result, encoding="utf-8"))
    else:
        from main import QCService
        result = QCService().process(a.image)
    if result.get("status") == "failed":
        raise SystemExit("сервис вернул ошибку: %s" % result.get("error"))
    cv2.imencode(".png", render(img, result))[1].tofile(a.out)
    print("сохранено:", a.out)


if __name__ == "__main__":
    main()
