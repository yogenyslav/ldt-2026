"""Fine-tune pelvis_presence (classifier: is the iliac crest visible in the side window). Usage from dicom-analyzer/:
    python -m training.finetune_pelvis_presence --submissions <dir|file> --images <dir> [--weights models/pelvis_presence.pt] [--out-dir training_out]

Labels come from pelvis_crest submissions: `present` of crest_left / crest_right is the presence label of the left / right window
(contract: one checkbox feeds both models). A `pelvis_presence` block is accepted too if a submission carries one.
Input = the same window the analyzer feeds the model: qc.crest_math.masked_window (spine column erased, right side mirrored) -> 128x128."""
import argparse

import albumentations as A
import cv2
import numpy as np
import timm
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset

from . import common
from qc import crest_math

TASK = "pelvis_presence"
SIDES = ("left", "right")
CROP_SIZE = 128


def _labels(sub: dict) -> dict:
    """{side: 0/1} for the sides whose label is a human/confirmed answer."""
    ann, out = sub["annotations"], {}
    if "pelvis_crest" in ann:
        by_name = {p["name"]: p for p in ann["pelvis_crest"]["points"]}
        for side in SIDES:
            p = by_name.get(f"crest_{side}")
            if p is not None and p.get("origin") in common.TRAINABLE_ORIGIN:
                out[side] = 1.0 if p.get("present") else 0.0
    if "pelvis_presence" in ann:
        for side in SIDES:
            b = ann["pelvis_presence"].get(side)
            if b is not None and b.get("origin") in common.TRAINABLE_ORIGIN:
                out[side] = 1.0 if b.get("visible") else 0.0
    return out


class WindowDataset(Dataset):
    def __init__(self, samples: list[dict], train: bool):
        self.samples = samples
        self.tf = A.Compose([A.Affine(scale=(0.95, 1.05), translate_percent=(-0.03, 0.03), rotate=(-5, 5), border_mode=cv2.BORDER_CONSTANT, fill=0, p=0.7),
                             A.RandomBrightnessContrast(0.15, 0.15, p=0.5)]) if train else None

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, i):
        s = self.samples[i]
        crop = s["crop"] if self.tf is None else self.tf(image=s["crop"])["image"]
        rgb = (np.stack([crop] * 3, -1).astype(np.float32) / 255.0 - common.IMAGENET_MEAN) / common.IMAGENET_STD
        return torch.from_numpy(rgb.transpose(2, 0, 1)).float(), torch.tensor(s["label"]), torch.tensor(s["weight"])


def _run(model, loader, opt, device):
    train = opt is not None
    model.train(train)
    total, n = 0.0, 0
    with torch.set_grad_enabled(train):
        for x, y, w in loader:
            x, y, w = x.to(device), y.to(device), w.to(device)
            loss = (F.binary_cross_entropy_with_logits(model(x).squeeze(1), y, reduction="none") * w).sum() / w.sum()
            if train:
                opt.zero_grad()
                loss.backward()
                opt.step()
            total += loss.item() * x.size(0)
            n += x.size(0)
    return total / max(n, 1)


def main(argv=None) -> str:
    ap = argparse.ArgumentParser(description=__doc__)
    common.add_common_args(ap, TASK, "pelvis_presence.pt")
    ap.add_argument("--lr", type=float, default=3e-5)
    ap.set_defaults(epochs=10)
    args = ap.parse_args(argv)
    common.seed_everything(args.seed)
    device = common.pick_device(args.device)

    subs = {}
    for key in ("pelvis_crest", "pelvis_presence"):
        subs.update({s["submission_id"]: s for s in common.load_submissions(args.submissions, key)})
    samples = []
    for sub in subs.values():
        labels = _labels(sub)
        img = common.load_image_for(sub, args.images) if labels else None
        if img is None:
            continue
        edges = crest_math.spine_edges(img)
        for side, y in labels.items():
            crop = cv2.resize(np.ascontiguousarray(crest_math.masked_window(img, side, edges)), (CROP_SIZE, CROP_SIZE), interpolation=cv2.INTER_AREA)
            samples.append({"job_id": sub["job_id"], "crop": crop, "label": y, "weight": common.STATUS_WEIGHT[sub["status"]]})
    if len(samples) < 2:
        raise SystemExit(f"{TASK}: {len(samples)} usable samples, need at least 2")
    train_s, val_s = common.split_by_job(samples, args.val_fraction, args.seed)
    print(f"{TASK}: {len(train_s)} train / {len(val_s)} val windows")

    ck = common.load_checkpoint(args.weights, device)
    model = timm.create_model(ck["backbone_name"], pretrained=False, num_classes=1).to(device)
    model.load_state_dict(ck["model_state_dict"])
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
    loader = DataLoader(WindowDataset(train_s, True), batch_size=args.batch_size, shuffle=True, drop_last=len(train_s) > args.batch_size)
    val_loader = DataLoader(WindowDataset(val_s, False), batch_size=args.batch_size) if val_s else None
    best, best_state = float("inf"), None
    for ep in range(args.epochs):
        tl = _run(model, loader, opt, device)
        vl = _run(model, val_loader, None, device) if val_loader else None
        print(f"epoch {ep + 1}/{args.epochs} train_loss={tl:.4f}" + (f" val_loss={vl:.4f}" if vl is not None else ""))
        if vl is not None and vl < best:
            best, best_state = vl, {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
    state = best_state or {k: v.detach().cpu() for k, v in model.state_dict().items()}
    meta = {"task": TASK, "base_weights": args.weights, "samples": len(train_s), "val_samples": len(val_s),
            "epochs": args.epochs, "best_val_loss": None if best_state is None else best}
    path = common.save_new_checkpoint(ck, {"model_state_dict": state}, TASK, args.out_dir, meta)
    print("saved:", path)
    return path


if __name__ == "__main__":
    main()
