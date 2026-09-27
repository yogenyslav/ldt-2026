"""Модели гребней подвздошных костей для пайплайна: keypoint-модель (положение точки + вероятность присутствия) и классификатор «гребень в окне».
Код модели перенесён из train_pelvis_crest_vote.ipynb ДОСЛОВНО (класс KeypointHeatmapModel); ниже инференс, повторяющий ноутбук: keypoint_infer и cls_predict_sides.
Пороги решений (keypoint, классификатор, математика) читаются из pelvis_crest_gate.json рядом с весами (см. ModelHub.gate). Зависимости: torch, timm, albumentations."""
from __future__ import annotations

import cv2
import numpy as np
import timm
import torch
import torch.nn as nn
import albumentations as A

from .crest_math import masked_window, spine_edges

IMAGE_SIZE = 224
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
SIDES = ("left", "right")
CROP_SIZE = 128
# допустимая область пика (приор ноутбука): левый канал x < CREST_LEFT_MAX_X, правый x >= CREST_RIGHT_MIN_X, оба не выше CREST_MIN_Y (масштаб 224)
CREST_MIN_Y = 120
CREST_LEFT_MAX_X = 92
CREST_RIGHT_MIN_X = 132
BACKBONES = {"convnext_tiny.fb_in22k_ft_in1k": ("stem", "stages_0"), "resnet18.fb_swsl_ig1b_ft_in1k": ("conv1", "bn1", "layer1"),
             "resnet18.tv_in1k": ("conv1", "bn1", "layer1"), "resnet18.a1_in1k": ("conv1", "bn1", "layer1")}
BACKBONE_CANDIDATES = ["convnext_tiny.fb_in22k_ft_in1k"]
PRETRAINED_BACKBONE = False                # веса приходят из чекпоинта


# ===== из ноутбука: модель =====
class KeypointHeatmapModel(nn.Module):
    def __init__(self, num_keypoints: int = 2, backbone_name: str = None):
        super().__init__()
        backbone_name = backbone_name or BACKBONE_CANDIDATES[0]
        self.encoder = timm.create_model(backbone_name, pretrained=PRETRAINED_BACKBONE, features_only=True)
        feat_ch = self.encoder.feature_info.channels()[-1]  # каналы последнего этапа (stride 32)
        for name, param in self.encoder.named_parameters():
            if name.startswith(BACKBONES[backbone_name]):
                param.requires_grad = False

        self.decoder = nn.Sequential(
            nn.Upsample(scale_factor=2, mode="bilinear", align_corners=False),
            nn.Conv2d(feat_ch, 256, kernel_size=3, padding=1), nn.BatchNorm2d(256), nn.ReLU(inplace=True),
            nn.Upsample(scale_factor=2, mode="bilinear", align_corners=False),
            nn.Conv2d(256, 128, kernel_size=3, padding=1), nn.BatchNorm2d(128), nn.ReLU(inplace=True),
            nn.Upsample(scale_factor=2, mode="bilinear", align_corners=False),
            nn.Conv2d(128, 64, kernel_size=3, padding=1), nn.BatchNorm2d(64), nn.ReLU(inplace=True),
            nn.Upsample(scale_factor=2, mode="bilinear", align_corners=False),
            nn.Conv2d(64, 32, kernel_size=3, padding=1), nn.BatchNorm2d(32), nn.ReLU(inplace=True),
            nn.Upsample(scale_factor=2, mode="bilinear", align_corners=False),
        )
        self.head = nn.Conv2d(32, num_keypoints, kernel_size=1)

        # Допустимая область пика (приор из конфигурации): вне неё логит = -20, то есть пик там
        # невозможен и в лоссе (цель там всегда 0), и на инференсе. Не сохраняется в чекпоинт.
        assert num_keypoints == 2, "маска рассчитана на левый/правый гребень"
        allowed = torch.zeros(1, 2, IMAGE_SIZE, IMAGE_SIZE, dtype=torch.bool)
        allowed[:, 0, CREST_MIN_Y:, :CREST_LEFT_MAX_X] = True
        allowed[:, 1, CREST_MIN_Y:, CREST_RIGHT_MIN_X:] = True
        self.register_buffer("allowed_region", allowed, persistent=False)

        # Голова присутствия: "точка есть/нет" отдельно от положения. Считается по признакам той же
        # области кадра, где допустим пик (левый низ / правый низ), avg+max пулинг -> 1 логит на точку.
        self.presence = nn.ModuleList([nn.Linear(2 * feat_ch, 1), nn.Linear(2 * feat_ch, 1)])

    @staticmethod
    def _pool(region):
        return torch.cat([region.mean(dim=(2, 3)), region.amax(dim=(2, 3))], dim=1)

    def forward(self, x):
        feat = self.encoder(x)[-1]  # последний этап backbone, stride 32 (7x7 при 224)
        d = self.decoder(feat)
        logits = self.head(d).masked_fill(~self.allowed_region, -20.0)  # heatmap-логиты, sigmoid снаружи

        fh, fw = feat.shape[-2:]
        r0 = int(CREST_MIN_Y / IMAGE_SIZE * fh)
        left = feat[:, :, r0:, : int(CREST_LEFT_MAX_X / IMAGE_SIZE * fw) + 1]
        right = feat[:, :, r0:, int(CREST_RIGHT_MIN_X / IMAGE_SIZE * fw):]
        presence_logits = torch.cat([self.presence[0](self._pool(left)), self.presence[1](self._pool(right))], dim=1)
        return logits, presence_logits  # (B,2,H,W), (B,2)


# ===== инференс =====
class CrestKeypointModel:
    """predict(img_u8) -> {"left": (x, y, p), "right": (x, y, p)}: координата пика heatmap в ПИКСЕЛЯХ исходного снимка и вероятность присутствия (как keypoint_infer в ноутбуке)."""

    def __init__(self, path: str, device: str = "cpu"):
        ckpt = torch.load(path, map_location=device, weights_only=False)
        self.device = device
        self.size = int(ckpt.get("image_size", IMAGE_SIZE))
        self.model = KeypointHeatmapModel(num_keypoints=2, backbone_name=ckpt["backbone_name"]).to(device)
        self.model.load_state_dict(ckpt["model_state_dict"])
        self.model.eval()
        self.thr = 0.97                                                   # перезаписывается из pelvis_crest_gate.json (ModelHub.gate)
        self.tf = A.Compose([A.LongestMaxSize(max_size=self.size),
                             A.PadIfNeeded(min_height=self.size, min_width=self.size, border_mode=cv2.BORDER_CONSTANT, fill=0)],
                            keypoint_params=A.KeypointParams(format="xy", remove_invisible=False))

    def predict(self, img_u8: np.ndarray) -> dict:
        h, w = img_u8.shape
        eq = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(img_u8)
        out = self.tf(image=eq, keypoints=[(0.0, 0.0), (float(w), float(h))])
        im, (p0, p1) = out["image"], out["keypoints"]
        sx, sy = (p1[0] - p0[0]) / w, (p1[1] - p0[1]) / h                  # обратное преобразование по образам двух известных точек
        rgb = (np.stack([im] * 3, axis=-1).astype(np.float32) / 255.0 - IMAGENET_MEAN) / IMAGENET_STD
        x = torch.from_numpy(rgb.transpose(2, 0, 1)).float().unsqueeze(0).to(self.device)
        with torch.no_grad():
            hm_logits, pres_logits = self.model(x)
        hm = torch.sigmoid(hm_logits)[0].cpu().numpy()
        pres = torch.sigmoid(pres_logits)[0].cpu().numpy()
        res = {}
        for k, side in enumerate(SIDES):
            yy, xx = np.unravel_index(np.argmax(hm[k]), hm[k].shape)
            res[side] = ((float(xx) - p0[0]) / sx, (float(yy) - p0[1]) / sy, float(pres[k]))
        return res


class CrestPresenceModel:
    """predict(img_u8) -> {"left": p, "right": p}: вероятность «гребень есть» по боковому нижнему окну со стёртым позвоночником (cls_predict_sides в ноутбуке)."""

    def __init__(self, path: str, device: str = "cpu"):
        ck = torch.load(path, map_location=device, weights_only=False)
        self.device = device
        self.model = timm.create_model(ck["backbone_name"], pretrained=False, num_classes=1).to(device)
        self.model.load_state_dict(ck["model_state_dict"])
        self.model.eval()
        self.thr = 0.7                                                    # перезаписывается из pelvis_crest_gate.json

    def predict(self, img_u8: np.ndarray) -> dict:
        edges = spine_edges(img_u8)
        out = {}
        for side in SIDES:
            crop = cv2.resize(np.ascontiguousarray(masked_window(img_u8, side, edges)), (CROP_SIZE, CROP_SIZE), interpolation=cv2.INTER_AREA)
            rgb = (np.stack([crop] * 3, axis=-1).astype(np.float32) / 255.0 - IMAGENET_MEAN) / IMAGENET_STD
            x = torch.from_numpy(rgb.transpose(2, 0, 1)).float().unsqueeze(0).to(self.device)
            with torch.no_grad():
                out[side] = float(torch.sigmoid(self.model(x)).item())
        return out
