"""
Строит манифест для обучения: дедуп по хэшу пикселей + group k-fold split
по study_uid (папка исследования), чтобы копии одного снимка никогда не
оказались в разных фолдах (см. обсуждение утечки данных в docs/plan.md,
Шаг 0, п.4).

Метки region/side берутся из services/region_classifier/classify.py —
эвристики двух независимых сигналов (форма кости и ширина снимка),
согласных между собой на 497/497 файлах на 99.6% (см. README.md там же).
ВАЖНО: это не сверка с истинной разметкой (per-image разметки зоны
организаторы не дали) — это согласие двух эвристик друг с другом,
дополнительно подтверждённое 3/3 совпадениями с именами файлов на
маленькой отдельной выборке "Для теста" (там суффиксы _ПОП/_ППОБ/_ЛПОБ
есть, в основном обучающем наборе — нет).

Единственные 2 известных случая расхождения региона (n_peaks-эвристика
против ширины) были визуально проверены человеком (это бёдра с
выраженной трабекулярной текстурой, ошибочно принятые за позвоночник
из-за ложной периодичности после CLAHE) — их метки жёстко исправлены
ниже в MANUAL_REGION_OVERRIDES, а не оставлены на усмотрение эвристики.

Отдельно — 1 известная ошибка СТОРОНЫ бедра (region был верный, side —
нет), найдена ручным визуальным просмотром экспорта по классам
(export_for_review.py) и исправлена в MANUAL_SIDE_OVERRIDES. Показательно:
у этого снимка side_score=-0.029 — почти точно на границе принятия
решения (0), что и должно было дать низкую side_confidence. Второй
похожий на вид снимок (сильно обрезанный/замаскированный) при проверке
оказался верным — там side_score=-0.578, уверенный сигнал несмотря на
визуальную неоднозначность для человека.

Использование:
    python build_manifest.py "<путь>\\НД_для_обучения\\Исследования" manifest.csv
"""

from __future__ import annotations

import csv
import hashlib
import os
import sys
from collections import defaultdict

import numpy as np
from sklearn.model_selection import StratifiedGroupKFold

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from classify import (  # noqa: E402
    classify_file,
    classify_hip_side,
    load_pixel_array,
    segment_bone,
    side_margin_confidence,
)

N_FOLDS = 5
CONFIDENCE_REVIEW_THRESHOLD = 0.7

# Визуально подтверждённые исправления региона (найдены через
# eval_against_width_heuristic.py). Ключ — путь к файлу (любой из дублей
# подойдёт, матчится по вхождению в duplicate_paths), значение —
# принудительный region.
MANUAL_REGION_OVERRIDES = {
    r"2.25.145848300160680194368420189079847088556\series_002_2_CR\A2504248615 DXA Exam\CR DXA Images\CR000001.dcm": "hip",
    r"2.25.164566280810634620154538016595892212884\series_001_2_CR\A2504291878 DXA Exam\CR DXA Images\CR000002.dcm": "hip",
}

# Визуально подтверждённое исправление стороны (region был верный, side — нет).
# Найдено просмотром export_for_review.py, см. докстринг модуля.
MANUAL_SIDE_OVERRIDES = {
    r"2.25.17706555930735581384953296958427669848\series_004_3_CR\A2504146513 DXA\CR DXA\CR000003.dcm": "image_right",
    r"2.25.168317503020329569414190677927680518621\series_004_2_CR\A2507557128 DXA\CR DXA\CR000000.dcm": "image_left",
}


def study_uid_from_path(dataset_root: str, file_path: str) -> str:
    """Первый компонент пути относительно dataset_root — это и есть папка
    исследования (совпадает со столбцом 'study' в разметка.xlsx)."""
    rel = os.path.relpath(file_path, dataset_root)
    return rel.split(os.sep)[0]


def pixel_hash(file_path: str) -> str | None:
    try:
        arr = load_pixel_array(file_path)
    except Exception:
        return None
    return hashlib.md5(arr.tobytes()).hexdigest()


def build_manifest(dataset_root: str) -> list[dict]:
    # Шаг 1: дедуп по хэшу пикселей, собираем все пути-дубликаты вместе
    hash_to_files: dict[str, list[str]] = defaultdict(list)
    read_errors = 0
    for root, _dirs, files in os.walk(dataset_root):
        for f in files:
            fp = os.path.join(root, f)
            h = pixel_hash(fp)
            if h is None:
                read_errors += 1
                continue
            hash_to_files[h].append(fp)

    # Шаг 2: для каждого уникального изображения — классификация region/side
    # по первому файлу-представителю (пиксели идентичны у всех копий)
    rows = []
    n_region_overridden = 0
    n_side_overridden = 0
    for h, paths in hash_to_files.items():
        representative = sorted(paths)[0]
        result = classify_file(representative)
        study_uid = study_uid_from_path(dataset_root, representative)

        region = result.region
        side = result.side or ""
        side_confidence = result.side_confidence
        confidence = result.region_confidence
        needs_review = confidence < CONFIDENCE_REVIEW_THRESHOLD
        manually_verified = False

        override_region = next(
            (v for k, v in MANUAL_REGION_OVERRIDES.items() if any(k in p for p in paths)),
            None,
        )
        if override_region is not None:
            region = override_region
            confidence = 1.0
            needs_review = False
            manually_verified = True
            n_region_overridden += 1
            if region == "hip":
                # исходная классификация приняла снимок за spine и не считала
                # side — пересчитываем сторону теперь, когда знаем, что это hip
                image_u8 = load_pixel_array(representative)
                mask = segment_bone(image_u8)
                side, score = classify_hip_side(mask)
                side = side or ""
                side_confidence = side_margin_confidence(score)

        override_side = next(
            (v for k, v in MANUAL_SIDE_OVERRIDES.items() if any(k in p for p in paths)),
            None,
        )
        if override_side is not None and region == "hip":
            side = override_side
            side_confidence = 1.0
            manually_verified = True
            n_side_overridden += 1

        relative_path = os.path.relpath(representative, dataset_root).replace(os.sep, "/")
        rows.append(
            dict(
                image_hash=h,
                representative_path=representative,
                relative_path=relative_path,
                duplicate_paths=";".join(sorted(paths)),
                n_duplicates=len(paths),
                study_uid=study_uid,
                region=region,
                side=side,
                region_confidence=round(confidence, 3),
                side_confidence=round(side_confidence, 3) if side_confidence is not None else "",
                needs_review=needs_review,
                manually_verified=manually_verified,
            )
        )

    # Шаг 3: label для стратификации/фолдов — region+side вместе (3 класса:
    # spine, hip_left, hip_right), чтобы фолды были сбалансированы по всем трём
    def combined_label(row: dict) -> str:
        if row["region"] == "hip" and row["side"]:
            return f"hip_{row['side'].replace('image_', '')}"
        return row["region"]

    for row in rows:
        row["label"] = combined_label(row)

    # Шаг 4: StratifiedGroupKFold по study_uid — все файлы (и все их дубли)
    # одного исследования гарантированно попадают в один и тот же фолд
    groups = [row["study_uid"] for row in rows]
    labels = [row["label"] for row in rows]
    sgkf = StratifiedGroupKFold(n_splits=N_FOLDS, shuffle=True, random_state=42)
    fold_of = {}
    for fold_idx, (_train_idx, val_idx) in enumerate(
        sgkf.split(np.zeros(len(rows)), labels, groups)
    ):
        for i in val_idx:
            fold_of[i] = fold_idx
    for i, row in enumerate(rows):
        row["fold"] = fold_of[i]

    print(f"Прочитано файлов с ошибкой: {read_errors}")
    print(f"Уникальных изображений: {len(rows)} (из {sum(len(v) for v in hash_to_files.values())} файлов)")
    print(f"Исправлено вручную, region (MANUAL_REGION_OVERRIDES): {n_region_overridden}")
    print(f"Исправлено вручную, side (MANUAL_SIDE_OVERRIDES): {n_side_overridden}")
    print(f"Требуют ручной проверки (confidence < {CONFIDENCE_REVIEW_THRESHOLD}): "
          f"{sum(r['needs_review'] for r in rows)}")

    return rows


def write_manifest(rows: list[dict], out_path: str) -> None:
    fieldnames = [
        "image_hash", "representative_path", "relative_path", "duplicate_paths",
        "n_duplicates", "study_uid", "region", "side", "label", "region_confidence",
        "side_confidence", "needs_review", "manually_verified", "fold",
    ]
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Манифест сохранён: {out_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python build_manifest.py <путь_к_Исследования> <output.csv>")
        sys.exit(1)
    rows = build_manifest(sys.argv[1])
    write_manifest(rows, sys.argv[2])

    # сводка по фолдам, для проверки баланса классов
    from collections import Counter
    for fold in range(N_FOLDS):
        labels_in_fold = [r["label"] for r in rows if r["fold"] == fold]
        studies_in_fold = len({r["study_uid"] for r in rows if r["fold"] == fold})
        print(f"fold {fold}: {len(labels_in_fold)} изображений, "
              f"{studies_in_fold} исследований, {dict(Counter(labels_in_fold))}")
