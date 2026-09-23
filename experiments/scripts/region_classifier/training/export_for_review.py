"""
Раскладывает уникальные изображения из manifest.csv по 3 папкам —
для быстрой визуальной проверки человеком, что метки region/side верны.

Имя файла включает confidence и study_uid, чтобы:
  - низкоуверенные случаи было легко просматривать в первую очередь
    (сортировка по имени файла в проводнике = сортировка по возрастанию
    confidence, т.к. confidence — первая часть имени);
  - можно было при необходимости найти исходный DICOM по study_uid.

Использование:
    python export_for_review.py manifest.csv <куда_сохранить_папки>
"""

from __future__ import annotations

import os
import sys

import cv2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from classify import load_pixel_array  # noqa: E402

import csv

FOLDER_NAMES = {
    "spine": "1_Позвоночник",
    "hip_left": "2_Бедро_левое",
    "hip_right": "3_Бедро_правое",
}


def main(manifest_path: str, dataset_root: str, out_dir: str) -> None:
    with open(manifest_path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    for folder in FOLDER_NAMES.values():
        os.makedirs(os.path.join(out_dir, folder), exist_ok=True)

    n_written = 0
    n_errors = 0
    for row in rows:
        label = row["label"]
        folder = FOLDER_NAMES.get(label)
        if folder is None:
            print(f"Пропуск: неизвестная метка {label!r} для {row['relative_path']}")
            continue

        src_path = os.path.join(dataset_root, row["relative_path"])
        try:
            image_u8 = load_pixel_array(src_path)
        except Exception as exc:  # noqa: BLE001
            print(f"Ошибка чтения {src_path}: {exc}")
            n_errors += 1
            continue

        confidence = float(row["region_confidence"])
        side_conf_str = ""
        if row["side_confidence"]:
            side_conf_str = f"_side{float(row['side_confidence']):.2f}"
        review_flag = "REVIEW_" if row["needs_review"] == "True" else ""
        verified_flag = "manual_" if row["manually_verified"] == "True" else ""
        study_short = row["study_uid"][:12]
        out_name = (
            f"{confidence:.2f}{side_conf_str}_{review_flag}{verified_flag}"
            f"{study_short}_{row['image_hash'][:8]}.png"
        )

        # cv2.imwrite молча возвращает False на путях с не-ASCII символами
        # (кириллица в "Датасет") на Windows и ничего не пишет — поэтому
        # кодируем в память и пишем сами через open(), с ним юникод-пути ОК.
        ok, buf = cv2.imencode(".png", image_u8)
        if not ok:
            print(f"Ошибка кодирования PNG для {src_path}")
            n_errors += 1
            continue
        with open(os.path.join(out_dir, folder, out_name), "wb") as out_f:
            out_f.write(buf.tobytes())
        n_written += 1

    print(f"Сохранено: {n_written}, ошибок чтения: {n_errors}")
    for label, folder in FOLDER_NAMES.items():
        count = sum(1 for r in rows if r["label"] == label)
        print(f"  {folder}: {count} изображений")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python export_for_review.py manifest.csv <путь_к_Исследования> <куда_сохранить>")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2], sys.argv[3])
