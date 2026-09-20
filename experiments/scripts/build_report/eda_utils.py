"""Общие функции EDA: загрузка индекса, графики, галереи снимков.

Используется в notebooks/01_eda.ipynb и scripts/data_analysis/build_report.py.
Перед использованием запустить build_index.py.
"""
from pathlib import Path
import warnings

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import pydicom
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"

REGIONS = ["spine", "hip_right", "hip_left"]
REGION_RU = {"spine": "Позвоночник", "hip_right": "Правое бедро", "hip_left": "Левое бедро"}
CRITERIA = {
    "spine": ["placement", "axis", "artifacts"],
    "hip_right": ["positioning", "roi"],
    "hip_left": ["positioning", "roi"],
}
CRITERION_RU = {
    "placement": "Укладка",
    "axis": "Ось > 5°",
    "artifacts": "Артефакты",
    "positioning": "Позиц./ротация",
    "roi": "Область интереса",
}
COLOR_OK = "#2a78d6"
COLOR_BAD = "#eb6834"
INK = "#52514e"

warnings.filterwarnings("ignore", module="pydicom")


def setup_style() -> None:
    plt.rcParams.update({
        "figure.dpi": 110,
        "font.size": 9,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.edgecolor": "#c3c2b7",
        "axes.labelcolor": INK,
        "axes.titlesize": 10,
        "axes.titleweight": "bold",
        "xtick.color": INK,
        "ytick.color": INK,
        "axes.grid": True,
        "grid.color": "#ebeae6",
        "grid.linewidth": 0.8,
        "axes.axisbelow": True,
        "legend.frameon": False,
    })


def load() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    index = pd.read_csv(DATA_DIR / "index.csv")
    labels = pd.read_csv(DATA_DIR / "labels.csv", keep_default_na=False, na_values=[""])
    images = pd.read_csv(DATA_DIR / "images.csv", keep_default_na=False, na_values=[""])
    return index, labels, images


def read_pixels(path: str) -> np.ndarray:
    return pydicom.dcmread(ROOT / path).pixel_array


def violations_text(row: pd.Series) -> str:
    if not row.get("labeled", True) or pd.isna(row.get("total")):
        return "без метки"
    names = [CRITERION_RU[c] for c in CRITERIA[row["region"]] if row.get(c) == 1]
    if row["total"] == 1 and not names:
        names = ["итог=1 без критерия"]
    return ", ".join(names) if names else "норма"


def gallery(df: pd.DataFrame, ncols: int = 6, size: float = 1.9, title: str | None = None):
    """Сетка снимков; подпись: №строки разметки, зона, нарушения. Рамка: синяя — норма, оранжевая — нарушение."""
    n = len(df)
    nrows = max(1, int(np.ceil(n / ncols)))
    fig, axes = plt.subplots(nrows, ncols, figsize=(ncols * size, nrows * (size + 0.45)), squeeze=False)
    for ax in axes.flat:
        ax.axis("off")
    for ax, (_, row) in zip(axes.flat, df.iterrows()):
        ax.imshow(read_pixels(row["path"]), cmap="gray", vmin=0, vmax=255)
        ax.axis("on")
        ax.set_xticks([])
        ax.set_yticks([])
        ax.grid(False)
        color = COLOR_BAD if row.get("total") == 1 else COLOR_OK if row.get("total") == 0 else "#8a8984"
        for spine in ax.spines.values():
            spine.set_visible(True)
            spine.set_color(color)
            spine.set_linewidth(2.5)
        row_no = f"№{int(row['row_no'])} " if pd.notna(row.get("row_no")) else ""
        ax.set_title(f"{row_no}{REGION_RU.get(row['region'], row['region'])}\n{violations_text(row)}",
                     fontsize=7, fontweight="normal", color=INK)
    if title:
        fig.suptitle(title, fontsize=11, fontweight="bold", x=0.01, ha="left")
    fig.tight_layout()
    return fig


def resized(path: str, shape: tuple[int, int] = (256, 256)) -> np.ndarray:
    img = Image.fromarray(read_pixels(path)).resize(shape[::-1], Image.BILINEAR)
    return np.asarray(img, dtype=float)


def mean_images(images: pd.DataFrame) -> dict[tuple[str, int], np.ndarray]:
    labeled = images[images["labeled"]]
    return {
        (region, total): np.mean([resized(p) for p in group["path"]], axis=0)
        for (region, total), group in labeled.groupby(["region", "total"])
    }


# ---------- графики ----------

def plot_files_per_study(index: pd.DataFrame, images: pd.DataFrame):
    train = index[index["split"] == "train"]
    files = train.groupby("study_id").size()
    unique = images.groupby("study_id").size()
    fig, axes = plt.subplots(1, 2, figsize=(9, 3), sharey=True)
    for ax, series, title in [(axes[0], files, "Файлов DICOM на исследование"),
                              (axes[1], unique, "Уникальных снимков на исследование")]:
        counts = series.value_counts().sort_index()
        ax.bar(counts.index.astype(str), counts.values, color=COLOR_OK, width=0.7)
        for x, y in zip(counts.index.astype(str), counts.values):
            ax.text(x, y + 0.8, str(y), ha="center", fontsize=8, color=INK)
        ax.set_title(title, loc="left")
        ax.set_xlabel("шт. в исследовании")
    axes[0].set_ylabel("исследований")
    fig.tight_layout()
    return fig


def plot_violation_share(labels: pd.DataFrame):
    stats = labels.groupby("region")["total"].agg(["sum", "count"]).reindex(REGIONS)
    ok = stats["count"] - stats["sum"]
    names = [REGION_RU[r] for r in REGIONS]
    fig, ax = plt.subplots(figsize=(7, 2.4))
    ax.barh(names, ok, color=COLOR_OK, label="норма", height=0.6)
    ax.barh(names, stats["sum"], left=ok + 0.6, color=COLOR_BAD, label="нарушение", height=0.6)
    for i, r in enumerate(REGIONS):
        ax.text(ok[r] / 2, i, str(int(ok[r])), ha="center", va="center", color="white", fontsize=8)
        ax.text(ok[r] + 0.6 + stats.loc[r, "sum"] / 2, i, str(int(stats.loc[r, "sum"])),
                ha="center", va="center", color="white", fontsize=8)
        ax.text(stats.loc[r, "count"] + 2, i, f"{stats.loc[r, 'sum'] / stats.loc[r, 'count']:.0%} нарушений",
                va="center", fontsize=8, color=INK)
    ax.invert_yaxis()
    ax.set_xlim(0, stats["count"].max() * 1.25)
    ax.set_title("Итог по зоне (снимков)", loc="left")
    ax.legend(loc="lower right", ncols=2, bbox_to_anchor=(1, 1.02))
    ax.grid(axis="y", visible=False)
    fig.tight_layout()
    return fig


def plot_criteria(labels: pd.DataFrame):
    fig, axes = plt.subplots(1, 3, figsize=(10, 2.4), sharex=True)
    for ax, region in zip(axes, REGIONS):
        sub = labels[labels["region"] == region]
        crit = CRITERIA[region]
        counts = sub[crit].sum().astype(int)
        ax.barh([CRITERION_RU[c] for c in crit], counts.values, color=COLOR_BAD, height=0.55)
        for i, v in enumerate(counts.values):
            ax.text(v + 0.4, i, f"{v}", va="center", fontsize=8, color=INK)
        ax.invert_yaxis()
        ax.set_title(f"{REGION_RU[region]} (n={len(sub)})", loc="left")
        ax.grid(axis="y", visible=False)
    axes[0].set_xlim(0, labels[[c for cs in CRITERIA.values() for c in cs]].sum().max() * 1.3)
    fig.suptitle("Число снимков с нарушением по критерию", x=0.01, ha="left", fontsize=11, fontweight="bold")
    fig.tight_layout()
    return fig


def plot_size_by_region(images: pd.DataFrame):
    labeled = images[images["labeled"]]
    fig, axes = plt.subplots(1, 3, figsize=(10, 2.8), sharey=True)
    bins = np.arange(170, 420, 10)
    for ax, region in zip(axes, REGIONS):
        sub = labeled[labeled["region"] == region]
        ax.hist([sub.loc[sub["total"] == 0, "rows"], sub.loc[sub["total"] == 1, "rows"]], bins=bins,
                stacked=True, color=[COLOR_OK, COLOR_BAD], label=["норма", "нарушение"],
                edgecolor="white", linewidth=0.8)
        ax.set_title(f"{REGION_RU[region]}, ширина {int(sub['cols'].mode()[0])} px", loc="left")
        ax.set_xlabel("высота снимка, px")
    axes[0].set_ylabel("снимков")
    axes[-1].legend(loc="upper right")
    fig.tight_layout()
    return fig


def plot_violation_rate_by_height(images: pd.DataFrame):
    hips = images[images["labeled"] & (images["region"] != "spine")].copy()
    hips["height_bin"] = pd.cut(hips["rows"], [0, 240, 280, 300, 500],
                                labels=["< 240", "240–280", "280–300", "> 300"])
    stats = hips.groupby("height_bin", observed=True)["total"].agg(["mean", "sum", "count"])
    fig, ax = plt.subplots(figsize=(6, 2.6))
    ax.bar(stats.index.astype(str), stats["mean"], color=COLOR_BAD, width=0.6)
    for i, (_, r) in enumerate(stats.iterrows()):
        ax.text(i, r["mean"] + 0.015, f"{r['mean']:.0%}\n({int(r['sum'])}/{int(r['count'])})",
                ha="center", fontsize=8, color=INK)
    ax.set_ylim(0, max(0.8, stats["mean"].max() + 0.15))
    ax.yaxis.set_major_formatter(plt.matplotlib.ticker.PercentFormatter(1.0))
    ax.set_title("Бедро: доля нарушений по высоте снимка", loc="left")
    ax.set_xlabel("высота снимка, px")
    ax.grid(axis="x", visible=False)
    fig.tight_layout()
    return fig


def plot_intensity(images: pd.DataFrame):
    labeled = images[images["labeled"]]
    fig, axes = plt.subplots(1, 3, figsize=(10, 2.6), sharey=True)
    for ax, region in zip(axes, REGIONS):
        sub = labeled[labeled["region"] == region]
        pixels = np.concatenate([read_pixels(p).ravel() for p in sub["path"]])
        ax.hist(pixels, bins=64, range=(0, 256), color=COLOR_OK, log=True)
        ax.set_title(REGION_RU[region], loc="left")
        ax.set_xlabel("значение пикселя (0–255)")
    axes[0].set_ylabel("пикселей (log)")
    fig.tight_layout()
    return fig


def plot_mean_images(means: dict[tuple[str, int], np.ndarray], images: pd.DataFrame):
    counts = images[images["labeled"]].groupby(["region", "total"]).size()
    fig, axes = plt.subplots(3, 3, figsize=(7.5, 8))
    for i, region in enumerate(REGIONS):
        ok, bad = means[(region, 0)], means[(region, 1)]
        diff = bad - ok
        lim = np.abs(diff).max()
        panels = [(ok, "gray", 0, 255, f"норма (n={counts[(region, 0)]})"),
                  (bad, "gray", 0, 255, f"нарушение (n={counts[(region, 1)]})"),
                  (diff, "RdBu_r", -lim, lim, "нарушение − норма")]
        for ax, (img, cmap, vmin, vmax, title) in zip(axes[i], panels):
            ax.imshow(img, cmap=cmap, vmin=vmin, vmax=vmax)
            ax.set_title(f"{REGION_RU[region]}: {title}", fontsize=8, fontweight="normal", color=INK)
            ax.axis("off")
    fig.tight_layout()
    return fig


def plot_side_score(images: pd.DataFrame):
    hips = images[images["region"] != "spine"]
    fig, ax = plt.subplots(figsize=(6, 2.4))
    ax.hist([hips.loc[hips["region"] == "hip_left", "side_score"],
             hips.loc[hips["region"] == "hip_right", "side_score"]],
            bins=np.arange(-130, 131, 10), color=["#1baf7a", "#eb6834"],
            label=["левое (score < 0)", "правое (score > 0)"], edgecolor="white", linewidth=0.8)
    ax.axvline(0, color=INK, linewidth=1)
    ax.set_title("Сторона бедра: разность яркости верха снимка (право − лево)", loc="left")
    ax.set_xlabel("side_score")
    ax.set_ylabel("снимков")
    ax.legend()
    fig.tight_layout()
    return fig
