from __future__ import annotations
import dataclasses
from typing import Optional
import cv2
import numpy as np
from classify import CLAHE_CLIP_LIMIT, CLAHE_TILE_GRID, segment_bone
TOPHAT_KERNEL_SIZE = 9
UPPER_FRACTION = 0.65
PERIPHERY_DILATE_PX = 21
PERCENTILE = 99
ARTIFACT_THRESHOLD = 41.0

@dataclasses.dataclass
class ArtifactResult:
    score: float
    has_artifact: bool
    note: str = 'ok'

def artifact_score(image_u8: np.ndarray) -> float:
    h, w = image_u8.shape
    clahe = cv2.createCLAHE(clipLimit=CLAHE_CLIP_LIMIT, tileGridSize=CLAHE_TILE_GRID)
    eq = clahe.apply(image_u8)
    main_mask = segment_bone(image_u8)
    dilated = cv2.dilate(main_mask, np.ones((PERIPHERY_DILATE_PX, PERIPHERY_DILATE_PX), np.uint8))
    periphery = dilated == 0
    upper = np.zeros((h, w), dtype=bool)
    upper[:int(h * UPPER_FRACTION), :] = True
    region = periphery & upper
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (TOPHAT_KERNEL_SIZE, TOPHAT_KERNEL_SIZE))
    tophat = cv2.morphologyEx(eq, cv2.MORPH_TOPHAT, kernel)
    vals = tophat[region]
    if vals.size == 0:
        return 0.0
    return float(np.percentile(vals, PERCENTILE))

def analyze(image_u8: np.ndarray, threshold: float=ARTIFACT_THRESHOLD) -> ArtifactResult:
    score = artifact_score(image_u8)
    return ArtifactResult(score=score, has_artifact=score > threshold)
