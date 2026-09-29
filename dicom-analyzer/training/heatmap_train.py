"""Fine-tuning loop shared by the two keypoint models (hip_keypoints, pelvis_crest).

Follows train_hip_keypoints.ipynb / train_pelvis_crest_vote.ipynb: CLAHE -> (mirror hip_right) -> LongestMaxSize+Pad 224 -> gaussian heatmaps (sigma 6),
weighted MSE on heatmaps + 0.2 * BCE of the presence head. Differences: lower learning rates (fine-tuning), per-point loss mask for points
without a trustworthy label, sample weight for `uncertain` submissions."""
from __future__ import annotations

import albumentations as A
import cv2
import numpy as np
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset

from . import common

IMAGE_SIZE = 224
HEATMAP_SIGMA = 6.0
POS_WEIGHT = 25.0
PRESENCE_LOSS_WEIGHT = 0.2


def clahe(img: np.ndarray) -> np.ndarray:
    return cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(img)


def _tf(train: bool) -> A.Compose:
    ops = [A.LongestMaxSize(max_size=IMAGE_SIZE),
           A.PadIfNeeded(min_height=IMAGE_SIZE, min_width=IMAGE_SIZE, border_mode=cv2.BORDER_CONSTANT, fill=0)]
    if train:
        ops += [A.Affine(scale=(0.95, 1.05), translate_percent=(-0.03, 0.03), rotate=(-5, 5), border_mode=cv2.BORDER_CONSTANT, fill=0, p=0.7),
                A.RandomBrightnessContrast(0.15, 0.15, p=0.5)]
    return A.Compose(ops, keypoint_params=A.KeypointParams(format="xy", remove_invisible=False))


def gaussian(x: float, y: float) -> np.ndarray:
    yy, xx = np.mgrid[0:IMAGE_SIZE, 0:IMAGE_SIZE]
    return np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * HEATMAP_SIGMA ** 2)).astype(np.float32)


class KeypointDataset(Dataset):
    """samples: dicts with img (uint8), coords, present, known, weight, mirror. bone_mask=True adds the hip model's bone-mask input step."""

    def __init__(self, samples: list[dict], train: bool, bone_mask: bool):
        self.samples, self.tf, self.bone_mask = samples, _tf(train), bone_mask
        if bone_mask:
            from qc.kp_model import apply_bone_mask, detect_implant
            self._apply, self._detect = apply_bone_mask, detect_implant

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, i):
        s = self.samples[i]
        implant = self._detect(s["img"])[0] if self.bone_mask else False    # on the raw frame, before CLAHE
        x, coords = clahe(s["img"]), list(s["coords"])
        if s["mirror"]:
            w = x.shape[1]
            x = np.ascontiguousarray(x[:, ::-1])
            coords = [(w - 1 - c[0], c[1]) if c else None for c in coords]
        idx = [k for k, c in enumerate(coords) if c is not None]
        out = self.tf(image=x, keypoints=[coords[k] for k in idx])
        im, c224 = out["image"], [None] * len(coords)
        for j, k in enumerate(idx):
            c224[k] = out["keypoints"][j]
        if self.bone_mask:
            im = self._apply(im, implant)
        hm = np.stack([gaussian(*c[:2]) if c else np.zeros((IMAGE_SIZE, IMAGE_SIZE), np.float32) for c in c224])
        rgb = (np.stack([im] * 3, -1).astype(np.float32) / 255.0 - common.IMAGENET_MEAN) / common.IMAGENET_STD
        return (torch.from_numpy(rgb.transpose(2, 0, 1)).float(), torch.from_numpy(hm),
                torch.tensor(s["present"]), torch.tensor(s["known"]) * s["weight"])


def loss_fn(hm_logits, pres_logits, hm, present, known):
    weight = 1.0 + (POS_WEIGHT - 1.0) * hm
    per_point = (weight * (torch.sigmoid(hm_logits) - hm) ** 2).mean((2, 3)) + \
        PRESENCE_LOSS_WEIGHT * F.binary_cross_entropy_with_logits(pres_logits, present, reduction="none")
    return (per_point * known).sum() / known.sum().clamp(min=1e-6)


def _run(model, loader, opt, device):
    train = opt is not None
    model.train(train)
    total, n = 0.0, 0
    with torch.set_grad_enabled(train):
        for x, hm, present, known in loader:
            x, hm, present, known = x.to(device), hm.to(device), present.to(device), known.to(device)
            hm_logits, pres_logits = model(x)
            loss = loss_fn(hm_logits, pres_logits, hm, present, known)
            if train:
                opt.zero_grad()
                loss.backward()
                opt.step()
            total += loss.item() * x.size(0)
            n += x.size(0)
    return total / max(n, 1)


def add_lr_args(ap):
    ap.add_argument("--head-lr", type=float, default=1e-4)
    ap.add_argument("--backbone-lr", type=float, default=1e-5)


def finetune(args, model_cls, names: list[str], bone_mask: bool, mirror_for) -> str:
    """Generic entry: args from common.add_common_args + add_lr_args, model_cls = KeypointHeatmapModel of the model, names = fixed point order,
    mirror_for(submission) -> bool (hip_right frames are mirrored to the canonical orientation)."""
    common.seed_everything(args.seed)
    device = common.pick_device(args.device)
    samples = []
    for sub in common.load_submissions(args.submissions, args.task):
        img = common.load_image_for(sub, args.images)
        if img is None:
            continue
        coords, present, known = common.points_of(sub, args.task, names)
        if not any(known):
            continue
        samples.append({"job_id": sub["job_id"], "img": img, "coords": coords, "present": present, "known": known,
                        "weight": common.STATUS_WEIGHT[sub["status"]], "mirror": mirror_for(sub)})
    if len(samples) < 2:
        raise SystemExit(f"{args.task}: {len(samples)} usable samples, need at least 2")
    train_s, val_s = common.split_by_job(samples, args.val_fraction, args.seed)
    print(f"{args.task}: {len(train_s)} train / {len(val_s)} val samples")

    ck = common.load_checkpoint(args.weights, device)
    model = model_cls(num_keypoints=len(names), backbone_name=ck["backbone_name"]).to(device)
    model.load_state_dict(ck["model_state_dict"])
    head = list(model.decoder.parameters()) + list(model.head.parameters()) + list(model.presence.parameters())
    back = [p for p in model.encoder.parameters() if p.requires_grad]
    opt = torch.optim.AdamW([{"params": head, "lr": args.head_lr}, {"params": back, "lr": args.backbone_lr}], weight_decay=0.01)

    loader = DataLoader(KeypointDataset(train_s, True, bone_mask), batch_size=args.batch_size, shuffle=True, drop_last=len(train_s) > args.batch_size)
    val_loader = DataLoader(KeypointDataset(val_s, False, bone_mask), batch_size=args.batch_size) if val_s else None
    best, best_state = float("inf"), None
    for ep in range(args.epochs):
        tl = _run(model, loader, opt, device)
        vl = _run(model, val_loader, None, device) if val_loader else None
        print(f"epoch {ep + 1}/{args.epochs} train_loss={tl:.4f}" + (f" val_loss={vl:.4f}" if vl is not None else ""))
        if vl is not None and vl < best:
            best, best_state = vl, {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
    state = best_state or {k: v.detach().cpu() for k, v in model.state_dict().items()}
    meta = {"task": args.task, "base_weights": args.weights, "samples": len(train_s), "val_samples": len(val_s),
            "epochs": args.epochs, "best_val_loss": None if best_state is None else best}
    path = common.save_new_checkpoint(ck, {"model_state_dict": state}, args.task, args.out_dir, meta)
    print("saved:", path)
    return path
