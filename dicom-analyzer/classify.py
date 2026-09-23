from __future__ import annotations
import argparse
import dataclasses
import glob
import os
from typing import Optional
import cv2
import numpy as np
import pydicom
from scipy.signal import find_peaks
SPINE_WIDTH_HINTS = {300}
HIP_WIDTH_HINTS = {280}
CLAHE_CLIP_LIMIT = 3.0
CLAHE_TILE_GRID = (8, 8)
PEAK_SMOOTH_WINDOW = 7
PEAK_PROMINENCE = 0.05
PEAK_MIN_DISTANCE = 6
SPINE_PEAK_THRESHOLD = 6
CONFIDENCE_MARGIN_SCALE = 0.09
CONFIDENCE_FLOOR = 0.5
CONFIDENCE_CEIL = 0.99
SIDE_CONFIDENCE_SCALE = 0.7

@dataclasses.dataclass
class RegionResult:
    region: str
    region_confidence: float
    n_peaks: int
    width_hint: Optional[str]
    side: Optional[str] = None
    side_score: Optional[float] = None
    side_confidence: Optional[float] = None

def load_pixel_array(dicom_path: str) -> np.ndarray:
    ds = pydicom.dcmread(dicom_path)
    arr = ds.pixel_array
    norm = cv2.normalize(arr, None, 0, 255, cv2.NORM_MINMAX).astype('uint8')
    return norm

def segment_bone(image_u8: np.ndarray) -> np.ndarray:
    clahe = cv2.createCLAHE(clipLimit=CLAHE_CLIP_LIMIT, tileGridSize=CLAHE_TILE_GRID)
    equalized = clahe.apply(image_u8)
    blur = cv2.GaussianBlur(equalized, (5, 5), 0)
    _, th = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    kernel = np.ones((3, 3), np.uint8)
    th = cv2.morphologyEx(th, cv2.MORPH_OPEN, kernel)
    th = cv2.morphologyEx(th, cv2.MORPH_CLOSE, kernel)
    n_components, labels, stats, _ = cv2.connectedComponentsWithStats(th, connectivity=8)
    if n_components <= 1:
        return th
    largest_label = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    mask = (labels == largest_label).astype('uint8') * 255
    return mask

def count_vertical_peaks(mask: np.ndarray) -> int:
    row_width = (mask > 0).sum(axis=1).astype(float)
    if row_width.max() <= 0:
        return 0
    kernel = np.ones(PEAK_SMOOTH_WINDOW) / PEAK_SMOOTH_WINDOW
    smoothed = np.convolve(row_width, kernel, mode='same')
    smoothed_norm = smoothed / smoothed.max()
    peaks, _ = find_peaks(smoothed_norm, prominence=PEAK_PROMINENCE, distance=PEAK_MIN_DISTANCE)
    return len(peaks)

def peak_margin_confidence(n_peaks: int) -> float:
    margin = abs(n_peaks - (SPINE_PEAK_THRESHOLD - 0.5))
    confidence = CONFIDENCE_FLOOR + CONFIDENCE_MARGIN_SCALE * margin
    return float(min(CONFIDENCE_CEIL, confidence))

def classify_region(mask: np.ndarray, image_width: int) -> tuple[str, float, int, Optional[str]]:
    n_peaks = count_vertical_peaks(mask)
    peak_vote = 'spine' if n_peaks >= SPINE_PEAK_THRESHOLD else 'hip'
    peak_confidence = peak_margin_confidence(n_peaks)
    width_hint = None
    if image_width in SPINE_WIDTH_HINTS:
        width_hint = 'spine'
    elif image_width in HIP_WIDTH_HINTS:
        width_hint = 'hip'
    region = peak_vote
    if width_hint is not None and width_hint == peak_vote:
        confidence = min(CONFIDENCE_CEIL, peak_confidence + 0.05)
    elif width_hint is not None and width_hint != peak_vote:
        confidence = max(CONFIDENCE_FLOOR, peak_confidence - 0.25)
    else:
        confidence = peak_confidence
    return (region, confidence, n_peaks, width_hint)

def classify_hip_side(mask: np.ndarray, top_fraction: float=0.35) -> tuple[Optional[str], Optional[float]]:
    h, w = mask.shape
    top = mask[:int(h * top_fraction), :]
    ys, xs = np.nonzero(top)
    if len(xs) == 0:
        return (None, None)
    cx = xs.mean()
    center = w / 2
    score = (cx - center) / (w / 2)
    side = 'image_left' if cx < center else 'image_right'
    return (side, float(score))

def side_margin_confidence(side_score: Optional[float]) -> Optional[float]:
    if side_score is None:
        return None
    confidence = CONFIDENCE_FLOOR + SIDE_CONFIDENCE_SCALE * abs(side_score)
    return float(min(CONFIDENCE_CEIL, confidence))

def classify_file(dicom_path: str) -> RegionResult:
    image_u8 = load_pixel_array(dicom_path)
    mask = segment_bone(image_u8)
    region, confidence, n_peaks, width_hint = classify_region(mask, image_u8.shape[1])
    side, side_score, side_confidence = (None, None, None)
    if region == 'hip':
        side, side_score = classify_hip_side(mask)
        side_confidence = side_margin_confidence(side_score)
    return RegionResult(region=region, region_confidence=confidence, n_peaks=n_peaks, width_hint=width_hint, side=side, side_score=side_score, side_confidence=side_confidence)

def _iter_dicom_files(path: str):
    if os.path.isfile(path):
        yield path
        return
    for fp in glob.glob(os.path.join(path, '**', '*'), recursive=True):
        if os.path.isfile(fp):
            yield fp

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', help='Путь к DICOM-файлу или папке с исследованиями')
    args = parser.parse_args()
    for fp in _iter_dicom_files(args.path):
        try:
            result = classify_file(fp)
        except Exception as exc:
            print(f'{fp}\tERROR\t{exc}')
            continue
        side_str = f'\tside={result.side}(score={result.side_score:+.2f}, conf={result.side_confidence:.2f})' if result.side else ''
        print(f'{fp}\tregion={result.region}\tconf={result.region_confidence:.2f}\tn_peaks={result.n_peaks}\twidth_hint={result.width_hint}{side_str}')
if __name__ == '__main__':
    main()
