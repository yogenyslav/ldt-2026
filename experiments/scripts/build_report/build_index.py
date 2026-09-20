"""Индекс DXA-датасета: файлы, разметка в длинном формате, уникальные снимки с метками.

Выход (в data/):
  index.csv  — один DICOM-файл = одна строка (train + test)
  labels.csv — одна строка = (исследование, зона)
  images.csv — уникальные снимки train (без попиксельных дубликатов) с зоной и метками
"""
from pathlib import Path
import hashlib
import warnings

import numpy as np
import pandas as pd
import pydicom

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
TRAIN_DIR = DATA_DIR / "НД_для_обучения" / "Исследования"
LABELS_XLSX = DATA_DIR / "НД_для_обучения" / "разметка.xlsx"
TEST_DIR = DATA_DIR / "Для теста"

SPINE_WIDTH = 300
TEST_SUFFIX_REGION = {"ПОП": "spine", "ППОБ": "hip_right", "ЛПОБ": "hip_left"}

# Колонки листа «Калибровка» (двухстрочная шапка, данные с 3-й строки)
LABEL_COLUMNS = [
    "row_no", "study_id",
    "spine_placement", "spine_axis", "spine_artifacts",
    "hip_right_positioning", "hip_right_roi",
    "hip_left_positioning", "hip_left_roi",
    "spine_total", "hip_right_total", "hip_left_total",
    "comment",
]
REGION_CRITERIA = {
    "spine": ["placement", "axis", "artifacts"],
    "hip_right": ["positioning", "roi"],
    "hip_left": ["positioning", "roi"],
}


def hip_side(pixels: np.ndarray) -> tuple[str, float]:
    """Сторона бедра по верхней части снимка: таз (медиальная сторона) даёт больше яркой массы.

    Соглашение из тестовых файлов: у правого бедра таз справа на изображении, у левого — слева.
    """
    top = pixels[: int(pixels.shape[0] * 0.45)].astype(float)
    half = pixels.shape[1] // 2
    score = top[:, half:].mean() - top[:, :half].mean()
    return ("hip_right" if score > 0 else "hip_left"), float(score)


def read_dicom(path: Path) -> dict:
    ds = pydicom.dcmread(path)
    pixels = ds.pixel_array
    if ds.Columns == SPINE_WIDTH:
        region, side_score = "spine", np.nan
    else:
        region, side_score = hip_side(pixels)
    return {
        "path": path.relative_to(ROOT).as_posix(),
        "file_name": path.name,
        "study_uid": str(ds.StudyInstanceUID),
        "series_uid": str(ds.SeriesInstanceUID),
        "sop_uid": str(ds.SOPInstanceUID),
        "instance_number": int(ds.InstanceNumber),
        "rows": int(ds.Rows),
        "cols": int(ds.Columns),
        "pixel_md5": hashlib.md5(pixels.tobytes()).hexdigest(),
        "region_pred": region,
        "side_score": side_score,
        "zero_frac": float((pixels == 0).mean()),
        "mean": float(pixels.mean()),
        "std": float(pixels.std()),
        "p01": float(np.percentile(pixels, 1)),
        "p99": float(np.percentile(pixels, 99)),
    }


def build_index() -> pd.DataFrame:
    records = []
    for split, folder in [("train", TRAIN_DIR), ("test", TEST_DIR)]:
        for path in sorted(folder.rglob("*.dcm")):
            record = read_dicom(path)
            # Разметка ссылается на имя папки исследования; StudyInstanceUID в тегах другой
            study_id = path.relative_to(folder).parts[0] if split == "train" else record["study_uid"]
            records.append({"split": split, "study_id": study_id, **record})
    index = pd.DataFrame(records)

    index["n_copies"] = index.groupby(["study_id", "pixel_md5"])["path"].transform("size")
    first = index.sort_values("instance_number").groupby(["study_id", "pixel_md5"]).head(1).index
    index["is_duplicate"] = ~index.index.isin(first)

    test = index["split"] == "test"
    suffix = index.loc[test, "file_name"].str.extract(r"_([^_.]+)\.dcm$")[0]
    index.loc[test, "region_true"] = suffix.map(TEST_SUFFIX_REGION)
    return index


def build_labels() -> pd.DataFrame:
    raw = pd.read_excel(LABELS_XLSX, header=None, skiprows=2, usecols=range(len(LABEL_COLUMNS)))
    raw.columns = LABEL_COLUMNS
    raw = raw.dropna(subset=["study_id"])

    rows = []
    for _, r in raw.iterrows():
        for region, criteria in REGION_CRITERIA.items():
            if pd.isna(r[f"{region}_total"]):
                continue
            row = {
                "row_no": int(r["row_no"]),
                "study_id": str(r["study_id"]).strip(),
                "region": region,
                "total": int(r[f"{region}_total"]),
                "comment": r["comment"] if pd.notna(r["comment"]) else "",
            }
            for criterion in ["placement", "axis", "artifacts", "positioning", "roi"]:
                value = r.get(f"{region}_{criterion}") if criterion in criteria else np.nan
                row[criterion] = value
            row["total_equals_or"] = row["total"] == int(max(r[f"{region}_{c}"] for c in criteria))
            rows.append(row)
    return pd.DataFrame(rows)


def build_images(index: pd.DataFrame, labels: pd.DataFrame) -> pd.DataFrame:
    images = index[(index["split"] == "train") & ~index["is_duplicate"]].copy()
    images = images.rename(columns={"region_pred": "region"})
    images = images.merge(labels, on=["study_id", "region"], how="left", indicator=True)
    images["labeled"] = images.pop("_merge") == "both"
    row_no = labels.groupby("study_id")["row_no"].first()
    images["row_no"] = images["study_id"].map(row_no)
    return images


def report(index: pd.DataFrame, labels: pd.DataFrame, images: pd.DataFrame) -> None:
    train = index[index["split"] == "train"]
    print(f"Файлов: train {len(train)}, test {(index['split'] == 'test').sum()}")
    print(f"Исследований train: {train['study_id'].nunique()}, серий: {train['series_uid'].nunique()}, "
          f"StudyInstanceUID: {train['study_uid'].nunique()}")
    print(f"Дубликатов (попиксельно, внутри исследования): {train['is_duplicate'].sum()}, "
          f"уникальных снимков: {len(images)}")
    cross = train.groupby("pixel_md5")["study_id"].nunique().gt(1).sum()
    print(f"Одинаковых снимков в разных исследованиях: {cross}")

    print("\nЗоны уникальных снимков:", images["region"].value_counts().to_dict())
    per_study = images.groupby(["study_id", "region"]).size()
    print("Пар (исследование, зона) с > 1 снимком:", int((per_study > 1).sum()))

    label_keys = set(zip(labels["study_id"], labels["region"]))
    image_keys = set(zip(images["study_id"], images["region"]))
    print(f"Меток без снимка: {len(label_keys - image_keys)}")
    unlabeled = images[~images["labeled"]]
    print(f"Снимков без метки: {len(unlabeled)}")
    for _, r in unlabeled.iterrows():
        print(f"  №{r['row_no']} {r['region']} {r['path']}")

    test = index[index["split"] == "test"]
    ok = (test["region_pred"] == test["region_true"]).sum()
    print(f"\nЗона на test (по имени файла): {ok}/{len(test)} совпало")

    print("\nНарушения по зонам (total=1 / всего):")
    print(labels.groupby("region")["total"].agg(["sum", "count"]).to_string())
    print(f"Итог не равен OR критериев: {(~labels['total_equals_or']).sum()}")


def main() -> None:
    warnings.filterwarnings("ignore", module="pydicom")
    index = build_index()
    labels = build_labels()
    images = build_images(index, labels)

    index.to_csv(DATA_DIR / "index.csv", index=False, encoding="utf-8")
    labels.to_csv(DATA_DIR / "labels.csv", index=False, encoding="utf-8")
    images.to_csv(DATA_DIR / "images.csv", index=False, encoding="utf-8")
    report(index, labels, images)


if __name__ == "__main__":
    main()
