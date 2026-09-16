"""
Проверка классификатора зоны (classify.py) на обучающем наборе.

ВАЖНО: настоящей поимённой (per-image) разметки зоны организаторы не
предоставили — только study-level разметку критериев качества в
разметка.xlsx. Поэтому здесь классификатор, основанный на форме кости
(периодичность профиля), сверяется с эвристикой по ширине снимка
(300px -> позвоночник, 280px -> бедро), которую команда использовала
для первичной сортировки данных. Это НЕ независимая истинная метка,
а сверка одной эвристики с другой — совпадение показывает, что метод
на основе формы работает независимо от ширины снимка (что важно на
случай других настроек экспорта/аппарата на закрытом тесте), расхождения
стоит проверять руками.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from classify import classify_file, SPINE_PEAK_THRESHOLD  # noqa: E402


def main(dataset_root: str) -> None:
    total = 0
    agree_blended = 0  # итоговое region (учитывает fallback на ширину при разногласии)
    agree_shape_only = 0  # только признак периодичности, без подмешивания ширины
    disagreements = []

    for root, _dirs, files in os.walk(dataset_root):
        for f in files:
            fp = os.path.join(root, f)
            try:
                result = classify_file(fp)
            except Exception as exc:  # noqa: BLE001
                print(f"SKIP (read error): {fp}: {exc}")
                continue

            if result.width_hint is None:
                continue  # ширина снимка не входит в известные для этого аппарата

            total += 1
            peak_vote = "spine" if result.n_peaks >= SPINE_PEAK_THRESHOLD else "hip"

            if result.width_hint == result.region:
                agree_blended += 1
            if result.width_hint == peak_vote:
                agree_shape_only += 1
            else:
                disagreements.append((fp, result, peak_vote))

    print(f"Всего сопоставимых снимков: {total}")
    print(
        "Точность ТОЛЬКО признака формы (периодичность), без подмешивания ширины: "
        f"{agree_shape_only} ({100 * agree_shape_only / total:.1f}%) "
        "— это честная оценка shape-based метода"
    )
    print(
        "Совпадение итогового (blended, с fallback на ширину при разногласии) региона "
        f"с width-эвристикой: {agree_blended} ({100 * agree_blended / total:.1f}%) "
        "— тривиально высокое по построению, не показатель качества shape-признака"
    )
    print(f"Расхождений shape-only с width: {len(disagreements)}")
    for fp, result, peak_vote in disagreements[:30]:
        print(
            f"  {fp}\n"
            f"    width_hint={result.width_hint} vs shape_only_vote={peak_vote} "
            f"(n_peaks={result.n_peaks})"
        )


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python eval_against_width_heuristic.py <path_to_Исследования>")
        sys.exit(1)
    main(sys.argv[1])
