import glob
import os
import numpy as np
import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix, precision_score, recall_score, f1_score
SCRATCH = 'C:\\Users\\MSI\\AppData\\Local\\Temp\\claude\\C--Users-MSI-Downloads\\7a59254c-1e85-4733-9fee-c89cb749aee6\\scratchpad'
report = pd.read_csv('C:\\Users\\MSI\\Downloads\\report_full_dataset_oof.csv')
report['study_folder'] = report['path_to_study'].apply(lambda p: os.path.basename(p.rstrip('/\\')))
report['quality_class_num'] = pd.to_numeric(report['quality_class'], errors='coerce')
manifest = pd.read_csv(os.path.join(SCRATCH, 'x_dataset', 'dataset', 'processed', 'training_package', 'manifest.csv'))
manifest['study_uid'] = manifest['study_uid'].astype(str)
study_fold = manifest.drop_duplicates('study_uid').set_index('study_uid')['fold']
xlsx_path = glob.glob(os.path.join(SCRATCH, 'x_dataset', 'dataset', 'raw', '*', '*.xlsx'))[0]
df = pd.read_excel(xlsx_path, header=None).iloc[2:102, :13]
df.columns = ['n', 'study', 'sp_pos', 'sp_axis', 'sp_art', 'R_pos', 'R_roi', 'L_pos', 'L_roi', 'fin_sp', 'fin_R', 'fin_L', 'comment']
for c in df.columns[2:12]:
    df[c] = pd.to_numeric(df[c], errors='coerce')
df['study'] = df['study'].astype(str)
df['fold'] = df['study'].map(study_fold)

def bootstrap_ci(y_true, y_pred, metric_fn, n_boot=3000, seed=42):
    rng = np.random.default_rng(seed)
    y_true, y_pred = (np.asarray(y_true), np.asarray(y_pred))
    n = len(y_true)
    vals = []
    for _ in range(n_boot):
        idx = rng.integers(0, n, n)
        yt, yp = (y_true[idx], y_pred[idx])
        if len(np.unique(yt)) < 2:
            continue
        try:
            vals.append(metric_fn(yt, yp, zero_division=0))
        except Exception:
            continue
    if not vals:
        return (float('nan'), float('nan'))
    return (float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5)))

def summarize(name, y_true, y_pred):
    n = len(y_true)
    n_pos = int(sum(y_true))
    print(f'\n=== {name}: n={n}, положительных={n_pos} ===')
    if n_pos == 0 or n_pos == n:
        print(f'Только один класс — accuracy={(np.array(y_true) == np.array(y_pred)).mean():.3f}')
        return
    print(classification_report(y_true, y_pred, target_names=['норма', 'нарушение'], digits=3, zero_division=0))
    print('Confusion matrix:\n', confusion_matrix(y_true, y_pred))
    for label, fn in [('precision', precision_score), ('recall', recall_score), ('F1', f1_score)]:
        lo, hi = bootstrap_ci(y_true, y_pred, fn)
        print(f'{label} = {fn(y_true, y_pred, zero_division=0):.3f}, 95% ДИ [{lo:.3f}, {hi:.3f}]')
sp = report[report['anatomical_region'] == 'spine']
sp = sp.merge(df[['study', 'sp_axis', 'sp_art', 'sp_pos', 'fin_sp']], left_on='study_folder', right_on='study', how='left')
print("###### ПОЗВОНОЧНИК: quality_class (axis+artifacts+placement) против отдельных критериев и 'Итог' ######")
sp_axis = sp.dropna(subset=['sp_axis', 'quality_class_num'])
summarize('против sp_axis (только ось)', sp_axis.sp_axis, sp_axis.quality_class_num)
sp_art = sp.dropna(subset=['sp_art', 'quality_class_num'])
summarize('против sp_art (только артефакты)', sp_art.sp_art, sp_art.quality_class_num)
sp_pos = sp.dropna(subset=['sp_pos', 'quality_class_num'])
summarize('против sp_pos (только укладка)', sp_pos.sp_pos, sp_pos.quality_class_num)
sp_fin = sp.dropna(subset=['fin_sp', 'quality_class_num'])
summarize("против fin_sp ('Итог' — главная метрика позвоночника)", sp_fin.fin_sp, sp_fin.quality_class_num)
print('\n\n###### БЕДРО: quality_class (positioning+rotation, без roi) против R_pos/L_pos, OOF ######')
rows = []
for side, col in [('hip_right', 'R_pos'), ('hip_left', 'L_pos')]:
    sub = report[report['anatomical_region'] == side]
    sub = sub.merge(df[['study', col, 'fold']], left_on='study_folder', right_on='study', how='left').dropna(subset=[col, 'quality_class_num'])
    rows.append(sub.rename(columns={col: 'y_true'})[['study_folder', 'quality_class_num', 'y_true', 'fold']])
hip_all = pd.concat(rows)
summarize('БЕДРО (право+лево)', hip_all['y_true'].values, hip_all['quality_class_num'].values)
print('\n=== бедро по фолдам отдельно ===')
for f in sorted(hip_all['fold'].dropna().unique()):
    sub = hip_all[hip_all['fold'] == f]
    if sub['y_true'].nunique() < 2:
        print(f'fold {int(f)}: n={len(sub)}, только один класс, пропуск')
        continue
    print(f'fold {int(f)}: n={len(sub)}, F1={f1_score(sub.y_true, sub.quality_class_num, zero_division=0):.3f}')
print('\n=== processing_status ===')
print(report['processing_status'].value_counts().to_dict())
