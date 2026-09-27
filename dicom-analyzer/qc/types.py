"""Единый формат результата критерия. Координаты точек — в пикселях ИСХОДНОГО снимка (x вправо, y вниз)."""
from __future__ import annotations

import dataclasses
from typing import Optional


@dataclasses.dataclass
class Criterion:
    name: str                          # ключ критерия
    ok: Optional[int]                  # 1 — норма, 0 — нарушение, None — не оценён (нет модели / нет данных / отсев)
    source: str = "math"               # math | model | vote | heuristic | none
    value: Optional[float] = None      # главное число (градусы / см / мм), если есть
    unit: str = ""
    points: dict = dataclasses.field(default_factory=dict)      # имя -> [x, y] (или [x, y, класс/уверенность])
    regions: list = dataclasses.field(default_factory=list)     # полигоны для закрашивания: [[[x, y], ...], ...]
    details: dict = dataclasses.field(default_factory=dict)     # всё остальное (углы, стороны квадрата, голоса и т. д.)
    note: str = ""


def to_jsonable(x):
    import numpy as np
    if isinstance(x, dict):
        return {k: to_jsonable(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [to_jsonable(v) for v in x]
    if isinstance(x, np.generic):
        return x.item()
    if isinstance(x, float) and x != x:
        return None
    return x
