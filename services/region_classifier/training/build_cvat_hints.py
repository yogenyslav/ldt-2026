"""
Пересохраняет уже готовые PNG (из training_package/images) с подсказками
в имени файла — что именно отмечено как нарушение в разметка.xlsx для
этого исследования. Так при разметке в CVAT видно прямо в списке файлов,
чего ожидать на конкретном снимке (артефакты, проблема с осью и т.д.),
без переключения на Excel.

Показываются ТОЛЬКО те критерии, которые относятся к зоне/стороне
конкретного изображения (для snimka бедра не показываем критерии
позвоночника и наоборот) — иначе подсказка была бы нерелевантной шумной.

Использование:
    python build_cvat_hints.py manifest.csv разметка.xlsx <images_dir> <output_dir>
"""

from __future__ import annotations

import csv
import os
import re
import shutil
import sys

import openpyxl

# Индексы колонок в разметка.xlsx (0-based), см. историю анализа файла:
# 2=укладка позвоночника, 3=ось, 4=артефакты,
# 5=прав.бедро позиц/ротация, 6=прав.бедро ROI,
# 7=лев.бедро позиц/ротация, 8=лев.бедро ROI, 12=комментарий
COL_SPINE_UKLADKA = 2
COL_SPINE_AXIS = 3
COL_SPINE_ARTIFACTS = 4
COL_HIP_RIGHT_POS = 5
COL_HIP_RIGHT_ROI = 6
COL_HIP_LEFT_POS = 7
COL_HIP_LEFT_ROI = 8
COL_COMMENT = 12


def load_razmetka(path: str) -> dict[str, dict]:
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))[2:]  # первые 2 строки — заголовки

    by_study = {}
    for row in rows:
        study_uid = row[1]
        if not study_uid:
            continue
        by_study[study_uid] = {
            "spine_ukladka": row[COL_SPINE_UKLADKA],
            "spine_axis": row[COL_SPINE_AXIS],
            "spine_artifacts": row[COL_SPINE_ARTIFACTS],
            "hip_right_pos": row[COL_HIP_RIGHT_POS],
            "hip_right_roi": row[COL_HIP_RIGHT_ROI],
            "hip_left_pos": row[COL_HIP_LEFT_POS],
            "hip_left_roi": row[COL_HIP_LEFT_ROI],
            "comment": row[COL_COMMENT],
        }
    return by_study


def sanitize(text: str) -> str:
    text = str(text).strip()
    text = re.sub(r"[^0-9A-Za-zА-Яа-яЁё]+", "_", text)
    return text.strip("_")[:30]


RU_LABEL = {
    "spine": "позвоночник",
    "hip_left": "бедро_лево",
    "hip_right": "бедро_право",
}


def build_hint(region: str, side: str, razmetka_row: dict | None) -> str:
    if razmetka_row is None:
        return "НЕТ_ДАННЫХ"  # study_uid из manifest не нашёлся в разметка.xlsx — стоит проверить руками

    tags = []
    if region == "spine":
        if razmetka_row["spine_ukladka"] == 1:
            tags.append("УКЛАДКА")
        if razmetka_row["spine_axis"] == 1:
            tags.append("ОСЬ")
        if razmetka_row["spine_artifacts"] == 1:
            tags.append("АРТЕФАКТ")
    elif region == "hip" and side == "image_right":
        if razmetka_row["hip_right_pos"] == 1:
            tags.append("ПОЗИЦИЯ")
        if razmetka_row["hip_right_roi"] == 1:
            tags.append("ОТСТУПЫ")
    elif region == "hip" and side == "image_left":
        if razmetka_row["hip_left_pos"] == 1:
            tags.append("ПОЗИЦИЯ")
        if razmetka_row["hip_left_roi"] == 1:
            tags.append("ОТСТУПЫ")

    hint = "-".join(tags) if tags else "НОРМА"

    comment = razmetka_row["comment"]
    if comment:
        hint += "_" + sanitize(comment)

    return hint


def main(manifest_path: str, razmetka_path: str, images_dir: str, out_dir: str) -> None:
    os.makedirs(out_dir, exist_ok=True)
    razmetka = load_razmetka(razmetka_path)

    with open(manifest_path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    n_written = 0
    n_missing_row = 0
    for row in rows:
        src = os.path.join(images_dir, row["image_filename"])
        if not os.path.exists(src):
            print(f"Пропуск (нет файла): {src}")
            continue

        razmetka_row = razmetka.get(row["study_uid"])
        if razmetka_row is None:
            n_missing_row += 1

        hint = build_hint(row["region"], row["side"], razmetka_row)
        study_short = row["study_uid"][:10]
        ru_label = RU_LABEL.get(row["label"], row["label"])
        out_name = f"{ru_label}_{hint}_{study_short}_{row['image_hash'][:8]}.png"

        shutil.copyfile(src, os.path.join(out_dir, out_name))
        n_written += 1

    print(f"Готово: {n_written} файлов сохранено в {out_dir}")
    print(f"Исследований без строки в разметка.xlsx: {n_missing_row}")


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("Usage: python build_cvat_hints.py manifest.csv разметка.xlsx <images_dir> <output_dir>")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
