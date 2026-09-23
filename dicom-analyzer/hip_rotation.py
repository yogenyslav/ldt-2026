from __future__ import annotations
import dataclasses
import glob
import os
import random
from typing import Optional
import albumentations as A
import cv2
import numpy as np
import torch
import torch.nn as nn
import timm
IMAGE_SIZE = 224
CROP_FRACTION = 0.22
CLF_INPUT_SIZE = 128
LOW_SEG_CONFIDENCE = 0.3
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

def clahe(image: np.ndarray) -> np.ndarray:
    return cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(image)

def eval_transform(image_size: int=IMAGE_SIZE) -> A.Compose:
    return A.Compose([A.LongestMaxSize(max_size=image_size), A.PadIfNeeded(min_height=image_size, min_width=image_size, border_mode=cv2.BORDER_CONSTANT, fill=0)], keypoint_params=A.KeypointParams(format='xy', remove_invisible=False))

def to_normalized_tensor(image_u8: np.ndarray) -> torch.Tensor:
    rgb = np.stack([image_u8] * 3, axis=-1).astype(np.float32) / 255.0
    rgb = (rgb - IMAGENET_MEAN) / IMAGENET_STD
    return torch.from_numpy(rgb.transpose(2, 0, 1)).float()

def to_normalized_tensor_rgb(rgb_u8: np.ndarray) -> torch.Tensor:
    rgb = rgb_u8.astype(np.float32) / 255.0
    rgb = (rgb - IMAGENET_MEAN) / IMAGENET_STD
    return torch.from_numpy(rgb.transpose(2, 0, 1)).float()

def _resize_pad_params(orig_h: int, orig_w: int, size: int=IMAGE_SIZE) -> dict:
    scale = size / max(orig_h, orig_w)
    new_h, new_w = (orig_h * scale, orig_w * scale)
    return {'scale': scale, 'new_h': new_h, 'new_w': new_w, 'pad_top': (size - new_h) / 2, 'pad_left': (size - new_w) / 2}

def _prob_map_to_original(prob_224: np.ndarray, orig_h: int, orig_w: int, params: dict) -> np.ndarray:
    top, left = (int(round(params['pad_top'])), int(round(params['pad_left'])))
    h, w = (int(round(params['new_h'])), int(round(params['new_w'])))
    sub = prob_224[top:top + h, left:left + w]
    return cv2.resize(sub, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)

def _soft_centroid(prob_map: np.ndarray, eps: float=1e-06) -> tuple[float, float]:
    h, w = prob_map.shape
    ys, xs = np.mgrid[0:h, 0:w]
    total = prob_map.sum() + eps
    return (float((xs * prob_map).sum() / total), float((ys * prob_map).sum() / total))

def _crop_around_point(image_u8: np.ndarray, prob_map: np.ndarray, cx: float, cy: float, fraction: float, out_size: int):
    h, w = image_u8.shape
    crop_size = int(round(fraction * max(h, w)))
    half = crop_size // 2
    x0, y0 = (int(round(cx - half)), int(round(cy - half)))
    img_pad = cv2.copyMakeBorder(image_u8, half, half, half, half, cv2.BORDER_CONSTANT, value=0)
    prob_pad = cv2.copyMakeBorder(prob_map, half, half, half, half, cv2.BORDER_CONSTANT, value=0)
    x0p, y0p = (x0 + half, y0 + half)
    img_crop = img_pad[y0p:y0p + crop_size, x0p:x0p + crop_size]
    prob_crop = prob_pad[y0p:y0p + crop_size, x0p:x0p + crop_size]
    return (cv2.resize(img_crop, (out_size, out_size), interpolation=cv2.INTER_LINEAR), cv2.resize(prob_crop, (out_size, out_size), interpolation=cv2.INTER_LINEAR))

def _heatmap_overlay(gray_u8: np.ndarray, heat01: np.ndarray, alpha: float=0.6) -> np.ndarray:
    gray_f = gray_u8.astype(np.float32)
    heat = np.clip(heat01, 0.0, 1.0)
    r = np.clip(gray_f + heat * 255.0 * alpha, 0, 255)
    g = gray_f
    b = np.clip(gray_f - heat * 255.0 * alpha * 0.5, 0, 255)
    return np.stack([r, g, b], axis=-1).astype(np.uint8)

class UpBlock(nn.Module):

    def __init__(self, in_ch: int, skip_ch: int, out_ch: int):
        super().__init__()
        self.conv1 = nn.Conv2d(in_ch + skip_ch, out_ch, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm2d(out_ch)
        self.conv2 = nn.Conv2d(out_ch, out_ch, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm2d(out_ch)
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x, skip):
        x = nn.functional.interpolate(x, size=skip.shape[-2:], mode='bilinear', align_corners=False)
        x = torch.cat([x, skip], dim=1)
        x = self.relu(self.bn1(self.conv1(x)))
        return self.relu(self.bn2(self.conv2(x)))

class SegmentationModel(nn.Module):

    def __init__(self):
        super().__init__()
        self.encoder = timm.create_model('resnet18', pretrained=False, features_only=True, out_indices=(0, 1, 2, 3, 4))
        self.up1 = UpBlock(512, 256, 256)
        self.up2 = UpBlock(256, 128, 128)
        self.up3 = UpBlock(128, 64, 64)
        self.up4 = UpBlock(64, 64, 32)
        self.up5 = nn.Sequential(nn.Upsample(scale_factor=2, mode='bilinear', align_corners=False), nn.Conv2d(32, 16, kernel_size=3, padding=1), nn.BatchNorm2d(16), nn.ReLU(inplace=True))
        self.head = nn.Conv2d(16, 1, kernel_size=1)

    def forward(self, x):
        feat0, feat1, feat2, feat3, feat4 = self.encoder(x)
        d = self.up1(feat4, feat3)
        d = self.up2(d, feat2)
        d = self.up3(d, feat1)
        d = self.up4(d, feat0)
        return self.head(self.up5(d))

class SmallClassifier(nn.Module):

    def __init__(self):
        super().__init__()
        self.backbone = timm.create_model('resnet18', pretrained=False, num_classes=2)

    def forward(self, x):
        return self.backbone(x)

@dataclasses.dataclass
class HipRotationResult:
    position_error: int
    confidence: float
    seg_confidence: float
    low_confidence: bool

class HipRotationEnsemble:

    def __init__(self, checkpoint_dir: str, device: Optional[torch.device]=None):
        self.device = device or torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.seg_models_by_fold: dict[int, nn.Module] = {}
        for path in sorted(glob.glob(os.path.join(checkpoint_dir, 'seg_fold*.pt'))):
            ckpt = torch.load(path, map_location=self.device, weights_only=False)
            m = SegmentationModel().to(self.device)
            m.load_state_dict(ckpt['model_state_dict'])
            m.eval()
            self.seg_models_by_fold[int(ckpt['fold'])] = m
        self.clf_models_by_fold: dict[int, nn.Module] = {}
        for path in sorted(glob.glob(os.path.join(checkpoint_dir, 'clf_fold*.pt'))):
            ckpt = torch.load(path, map_location=self.device, weights_only=False)
            m = SmallClassifier().to(self.device)
            m.load_state_dict(ckpt['model_state_dict'])
            m.eval()
            self.clf_models_by_fold[int(ckpt['fold'])] = m
        if not self.seg_models_by_fold or not self.clf_models_by_fold:
            raise FileNotFoundError(f'Не найдены seg_fold*.pt/clf_fold*.pt в {checkpoint_dir}')

    @property
    def seg_models(self):
        return list(self.seg_models_by_fold.values())

    @property
    def clf_models(self):
        return list(self.clf_models_by_fold.values())

    @torch.no_grad()
    def _seg_prob_original(self, image_u8_clahe: np.ndarray, seg_models) -> np.ndarray:
        orig_h, orig_w = image_u8_clahe.shape
        params = _resize_pad_params(orig_h, orig_w)
        image_224 = eval_transform()(image=image_u8_clahe, keypoints=[])['image']
        tensor = to_normalized_tensor(image_224).unsqueeze(0).to(self.device)
        probs = torch.stack([torch.sigmoid(m(tensor)) for m in seg_models], dim=0).mean(dim=0)
        return _prob_map_to_original(probs[0, 0].cpu().numpy(), orig_h, orig_w, params)

    @torch.no_grad()
    def predict(self, image_u8: np.ndarray, oof_fold: Optional[int]=None) -> HipRotationResult:
        seg_models = [self.seg_models_by_fold[oof_fold]] if oof_fold in self.seg_models_by_fold else self.seg_models
        clf_models = [self.clf_models_by_fold[oof_fold]] if oof_fold in self.clf_models_by_fold else self.clf_models
        eq = clahe(image_u8)
        prob_map = self._seg_prob_original(eq, seg_models)
        cx, cy = _soft_centroid(prob_map)
        img_crop, prob_crop = _crop_around_point(eq, prob_map, cx, cy, CROP_FRACTION, CLF_INPUT_SIZE)
        rgb = _heatmap_overlay(img_crop, prob_crop)
        tensor = to_normalized_tensor_rgb(rgb).unsqueeze(0).to(self.device)
        clf_probs = torch.stack([torch.softmax(m(tensor), dim=1) for m in clf_models], dim=0).mean(dim=0)
        pred_label = int(clf_probs.argmax(dim=1).item())
        confidence = float(clf_probs[0, pred_label].item())
        seg_confidence = float(prob_map.max())
        return HipRotationResult(position_error=pred_label, confidence=confidence, seg_confidence=seg_confidence, low_confidence=seg_confidence < LOW_SEG_CONFIDENCE)
