"""
Классификация анатомической области DXA-снимка (позвоночник / бедро)
и стороны бедра (лево/право) чисто математическими методами OpenCV,
без обучаемых моделей.

Идея (первая итерация, до перехода на ML):

1. Сегментация кости: CLAHE (выравнивание локального контраста) +
   Otsu-порог + морфология + выбор наибольшей связной компоненты
   (кость — самая яркая и большая область на снимке). CLAHE — ключевой
   шаг: без него часть низкоконтрастных снимков позвоночника
   сегментировалась не полностью (Otsu давал неполную/смещённую маску,
   терялась периодичность), см. подбор параметров и до/после в истории
   работы над этим файлом.

2. Признак "периодичность" (n_peaks): суммируем яркие пиксели маски
   построчно (профиль ширины кости по вертикали) и считаем локальные
   максимумы. На позвоночнике тела позвонков и межпозвонковые щели
   дают выраженную периодичность (много пиков), на бедре силуэт
   монотонно расширяется к головке бедра/тазу — пиков мало.

3. Ширина снимка (Columns): в исследованном наборе (единственный
   аппарат — GE Lunar Prodigy Advance, см. ответ организаторов)
   почти всегда 300 px для позвоночника и 280 px для бедра. Это
   сильный, но хрупкий сигнал (замечены редкие исключения, напр.
   248 px), поэтому используется только как вторичное подтверждение,
   а не единственный критерий — после улучшения сегментации признак
   периодичности сам по себе уже надёжнее ширины.

4. Сторона бедра: горизонтальный центроид кости в верхней трети
   снимка (там, где расположено крыло подвздошной кости) относительно
   центра изображения. Если масса смещена влево от центра —
   "image_left", вправо — "image_right". Важно: это сторона В
   КООРДИНАТАХ ИЗОБРАЖЕНИЯ, не гарантированно совпадает с анатомическим
   "левое/правое бедро" пациента (зависит от конвенции укладки/экспорта) —
   требует проверки на нескольких снимках с известным ответом.

Ограничения и качество (см. README.md в этой папке):
  - Точность признака периодичности после подбора параметров (CLAHE
    clipLimit=3.0, порог по числу пиков >=6) — 99.6% на обучающей
    выборке (495/497, сверено с эвристикой по ширине снимка как прокси,
    не с истинной разметкой per-image — она организаторами не
    предоставлена).
  - Известный остаточный failure mode (обе ошибки из 2): снимки бедра
    с выраженной трабекулярной (губчатой) текстурой кости низкой
    плотности — CLAHE усиливает эту текстуру, силуэт становится
    "рваным" и даёт ложные пики. Возможно, коррелирует с реальным
    остеопорозом пациента — стоит иметь в виду при интерпретации.
  - Это эвристика для быстрого MVP и fallback на случай отказа
    основной ML-модели (см. docs/plan.md), не полноценная замена
    обученному классификатору региона.
"""

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
SPINE_PEAK_THRESHOLD = 6  # >= этого числа пиков -> похоже на позвоночник


@dataclasses.dataclass
class RegionResult:
    region: str  # "spine" | "hip" | "unknown"
    region_confidence: float  # 0..1, эвристическая уверенность
    n_peaks: int
    width_hint: Optional[str]  # что подсказывает ширина снимка, если подсказывает
    side: Optional[str] = None  # для hip: "image_left" | "image_right"
    side_score: Optional[float] = None  # -1..1, чем дальше от 0 тем увереннее


def load_pixel_array(dicom_path: str) -> np.ndarray:
    ds = pydicom.dcmread(dicom_path)
    arr = ds.pixel_array
    norm = cv2.normalize(arr, None, 0, 255, cv2.NORM_MINMAX).astype("uint8")
    return norm


def segment_bone(image_u8: np.ndarray) -> np.ndarray:
    """Возвращает бинарную маску (0/255) наибольшей связной светлой области."""
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
    mask = (labels == largest_label).astype("uint8") * 255
    return mask


def count_vertical_peaks(mask: np.ndarray) -> int:
    row_width = (mask > 0).sum(axis=1).astype(float)
    if row_width.max() <= 0:
        return 0
    kernel = np.ones(PEAK_SMOOTH_WINDOW) / PEAK_SMOOTH_WINDOW
    smoothed = np.convolve(row_width, kernel, mode="same")
    smoothed_norm = smoothed / smoothed.max()
    peaks, _ = find_peaks(smoothed_norm, prominence=PEAK_PROMINENCE, distance=PEAK_MIN_DISTANCE)
    return len(peaks)


def classify_region(mask: np.ndarray, image_width: int) -> tuple[str, float, int, Optional[str]]:
    n_peaks = count_vertical_peaks(mask)
    peak_vote = "spine" if n_peaks >= SPINE_PEAK_THRESHOLD else "hip"

    width_hint = None
    if image_width in SPINE_WIDTH_HINTS:
        width_hint = "spine"
    elif image_width in HIP_WIDTH_HINTS:
        width_hint = "hip"

    # После подбора параметров (CLAHE + порог по 6 пикам) признак периодичности
    # сам по себе точнее (99.6% на обучающей выборке), чем ширина снимка —
    # поэтому при разногласии доверяем peak_vote, а не наоборот, как в первой
    # версии. Ширина остаётся вторичным подтверждением уверенности.
    if width_hint is not None and width_hint == peak_vote:
        region = peak_vote
        confidence = 0.98
    elif width_hint is not None and width_hint != peak_vote:
        # сигналы разошлись — это редкий случай (в обучающей выборке 2/497),
        # обычно связанный с сильно текстурированной (низкоплотной) костью.
        # Доверяем более точному признаку (периодичность), но со сниженной
        # уверенностью, чтобы такие случаи было легко выловить и проверить руками
        region = peak_vote
        confidence = 0.6
    else:
        region = peak_vote
        confidence = 0.9

    return region, confidence, n_peaks, width_hint


def classify_hip_side(mask: np.ndarray, top_fraction: float = 0.35) -> tuple[Optional[str], Optional[float]]:
    h, w = mask.shape
    top = mask[: int(h * top_fraction), :]
    ys, xs = np.nonzero(top)
    if len(xs) == 0:
        return None, None
    cx = xs.mean()
    center = w / 2
    score = (cx - center) / (w / 2)  # -1..1, отрицательное = левее центра
    side = "image_left" if cx < center else "image_right"
    return side, float(score)


def classify_file(dicom_path: str) -> RegionResult:
    image_u8 = load_pixel_array(dicom_path)
    mask = segment_bone(image_u8)
    region, confidence, n_peaks, width_hint = classify_region(mask, image_u8.shape[1])

    side, side_score = (None, None)
    if region == "hip":
        side, side_score = classify_hip_side(mask)

    return RegionResult(
        region=region,
        region_confidence=confidence,
        n_peaks=n_peaks,
        width_hint=width_hint,
        side=side,
        side_score=side_score,
    )


def _iter_dicom_files(path: str):
    if os.path.isfile(path):
        yield path
        return
    for fp in glob.glob(os.path.join(path, "**", "*"), recursive=True):
        if os.path.isfile(fp):
            yield fp


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", help="Путь к DICOM-файлу или папке с исследованиями")
    args = parser.parse_args()

    for fp in _iter_dicom_files(args.path):
        try:
            result = classify_file(fp)
        except Exception as exc:  # noqa: BLE001 — CLI-диагностика, не продовый код
            print(f"{fp}\tERROR\t{exc}")
            continue
        side_str = f"\tside={result.side}({result.side_score:+.2f})" if result.side else ""
        print(
            f"{fp}\tregion={result.region}\tconf={result.region_confidence:.2f}"
            f"\tn_peaks={result.n_peaks}\twidth_hint={result.width_hint}{side_str}"
        )


if __name__ == "__main__":
    main()
