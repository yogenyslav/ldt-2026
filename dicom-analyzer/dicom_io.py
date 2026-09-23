from __future__ import annotations
import dataclasses
import glob
import hashlib
import os
from collections import defaultdict
from typing import Optional
import numpy as np
import pydicom
KNOWN_HIP_MISCLASSIFIED_AS_SPINE = {'280d919982af47b39e1d0b126c542d51': 'image_left', '186446e4d966ec5b55d8885921bac9ac': 'image_left'}

@dataclasses.dataclass
class DicomImage:
    path: str
    study_uid: str
    sop_uid: str
    series_uid: Optional[str]
    pixels_u8: np.ndarray
    rows: int
    cols: int
    pixel_hash: str
    duplicate_paths: list

def pixel_spacing_mm(path: str) -> Optional[float]:
    try:
        ds = pydicom.dcmread(path, force=True, stop_before_pixels=True)
        ea = ds.get('ExposedArea', None)
        cols = int(ds.Columns)
        if ea is None or len(ea) != 2 or cols <= 0:
            return None
        width_mm = float(ea[0])
        if width_mm <= 0 or width_mm >= 300:
            return None
        return width_mm / cols
    except Exception:
        return None

def load_pixel_array_u8(path: str) -> np.ndarray:
    import cv2
    ds = pydicom.dcmread(path, force=True)
    arr = ds.pixel_array
    return cv2.normalize(arr, None, 0, 255, cv2.NORM_MINMAX).astype('uint8')

def read_dicom(path: str) -> DicomImage:
    ds = pydicom.dcmread(path, force=True)
    pixels_u8 = load_pixel_array_u8(path)
    pixel_hash = hashlib.md5(pixels_u8.tobytes()).hexdigest()
    return DicomImage(path=path, study_uid=str(getattr(ds, 'StudyInstanceUID', '')), sop_uid=str(getattr(ds, 'SOPInstanceUID', '')), series_uid=str(getattr(ds, 'SeriesInstanceUID', '')) or None, pixels_u8=pixels_u8, rows=int(ds.Rows), cols=int(ds.Columns), pixel_hash=pixel_hash, duplicate_paths=[])

def iter_dicom_paths(root: str):
    if os.path.isfile(root):
        yield root
        return
    for fp in glob.glob(os.path.join(root, '**', '*'), recursive=True):
        if os.path.isfile(fp):
            yield fp

def collect_study(root: str, dedupe: bool=True) -> tuple[list[DicomImage], list[tuple[str, Exception]]]:
    images: list[DicomImage] = []
    errors: list[tuple[str, Exception]] = []
    for path in iter_dicom_paths(root):
        try:
            img = read_dicom(path)
        except Exception as exc:
            errors.append((path, exc))
            continue
        images.append(img)
    if not dedupe:
        return (images, errors)
    by_key: dict[tuple[str, str], list[DicomImage]] = defaultdict(list)
    for img in images:
        by_key[img.study_uid, img.pixel_hash].append(img)
    representatives = []
    for (_study, _hash), group in by_key.items():
        group_sorted = sorted(group, key=lambda i: i.path)
        rep = group_sorted[0]
        rep.duplicate_paths = [i.path for i in group_sorted[1:]]
        representatives.append(rep)
    return (representatives, errors)
