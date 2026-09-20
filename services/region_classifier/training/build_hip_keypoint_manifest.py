"""
Собирает манифест для Шага 2 (keypoints бедра + полигон малого вертела)
из экспорта CVAT ("CVAT for images 1.1" XML) + уже готового manifest.csv
(region/side/fold из Step 1) + разметка.xlsx (истинная метка "позиция
корректна/нет" для классификатора ротации).

Важно: имя файла в CVAT XML может быть УСТАРЕВШИМ по стороне (лево/право) —
если снимок был загружен в CVAT до того, как мы поправили ошибку стороны
в manifest.csv, имя файла всё ещё содержит старую метку. Сторона/зона тут
НЕ берутся из имени файла в XML — только хэш (последние 8 символов перед
.png) используется, чтобы сопоставить с actual, уже исправленным manifest.csv.
Сами координаты точек/полигона от стороны не зависят и не портятся.

Использование:
    python build_hip_keypoint_manifest.py annotations.xml manifest.csv разметка.xlsx hip_keypoints_manifest.csv
"""

from __future__ import annotations

import csv
import re
import sys
import xml.etree.ElementTree as ET

import openpyxl

HASH_RE = re.compile(r"([0-9a-f]{8})\.png$", re.IGNORECASE)

COL_HIP_RIGHT_POS = 5
COL_HIP_LEFT_POS = 7


def load_position_labels(razmetka_path: str) -> dict[str, dict]:
    wb = openpyxl.load_workbook(razmetka_path, data_only=True)
    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(values_only=True))[2:]
    by_study = {}
    for row in rows:
        study_uid = row[1]
        if not study_uid:
            continue
        by_study[study_uid] = {
            "hip_right_pos": row[COL_HIP_RIGHT_POS],
            "hip_left_pos": row[COL_HIP_LEFT_POS],
        }
    return by_study


def load_manifest(manifest_path: str) -> dict[str, dict]:
    with open(manifest_path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    return {r["image_hash"][:8]: r for r in rows}


def parse_points(text: str) -> tuple[float, float]:
    x, y = text.split(",")
    return float(x), float(y)


def parse_polygon(text: str) -> list[tuple[float, float]]:
    return [parse_points(p) for p in text.split(";")]


def main(xml_path: str, manifest_path: str, razmetka_path: str, out_path: str) -> None:
    manifest_by_hash = load_manifest(manifest_path)
    position_labels = load_position_labels(razmetka_path)

    tree = ET.parse(xml_path)
    root = tree.getroot()

    out_rows = []
    n_skipped_no_manifest = 0
    n_skipped_not_hip = 0
    n_missing_kp = 0

    for img in root.findall("image"):
        name = img.get("name")
        m = HASH_RE.search(name)
        if not m:
            print(f"Не удалось извлечь хэш из имени: {name}")
            continue
        short_hash = m.group(1).lower()

        manifest_row = manifest_by_hash.get(short_hash)
        if manifest_row is None:
            n_skipped_no_manifest += 1
            continue
        if manifest_row["region"] != "hip":
            n_skipped_not_hip += 1
            continue

        width, height = float(img.get("width")), float(img.get("height"))

        kp = {"большой_вертел": None, "шейка_бедра": None, "седалищная_кость": None}
        polygon = None
        for shape in list(img):
            label = shape.get("label")
            if shape.tag == "points" and label in kp:
                kp[label] = parse_points(shape.get("points"))
            elif shape.tag == "polygon" and label == "область_малого_вертела":
                polygon = parse_polygon(shape.get("points"))

        if any(v is None for v in kp.values()) or polygon is None:
            n_missing_kp += 1
            # всё равно сохраняем то, что есть — для keypoint-модели
            # достаточно хотя бы части точек, полигон нужен отдельно

        study_uid = manifest_row["study_uid"]
        side = manifest_row["side"]  # "image_left" / "image_right"
        pos_row = position_labels.get(study_uid)
        position_error = None
        if pos_row is not None:
            if side == "image_right":
                position_error = pos_row["hip_right_pos"]
            elif side == "image_left":
                position_error = pos_row["hip_left_pos"]

        out_rows.append(
            dict(
                image_filename=f"{manifest_row['image_hash']}.png",
                study_uid=study_uid,
                side=side,
                fold=manifest_row["fold"],
                width=width,
                height=height,
                bolshoy_vertel_x=kp["большой_вертел"][0] if kp["большой_вертел"] else "",
                bolshoy_vertel_y=kp["большой_вертел"][1] if kp["большой_вертел"] else "",
                sheyka_bedra_x=kp["шейка_бедра"][0] if kp["шейка_бедра"] else "",
                sheyka_bedra_y=kp["шейка_бедра"][1] if kp["шейка_бедра"] else "",
                sedalishnaya_kost_x=kp["седалищная_кость"][0] if kp["седалищная_кость"] else "",
                sedalishnaya_kost_y=kp["седалищная_кость"][1] if kp["седалищная_кость"] else "",
                polygon=";".join(f"{x},{y}" for x, y in polygon) if polygon else "",
                position_error=position_error if position_error is not None else "",
            )
        )

    fieldnames = list(out_rows[0].keys()) if out_rows else []
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(out_rows)

    print(f"Записано строк: {len(out_rows)}")
    print(f"Пропущено (не нашли в manifest.csv по хэшу): {n_skipped_no_manifest}")
    print(f"Пропущено (не hip): {n_skipped_not_hip}")
    print(f"С неполной разметкой (не все точки/полигон есть): {n_missing_kp}")
    n_no_pos_label = sum(1 for r in out_rows if r["position_error"] == "")
    print(f"Без истинной метки position_error (нет строки в разметка.xlsx): {n_no_pos_label}")


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("Usage: python build_hip_keypoint_manifest.py annotations.xml manifest.csv разметка.xlsx out.csv")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
