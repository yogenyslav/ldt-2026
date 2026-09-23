import os
import random
import json
import numpy as np
import pandas as pd
import cv2
import albumentations as A
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import timm
from sklearn.metrics import f1_score, accuracy_score, classification_report, confusion_matrix
SEED = 42

def set_full_determinism(seed: int=SEED) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False
set_full_determinism(SEED)

def worker_init_fn(worker_id: int) -> None:
    worker_seed = SEED + worker_id
    random.seed(worker_seed)
    np.random.seed(worker_seed)

def make_generator(seed: int=SEED) -> torch.Generator:
    g = torch.Generator()
    g.manual_seed(seed)
    return g
SCRATCH = 'C:\\Users\\MSI\\AppData\\Local\\Temp\\claude\\C--Users-MSI-Downloads\\7a59254c-1e85-4733-9fee-c89cb749aee6\\scratchpad'
IMAGES_DIR = os.path.join(SCRATCH, 'x_dataset', 'dataset', 'processed', 'training_package', 'images')
KEYPOINTS_MANIFEST_PATH = os.path.join(SCRATCH, 'x_dataset', 'dataset', 'processed', 'training_package', 'hip_keypoints_manifest.csv')
OUTPUT_DIR = 'C:\\Users\\MSI\\Downloads\\outputs_lesser_trochanter'
os.makedirs(OUTPUT_DIR, exist_ok=True)
IMAGE_SIZE = 224
CROP_FRACTION = 0.22
CLF_INPUT_SIZE = 128
CROP_JITTER_FRAC = 0.15
BATCH_SIZE = 8
NUM_EPOCHS_SEG = 60
NUM_EPOCHS_CLF = 60
EARLY_STOPPING_PATIENCE = 15
HEAD_LR = 0.001
BACKBONE_LR = 1e-05
N_FOLDS = 5
TEST_FOLD = N_FOLDS - 1
NUM_WORKERS = 0
DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print('Device:', DEVICE, flush=True)
if DEVICE.type == 'cuda':
    print('GPU:', torch.cuda.get_device_name(0), flush=True)
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

def clahe(image: np.ndarray) -> np.ndarray:
    return cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(image)

def parse_polygon(text: str) -> list:
    return [tuple(map(float, p.split(','))) for p in text.split(';')]

def polygon_to_mask(size: int, polygon_xy: list) -> np.ndarray:
    mask = np.zeros((size, size), dtype=np.uint8)
    pts = np.array(polygon_xy, dtype=np.int32).reshape(-1, 1, 2)
    cv2.fillPoly(mask, [pts], 1)
    return mask

def build_seg_train_transform(image_size=IMAGE_SIZE) -> A.Compose:
    return A.Compose([A.RandomBrightnessContrast(brightness_limit=0.25, contrast_limit=0.25, p=0.8), A.RandomGamma(gamma_limit=(70, 130), p=0.5), A.OneOf([A.GaussNoise(std_range=(0.02, 0.08), p=1.0), A.MultiplicativeNoise(multiplier=(0.9, 1.1), p=1.0)], p=0.4), A.Affine(scale=(0.9, 1.1), translate_percent=(0.0, 0.05), rotate=(-15, 15), fit_output=False, p=0.7), A.HorizontalFlip(p=0.5), A.LongestMaxSize(max_size=image_size), A.PadIfNeeded(min_height=image_size, min_width=image_size, border_mode=cv2.BORDER_CONSTANT, fill=0)], keypoint_params=A.KeypointParams(format='xy', remove_invisible=False), seed=SEED)

def build_eval_transform(image_size=IMAGE_SIZE) -> A.Compose:
    return A.Compose([A.LongestMaxSize(max_size=image_size), A.PadIfNeeded(min_height=image_size, min_width=image_size, border_mode=cv2.BORDER_CONSTANT, fill=0)], keypoint_params=A.KeypointParams(format='xy', remove_invisible=False))

def to_normalized_tensor(image_u8: np.ndarray) -> torch.Tensor:
    rgb = np.stack([image_u8] * 3, axis=-1).astype(np.float32) / 255.0
    rgb = (rgb - IMAGENET_MEAN) / IMAGENET_STD
    return torch.from_numpy(rgb.transpose(2, 0, 1)).float()

def resize_pad_params(orig_h: int, orig_w: int, size: int=IMAGE_SIZE) -> dict:
    scale = size / max(orig_h, orig_w)
    new_h, new_w = (orig_h * scale, orig_w * scale)
    pad_top = (size - new_h) / 2
    pad_left = (size - new_w) / 2
    return {'scale': scale, 'new_h': new_h, 'new_w': new_w, 'pad_top': pad_top, 'pad_left': pad_left}

def prob_map_to_original(prob_224: np.ndarray, orig_h: int, orig_w: int, params: dict) -> np.ndarray:
    top, left = (int(round(params['pad_top'])), int(round(params['pad_left'])))
    h, w = (int(round(params['new_h'])), int(round(params['new_w'])))
    sub = prob_224[top:top + h, left:left + w]
    return cv2.resize(sub, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)

def soft_centroid(prob_map: np.ndarray, eps: float=1e-06):
    h, w = prob_map.shape
    ys, xs = np.mgrid[0:h, 0:w]
    total = prob_map.sum() + eps
    cx = float((xs * prob_map).sum() / total)
    cy = float((ys * prob_map).sum() / total)
    return (cx, cy)

@torch.no_grad()
def predict_seg_prob_original(image_u8: np.ndarray, models: list) -> np.ndarray:
    orig_h, orig_w = image_u8.shape
    params = resize_pad_params(orig_h, orig_w)
    image_224 = build_eval_transform()(image=image_u8, keypoints=[])['image']
    tensor = to_normalized_tensor(image_224).unsqueeze(0).to(DEVICE)
    probs = torch.stack([torch.sigmoid(m(tensor)) for m in models], dim=0).mean(dim=0)
    prob_224 = probs[0, 0].cpu().numpy()
    return prob_map_to_original(prob_224, orig_h, orig_w, params)

def crop_around_point(image_u8: np.ndarray, prob_map: np.ndarray, cx: float, cy: float, fraction: float, out_size: int, jitter_frac: float=0.0):
    h, w = image_u8.shape
    crop_size = int(round(fraction * max(h, w)))
    if jitter_frac > 0:
        cx = cx + random.uniform(-jitter_frac, jitter_frac) * crop_size
        cy = cy + random.uniform(-jitter_frac, jitter_frac) * crop_size
    half = crop_size // 2
    x0, y0 = (int(round(cx - half)), int(round(cy - half)))
    img_pad = cv2.copyMakeBorder(image_u8, half, half, half, half, cv2.BORDER_CONSTANT, value=0)
    prob_pad = cv2.copyMakeBorder(prob_map, half, half, half, half, cv2.BORDER_CONSTANT, value=0)
    x0p, y0p = (x0 + half, y0 + half)
    img_crop = img_pad[y0p:y0p + crop_size, x0p:x0p + crop_size]
    prob_crop = prob_pad[y0p:y0p + crop_size, x0p:x0p + crop_size]
    img_crop = cv2.resize(img_crop, (out_size, out_size), interpolation=cv2.INTER_LINEAR)
    prob_crop = cv2.resize(prob_crop, (out_size, out_size), interpolation=cv2.INTER_LINEAR)
    return (img_crop, prob_crop)

def heatmap_overlay(gray_u8: np.ndarray, heat01: np.ndarray, alpha: float=0.6) -> np.ndarray:
    gray_f = gray_u8.astype(np.float32)
    heat = np.clip(heat01, 0.0, 1.0)
    r = np.clip(gray_f + heat * 255.0 * alpha, 0, 255)
    g = gray_f
    b = np.clip(gray_f - heat * 255.0 * alpha * 0.5, 0, 255)
    return np.stack([r, g, b], axis=-1).astype(np.uint8)

def to_normalized_tensor_rgb(rgb_u8: np.ndarray) -> torch.Tensor:
    rgb = rgb_u8.astype(np.float32) / 255.0
    rgb = (rgb - IMAGENET_MEAN) / IMAGENET_STD
    return torch.from_numpy(rgb.transpose(2, 0, 1)).float()

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
        x = self.relu(self.bn2(self.conv2(x)))
        return x

class SegmentationModel(nn.Module):

    def __init__(self):
        super().__init__()
        self.encoder = timm.create_model('resnet18', pretrained=True, features_only=True, out_indices=(0, 1, 2, 3, 4))
        for name, param in self.encoder.named_parameters():
            if name.startswith(('conv1', 'bn1', 'layer1', 'layer2', 'layer3')):
                param.requires_grad = False
        self.up1 = UpBlock(in_ch=512, skip_ch=256, out_ch=256)
        self.up2 = UpBlock(in_ch=256, skip_ch=128, out_ch=128)
        self.up3 = UpBlock(in_ch=128, skip_ch=64, out_ch=64)
        self.up4 = UpBlock(in_ch=64, skip_ch=64, out_ch=32)
        self.up5 = nn.Sequential(nn.Upsample(scale_factor=2, mode='bilinear', align_corners=False), nn.Conv2d(32, 16, kernel_size=3, padding=1), nn.BatchNorm2d(16), nn.ReLU(inplace=True))
        self.head = nn.Conv2d(16, 1, kernel_size=1)

    def forward(self, x):
        feat0, feat1, feat2, feat3, feat4 = self.encoder(x)
        d = self.up1(feat4, feat3)
        d = self.up2(d, feat2)
        d = self.up3(d, feat1)
        d = self.up4(d, feat0)
        d = self.up5(d)
        return self.head(d)

def dice_loss(logits: torch.Tensor, targets: torch.Tensor, eps: float=1e-06) -> torch.Tensor:
    probs = torch.sigmoid(logits)
    probs = probs.view(probs.size(0), -1)
    targets = targets.view(targets.size(0), -1)
    intersection = (probs * targets).sum(dim=1)
    union = probs.sum(dim=1) + targets.sum(dim=1)
    dice = (2 * intersection + eps) / (union + eps)
    return 1 - dice.mean()

class SegDataset(Dataset):

    def __init__(self, df: pd.DataFrame, images_dir: str, train: bool):
        self.df = df.reset_index(drop=True)
        self.images_dir = images_dir
        self.train = train

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        path = os.path.join(self.images_dir, row['image_filename'])
        image_u8 = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
        image_u8 = clahe(image_u8)
        polygon = parse_polygon(row['polygon'])
        transform = build_seg_train_transform() if self.train else build_eval_transform()
        transformed = transform(image=image_u8, keypoints=polygon)
        image_t = transformed['image']
        polygon_t = transformed['keypoints']
        mask = polygon_to_mask(IMAGE_SIZE, polygon_t)
        image_tensor = to_normalized_tensor(image_t)
        mask_tensor = torch.from_numpy(mask).float().unsqueeze(0)
        return (image_tensor, mask_tensor)

def build_seg_optimizer(model: nn.Module):
    decoder_modules = [model.up1, model.up2, model.up3, model.up4, model.up5, model.head]
    head_params = [p for m in decoder_modules for p in m.parameters()]
    backbone_params = [p for p in model.encoder.parameters() if p.requires_grad]
    return torch.optim.AdamW([{'params': head_params, 'lr': HEAD_LR}, {'params': backbone_params, 'lr': BACKBONE_LR}], weight_decay=0.05)

def run_seg_epoch(model, loader, optimizer=None):
    is_train = optimizer is not None
    model.train(is_train)
    total_loss, total_dice, n = (0.0, 0.0, 0)
    with torch.set_grad_enabled(is_train):
        for images, masks in loader:
            images, masks = (images.to(DEVICE), masks.to(DEVICE))
            logits = model(images)
            loss = dice_loss(logits, masks) + nn.functional.binary_cross_entropy_with_logits(logits, masks)
            if is_train:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
            with torch.no_grad():
                pred = (torch.sigmoid(logits) > 0.5).float()
                inter = (pred * masks).sum(dim=(1, 2, 3))
                union = pred.sum(dim=(1, 2, 3)) + masks.sum(dim=(1, 2, 3))
                dice = ((2 * inter + 1e-06) / (union + 1e-06)).mean().item()
            bs = images.size(0)
            total_loss += loss.item() * bs
            total_dice += dice * bs
            n += bs
    return (total_loss / n, total_dice / n)

def train_seg_one_fold(fold: int, seg_cv: pd.DataFrame):
    set_full_determinism(int(SEED + fold))
    train_df = seg_cv[seg_cv['fold'] != fold]
    val_df = seg_cv[seg_cv['fold'] == fold]
    train_ds = SegDataset(train_df, IMAGES_DIR, train=True)
    val_ds = SegDataset(val_df, IMAGES_DIR, train=False)
    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=NUM_WORKERS, drop_last=True, worker_init_fn=worker_init_fn, generator=make_generator(int(SEED + fold)))
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=NUM_WORKERS)
    model = SegmentationModel().to(DEVICE)
    optimizer = build_seg_optimizer(model)
    best_dice, best_state, patience = (-1.0, None, 0)
    history = []
    for epoch in range(NUM_EPOCHS_SEG):
        train_loss, train_dice = run_seg_epoch(model, train_loader, optimizer)
        val_loss, val_dice = run_seg_epoch(model, val_loader)
        print(f'[seg] fold {fold} | epoch {epoch + 1}/{NUM_EPOCHS_SEG} | train_dice={train_dice:.3f} | val_dice={val_dice:.3f}', flush=True)
        history.append(dict(epoch=epoch + 1, train_loss=train_loss, train_dice=train_dice, val_loss=val_loss, val_dice=val_dice))
        if val_dice > best_dice:
            best_dice = val_dice
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            patience = 0
        else:
            patience += 1
            if patience >= EARLY_STOPPING_PATIENCE:
                print(f'[seg] fold {fold}: early stopping на эпохе {epoch + 1}', flush=True)
                break
    torch.save({'model_state_dict': best_state, 'image_size': IMAGE_SIZE, 'fold': fold, 'best_val_dice': best_dice}, os.path.join(OUTPUT_DIR, f'seg_fold{fold}.pt'))
    pd.DataFrame(history).to_csv(os.path.join(OUTPUT_DIR, f'seg_history_fold{fold}.csv'), index=False)
    return best_dice

class LesserTrochanterClfDataset(Dataset):

    def __init__(self, df: pd.DataFrame, images_dir: str, seg_models_by_fold: dict, train: bool):
        self.df = df.reset_index(drop=True)
        self.images_dir = images_dir
        self.seg_models_by_fold = seg_models_by_fold
        self.train = train
        self.aug = A.Compose([A.RandomBrightnessContrast(brightness_limit=0.25, contrast_limit=0.25, p=0.8), A.RandomGamma(gamma_limit=(70, 130), p=0.5)]) if train else None

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        path = os.path.join(self.images_dir, row['image_filename'])
        image_u8 = clahe(cv2.imread(path, cv2.IMREAD_GRAYSCALE))
        model = self.seg_models_by_fold[int(row['fold'])]
        prob_map = predict_seg_prob_original(image_u8, [model])
        cx, cy = soft_centroid(prob_map)
        jitter = CROP_JITTER_FRAC if self.train else 0.0
        img_crop, prob_crop = crop_around_point(image_u8, prob_map, cx, cy, CROP_FRACTION, CLF_INPUT_SIZE, jitter)
        if self.aug is not None:
            img_crop = self.aug(image=img_crop)['image']
        rgb = heatmap_overlay(img_crop, prob_crop)
        tensor = to_normalized_tensor_rgb(rgb)
        label = int(row['position_error'])
        return (tensor, label)

class SmallClassifier(nn.Module):

    def __init__(self):
        super().__init__()
        self.backbone = timm.create_model('resnet18', pretrained=True, num_classes=2)
        for name, param in self.backbone.named_parameters():
            if name.startswith(('conv1', 'bn1', 'layer1')):
                param.requires_grad = False

    def forward(self, x):
        return self.backbone(x)

def run_clf_epoch(model, loader, criterion, optimizer=None):
    is_train = optimizer is not None
    model.train(is_train)
    total_loss, all_preds, all_labels = (0.0, [], [])
    with torch.set_grad_enabled(is_train):
        for images, labels in loader:
            images, labels = (images.to(DEVICE), labels.to(DEVICE))
            outputs = model(images)
            loss = criterion(outputs, labels)
            if is_train:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
            total_loss += loss.item() * images.size(0)
            all_preds.extend(outputs.argmax(dim=1).cpu().numpy())
            all_labels.extend(labels.cpu().numpy())
    f1 = f1_score(all_labels, all_preds, average='macro', zero_division=0)
    return (total_loss / len(loader.dataset), f1, all_preds, all_labels)

def train_clf_one_fold(fold: int, clf_cv: pd.DataFrame, seg_models_by_fold: dict):
    set_full_determinism(int(SEED + fold))
    train_df = clf_cv[clf_cv['fold'] != fold]
    val_df = clf_cv[clf_cv['fold'] == fold]
    if val_df['position_error'].nunique() < 2:
        print(f'[clf] fold {fold}: в валидации только один класс, пропуск фолда', flush=True)
        return None
    counts = train_df['position_error'].value_counts()
    weights = torch.tensor([1.0 / counts.get(0, 1), 1.0 / counts.get(1, 1)], dtype=torch.float32)
    weights = weights / weights.sum() * 2
    train_ds = LesserTrochanterClfDataset(train_df, IMAGES_DIR, seg_models_by_fold, train=True)
    val_ds = LesserTrochanterClfDataset(val_df, IMAGES_DIR, seg_models_by_fold, train=False)
    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=NUM_WORKERS, drop_last=True, worker_init_fn=worker_init_fn, generator=make_generator(int(SEED + fold)))
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=NUM_WORKERS)
    model = SmallClassifier().to(DEVICE)
    optimizer = torch.optim.AdamW(model.parameters(), lr=HEAD_LR)
    criterion = nn.CrossEntropyLoss(weight=weights.to(DEVICE))
    best_f1, best_state, patience = (-1.0, None, 0)
    history = []
    for epoch in range(NUM_EPOCHS_CLF):
        train_loss, train_f1, _, _ = run_clf_epoch(model, train_loader, criterion, optimizer)
        val_loss, val_f1, val_preds, val_labels = run_clf_epoch(model, val_loader, criterion)
        print(f'[clf] fold {fold} | epoch {epoch + 1}/{NUM_EPOCHS_CLF} | train_f1={train_f1:.3f} | val_f1={val_f1:.3f}', flush=True)
        history.append(dict(epoch=epoch + 1, train_loss=train_loss, train_f1=train_f1, val_loss=val_loss, val_f1=val_f1))
        if val_f1 > best_f1:
            best_f1 = val_f1
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            patience = 0
        else:
            patience += 1
            if patience >= EARLY_STOPPING_PATIENCE:
                print(f'[clf] fold {fold}: early stopping на эпохе {epoch + 1}', flush=True)
                break
    torch.save({'model_state_dict': best_state, 'fold': fold, 'best_val_f1': best_f1}, os.path.join(OUTPUT_DIR, f'clf_fold{fold}.pt'))
    pd.DataFrame(history).to_csv(os.path.join(OUTPUT_DIR, f'clf_history_fold{fold}.csv'), index=False)
    return best_f1

@torch.no_grad()
def predict_pipeline(image_u8: np.ndarray, seg_models: list, clf_models: list) -> dict:
    prob_map = predict_seg_prob_original(image_u8, seg_models)
    cx, cy = soft_centroid(prob_map)
    img_crop, prob_crop = crop_around_point(image_u8, prob_map, cx, cy, CROP_FRACTION, CLF_INPUT_SIZE, jitter_frac=0.0)
    rgb = heatmap_overlay(img_crop, prob_crop)
    tensor = to_normalized_tensor_rgb(rgb).unsqueeze(0).to(DEVICE)
    clf_probs = torch.stack([torch.softmax(m(tensor), dim=1) for m in clf_models], dim=0).mean(dim=0)
    pred_label = int(clf_probs.argmax(dim=1).item())
    confidence = float(clf_probs[0, pred_label].item())
    return {'position_error': pred_label, 'confidence': confidence, 'seg_confidence': float(prob_map.max())}

def main():
    manifest = pd.read_csv(KEYPOINTS_MANIFEST_PATH)
    seg_df = manifest[manifest['polygon'].notna() & (manifest['polygon'] != '')].reset_index(drop=True)
    print(f'Для сегментации (есть полигон): {len(seg_df)}', flush=True)
    clf_df = seg_df[seg_df['position_error'].notna()].reset_index(drop=True)
    clf_df = clf_df[clf_df['position_error'] != ''].reset_index(drop=True)
    clf_df['position_error'] = clf_df['position_error'].astype(int)
    print(f'Для классификатора (есть полигон + метка position_error): {len(clf_df)}', flush=True)
    print(clf_df['position_error'].value_counts().to_dict(), flush=True)
    seg_cv = seg_df[seg_df['fold'] != TEST_FOLD].reset_index(drop=True)
    seg_test = seg_df[seg_df['fold'] == TEST_FOLD].reset_index(drop=True)
    clf_cv = clf_df[clf_df['fold'] != TEST_FOLD].reset_index(drop=True)
    clf_test = clf_df[clf_df['fold'] == TEST_FOLD].reset_index(drop=True)
    print(f'Seg CV/test: {len(seg_cv)}/{len(seg_test)}', flush=True)
    print(f'Clf CV/test: {len(clf_cv)}/{len(clf_test)}', flush=True)
    seg_fold_scores = []
    for fold in sorted((int(f) for f in seg_cv['fold'].unique())):
        score = train_seg_one_fold(fold, seg_cv)
        seg_fold_scores.append(score)
        print(f'=== seg fold {fold}: best val Dice = {score:.3f} ===', flush=True)
    print('Dice по фолдам:', [round(s, 3) for s in seg_fold_scores], flush=True)
    print('Среднее:', round(np.mean(seg_fold_scores), 3), '± std:', round(np.std(seg_fold_scores), 3), flush=True)
    seg_models_by_fold = {}
    for fold in sorted((int(f) for f in seg_cv['fold'].unique())):
        ckpt = torch.load(os.path.join(OUTPUT_DIR, f'seg_fold{fold}.pt'), map_location=DEVICE, weights_only=False)
        m = SegmentationModel().to(DEVICE)
        m.load_state_dict(ckpt['model_state_dict'])
        m.eval()
        seg_models_by_fold[fold] = m
    print(f'Загружено моделей сегментации: {len(seg_models_by_fold)}', flush=True)
    clf_fold_scores = []
    for fold in sorted((int(f) for f in clf_cv['fold'].unique())):
        score = train_clf_one_fold(fold, clf_cv, seg_models_by_fold)
        if score is not None:
            clf_fold_scores.append(score)
            print(f'=== clf fold {fold}: best val macro-F1 = {score:.3f} ===', flush=True)
    print('Macro-F1 по фолдам:', [round(s, 3) for s in clf_fold_scores], flush=True)
    if clf_fold_scores:
        print('Среднее:', round(np.mean(clf_fold_scores), 3), '± std:', round(np.std(clf_fold_scores), 3), flush=True)
    seg_models = list(seg_models_by_fold.values())
    clf_models = []
    for fold in sorted((int(f) for f in clf_cv['fold'].unique())):
        ckpt_path = os.path.join(OUTPUT_DIR, f'clf_fold{fold}.pt')
        if not os.path.exists(ckpt_path):
            continue
        ckpt = torch.load(ckpt_path, map_location=DEVICE, weights_only=False)
        m = SmallClassifier().to(DEVICE)
        m.load_state_dict(ckpt['model_state_dict'])
        m.eval()
        clf_models.append(m)
    print(f'Моделей сегментации в ансамбле: {len(seg_models)}, классификации: {len(clf_models)}', flush=True)
    test_preds, test_labels, low_conf = ([], [], [])
    for _, row in clf_test.iterrows():
        path = os.path.join(IMAGES_DIR, row['image_filename'])
        image_u8 = clahe(cv2.imread(path, cv2.IMREAD_GRAYSCALE))
        result = predict_pipeline(image_u8, seg_models, clf_models)
        if result['seg_confidence'] < 0.3:
            low_conf.append(row['image_filename'])
        test_preds.append(result['position_error'])
        test_labels.append(int(row['position_error']))
    print(f'Отложенный тест целиком через пайплайн: {len(test_preds)} изображений', flush=True)
    if low_conf:
        print(f'Низкая уверенность сегментации (<0.3): {len(low_conf)} — {low_conf}', flush=True)
    summary = {'seg_fold_dice': seg_fold_scores, 'seg_mean_dice': float(np.mean(seg_fold_scores)), 'seg_std_dice': float(np.std(seg_fold_scores)), 'clf_fold_macro_f1': clf_fold_scores, 'clf_mean_macro_f1': float(np.mean(clf_fold_scores)) if clf_fold_scores else None, 'clf_std_macro_f1': float(np.std(clf_fold_scores)) if clf_fold_scores else None, 'n_low_seg_confidence_test': len(low_conf), 'low_seg_confidence_files': low_conf, 'n_test': len(test_preds), 'test_label_counts': {str(k): int(v) for k, v in pd.Series(test_labels).value_counts().to_dict().items()}}
    if len(set(test_labels)) > 1:
        report_text = classification_report(test_labels, test_preds, target_names=['норма', 'ошибка_позиции'], digits=3)
        print(report_text, flush=True)
        cm = confusion_matrix(test_labels, test_preds)
        cm_df = pd.DataFrame(cm, index=['норма', 'ошибка_позиции'], columns=['норма', 'ошибка_позиции'])
        print('Confusion matrix:', flush=True)
        print(cm_df, flush=True)
        summary['test_classification_report'] = report_text
        summary['test_confusion_matrix'] = cm.tolist()
        with open(os.path.join(OUTPUT_DIR, 'test_classification_report.txt'), 'w', encoding='utf-8') as f:
            f.write(report_text)
        cm_df.to_csv(os.path.join(OUTPUT_DIR, 'test_confusion_matrix.csv'))
    else:
        acc = accuracy_score(test_labels, test_preds)
        print('В отложенном тесте только один класс — accuracy:', acc, flush=True)
        summary['test_accuracy_single_class'] = float(acc)
    with open(os.path.join(OUTPUT_DIR, 'lt_cv_summary.json'), 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print('Готово. Сводка сохранена в lt_cv_summary.json', flush=True)
if __name__ == '__main__':
    main()
