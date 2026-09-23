"""
Собирает единый самодостаточный пакет для загрузки на Kaggle/Colab:
плоская папка с PNG-изображениями (по одному на уникальный снимок,
имя файла = image_hash) + manifest.csv, ссылающийся на них по простому
имени файла, а не на вложенную структуру исходных DICOM-папок.

Зачем: исходная "Исследования" — 499 файлов в глубоко вложенных папках
с пробелами и кириллицей в именах ("A2507250865 DXA", "CR DXA"), из
которых реально нужно только 252 уникальных (остальное — дубликаты,
см. build_manifest.py). Загружать всё это на Kaggle/Colab избыточно и
хрупко по путям. Этот пакет — то же самое, но: (1) только нужные 252
файла, (2) плоская структура без пробелов/кириллицы в путях, (3) PNG
вместо DICOM — ноутбуку больше не нужен pydicom вообще.

PNG сохраняется БЕЗ CLAHE (сырые нормализованные 0-255 пиксели) — CLAHE
остаётся частью препроцессинга в augmentation.py/train.ipynb, применяется
на лету, а не запекается в файл. Так пакет остаётся пригоден и для
других экспериментов с препроцессингом в будущем.

Использование:
    python build_training_package.py manifest.csv <путь_к_Исследования> <куда_собрать_пакет>

После запуска в <куда_собрать_пакет> будет:
    images/<hash>.png   (252 файла)
    manifest.csv         (с колонкой image_filename вместо путей)

Просто зазипуйте эту папку целиком и загрузите как один Kaggle Dataset.
"""

from __future__ import annotations

import csv
import os
import sys
import time

import cv2

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from classify import load_pixel_array  # noqa: E402


def main(manifest_path: str, dataset_root: str, out_dir: str) -> None:
    images_dir = os.path.join(out_dir, "images")
    os.makedirs(images_dir, exist_ok=True)

    with open(manifest_path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    n_written = 0
    n_errors = 0
    out_rows = []
    for row in rows:
        src_path = os.path.join(dataset_root, row["relative_path"])
        try:
            image_u8 = load_pixel_array(src_path)
        except Exception as exc:  # noqa: BLE001
            print(f"Ошибка чтения {src_path}: {exc}")
            n_errors += 1
            continue

        image_filename = f"{row['image_hash']}.png"
        ok, buf = cv2.imencode(".png", image_u8)
        if not ok:
            print(f"Ошибка кодирования PNG для {src_path}")
            n_errors += 1
            continue

        # На Windows запись иногда падает с transient OSError (антивирус/
        # индексация/синхронизация папки блокирует файл на долю секунды) —
        # несколько попыток с паузой вместо падения всего скрипта.
        dst_path = os.path.join(images_dir, image_filename)
        for attempt in range(5):
            try:
                with open(dst_path, "wb") as out_f:
                    out_f.write(buf.tobytes())
                break
            except OSError as exc:
                if attempt == 4:
                    print(f"Не удалось записать {dst_path} после 5 попыток: {exc}")
                    n_errors += 1
                    break
                time.sleep(0.3)
        else:
            continue
        n_written += 1

        out_rows.append(
            dict(
                image_filename=image_filename,
                image_hash=row["image_hash"],
                study_uid=row["study_uid"],
                region=row["region"],
                side=row["side"],
                label=row["label"],
                region_confidence=row["region_confidence"],
                side_confidence=row["side_confidence"],
                needs_review=row["needs_review"],
                manually_verified=row["manually_verified"],
                fold=row["fold"],
            )
        )

    out_manifest_path = os.path.join(out_dir, "manifest.csv")
    fieldnames = [
        "image_filename", "image_hash", "study_uid", "region", "side", "label",
        "region_confidence", "side_confidence", "needs_review", "manually_verified", "fold",
    ]
    with open(out_manifest_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(out_rows)

    print(f"Записано изображений: {n_written}, ошибок: {n_errors}")
    print(f"Пакет готов: {out_dir}")
    print(f"  {images_dir}  ({n_written} PNG)")
    print(f"  {out_manifest_path}")
    print("Зазипуйте всю папку целиком и загрузите как один Kaggle Dataset / положите в Google Drive.")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python build_training_package.py manifest.csv <путь_к_Исследования> <куда_собрать_пакет>")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2], sys.argv[3])
