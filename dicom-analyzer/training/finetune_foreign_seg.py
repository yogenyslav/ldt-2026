"""Fine-tune foreign_seg (segmentation of bra wire / object in the top 40% of the frame). Usage from dicom-analyzer/:
    python -m training.finetune_foreign_seg --submissions <dir|file> --images <dir> [--weights models/foreign_seg.pt] [--out-dir training_out]

Polygons (source-frame pixels) are rasterised into two masks (0 = wire, 1 = object) over the top `top_frac` rows and resized to the model's
input size, as in train_foreign_objects.ipynb. A submission with no polygons is a clean image: an all-zero target, a valid example."""
import argparse

import albumentations as A
import cv2
import numpy as np
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset

from . import common

TASK = "foreign_seg"
CLASSES = ("wire", "object")


def seg_loss(logits, target, pos_weight=8.0):
    """BCE with positive weight + dice, copied from the notebook."""
    bce = F.binary_cross_entropy_with_logits(logits, target, pos_weight=torch.tensor(pos_weight, device=logits.device))
    p = torch.sigmoid(logits)
    inter = (p * target).sum((2, 3))
    den = p.sum((2, 3)) + target.sum((2, 3))
    return bce + (1 - (2 * inter + 1) / (den + 1)).mean()


def rasterise(sub: dict, top_h: int, cols: int, size: tuple) -> np.ndarray:
    """(2, H, W) uint8 target at model resolution; polygons below the top zone are cut off by the zone itself."""
    m = np.zeros((2, top_h, cols), np.uint8)
    for poly in sub["annotations"][TASK].get("polygons", []):
        pts = np.round(np.array(poly["points"], dtype=np.float32)).astype(np.int32)
        cv2.fillPoly(m[CLASSES.index(poly["cls"])], [pts], 1)
    return np.stack([cv2.resize(c, size, interpolation=cv2.INTER_NEAREST) for c in m])


class SegDataset(Dataset):
    def __init__(self, samples: list[dict], train: bool):
        self.samples = samples
        self.tf = A.Compose([A.Affine(translate_percent=(-0.03, 0.03), scale=(0.97, 1.03), border_mode=cv2.BORDER_CONSTANT, fill=0, fill_mask=0, p=0.5),
                             A.RandomBrightnessContrast(0.15, 0.15, p=0.5)]) if train else None

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, i):
        s = self.samples[i]
        img, mask = s["img"], s["mask"]
        if self.tf is not None:
            out = self.tf(image=img, masks=[mask[0], mask[1]])
            img, mask = out["image"], np.stack(out["masks"])
        x = torch.from_numpy((img.astype(np.float32) / 255.0 - 0.449) / 0.226)[None].repeat(3, 1, 1)
        return x, torch.from_numpy(mask.astype(np.float32)), torch.tensor(s["weight"])


def _run(model, loader, opt, device):
    train = opt is not None
    model.train(train)
    total, n = 0.0, 0
    with torch.set_grad_enabled(train):
        for x, y, w in loader:
            x, y, w = x.to(device), y.to(device), w.to(device)
            loss = seg_loss(model(x), y) * w.mean()
            if train:
                opt.zero_grad()
                loss.backward()
                opt.step()
            total += loss.item() * x.size(0)
            n += x.size(0)
    return total / max(n, 1)


def main(argv=None) -> str:
    from qc.foreign_model import ForeignSegModel
    ap = argparse.ArgumentParser(description=__doc__)
    common.add_common_args(ap, TASK, "foreign_seg.pt")
    ap.add_argument("--lr", type=float, default=1e-4)
    args = ap.parse_args(argv)
    common.seed_everything(args.seed)
    device = common.pick_device(args.device)

    ck = common.load_checkpoint(args.weights, device)
    w_in, h_in = int(ck["img_size"][0]), int(ck["img_size"][1])
    top_frac = float(ck["top_frac"])
    samples = []
    for sub in common.load_submissions(args.submissions, TASK):
        img = common.load_image_for(sub, args.images)
        if img is None:
            continue
        top = img[:int(round(img.shape[0] * top_frac))]
        samples.append({"job_id": sub["job_id"], "img": cv2.resize(top, (w_in, h_in)), "mask": rasterise(sub, top.shape[0], img.shape[1], (w_in, h_in)),
                        "weight": common.STATUS_WEIGHT[sub["status"]]})
    if len(samples) < 2:
        raise SystemExit(f"{TASK}: {len(samples)} usable samples, need at least 2")
    train_s, val_s = common.split_by_job(samples, args.val_fraction, args.seed)
    print(f"{TASK}: {len(train_s)} train / {len(val_s)} val samples")

    model = ForeignSegModel(ck["backbone"], pretrained=False).to(device)
    model.load_state_dict(ck["state"])
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    loader = DataLoader(SegDataset(train_s, True), batch_size=args.batch_size, shuffle=True, drop_last=len(train_s) > args.batch_size)
    val_loader = DataLoader(SegDataset(val_s, False), batch_size=args.batch_size) if val_s else None
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
    path = common.save_new_checkpoint(ck, {"state": state}, TASK, args.out_dir, meta)
    print("saved:", path)
    return path


if __name__ == "__main__":
    main()
