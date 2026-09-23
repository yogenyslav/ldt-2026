from __future__ import annotations
import dataclasses
import numpy as np
from classify import segment_bone
BOTTOM_FRACTION = 0.15
SIDE_FRACTION = 0.35

@dataclasses.dataclass
class PlacementResult:
    wing_coverage: float
    placement_violation: bool
    note: str = 'ok'

def placement_score(image_u8: np.ndarray) -> float:
    h, w = image_u8.shape
    mask = segment_bone(image_u8) > 0
    bottom = mask[int(h * (1 - BOTTOM_FRACTION)):, :]
    left = bottom[:, :int(w * SIDE_FRACTION)]
    right = bottom[:, int(w * (1 - SIDE_FRACTION)):]
    return float((left.mean() + right.mean()) / 2)

def analyze(image_u8: np.ndarray) -> PlacementResult:
    score = placement_score(image_u8)
    return PlacementResult(wing_coverage=score, placement_violation=score == 0.0, note='low-confidence: только 3 из 6 известных нарушений ловятся этим правилом, не валидировано на held-out')
