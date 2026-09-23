from __future__ import annotations
import dataclasses
import glob
import os
from typing import Optional
import albumentations as A
import cv2
import numpy as np
import torch
import torch.nn as nn
import timm
KEYPOINT_NAMES = ['большой_вертел', 'шейка_бедра', 'седалищная_кость']
IMAGE_SIZE = 224
VISIBILITY_THRESHOLD = 0.1
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

class KeypointHeatmapModel(nn.Module):

    def __init__(self, num_keypoints: int=3):
        super().__init__()
        self.encoder = timm.create_model('resnet18', pretrained=False, features_only=True, out_indices=(4,))
        channels = [512, 256, 128, 64, 32, 16]
        blocks = []
        for i in range(5):
            blocks.append(nn.Upsample(scale_factor=2, mode='bilinear', align_corners=False))
            blocks.append(nn.Conv2d(channels[i], channels[i + 1], kernel_size=3, padding=1))
            blocks.append(nn.BatchNorm2d(channels[i + 1]))
            blocks.append(nn.ReLU(inplace=True))
        self.decoder = nn.Sequential(*blocks)
        self.head = nn.Conv2d(channels[-1], num_keypoints, kernel_size=1)

    def forward(self, x):
        feat = self.encoder(x)[0]
        return self.head(self.decoder(feat))

def clahe(image: np.ndarray) -> np.ndarray:
    return cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(image)

def eval_transform(image_size: int=IMAGE_SIZE) -> A.Compose:
    return A.Compose([A.LongestMaxSize(max_size=image_size), A.PadIfNeeded(min_height=image_size, min_width=image_size, border_mode=cv2.BORDER_CONSTANT, fill=0)])

def _resize_pad_params(orig_h: int, orig_w: int, size: int=IMAGE_SIZE) -> dict:
    scale = size / max(orig_h, orig_w)
    new_h, new_w = (orig_h * scale, orig_w * scale)
    return {'scale': scale, 'new_h': new_h, 'new_w': new_w, 'pad_top': (size - new_h) / 2, 'pad_left': (size - new_w) / 2}

def _coords_224_to_original(x: float, y: float, params: dict) -> tuple[float, float]:
    orig_x = (x - params['pad_left']) / params['scale']
    orig_y = (y - params['pad_top']) / params['scale']
    return (float(orig_x), float(orig_y))

def _heatmap_to_coords(heatmap: np.ndarray) -> tuple[float, float, float]:
    idx = int(np.argmax(heatmap))
    h, w = heatmap.shape
    y, x = divmod(idx, w)
    return (float(x), float(y), float(heatmap[y, x]))

@dataclasses.dataclass
class HipKeypointResult:
    name: str
    x: Optional[float]
    y: Optional[float]
    visible: bool
    confidence: float

class HipKeypointEnsemble:

    def __init__(self, checkpoint_dir: str, device: Optional[torch.device]=None):
        self.device = device or torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.models_by_fold: dict[int, nn.Module] = {}
        for path in sorted(glob.glob(os.path.join(checkpoint_dir, 'hip_keypoints_fold*.pt'))):
            ckpt = torch.load(path, map_location=self.device, weights_only=False)
            m = KeypointHeatmapModel(num_keypoints=len(ckpt.get('keypoint_names', KEYPOINT_NAMES)))
            m.load_state_dict(ckpt['model_state_dict'])
            m.to(self.device).eval()
            self.models_by_fold[int(ckpt['fold'])] = m
        if not self.models_by_fold:
            raise FileNotFoundError(f'Нет чекпоинтов hip_keypoints_fold*.pt в {checkpoint_dir}')

    @property
    def models(self):
        return list(self.models_by_fold.values())

    @torch.no_grad()
    def predict(self, image_u8: np.ndarray, oof_fold: Optional[int]=None) -> list[HipKeypointResult]:
        models = [self.models_by_fold[oof_fold]] if oof_fold in self.models_by_fold else self.models
        orig_h, orig_w = image_u8.shape
        params = _resize_pad_params(orig_h, orig_w)
        eq = clahe(image_u8)
        image_224 = eval_transform()(image=eq)['image']
        rgb = np.stack([image_224] * 3, axis=-1).astype(np.float32) / 255.0
        rgb = (rgb - IMAGENET_MEAN) / IMAGENET_STD
        tensor = torch.from_numpy(rgb.transpose(2, 0, 1)).float().unsqueeze(0).to(self.device)
        preds = torch.stack([m(tensor) for m in models], dim=0).mean(dim=0)[0].cpu().numpy()
        results = []
        for k, name in enumerate(KEYPOINT_NAMES):
            x224, y224, peak = _heatmap_to_coords(preds[k])
            visible = peak > VISIBILITY_THRESHOLD
            if visible:
                x_orig, y_orig = _coords_224_to_original(x224, y224, params)
            else:
                x_orig, y_orig = (None, None)
            results.append(HipKeypointResult(name=name, x=x_orig, y=y_orig, visible=visible, confidence=peak))
        return results
