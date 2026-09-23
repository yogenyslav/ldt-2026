import os
import random
import math
import json
import numpy as np
import pandas as pd
import cv2
import albumentations as A
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
import timm
from sklearn.metrics import accuracy_score
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
HERE = os.path.dirname(os.path.abspath(__file__))
IMAGES_DIR = os.path.join(HERE, 'x_dataset', 'dataset', 'processed', 'training_package', 'images')
KEYPOINTS_MANIFEST_PATH = os.path.join(HERE, 'x_dataset', 'dataset', 'processed', 'training_package', 'hip_keypoints_manifest.csv')
OUTPUT_DIR = os.path.join(HERE, 'outputs_keypoints')
os.makedirs(OUTPUT_DIR, exist_ok=True)
IMAGE_SIZE = 224
BATCH_SIZE = 8
NUM_EPOCHS = 60
EARLY_STOPPING_PATIENCE = 10
HEAD_LR = 0.001
BACKBONE_LR = 1e-05
N_FOLDS = 5
TEST_FOLD = N_FOLDS - 1
NUM_WORKERS = 0
KEYPOINT_NAMES = ['большой_вертел', 'шейка_бедра', 'седалищная_кость']
HEATMAP_SIGMA = 6.0
VISIBILITY_THRESHOLD = 0.3
DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print('Device:', DEVICE, flush=True)
if DEVICE.type == 'cuda':
    print('GPU:', torch.cuda.get_device_name(0), flush=True)

def clahe(image: np.ndarray) -> np.ndarray:
    return cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(image)

def build_train_transform(image_size=IMAGE_SIZE) -> A.Compose:
    return A.Compose([A.RandomBrightnessContrast(brightness_limit=0.25, contrast_limit=0.25, p=0.8), A.RandomGamma(gamma_limit=(70, 130), p=0.5), A.OneOf([A.GaussNoise(std_range=(0.02, 0.08), p=1.0), A.MultiplicativeNoise(multiplier=(0.9, 1.1), p=1.0)], p=0.4), A.Affine(scale=(0.9, 1.1), translate_percent=(0.0, 0.05), rotate=(-15, 15), fit_output=False, p=0.7), A.HorizontalFlip(p=0.5), A.LongestMaxSize(max_size=image_size), A.PadIfNeeded(min_height=image_size, min_width=image_size, border_mode=cv2.BORDER_CONSTANT, fill=0)], keypoint_params=A.KeypointParams(format='xy', remove_invisible=False), seed=SEED)

def build_eval_transform(image_size=IMAGE_SIZE) -> A.Compose:
    return A.Compose([A.LongestMaxSize(max_size=image_size), A.PadIfNeeded(min_height=image_size, min_width=image_size, border_mode=cv2.BORDER_CONSTANT, fill=0)], keypoint_params=A.KeypointParams(format='xy', remove_invisible=False))
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
COORD_COLS = [('bolshoy_vertel_x', 'bolshoy_vertel_y'), ('sheyka_bedra_x', 'sheyka_bedra_y'), ('sedalishnaya_kost_x', 'sedalishnaya_kost_y')]

def make_gaussian_heatmap(size: int, x: float, y: float, sigma: float) -> np.ndarray:
    yy, xx = np.mgrid[0:size, 0:size]
    heatmap = np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * sigma ** 2))
    return heatmap.astype(np.float32)

def get_coords_and_visibility(row):
    coords, visible = ([], [])
    for xcol, ycol in COORD_COLS:
        x, y = (row[xcol], row[ycol])
        if pd.isna(x) or pd.isna(y):
            coords.append(None)
            visible.append(0)
        else:
            coords.append((float(x), float(y)))
            visible.append(1)
    return (coords, visible)
CROP_AUG_MARGIN_MIN_PX = 5
CROP_AUG_MARGIN_MAX_PX = 25
CROP_DUPLICATE_FRACTION = 0.3

def expand_with_crop_duplicates(df: pd.DataFrame, fraction: float=CROP_DUPLICATE_FRACTION, seed: int=SEED) -> pd.DataFrame:
    clean = df.copy()
    clean['force_crop'] = 0
    subset = df.sample(frac=fraction, random_state=seed)
    cropped = subset.copy()
    cropped['force_crop'] = 1
    return pd.concat([clean, cropped], ignore_index=True)

def force_crop_all(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out['force_crop'] = 1
    return out

def apply_crop_augmentation(image: np.ndarray, coords_224: list, visible: list):
    size = image.shape[0]
    visible_idx = [i for i, v in enumerate(visible) if v == 1 and coords_224[i] is not None]
    if not visible_idx:
        return (image, coords_224, visible)
    target_i = random.choice(visible_idx)
    tx, ty = coords_224[target_i]
    margin = random.uniform(CROP_AUG_MARGIN_MIN_PX, CROP_AUG_MARGIN_MAX_PX)
    dist_to_edge = {'top': ty, 'bottom': size - ty, 'left': tx, 'right': size - tx}
    two_nearest = sorted(dist_to_edge, key=dist_to_edge.get)[:2]
    edge = random.choice(two_nearest)
    depth = int(min(size, dist_to_edge[edge] + margin))
    image = image.copy()
    if edge == 'top':
        image[:depth, :] = 0
        in_strip = lambda x, y: y < depth
    elif edge == 'bottom':
        image[size - depth:, :] = 0
        in_strip = lambda x, y: y > size - depth
    elif edge == 'left':
        image[:, :depth] = 0
        in_strip = lambda x, y: x < depth
    else:
        image[:, size - depth:] = 0
        in_strip = lambda x, y: x > size - depth
    new_visible = list(visible)
    new_coords = list(coords_224)
    for i, c in enumerate(coords_224):
        if c is not None and in_strip(c[0], c[1]):
            new_visible[i] = 0
            new_coords[i] = None
    return (image, new_coords, new_visible)

class HipKeypointDataset(Dataset):

    def __init__(self, df: pd.DataFrame, images_dir: str, train: bool, force_crop_eval: bool=False):
        self.df = df.reset_index(drop=True)
        self.images_dir = images_dir
        self.train = train
        self.force_crop_eval = force_crop_eval

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        path = os.path.join(self.images_dir, row['image_filename'])
        image_u8 = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
        if image_u8 is None:
            raise FileNotFoundError(f'Не удалось прочитать {path}')
        image_u8 = clahe(image_u8)
        coords, visible = get_coords_and_visibility(row)
        present_idx = [i for i, c in enumerate(coords) if c is not None]
        present_pts = [coords[i] for i in present_idx]
        transform = build_train_transform() if self.train else build_eval_transform()
        transformed = transform(image=image_u8, keypoints=present_pts)
        image_t = transformed['image']
        pts_t = transformed['keypoints']
        coords_224 = [None, None, None]
        for local_i, orig_i in enumerate(present_idx):
            coords_224[orig_i] = pts_t[local_i]
        if (self.train or self.force_crop_eval) and int(row.get('force_crop', 0)) == 1:
            image_t, coords_224, visible = apply_crop_augmentation(image_t, coords_224, visible)
        heatmaps = np.stack([make_gaussian_heatmap(IMAGE_SIZE, c[0], c[1], HEATMAP_SIGMA) if c is not None else np.zeros((IMAGE_SIZE, IMAGE_SIZE), dtype=np.float32) for c in coords_224], axis=0)
        rgb = np.stack([image_t] * 3, axis=-1).astype(np.float32) / 255.0
        rgb = (rgb - IMAGENET_MEAN) / IMAGENET_STD
        image_tensor = torch.from_numpy(rgb.transpose(2, 0, 1)).float()
        heatmap_tensor = torch.from_numpy(heatmaps).float()
        coords_tensor = torch.tensor([c if c is not None else (-1.0, -1.0) for c in coords_224], dtype=torch.float32)
        visible_tensor = torch.tensor(visible, dtype=torch.float32)
        return (image_tensor, heatmap_tensor, coords_tensor, visible_tensor)

class KeypointHeatmapModel(nn.Module):

    def __init__(self, num_keypoints: int=3):
        super().__init__()
        backbone = timm.create_model('resnet18', pretrained=True, features_only=True, out_indices=(4,))
        self.encoder = backbone
        for name, param in self.encoder.named_parameters():
            if name.startswith(('conv1', 'bn1', 'layer1', 'layer2')):
                param.requires_grad = False
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
        decoded = self.decoder(feat)
        return self.head(decoded)

def build_model(num_keypoints: int=3) -> nn.Module:
    return KeypointHeatmapModel(num_keypoints)

def build_optimizer(model: nn.Module):
    head_params = list(model.decoder.parameters()) + list(model.head.parameters())
    backbone_params = [p for p in model.encoder.parameters() if p.requires_grad]
    return torch.optim.AdamW([{'params': head_params, 'lr': HEAD_LR}, {'params': backbone_params, 'lr': BACKBONE_LR}])

def heatmap_to_coords(heatmap: torch.Tensor) -> torch.Tensor:
    b, k, h, w = heatmap.shape
    flat = heatmap.view(b, k, -1)
    idx = flat.argmax(dim=-1)
    ys = (idx // w).float()
    xs = (idx % w).float()
    return torch.stack([xs, ys], dim=-1)
POS_WEIGHT = 25.0

def weighted_heatmap_loss(pred: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    weights = 1.0 + POS_WEIGHT * target
    return (weights * (pred - target) ** 2).mean()

def run_epoch(model, loader, criterion, optimizer=None):
    is_train = optimizer is not None
    model.train(is_train)
    total_loss = 0.0
    total_pixel_error = 0.0
    n_visible_points = 0
    visibility_correct = 0
    n_points_total = 0
    with torch.set_grad_enabled(is_train):
        for images, heatmaps, kp_true, visible in loader:
            images = images.to(DEVICE)
            heatmaps = heatmaps.to(DEVICE)
            pred_heatmaps = model(images)
            loss = criterion(pred_heatmaps, heatmaps)
            if is_train:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
            pred_heatmaps_cpu = pred_heatmaps.detach().cpu()
            pred_coords = heatmap_to_coords(pred_heatmaps_cpu)
            mask = visible.bool()
            if mask.any():
                err = (pred_coords - kp_true).pow(2).sum(-1).sqrt()
                total_pixel_error += err[mask].sum().item()
                n_visible_points += mask.sum().item()
            peak_values = pred_heatmaps_cpu.flatten(2).max(dim=-1).values
            pred_visible = (peak_values > VISIBILITY_THRESHOLD).float()
            visibility_correct += (pred_visible == visible).sum().item()
            n_points_total += visible.numel()
            bs = images.size(0)
            total_loss += loss.item() * bs
    avg_loss = total_loss / len(loader.dataset)
    avg_pixel_error = total_pixel_error / n_visible_points if n_visible_points > 0 else float('nan')
    visibility_acc = visibility_correct / n_points_total
    return (avg_loss, avg_pixel_error, visibility_acc)

def train_one_fold(fold: int, cv_manifest: pd.DataFrame):
    set_full_determinism(int(SEED + fold))
    train_df = cv_manifest[cv_manifest['fold'] != fold]
    val_df = cv_manifest[cv_manifest['fold'] == fold]
    train_df = expand_with_crop_duplicates(train_df)
    train_ds = HipKeypointDataset(train_df, IMAGES_DIR, train=True)
    val_ds = HipKeypointDataset(val_df, IMAGES_DIR, train=False)
    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=NUM_WORKERS, drop_last=True, worker_init_fn=worker_init_fn, generator=make_generator(int(SEED + fold)))
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=NUM_WORKERS)
    model = build_model().to(DEVICE)
    optimizer = build_optimizer(model)
    criterion = weighted_heatmap_loss
    best_val_error = float('inf')
    best_state = None
    epochs_without_improvement = 0
    history = []
    best_epoch = 0
    for epoch in range(NUM_EPOCHS):
        train_loss, train_err, train_vis_acc = run_epoch(model, train_loader, criterion, optimizer)
        val_loss, val_err, val_vis_acc = run_epoch(model, val_loader, criterion)
        history.append(dict(epoch=epoch + 1, train_loss=train_loss, train_pixel_error=train_err, train_visibility_acc=train_vis_acc, val_loss=val_loss, val_pixel_error=val_err, val_visibility_acc=val_vis_acc))
        print(f'fold {fold} | epoch {epoch + 1}/{NUM_EPOCHS} | train_loss={train_loss:.5f} train_err={train_err:.2f}px train_vis_acc={train_vis_acc:.3f} | val_loss={val_loss:.5f} val_err={val_err:.2f}px val_vis_acc={val_vis_acc:.3f}', flush=True)
        if val_loss < best_val_error:
            best_val_error = val_loss
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            best_epoch = epoch + 1
            epochs_without_improvement = 0
        else:
            epochs_without_improvement += 1
            if epochs_without_improvement >= EARLY_STOPPING_PATIENCE:
                print(f'fold {fold}: early stopping на эпохе {epoch + 1}', flush=True)
                break
    checkpoint = {'model_state_dict': best_state, 'keypoint_names': KEYPOINT_NAMES, 'image_size': IMAGE_SIZE, 'best_epoch': best_epoch, 'best_val_loss': best_val_error, 'fold': fold, 'seed': SEED}
    torch.save(checkpoint, os.path.join(OUTPUT_DIR, f'hip_keypoints_fold{fold}.pt'))
    pd.DataFrame(history).to_csv(os.path.join(OUTPUT_DIR, f'kp_history_fold{fold}.csv'), index=False)
    return best_val_error

def collect_cv_val_predictions(cv_manifest: pd.DataFrame, force_crop_eval: bool=False):
    all_true, all_peak = ([], [])
    for fold in sorted((int(f) for f in cv_manifest['fold'].unique())):
        val_df = cv_manifest[cv_manifest['fold'] == fold]
        if force_crop_eval:
            val_df = force_crop_all(val_df)
        val_ds = HipKeypointDataset(val_df, IMAGES_DIR, train=False, force_crop_eval=force_crop_eval)
        val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=NUM_WORKERS)
        ckpt = torch.load(os.path.join(OUTPUT_DIR, f'hip_keypoints_fold{fold}.pt'), map_location=DEVICE, weights_only=False)
        m = build_model().to(DEVICE)
        m.load_state_dict(ckpt['model_state_dict'])
        m.eval()
        with torch.no_grad():
            for images, _heatmaps, _kp_true, visible in val_loader:
                images = images.to(DEVICE)
                preds = m(images).cpu()
                peak_values = preds.flatten(2).max(dim=-1).values
                all_true.append(visible.numpy())
                all_peak.append(peak_values.numpy())
    return (np.concatenate(all_true), np.concatenate(all_peak))

def run_ensemble_test(df: pd.DataFrame, ensemble_models, force_crop_eval: bool=False):
    ds = HipKeypointDataset(df, IMAGES_DIR, train=False, force_crop_eval=force_crop_eval)
    loader = DataLoader(ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=NUM_WORKERS)
    per_kp_errors = {name: [] for name in KEYPOINT_NAMES}
    visibility_true = {name: [] for name in KEYPOINT_NAMES}
    visibility_pred = {name: [] for name in KEYPOINT_NAMES}
    with torch.no_grad():
        for images, heatmaps, kp_true, visible in loader:
            images = images.to(DEVICE)
            preds = torch.stack([m(images).cpu() for m in ensemble_models], dim=0).mean(dim=0)
            pred_coords = heatmap_to_coords(preds)
            errors = (pred_coords - kp_true).pow(2).sum(-1).sqrt()
            peak_values = preds.flatten(2).max(dim=-1).values
            pred_vis = (peak_values > VISIBILITY_THRESHOLD).float()
            for k, name in enumerate(KEYPOINT_NAMES):
                vis_mask = visible[:, k].bool()
                if vis_mask.any():
                    per_kp_errors[name].extend(errors[vis_mask, k].tolist())
                visibility_true[name].extend(visible[:, k].tolist())
                visibility_pred[name].extend(pred_vis[:, k].tolist())
    return (per_kp_errors, visibility_true, visibility_pred)

def main():
    global VISIBILITY_THRESHOLD
    manifest = pd.read_csv(KEYPOINTS_MANIFEST_PATH)
    coord_cols_flat = [c for pair in COORD_COLS for c in pair]
    n_fully_visible = manifest[coord_cols_flat].notna().all(axis=1).sum()
    print(f'Строк всего: {len(manifest)}, со всеми 3 точками видимыми: {n_fully_visible}', flush=True)
    for xcol, ycol in COORD_COLS:
        n_missing = manifest[xcol].isna().sum()
        print(f"  {xcol.rsplit('_', 1)[0]}: невидима на {n_missing} снимках", flush=True)
    cv_manifest = manifest[manifest['fold'] != TEST_FOLD].reset_index(drop=True)
    test_manifest = manifest[manifest['fold'] == TEST_FOLD].reset_index(drop=True)
    print(f'CV: {len(cv_manifest)}, отложенный тест: {len(test_manifest)}', flush=True)
    fold_losses = []
    for fold in sorted((int(f) for f in cv_manifest['fold'].unique())):
        loss = train_one_fold(fold, cv_manifest)
        fold_losses.append(loss)
        print(f'=== fold {fold}: best val loss = {loss:.5f} ===', flush=True)
    print('val_loss по фолдам:', [round(l, 5) for l in fold_losses], flush=True)
    print('Среднее:', round(np.mean(fold_losses), 5), '± std:', round(np.std(fold_losses), 5), flush=True)
    set_full_determinism(SEED)
    true_vis_natural, peak_natural = collect_cv_val_predictions(cv_manifest, force_crop_eval=False)
    true_vis_synth, peak_synth = collect_cv_val_predictions(cv_manifest, force_crop_eval=True)
    true_vis = np.concatenate([true_vis_natural, true_vis_synth])
    peak_vals = np.concatenate([peak_natural, peak_synth])
    print(f'Натуральная валидация: {len(true_vis_natural)} точек, видимых {int(true_vis_natural.sum())}', flush=True)
    print(f'Синтетическая проверка: {len(true_vis_synth)} точек, видимых {int(true_vis_synth.sum())}', flush=True)
    candidate_thresholds = np.arange(0.02, 0.95, 0.02)
    best_threshold, best_acc = (None, -1.0)
    for thr in candidate_thresholds:
        pred = (peak_vals > thr).astype(np.float32)
        acc = (pred == true_vis).mean()
        if acc > best_acc:
            best_acc = float(acc)
            best_threshold = float(thr)
    acc_at_default = ((peak_vals > VISIBILITY_THRESHOLD).astype(np.float32) == true_vis).mean()
    print(f'Точность при старом пороге {VISIBILITY_THRESHOLD}: {acc_at_default:.3f}', flush=True)
    print(f'Откалиброванный порог: {best_threshold:.2f}, точность: {best_acc:.3f}', flush=True)
    acc_natural_only = ((peak_natural > best_threshold).astype(np.float32) == true_vis_natural).mean()
    acc_synth_only = ((peak_synth > best_threshold).astype(np.float32) == true_vis_synth).mean()
    print(f'  натуральная: {acc_natural_only:.3f}, синтетическая: {acc_synth_only:.3f}', flush=True)
    VISIBILITY_THRESHOLD = best_threshold
    print(f'VISIBILITY_THRESHOLD обновлён на {VISIBILITY_THRESHOLD:.2f}', flush=True)
    ensemble_models = []
    for fold in sorted((int(f) for f in cv_manifest['fold'].unique())):
        ckpt = torch.load(os.path.join(OUTPUT_DIR, f'hip_keypoints_fold{fold}.pt'), map_location=DEVICE, weights_only=False)
        m = build_model().to(DEVICE)
        m.load_state_dict(ckpt['model_state_dict'])
        m.eval()
        ensemble_models.append(m)
    print(f'Отложенный тест (натуральный): {len(test_manifest)} изображений', flush=True)
    per_kp_errors, visibility_true, visibility_pred = run_ensemble_test(test_manifest, ensemble_models, force_crop_eval=False)
    summary = {'fold_val_losses': fold_losses, 'mean_val_loss': float(np.mean(fold_losses)), 'std_val_loss': float(np.std(fold_losses)), 'visibility_threshold': VISIBILITY_THRESHOLD, 'visibility_threshold_calib_acc': best_acc, 'per_keypoint': {}}
    for name in KEYPOINT_NAMES:
        errs = np.array(per_kp_errors[name])
        vis_acc = accuracy_score(visibility_true[name], visibility_pred[name])
        n_visible = int(sum(visibility_true[name]))
        n_total = len(visibility_true[name])
        entry = {'n_visible': n_visible, 'n_total': n_total, 'visibility_acc': float(vis_acc)}
        if len(errs) > 0:
            entry.update({'mae_px': float(errs.mean()), 'median_px': float(np.median(errs)), 'max_px': float(errs.max())})
            print(f'{name}: MAE={errs.mean():.2f}px (n={len(errs)}), median={np.median(errs):.2f}px, max={errs.max():.2f}px | visibility_acc={vis_acc:.3f} ({n_visible}/{n_total})', flush=True)
        else:
            print(f'{name}: нет видимых точек в тесте | visibility_acc={vis_acc:.3f}', flush=True)
        summary['per_keypoint'][name] = entry
    print('Синтетическая проверка видимости (force_crop_all на отложенном тесте):', flush=True)
    set_full_determinism(SEED)
    per_kp_errors_s, visibility_true_s, visibility_pred_s = run_ensemble_test(force_crop_all(test_manifest), ensemble_models, force_crop_eval=True)
    summary['per_keypoint_synthetic_crop'] = {}
    for name in KEYPOINT_NAMES:
        vis_acc_s = accuracy_score(visibility_true_s[name], visibility_pred_s[name])
        n_visible_s = int(sum(visibility_true_s[name]))
        n_total_s = len(visibility_true_s[name])
        print(f'{name}: visibility_acc_synth={vis_acc_s:.3f} (видимых {n_visible_s}/{n_total_s})', flush=True)
        summary['per_keypoint_synthetic_crop'][name] = {'visibility_acc': float(vis_acc_s), 'n_visible': n_visible_s, 'n_total': n_total_s}
    with open(os.path.join(OUTPUT_DIR, 'kp_cv_summary.json'), 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print('Готово. Сводка сохранена в kp_cv_summary.json', flush=True)
if __name__ == '__main__':
    main()
