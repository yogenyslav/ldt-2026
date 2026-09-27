"""Полный проход: классификатор (класс + уверенность) -> ветка позвоночника или бедра -> JSON."""
from __future__ import annotations

import dataclasses
import os

import cv2
import numpy as np

from .hub import ModelHub
from .hip_branch import analyze_hip
from .spine_branch import analyze_spine
from .types import to_jsonable
from . import region_vote

import classify   # vendor


def read_image(path: str) -> np.ndarray:
    if path.lower().endswith(".dcm"):
        return classify.load_pixel_array(path)
    with open(path, "rb") as f:
        return cv2.imdecode(np.frombuffer(f.read(), np.uint8), cv2.IMREAD_GRAYSCALE)


def classify_image(img: np.ndarray, hub: ModelHub) -> dict:
    """Класс + уверенность голосованием трёх критериев: сеть (если есть весы), математика (маска кости, периодичность) и ширина снимка. Подробности — qc/region_vote.py."""
    m = hub.get("region")
    o = m.predict(img) if m is not None else None
    v = region_vote.vote(img, o["label"] if o else None, o["confidence"] if o else None)
    if v["region"] == "hip" and v["side"] is None:                       # ни сеть, ни математика не определили сторону бедра: снимок обработать нельзя
        raise ValueError("не определена сторона бедра (нет ни ответа сети, ни кости в верхней части кадра)")
    return {"label": v["label"], "confidence": v["confidence"], "source": "vote" if o else "vote (без сети: математика + ширина)", "side": v["side"],
            "votes": v["votes"], "agreement": v["agreement"], "unanimous": v["unanimous"], "n_peaks": v["n_peaks"],
            "cnn_confidence": None if o is None else float(o["confidence"])}


def analyze(img: np.ndarray, hub: ModelHub | None = None, name: str = "", settings: dict | None = None) -> dict:
    hub = hub or ModelHub()
    cls = classify_image(img, hub)
    crits = analyze_spine(img, hub) if cls["label"] == "spine" else analyze_hip(img, cls["side"], hub, settings)
    ok_vals = [c.ok for c in crits if c.ok is not None]
    verdict = None if not ok_vals else int(all(ok_vals))
    return to_jsonable({
        "image": name, "shape": [int(img.shape[0]), int(img.shape[1])], "classification": cls,
        "criteria": {c.name: dataclasses.asdict(c) for c in crits},
        "verdict": verdict, "verdict_note": "1 — все оценённые критерии в норме; критерии без результата (None) в итог не входят",
        "models": hub.status(),
    })
