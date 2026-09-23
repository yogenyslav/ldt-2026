import glob
import os
import cv2
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score, f1_score, precision_score, recall_score
from spine_artifacts import artifact_score
SCRATCH = 'C:\\Users\\MSI\\AppData\\Local\\Temp\\claude\\C--Users-MSI-Downloads\\7a59254c-1e85-4733-9fee-c89cb749aee6\\scratchpad'
TEST_FOLD = 4
xlsx = glob.glob(os.path.join(SCRATCH, 'x_dataset', 'dataset', 'raw', '*', '*.xlsx'))[0]
df = pd.read_excel(xlsx, header=None).iloc[2:102, :13]
df.columns = ['n', 'study', 'sp_pos', 'sp_axis', 'sp_art', 'R_pos', 'R_roi', 'L_pos', 'L_roi', 'fin_sp', 'fin_R', 'fin_L', 'comment']
for c in df.columns[2:12]:
    df[c] = pd.to_numeric(df[c], errors='coerce')
df['study'] = df['study'].astype(str)
manifest = pd.read_csv(os.path.join(SCRATCH, 'x_dataset', 'dataset', 'processed', 'training_package', 'manifest.csv'))
manifest['study_uid'] = manifest['study_uid'].astype(str)
sp = manifest[manifest.region == 'spine'][['image_hash', 'study_uid', 'fold']]
j = df.merge(sp, left_on='study', right_on='study_uid', how='inner').dropna(subset=['sp_art'])
images_dir = os.path.join(SCRATCH, 'x_dataset', 'dataset', 'processed', 'training_package', 'images')
j['score'] = j.image_hash.apply(lambda h: artifact_score(cv2.imread(os.path.join(images_dir, h + '.png'), cv2.IMREAD_GRAYSCALE)))
cv = j[j.fold != TEST_FOLD]
test = j[j.fold == TEST_FOLD]
print(f'CV: n={len(cv)}, положительных={int(cv.sp_art.sum())}')
print(f'TEST_FOLD={TEST_FOLD}: n={len(test)}, положительных={int(test.sp_art.sum())}')
print(f'AUC на CV: {roc_auc_score(cv.sp_art, cv.score):.3f}')
best_thr, best_f1 = (None, -1)
for thr in np.arange(cv.score.min(), cv.score.max(), 0.5):
    pred = (cv.score > thr).astype(int)
    f1 = f1_score(cv.sp_art, pred, zero_division=0)
    if f1 > best_f1:
        best_f1, best_thr = (f1, thr)
print(f'\nЛучший порог на CV: {best_thr:.1f}, F1 на CV: {best_f1:.3f}')
pred_test = (test.score > best_thr).astype(int)
print(f'\nНа TEST_FOLD={TEST_FOLD} с этим порогом:')
print(f'precision={precision_score(test.sp_art, pred_test, zero_division=0):.3f}, recall={recall_score(test.sp_art, pred_test, zero_division=0):.3f}, F1={f1_score(test.sp_art, pred_test, zero_division=0):.3f}')
print(f'AUC на TEST_FOLD: {roc_auc_score(test.sp_art, test.score):.3f}' if test.sp_art.nunique() > 1 else 'AUC: н/д (1 класс)')
