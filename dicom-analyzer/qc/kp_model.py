"""Модель точек бедра (большой вертел, шейка бедра, седалищная кость) для пайплайна.
Код маски кости, определения импланта и модели перенесён из train_hip_keypoints.ipynb ДОСЛОВНО (ячейки «Маска кости» и «Модель»); ниже добавлен только инференс.
Правило отсева (как в ноутбуке): точка берётся, если оценка присутствия >= presence_threshold И точка лежит внутри маски кости (point_inside_bone).
Снимок годен для измерения ротации, если взяты все три точки. Зависимости: torch, timm, albumentations."""
from __future__ import annotations

import json
import math
import os

import cv2
import numpy as np
import timm
import torch
import torch.nn as nn
import albumentations as A

IMAGE_SIZE = 224
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
KEYPOINT_NAMES = ["большой_вертел", "шейка_бедра", "седалищная_кость"]
OUT_NAMES = ["greater_trochanter_apex", "femoral_neck", "ischium"]
REGIONS = [(84, 204, 36, 154), (46, 168, 42, 150), (0, 112, 56, 194)]      # допустимые области пика в масштабе 224 (канонический кадр: боковая сторона справа)
BACKBONES = {"convnext_tiny.fb_in22k_ft_in1k": ("stem", "stages_0"), "resnet18.fb_swsl_ig1b_ft_in1k": ("conv1", "bn1", "layer1"),
             "resnet18.tv_in1k": ("conv1", "bn1", "layer1"), "resnet18.a1_in1k": ("conv1", "bn1", "layer1")}
BACKBONE_CANDIDATES = ["convnext_tiny.fb_in22k_ft_in1k"]
PRETRAINED_BACKBONE = False                # веса приходят из чекпоинта
USE_BONE_MASK_INPUT = True
BONE_MASK_INPUT_DILATE_PX = 3
BONE_MASK_OUTPUT_DILATE_PX = 1
DEFAULT_PRESENCE_THRESHOLD = 0.6


# ===== из ноутбука: маска кости и металл =====
BONE_INSIDE_RADIUS_PX = 2  # расширение проверки "внутри кости" (масштаб 224)
BONE_MIN_EXTRA_COMPONENT_PX = 150  # отдельные куски меньше этой площади (масштаб 224) отбрасываются как шум; после закрытия остаются небольшие куски кости
BONE_EXTRA_MIN_LEVEL_FRAC = 0.5    # отдельный кусок остаётся, только если он не тусклее этой доли яркости кости (дымка/мягкие ткани по краям тусклее)
# Эндопротез (металл): обычная маска рвётся (тёмный ореол вокруг чашки и ножки отрывает кость от ядра, яркий металл ломает порог). Для таких снимков маска
# другая: металл включается, разрывы замыкаются, внутренние дыры заполняются. Определение — детектор металла из проекта (services/region_classifier/implant_detect.py),
# его признак: жёсткое насыщение до 255 почти без разброса; работает по ИСХОДНОМУ кадру (до CLAHE), потому что опирается на точные значения пикселей.
# Проверен на данных: находит все 3 протеза из 153 снимков бедра и ни одного лишнего среди 99 снимков позвоночника.
IMPLANT_THRESH = 245        # порог кандидатных пятен (сам порог не решает — решают std и доля ровно 255)
IMPLANT_MIN_AREA_PX = 40
IMPLANT_MAX_STD = 2.0
IMPLANT_MIN_FRAC255 = 0.85
IMPLANT_BLOB_MIN_PX = 3000  # крупное пятно металла (головка, большая ножка) — форма не важна
IMPLANT_ROD_MIN_LEN_PX = 25  # тонкий стержень (ножка, винт) — важна форма
IMPLANT_ROD_MAX_WIDTH_PX = 22
IMPLANT_CLOSE_PX = 9        # ядро замыкания разрывов маски (эллипс, масштаб 224)
IMPLANT_SAT_DILATE_PX = 3   # металл расширяется, чтобы слиться с окружающей костью


def _segment_seed(img_u8: np.ndarray) -> np.ndarray:
    eq = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(img_u8)
    blur = cv2.GaussianBlur(eq, (5, 5), 0)
    _, th = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    kernel = np.ones((3, 3), np.uint8)
    th = cv2.morphologyEx(th, cv2.MORPH_OPEN, kernel)
    th = cv2.morphologyEx(th, cv2.MORPH_CLOSE, kernel)
    n, lab, st, _ = cv2.connectedComponentsWithStats(th, connectivity=8)
    if n <= 1:
        return th > 0
    return lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])


def detect_implant(img_u8: np.ndarray) -> tuple:
    # металл эндопротеза (services/region_classifier/implant_detect.py): пятно насыщения до 255 с малым разбросом; "blob" — крупное, "rod" — тонкий стержень
    sat = (img_u8 >= IMPLANT_THRESH).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(sat, connectivity=8)
    for k in range(1, n):
        area = stats[k, cv2.CC_STAT_AREA]
        if area < IMPLANT_MIN_AREA_PX:
            continue
        ys, xs = np.where(labels == k)
        vals = img_u8[ys, xs].astype(np.float32)
        if vals.std() > IMPLANT_MAX_STD or (vals == 255).mean() < IMPLANT_MIN_FRAC255:
            continue
        if area >= IMPLANT_BLOB_MIN_PX:
            return True, "blob"
        (cx, cy), (w, h), angle = cv2.minAreaRect(np.column_stack([xs, ys]).astype(np.float32))
        if max(w, h) >= IMPLANT_ROD_MIN_LEN_PX and min(w, h) <= IMPLANT_ROD_MAX_WIDTH_PX:
            return True, "rod"
    return False, "none"


def fill_internal_holes(mask: np.ndarray) -> np.ndarray:
    # заполняет только ВНУТРЕННИЕ дыры (не связанные с внешним фоном); вокруг кадра добавляется рамка фона, чтобы области, упирающиеся в край кадра, дырами не считались
    inv = np.pad((~mask).astype(np.uint8), 1, constant_values=1)
    ff = np.zeros((inv.shape[0] + 2, inv.shape[1] + 2), np.uint8)
    cv2.floodFill(inv, ff, (0, 0), 2)
    return mask | (inv[1:-1, 1:-1] == 1)


def implant_bone_mask(img_u8: np.ndarray, mask: np.ndarray) -> np.ndarray:
    metal = cv2.dilate((img_u8 >= 250).astype(np.uint8), np.ones((IMPLANT_SAT_DILATE_PX, IMPLANT_SAT_DILATE_PX), np.uint8)) > 0
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (IMPLANT_CLOSE_PX, IMPLANT_CLOSE_PX))
    closed = cv2.morphologyEx((mask | metal).astype(np.uint8), cv2.MORPH_CLOSE, kernel) > 0
    return fill_internal_holes(closed)


def bone_mask(img_u8: np.ndarray, implant: bool = False, rel: float = 0.2, min_thr: float = 12.0) -> np.ndarray:
    # маска кости: ядро (Otsu, наибольшая светлая область) достраивается порогом относительно фона (как bone_mask_full в hip_roi_margins.py)
    smooth = cv2.GaussianBlur(img_u8.astype(np.float32), (0, 0), 1.0)
    seeds = _segment_seed(img_u8)
    if seeds.sum() < 50:
        return np.zeros(img_u8.shape, bool)
    level = float(np.median(smooth[seeds]))
    ring = cv2.dilate(seeds.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=20) > 0
    bg = float(np.percentile(smooth[~ring], 80)) if (~ring).sum() > 200 else 0.0
    thr = bg + max(min_thr, rel * (level - bg))
    n, lab, st, _ = cv2.connectedComponentsWithStats((smooth >= thr).astype(np.uint8), connectivity=8)
    keep = set(np.unique(lab[seeds]).tolist()) | {k for k in range(1, n) if st[k, cv2.CC_STAT_AREA] >= BONE_MIN_EXTRA_COMPONENT_PX
                                                   and float(np.median(smooth[lab == k])) >= BONE_EXTRA_MIN_LEVEL_FRAC * level}
    keep.discard(0)
    mask = np.isin(lab, list(keep))
    return implant_bone_mask(img_u8, mask) if implant else mask


def dilate_mask(mask: np.ndarray, r: int) -> np.ndarray:
    if r <= 0:
        return mask
    return cv2.dilate(mask.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))) > 0


def point_inside_bone(mask: np.ndarray, x: float, y: float, r: int = BONE_INSIDE_RADIUS_PX) -> bool:
    h, w = mask.shape
    xi, yi = int(round(x)), int(round(y))
    return bool(mask[max(0, yi - r):min(h, yi + r + 1), max(0, xi - r):min(w, xi + r + 1)].any())



def apply_bone_mask(image_u8: np.ndarray, implant: bool = False) -> np.ndarray:
    # чистое фото: всё вне (расширенной) маски кости — ноль; implant — снимок с металлом (другая маска)
    return image_u8 * dilate_mask(bone_mask(image_u8, implant), BONE_MASK_INPUT_DILATE_PX).astype(np.uint8)


# ===== из ноутбука: модель =====
BG_NORM = float((0.0 - IMAGENET_MEAN[0]) / IMAGENET_STD[0])  # значение чёрного пикселя (u8 = 0) после нормализации по ImageNet


class KeypointHeatmapModel(nn.Module):
    def __init__(self, num_keypoints: int = 3, backbone_name: str = None):
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

        # Допустимая область пика каждой точки (REGIONS): вне неё логит = -20. Не сохраняется в чекпоинт.
        assert num_keypoints == len(REGIONS)
        allowed = torch.zeros(1, num_keypoints, IMAGE_SIZE, IMAGE_SIZE, dtype=torch.bool)
        for k, (x0, x1, y0, y1) in enumerate(REGIONS):
            allowed[:, k, max(0, y0):min(IMAGE_SIZE, y1), max(0, x0):min(IMAGE_SIZE, x1)] = True
        self.register_buffer("allowed_region", allowed, persistent=False)

        # Голова присутствия: "точка есть/нет" отдельно от положения, по признакам своей области, avg+max пулинг -> 1 логит на точку.
        self.presence = nn.ModuleList([nn.Linear(2 * feat_ch, 1) for _ in range(num_keypoints)])

    @staticmethod
    def _pool(region):
        return torch.cat([region.mean(dim=(2, 3)), region.amax(dim=(2, 3))], dim=1)

    def forward(self, x):
        feat = self.encoder(x)[-1]  # последний этап backbone, stride 32 (7x7 при 224)
        d = self.decoder(feat)
        logits = self.head(d).masked_fill(~self.allowed_region, -20.0)  # heatmap-логиты, sigmoid снаружи
        if USE_BONE_MASK_INPUT:
            # пик разрешён только на кости: вход уже обнулён вне маски, поэтому "есть кость" = пиксель выше фона (0 после нормализации)
            valid = (x[:, :1] > BG_NORM + 1e-3).float()
            r = BONE_MASK_OUTPUT_DILATE_PX
            if r > 0:
                valid = nn.functional.max_pool2d(valid, kernel_size=2 * r + 1, stride=1, padding=r)
            logits = logits.masked_fill(valid < 0.5, -20.0)

        fh, fw = feat.shape[-2:]
        outs = []
        for k, (x0, x1, y0, y1) in enumerate(REGIONS):
            ya = int(y0 / IMAGE_SIZE * fh)
            yb = max(ya + 1, math.ceil(y1 / IMAGE_SIZE * fh))
            xa = int(x0 / IMAGE_SIZE * fw)
            xb = max(xa + 1, math.ceil(x1 / IMAGE_SIZE * fw))
            outs.append(self.presence[k](self._pool(feat[:, :, ya:yb, xa:xb])))
        return logits, torch.cat(outs, dim=1)  # (B,K,H,W), (B,K)


# ===== инференс =====
class HipKeypointModel:
    """predict(img_u8, side) -> {"points": {имя: (x, y, оценка)} только ВЗЯТЫЕ точки в пикселях исходного снимка, "found_all": bool, "raw": {имя: {"conf", "inside"}}}.
    side: image_left | image_right (боковая сторона бедра приводится вправо зеркалированием, как при обучении)."""

    def __init__(self, path: str, device: str = "cpu"):
        ckpt = torch.load(path, map_location=device, weights_only=False)
        self.device = device
        self.size = int(ckpt.get("image_size", IMAGE_SIZE))
        self.backbone = ckpt["backbone_name"]
        self.model = KeypointHeatmapModel(num_keypoints=len(KEYPOINT_NAMES), backbone_name=self.backbone).to(device)
        self.model.load_state_dict(ckpt["model_state_dict"])
        self.model.eval()
        gate = os.path.join(os.path.dirname(path), "hip_keypoints_gate.json")
        self.thr = DEFAULT_PRESENCE_THRESHOLD
        if os.path.exists(gate):
            with open(gate, encoding="utf-8") as f:
                self.thr = float(json.load(f)["presence_threshold"])
        self.tf = A.Compose([A.LongestMaxSize(max_size=self.size),
                             A.PadIfNeeded(min_height=self.size, min_width=self.size, border_mode=cv2.BORDER_CONSTANT, fill=0)],
                            keypoint_params=A.KeypointParams(format="xy", remove_invisible=False))

    def predict(self, img_u8: np.ndarray, side: str) -> dict:
        h, w = img_u8.shape
        implant, _ = detect_implant(img_u8)                                   # по ИСХОДНОМУ кадру (до CLAHE)
        x = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(img_u8)
        mirrored = side == "image_right"
        if mirrored:
            x = np.ascontiguousarray(x[:, ::-1])
        out = self.tf(image=x, keypoints=[(0.0, 0.0), (float(w), float(h))])
        im, (p0, p1) = out["image"], out["keypoints"]
        sx, sy = (p1[0] - p0[0]) / w, (p1[1] - p0[1]) / h                      # обратное преобразование по образам двух известных точек
        if USE_BONE_MASK_INPUT:
            im = apply_bone_mask(im, implant)
        rgb = (np.stack([im] * 3, axis=-1).astype(np.float32) / 255.0 - IMAGENET_MEAN) / IMAGENET_STD
        t = torch.from_numpy(rgb.transpose(2, 0, 1)).float().unsqueeze(0).to(self.device)
        with torch.no_grad():
            hm_logits, pres_logits = self.model(t)
        hm = torch.sigmoid(hm_logits)[0].cpu().numpy()
        pres = torch.sigmoid(pres_logits)[0].cpu().numpy()
        mask = bone_mask(im, implant)                                          # маска по входному (уже очищенному) снимку, как в ноутбуке
        points, raw = {}, {}
        for k, name in enumerate(OUT_NAMES):
            yy, xx = np.unravel_index(np.argmax(hm[k]), hm[k].shape)
            inside = point_inside_bone(mask, xx, yy)
            conf = float(pres[k])
            raw[name] = {"conf": conf, "inside": bool(inside)}
            if conf >= self.thr and inside:
                ox, oy = (float(xx) - p0[0]) / sx, (float(yy) - p0[1]) / sy
                if mirrored:
                    ox = (w - 1) - ox
                points[name] = (ox, oy, conf)
        return {"points": points, "found_all": len(points) == len(OUT_NAMES), "raw": raw}
