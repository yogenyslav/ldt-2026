"""Shared helpers for the fine-tuning scripts: submissions, images, checkpoints.

Every script takes the current weights, the exported annotation submissions (contract: context/back_annotations.md,
dicom-analyzer/examples/annotation/README.md) and the source images, fine-tunes the model and writes a NEW checkpoint file.
Nothing here touches models/ or the analyzer code: the output goes to --out-dir (default training_out/)."""
from __future__ import annotations

import argparse
import glob
import json
import os
import random
import sys
import time

import cv2
import numpy as np
import torch

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
import qc  # noqa: E402,F401  (puts vendor/ on sys.path)
from qc.pipeline import read_image  # noqa: E402

MODELS_DIR = os.path.join(ROOT, "models")
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

STATUS_WEIGHT = {"done": 1.0, "uncertain": 0.5}       # skipped never trains
TRAINABLE_ORIGIN = ("human", "model_confirmed")       # origin == "model" is the model's own answer: useless as a label


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def pick_device(name: str = "auto") -> torch.device:
    return torch.device("cuda" if name == "auto" and torch.cuda.is_available() else ("cpu" if name == "auto" else name))


def add_common_args(ap: argparse.ArgumentParser, task: str, default_weights: str) -> None:
    ap.add_argument("--weights", default=os.path.join(MODELS_DIR, default_weights), help="checkpoint to start from")
    ap.add_argument("--submissions", required=True, help="JSON/JSONL file or directory with annotation submissions (a list, a single object or {'submissions': [...]})")
    ap.add_argument("--images", required=True, help="directory with source images named <job_id>.dcm|.png|.jpg (raw, NOT CLAHE)")
    ap.add_argument("--out-dir", default=os.path.join(ROOT, "training_out"))
    ap.add_argument("--epochs", type=int, default=20)
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--val-fraction", type=float, default=0.15, help="share of images held out to pick the best epoch (0 = none, keep last)")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--device", default="auto")
    ap.set_defaults(task=task)


# ---------- submissions ----------
def _read_json_items(path: str) -> list:
    with open(path, encoding="utf-8") as f:
        text = f.read()
    if path.endswith(".jsonl"):
        return [json.loads(line) for line in text.splitlines() if line.strip()]
    data = json.loads(text)
    if isinstance(data, dict) and "submissions" in data:
        data = data["submissions"]
    return data if isinstance(data, list) else [data]


def load_submissions(path: str, task: str) -> list[dict]:
    """Submissions of one task that may enter training: status done/uncertain, latest version only, deduplicated by submission_id."""
    files = [path] if os.path.isfile(path) else sorted(glob.glob(os.path.join(path, "*.json")) + glob.glob(os.path.join(path, "*.jsonl")))
    by_id = {}
    for fp in files:
        for s in _read_json_items(fp):
            if isinstance(s, dict) and "submission_id" in s:
                by_id[s["submission_id"]] = s
    replaced = {s["supersedes"] for s in by_id.values() if s.get("supersedes")}
    out = []
    for sid, s in by_id.items():
        if sid in replaced or s.get("superseded_by"):
            continue
        if s.get("status") not in STATUS_WEIGHT or task not in (s.get("annotations") or {}):
            continue
        out.append(s)
    return out


def find_image(images_dir: str, job_id: str) -> str | None:
    for ext in (".dcm", ".png", ".jpg", ".jpeg"):
        p = os.path.join(images_dir, job_id + ext)
        if os.path.exists(p):
            return p
    return None


def load_image_for(sub: dict, images_dir: str) -> np.ndarray | None:
    """uint8 grayscale frame of the submission; None (with a message) when missing or the size disagrees with the recorded one."""
    p = find_image(images_dir, sub["job_id"])
    if p is None:
        print(f"skip {sub['submission_id']}: no image for job {sub['job_id']}")
        return None
    img = read_image(p)
    want = (sub["image"]["rows"], sub["image"]["cols"])
    if img is None or img.shape != want:
        print(f"skip {sub['submission_id']}: image shape {None if img is None else img.shape} != submitted {want}")
        return None
    return img


def points_of(sub: dict, task: str, names: list[str]):
    """-> (coords, present, known). coords[i] = (x, y) or None; known[i] = 1 only for human/model_confirmed points."""
    by_name = {p["name"]: p for p in sub["annotations"][task]["points"]}
    coords, present, known = [], [], []
    for n in names:
        p = by_name.get(n)
        ok = p is not None and p.get("origin") in TRAINABLE_ORIGIN
        has = bool(ok and p.get("present") and p.get("x") is not None and p.get("y") is not None)
        coords.append((float(p["x"]), float(p["y"])) if has else None)
        present.append(1.0 if has else 0.0)
        known.append(1.0 if ok else 0.0)
    return coords, present, known


def split_by_job(samples: list[dict], val_fraction: float, seed: int):
    jobs = sorted({s["job_id"] for s in samples})
    random.Random(seed).shuffle(jobs)
    n_val = int(round(len(jobs) * val_fraction)) if len(jobs) >= 10 else 0
    val_jobs = set(jobs[:n_val])
    return [s for s in samples if s["job_id"] not in val_jobs], [s for s in samples if s["job_id"] in val_jobs]


# ---------- checkpoints ----------
def load_checkpoint(path: str, device) -> dict:
    return torch.load(path, map_location=device, weights_only=False)


def save_new_checkpoint(src_ckpt: dict, updates: dict, task: str, out_dir: str, meta: dict) -> str:
    """Copy of the source checkpoint with the weights replaced; written under a fresh name, the source file is never modified."""
    os.makedirs(out_dir, exist_ok=True)
    gi = os.path.join(out_dir, ".gitignore")
    if not os.path.exists(gi):
        with open(gi, "w") as f:
            f.write("*\n")
    ck = dict(src_ckpt)
    ck.update(updates)
    ck["finetune"] = meta
    path = os.path.join(out_dir, f"{task}_ft_{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}.pt")
    torch.save(ck, path)
    return path
