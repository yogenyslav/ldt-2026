import os
import json
import random
import hashlib
import platform
import subprocess
from datetime import datetime, timezone
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
MANIFEST_PATH = os.path.join(SCRATCH, 'x_dataset', 'dataset', 'processed', 'training_package', 'manifest.csv')
OUTPUT_DIR = 'C:\\Users\\MSI\\Downloads\\outputs_region_classifier'
os.makedirs(OUTPUT_DIR, exist_ok=True)
IMAGE_SIZE = 224
BATCH_SIZE = 16
NUM_EPOCHS = 40
EARLY_STOPPING_PATIENCE = 7
HEAD_LR = 0.001
BACKBONE_LR = 1e-05
N_FOLDS = 5
TEST_FOLD = N_FOLDS - 1
NUM_WORKERS = 0
ENABLE_TRAIN_AUGMENTATION = False
ENABLE_FLIP_AUGMENTATION = True
RADIMAGENET_WEIGHTS_PATH = None
LABEL_TO_IDX = {'spine': 0, 'hip_left': 1, 'hip_right': 2}
IDX_TO_LABEL = {v: k for k, v in LABEL_TO_IDX.items()}
DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print('Device:', DEVICE, flush=True)
if DEVICE.type == 'cuda':
    print('GPU:', torch.cuda.get_device_name(0), flush=True)

def file_md5(path: str) -> str:
    with open(path, 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()

def get_pip_freeze() -> list:
    try:
        out = subprocess.run(['pip', 'freeze'], capture_output=True, text=True, check=True)
        return out.stdout.splitlines()
    except Exception as exc:
        return [f'pip freeze failed: {exc}']
run_info = {'timestamp_utc': datetime.now(timezone.utc).isoformat(), 'seed': SEED, 'python_version': platform.python_version(), 'platform': platform.platform(), 'torch_version': torch.__version__, 'cuda_available': torch.cuda.is_available(), 'gpu_name': torch.cuda.get_device_name(0) if torch.cuda.is_available() else None, 'timm_version': timm.__version__, 'albumentations_version': A.__version__, 'manifest_path': MANIFEST_PATH, 'manifest_md5': file_md5(MANIFEST_PATH), 'hyperparameters': {'image_size': IMAGE_SIZE, 'batch_size': BATCH_SIZE, 'num_epochs': NUM_EPOCHS, 'early_stopping_patience': EARLY_STOPPING_PATIENCE, 'head_lr': HEAD_LR, 'backbone_lr': BACKBONE_LR, 'n_folds': N_FOLDS, 'backbone': 'resnet18 (timm, ImageNet pretrained)', 'enable_train_augmentation': ENABLE_TRAIN_AUGMENTATION, 'enable_flip_augmentation': ENABLE_FLIP_AUGMENTATION}, 'label_to_idx': LABEL_TO_IDX}
with open(os.path.join(OUTPUT_DIR, 'run_info.json'), 'w', encoding='utf-8') as f:
    json.dump(run_info, f, ensure_ascii=False, indent=2)
with open(os.path.join(OUTPUT_DIR, 'pip_freeze.txt'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(get_pip_freeze()))
FLIP_LABEL_SWAP = {'hip_left': 'hip_right', 'hip_right': 'hip_left'}

def flip_with_label_swap(image: np.ndarray, label: str, p: float=0.5):
    if random.random() >= p:
        return (image, label)
    flipped = cv2.flip(image, 1)
    return (flipped, FLIP_LABEL_SWAP.get(label, label))

def clahe(image: np.ndarray) -> np.ndarray:
    return cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(image)

def build_train_transform(image_size=IMAGE_SIZE) -> A.Compose:
    return A.Compose([A.RandomBrightnessContrast(brightness_limit=0.25, contrast_limit=0.25, p=0.8), A.RandomGamma(gamma_limit=(70, 130), p=0.5), A.OneOf([A.GaussNoise(std_range=(0.02, 0.08), p=1.0), A.MultiplicativeNoise(multiplier=(0.9, 1.1), p=1.0)], p=0.4), A.OneOf([A.GaussianBlur(blur_limit=(3, 5), p=1.0), A.Sharpen(alpha=(0.1, 0.3), p=1.0)], p=0.3), A.Affine(scale=(0.92, 1.08), translate_percent=(0.0, 0.06), rotate=(-12, 12), fit_output=False, p=0.7), A.CoarseDropout(num_holes_range=(1, 2), hole_height_range=(0.05, 0.18), hole_width_range=(0.05, 0.18), fill=0, p=0.25), A.LongestMaxSize(max_size=image_size), A.PadIfNeeded(min_height=image_size, min_width=image_size, border_mode=cv2.BORDER_CONSTANT, fill=0)], seed=SEED)

def build_eval_transform(image_size=IMAGE_SIZE) -> A.Compose:
    return A.Compose([A.LongestMaxSize(max_size=image_size), A.PadIfNeeded(min_height=image_size, min_width=image_size, border_mode=cv2.BORDER_CONSTANT, fill=0)])

def augment_sample(image_u8: np.ndarray, label: str, train: bool, image_size=IMAGE_SIZE):
    image = clahe(image_u8)
    if train:
        if ENABLE_FLIP_AUGMENTATION:
            image, label = flip_with_label_swap(image, label)
        transform = build_train_transform(image_size) if ENABLE_TRAIN_AUGMENTATION else build_eval_transform(image_size)
    else:
        transform = build_eval_transform(image_size)
    augmented = transform(image=image)['image']
    return (augmented, label)
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

class RegionDataset(Dataset):

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
        if image_u8 is None:
            raise FileNotFoundError(f'Не удалось прочитать {path}')
        image_u8, label = augment_sample(image_u8, row['label'], train=self.train)
        rgb = np.stack([image_u8] * 3, axis=-1).astype(np.float32) / 255.0
        rgb = (rgb - IMAGENET_MEAN) / IMAGENET_STD
        tensor = torch.from_numpy(rgb.transpose(2, 0, 1)).float()
        return (tensor, LABEL_TO_IDX[label])

def build_model(num_classes: int=3) -> nn.Module:
    model = timm.create_model('resnet18', pretrained=True, num_classes=num_classes)
    for name, param in model.named_parameters():
        if name.startswith(('conv1', 'bn1', 'layer1', 'layer2')):
            param.requires_grad = False
    return model

def build_optimizer(model: nn.Module):
    head_params, backbone_params = ([], [])
    for name, param in model.named_parameters():
        if not param.requires_grad:
            continue
        if name.startswith('fc'):
            head_params.append(param)
        else:
            backbone_params.append(param)
    return torch.optim.AdamW([{'params': head_params, 'lr': HEAD_LR}, {'params': backbone_params, 'lr': BACKBONE_LR}])

def run_epoch(model, loader, criterion, optimizer=None):
    is_train = optimizer is not None
    model.train(is_train)
    total_loss = 0.0
    all_preds, all_labels = ([], [])
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
    avg_loss = total_loss / len(loader.dataset)
    acc = accuracy_score(all_labels, all_preds)
    f1_macro = f1_score(all_labels, all_preds, average='macro')
    return (avg_loss, acc, f1_macro, all_preds, all_labels)

def train_one_fold(fold: int, manifest: pd.DataFrame):
    set_full_determinism(int(SEED + fold))
    train_df = manifest[manifest['fold'] != fold]
    val_df = manifest[manifest['fold'] == fold]
    train_ds = RegionDataset(train_df, IMAGES_DIR, train=True)
    val_ds = RegionDataset(val_df, IMAGES_DIR, train=False)
    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=NUM_WORKERS, drop_last=True, worker_init_fn=worker_init_fn, generator=make_generator(int(SEED + fold)))
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE, shuffle=False, num_workers=NUM_WORKERS)
    model = build_model().to(DEVICE)
    optimizer = build_optimizer(model)
    criterion = nn.CrossEntropyLoss()
    best_val_f1 = -1.0
    best_state = None
    epochs_without_improvement = 0
    history = []
    best_epoch = 0
    best_preds, best_labels = ([], [])
    for epoch in range(NUM_EPOCHS):
        train_loss, train_acc, train_f1, _, _ = run_epoch(model, train_loader, criterion, optimizer)
        val_loss, val_acc, val_f1, val_preds, val_labels = run_epoch(model, val_loader, criterion)
        history.append(dict(epoch=epoch + 1, train_loss=train_loss, train_acc=train_acc, train_f1=train_f1, val_loss=val_loss, val_acc=val_acc, val_f1=val_f1))
        print(f'fold {fold} | epoch {epoch + 1}/{NUM_EPOCHS} | train_loss={train_loss:.4f} train_f1={train_f1:.4f} | val_loss={val_loss:.4f} val_acc={val_acc:.4f} val_f1={val_f1:.4f}', flush=True)
        if val_f1 > best_val_f1:
            best_val_f1 = val_f1
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            best_preds, best_labels = (val_preds, val_labels)
            best_epoch = epoch + 1
            epochs_without_improvement = 0
        else:
            epochs_without_improvement += 1
            if epochs_without_improvement >= EARLY_STOPPING_PATIENCE:
                print(f'fold {fold}: early stopping на эпохе {epoch + 1}', flush=True)
                break
    checkpoint = {'model_state_dict': best_state, 'label_to_idx': LABEL_TO_IDX, 'image_size': IMAGE_SIZE, 'best_epoch': best_epoch, 'best_val_f1': best_val_f1, 'fold': fold, 'run_info': run_info}
    torch.save(checkpoint, os.path.join(OUTPUT_DIR, f'region_classifier_fold{fold}.pt'))
    pd.DataFrame(history).to_csv(os.path.join(OUTPUT_DIR, f'history_fold{fold}.csv'), index=False)
    return (best_val_f1, best_preds, best_labels)

class EnsembleClassifier:

    def __init__(self, checkpoint_paths: list, device: torch.device=DEVICE):
        self.device = device
        self.models = []
        self.label_to_idx = None
        self.image_size = IMAGE_SIZE
        for path in checkpoint_paths:
            ckpt = torch.load(path, map_location=device, weights_only=False)
            if self.label_to_idx is None:
                self.label_to_idx = ckpt['label_to_idx']
                self.image_size = ckpt['image_size']
            model = build_model(num_classes=len(ckpt['label_to_idx']))
            model.load_state_dict(ckpt['model_state_dict'])
            model.to(device).eval()
            self.models.append(model)
        self.idx_to_label = {v: k for k, v in self.label_to_idx.items()}
        print(f'Загружено моделей в ансамбль: {len(self.models)}', flush=True)

    def _preprocess(self, image_u8: np.ndarray) -> torch.Tensor:
        image, _ = augment_sample(image_u8, label='spine', train=False, image_size=self.image_size)
        rgb = np.stack([image] * 3, axis=-1).astype(np.float32) / 255.0
        rgb = (rgb - IMAGENET_MEAN) / IMAGENET_STD
        tensor = torch.from_numpy(rgb.transpose(2, 0, 1)).float()
        return tensor.unsqueeze(0).to(self.device)

    @torch.no_grad()
    def predict(self, image_u8: np.ndarray) -> dict:
        tensor = self._preprocess(image_u8)
        per_model_probs = []
        for model in self.models:
            logits = model(tensor)
            probs = torch.softmax(logits, dim=1).cpu().numpy()[0]
            per_model_probs.append(probs)
        per_model_probs = np.stack(per_model_probs, axis=0)
        avg_probs = per_model_probs.mean(axis=0)
        pred_idx = int(avg_probs.argmax())
        return {'label': self.idx_to_label[pred_idx], 'confidence': float(avg_probs[pred_idx]), 'probs_by_class': {self.idx_to_label[i]: float(p) for i, p in enumerate(avg_probs)}, 'per_model_agreement': float((per_model_probs.argmax(axis=1) == pred_idx).mean())}

def main():
    manifest = pd.read_csv(MANIFEST_PATH)
    print('Всего строк в манифесте:', len(manifest), flush=True)
    print(manifest['label'].value_counts().to_dict(), flush=True)
    print(manifest['fold'].value_counts().sort_index().to_dict(), flush=True)
    cv_manifest = manifest[manifest['fold'] != TEST_FOLD].reset_index(drop=True)
    test_manifest = manifest[manifest['fold'] == TEST_FOLD].reset_index(drop=True)
    print(f'CV (обучение/валидация): {len(cv_manifest)} изображений', flush=True)
    print(f'Отложенный тест (fold {TEST_FOLD}): {len(test_manifest)} изображений', flush=True)
    fold_scores = []
    all_val_preds, all_val_labels = ([], [])
    for fold in sorted((int(f) for f in cv_manifest['fold'].unique())):
        best_f1, preds, labels = train_one_fold(fold, cv_manifest)
        fold_scores.append(best_f1)
        all_val_preds.extend(preds)
        all_val_labels.extend(labels)
        print(f'=== fold {fold}: best val macro-F1 = {best_f1:.4f} ===', flush=True)
    print('Macro-F1 по фолдам:', [round(s, 4) for s in fold_scores], flush=True)
    print('Среднее:', round(np.mean(fold_scores), 4), '± std:', round(np.std(fold_scores), 4), flush=True)
    with open(os.path.join(OUTPUT_DIR, 'cv_summary.json'), 'w', encoding='utf-8') as f:
        json.dump({'fold_scores': fold_scores, 'mean_f1': float(np.mean(fold_scores)), 'std_f1': float(np.std(fold_scores))}, f, ensure_ascii=False, indent=2)
    target_names = [IDX_TO_LABEL[i] for i in range(len(IDX_TO_LABEL))]
    report_text = classification_report(all_val_labels, all_val_preds, target_names=target_names, digits=3)
    print(report_text, flush=True)
    cm = confusion_matrix(all_val_labels, all_val_preds)
    cm_df = pd.DataFrame(cm, index=target_names, columns=target_names)
    print('Confusion matrix (CV, out-of-fold):', flush=True)
    print(cm_df, flush=True)
    with open(os.path.join(OUTPUT_DIR, 'classification_report.txt'), 'w', encoding='utf-8') as f:
        f.write(report_text)
    cm_df.to_csv(os.path.join(OUTPUT_DIR, 'confusion_matrix.csv'))
    ensemble = EnsembleClassifier([os.path.join(OUTPUT_DIR, f'region_classifier_fold{fold}.pt') for fold in sorted((int(f) for f in cv_manifest['fold'].unique()))])
    test_preds, test_labels_true, test_confidences, test_agreements = ([], [], [], [])
    for _, row in test_manifest.iterrows():
        img = cv2.imread(os.path.join(IMAGES_DIR, row['image_filename']), cv2.IMREAD_GRAYSCALE)
        result = ensemble.predict(img)
        test_preds.append(LABEL_TO_IDX[result['label']])
        test_labels_true.append(LABEL_TO_IDX[row['label']])
        test_confidences.append(result['confidence'])
        test_agreements.append(result['per_model_agreement'])
    test_report = classification_report(test_labels_true, test_preds, target_names=target_names, digits=3)
    print(f'Отложенный тест: {len(test_manifest)} изображений (никогда не участвовали в обучении)', flush=True)
    print(test_report, flush=True)
    test_cm = confusion_matrix(test_labels_true, test_preds)
    test_cm_df = pd.DataFrame(test_cm, index=target_names, columns=target_names)
    print('Confusion matrix (отложенный тест):', flush=True)
    print(test_cm_df, flush=True)
    print(f'Средняя уверенность ансамбля: {np.mean(test_confidences):.3f}, среднее согласие моделей: {np.mean(test_agreements):.3f}', flush=True)
    with open(os.path.join(OUTPUT_DIR, 'holdout_test_classification_report.txt'), 'w', encoding='utf-8') as f:
        f.write(test_report)
    test_cm_df.to_csv(os.path.join(OUTPUT_DIR, 'holdout_test_confusion_matrix.csv'))
    summary = {'fold_scores': fold_scores, 'mean_f1': float(np.mean(fold_scores)), 'std_f1': float(np.std(fold_scores)), 'cv_classification_report': report_text, 'cv_confusion_matrix': cm.tolist(), 'test_classification_report': test_report, 'test_confusion_matrix': test_cm.tolist(), 'test_mean_confidence': float(np.mean(test_confidences)), 'test_mean_ensemble_agreement': float(np.mean(test_agreements))}
    with open(os.path.join(OUTPUT_DIR, 'final_summary.json'), 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print('Готово. Сводка сохранена в final_summary.json', flush=True)
if __name__ == '__main__':
    main()
