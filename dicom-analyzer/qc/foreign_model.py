"""Сегментация посторонних предметов на снимке позвоночника (дужки лифчика, застёжки) для пайплайна.
Модель перенесена из train_foreign_objects.ipynb ДОСЛОВНО (ConvBlock, ForeignSegModel); очистка масок (pred_masks) и вердикт (verdict_levels) повторяют ноутбук,
параметры читаются из foreign_seg_gate.json рядом с весами. Модели подаётся верхняя часть кадра (top_frac), приведённая к img_size.
Зависимости: torch, timm."""
from __future__ import annotations

import json
import math
import os

import cv2
import numpy as np
import timm
import torch
import torch.nn as nn
import torch.nn.functional as F


# ===== из ноутбука: модель =====
class ConvBlock(nn.Sequential):
    def __init__(self, cin, cout):
        super().__init__(nn.Conv2d(cin, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True))


class ForeignSegModel(nn.Module):
    def __init__(self, name="resnet18.tv_in1k", pretrained=False):
        super().__init__()
        self.enc = timm.create_model(name, pretrained=pretrained, features_only=True, out_indices=(0, 1, 2, 3, 4))
        ch = self.enc.feature_info.channels()   # 64, 64, 128, 256, 512 (шаги 2..32)
        self.top = ConvBlock(ch[4], 128)
        self.fuse = nn.ModuleList([ConvBlock(128 + ch[i], 128) for i in range(4)])
        self.head = nn.Sequential(ConvBlock(128 + 3, 64), nn.Conv2d(64, 2, 1))

    def forward(self, x):
        feats = self.enc(x); h = self.top(feats[4])
        for i in (3, 2, 1, 0):
            h = F.interpolate(h, size=feats[i].shape[-2:], mode="bilinear", align_corners=False)
            h = self.fuse[i](torch.cat([h, feats[i]], 1))
        h = F.interpolate(h, size=x.shape[-2:], mode="bilinear", align_corners=False)
        return self.head(torch.cat([h, x], 1))   # исходный кадр подмешан на последнем шаге: тонкие линии не теряются


# ===== инференс =====
class ForeignSegAdapter:
    """predict(img_u8) -> {"verdict": "ПРЕДМЕТ"|"проверить"|"чисто", "wire_px", "object_px", "masks": {"wire", "object"}}.
    masks — бинарные uint8 массивы размера верхней части снимка (top_h, W), координаты совпадают с координатами исходного снимка (верх кадра с нулевой строки)."""

    def __init__(self, path: str, device: str = "cpu"):
        ck = torch.load(path, map_location=device, weights_only=False)
        self.device = device
        gate_path = os.path.join(os.path.dirname(path), "foreign_seg_gate.json")
        with open(gate_path, encoding="utf-8") as f:
            self.cfg = json.load(f)                                                   # параметры очистки и вердикта из ноутбука
        self.img_w, self.img_h = int(ck["img_size"][0]), int(ck["img_size"][1])
        self.top_frac = float(ck["top_frac"])
        self.model = ForeignSegModel(ck["backbone"], pretrained=False).to(device)
        self.model.load_state_dict(ck["state"])
        self.model.eval()

    def _pred_masks(self, prob2, top_u8):
        """Очистка масок как pred_masks в ноутбуке: красные (дужки) короче min_wire_len_px, не вытянутые и ниже max_wire_top_frac убираются; зелёные (предметы) меньше min_obj_comp_px
        убираются, остаётся одна самая уверенная область (выпуклая оболочка), слабую по контрасту (max над медианным фоном < obj_min_mx) отсеиваем целиком."""
        c_ = self.cfg
        out = np.zeros((2, prob2.shape[1], prob2.shape[2]), np.uint8)
        for c in range(2):
            bin_ = (prob2[c] > c_["mask_thresh"]).astype(np.uint8)
            if c == 1:
                bin_ = cv2.morphologyEx(bin_, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (c_["obj_merge_px"], c_["obj_merge_px"])))
            k, lab, st, _ = cv2.connectedComponentsWithStats(bin_, connectivity=8)
            best = None
            for i in range(1, k):
                w_, h_, a_ = st[i, cv2.CC_STAT_WIDTH], st[i, cv2.CC_STAT_HEIGHT], st[i, cv2.CC_STAT_AREA]
                keep = (math.hypot(w_, h_) >= c_["min_wire_len_px"] and st[i, cv2.CC_STAT_TOP] <= c_["max_wire_top_frac"] * prob2.shape[1]) if c == 0 else a_ >= c_["min_obj_comp_px"]
                if keep and c == 0:
                    (_, _), (rw, rh), _ = cv2.minAreaRect(np.column_stack(np.where(lab == i)[::-1]).astype(np.float32))
                    keep = max(rw, rh) / max(min(rw, rh), 1.0) >= c_["min_wire_aspect"]
                if not keep:
                    continue
                if c == 1:
                    conf = float(prob2[1][lab == i].sum())
                    if best is None or conf > best[0]:
                        best = (conf, i)
                else:
                    out[c][lab == i] = 1
            if c == 1 and best is not None:
                hull_m = np.zeros(bin_.shape, np.uint8)
                cv2.fillConvexPoly(hull_m, cv2.convexHull(np.column_stack(np.where(lab == best[1])[::-1]).astype(np.int32)), 1)
                m_nat = cv2.resize(hull_m, (top_u8.shape[1], top_u8.shape[0]), interpolation=cv2.INTER_NEAREST) > 0
                res_ = np.clip(top_u8.astype(np.float32) - cv2.medianBlur(top_u8, c_["bg_median_px"]).astype(np.float32), 0, 255)
                if m_nat.any() and res_[m_nat].max() < c_["obj_min_mx"]:
                    hull_m[:] = 0
                out[c] = hull_m
        return out

    def _verdict(self, masks2):
        if masks2[0].sum() >= self.cfg["min_wire_verdict_px"]:
            return "ПРЕДМЕТ"
        return "проверить" if masks2[1].sum() > 0 else "чисто"

    def predict(self, img_u8: np.ndarray) -> dict:
        top = img_u8[:int(round(img_u8.shape[0] * self.top_frac))]
        x = (cv2.resize(top, (self.img_w, self.img_h)).astype(np.float32) / 255.0 - 0.449) / 0.226
        xb = torch.from_numpy(x)[None, None].repeat(1, 3, 1, 1).to(self.device)
        with torch.no_grad():
            prob = torch.sigmoid(self.model(xb))[0].cpu().numpy()
        m2 = self._pred_masks(prob, top)
        masks = np.stack([cv2.resize(mm, (top.shape[1], top.shape[0]), interpolation=cv2.INTER_NEAREST) for mm in m2])
        return {"verdict": self._verdict(m2), "wire_px": int(m2[0].sum()), "object_px": int(m2[1].sum()), "masks": {"wire": masks[0], "object": masks[1]}}
