"""Реестр моделей. Веса лежат в models/ (см. models/README.md). Нет файла — get() вернёт None, критерий отработает запасным путём или вернёт «не оценён».
Адаптер модели — любой объект с методом, указанным в CONTRACTS; подключение весов = написать loader в LOADERS (один на модель), остальной код не меняется."""
from __future__ import annotations

import json
import os

from . import MODELS_DIR

# имя модели -> (имя файла весов, что делает predict)
FILES = {
    "region": "region_classifier.pt",        # predict(img_u8) -> {"label": spine|hip_left|hip_right, "confidence": float}
    "hip_keypoints": "hip_keypoints.pt",     # predict(img_u8) -> {"points": {name: (x, y, conf)}}, name in HIP_POINTS
    "pelvis_crest": "pelvis_crest.pt",       # predict(img_u8) -> {"left": (x, y, p) | None, "right": (x, y, p) | None}  p — вероятность присутствия
    "pelvis_presence": "pelvis_presence.pt", # predict(img_u8) -> {"left": p, "right": p}   классификатор «гребень в окне»
    "foreign_seg": "foreign_seg.pt",         # predict(img_u8) -> {"verdict": ПРЕДМЕТ|проверить|чисто, "masks": {"wire", "object"} (верх кадра, координаты снимка)}; параметры — foreign_seg_gate.json
}
HIP_POINTS = ("greater_trochanter_apex", "femoral_neck", "ischium")      # «три точки» бедра: без них ротацию не меряем

# сюда подключается загрузка весов: LOADERS["region"] = lambda path: MyModel(path)
LOADERS: dict = {}


class ModelHub:
    def __init__(self, models_dir: str = MODELS_DIR):
        self.dir = models_dir
        self._cache: dict = {}
        self._gate: dict = {}

    def has(self, name: str) -> bool:
        return os.path.exists(os.path.join(self.dir, FILES[name])) and name in LOADERS

    def get(self, name: str):
        if not self.has(name):
            return None
        if name not in self._cache:
            model = LOADERS[name](os.path.join(self.dir, FILES[name]))
            g = self.gate("pelvis_crest_gate.json") or {}
            if name == "pelvis_crest" and "keypoint_presence_threshold" in g:      # пороги решений из json, сохранённого ноутбуком
                model.thr = float(g["keypoint_presence_threshold"])
            if name == "pelvis_presence" and "classifier_threshold" in g:
                model.thr = float(g["classifier_threshold"])
            self._cache[name] = model
        return self._cache[name]

    def gate(self, filename: str):
        """Содержимое json с порогами рядом с весами (или None, если файла нет)."""
        if filename not in self._gate:
            path = os.path.join(self.dir, filename)
            self._gate[filename] = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else None
        return self._gate[filename]

    def status(self) -> dict:
        return {n: ("подключена" if self.has(n) else ("файл есть, loader не написан" if os.path.exists(os.path.join(self.dir, f)) else "нет весов")) for n, f in FILES.items()}


from .adapters import register as _register     # noqa: E402  (адаптеры обученных моделей)
_register(LOADERS)
