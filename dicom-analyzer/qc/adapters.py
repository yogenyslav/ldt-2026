"""Адаптеры обученных моделей: загрузка весов и predict(img_u8) в формате, который ждёт пайплайн (см. models/README.md).
Регистрируются в hub.LOADERS; torch/timm/albumentations импортируются только при загрузке весов."""
from __future__ import annotations

import numpy as np

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class RegionModel:
    """Классификатор региона: resnet18 (timm), 3 класса; препроцессинг как при обучении: CLAHE -> LongestMaxSize -> PadIfNeeded."""

    def __init__(self, path: str):
        import cv2, timm, torch
        import albumentations as A
        self.torch, self.cv2 = torch, cv2
        ckpt = torch.load(path, map_location="cpu", weights_only=False)
        self.label_to_idx = ckpt["label_to_idx"]
        self.idx_to_label = {v: k for k, v in self.label_to_idx.items()}
        self.size = int(ckpt["image_size"])
        self.model = timm.create_model("resnet18", pretrained=False, num_classes=len(self.label_to_idx))
        self.model.load_state_dict(ckpt["model_state_dict"])
        self.model.eval()
        self.tf = A.Compose([A.LongestMaxSize(max_size=self.size),
                             A.PadIfNeeded(min_height=self.size, min_width=self.size, border_mode=cv2.BORDER_CONSTANT, fill=0)])

    def predict(self, img_u8: np.ndarray) -> dict:
        eq = self.cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(img_u8)
        x = self.tf(image=eq)["image"]
        rgb = (np.stack([x] * 3, axis=-1).astype(np.float32) / 255.0 - IMAGENET_MEAN) / IMAGENET_STD
        t = self.torch.from_numpy(rgb.transpose(2, 0, 1)).float().unsqueeze(0)
        with self.torch.no_grad():
            p = self.torch.softmax(self.model(t), dim=1).numpy()[0]
        i = int(p.argmax())
        return {"label": self.idx_to_label[i], "confidence": float(p[i])}


def register(loaders: dict) -> None:
    loaders["region"] = lambda path: RegionModel(path)
    loaders["hip_keypoints"] = lambda path: __import__("qc.kp_model", fromlist=["HipKeypointModel"]).HipKeypointModel(path)
    loaders["pelvis_crest"] = lambda path: __import__("qc.crest_models", fromlist=["CrestKeypointModel"]).CrestKeypointModel(path)
    loaders["foreign_seg"] = lambda path: __import__("qc.foreign_model", fromlist=["ForeignSegAdapter"]).ForeignSegAdapter(path)
    loaders["pelvis_presence"] = lambda path: __import__("qc.crest_models", fromlist=["CrestPresenceModel"]).CrestPresenceModel(path)
