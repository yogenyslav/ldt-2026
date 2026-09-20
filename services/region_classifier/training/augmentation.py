"""
Аугментация для обучения классификатора зоны/стороны (Шаг 1 плана,
docs/plan.md). Рассчитана на запуск в Kaggle/Colab-ноутбуке — только
albumentations + opencv + numpy, без специфики локального окружения.

Ключевые решения (почему именно так):

1. Горизонтальный флип обрабатывается ОТДЕЛЬНО от остального пайплайна
   albumentations, функцией `flip_with_label_swap`. Причина: флип бедра
   меняет его анатомическую сторону (hip_left <-> hip_right), а
   albumentations ничего не знает про семантику наших меток — она только
   переворачивает пиксели. Если добавить HorizontalFlip прямо в
   Compose(), метка останется прежней и будет неверной для перевёрнутых
   примеров бедра. Для позвоночника (spine) флип оставляет метку как
   есть (условно симметричен относительно вертикальной оси).

2. НЕ используются: вертикальный флип (анатомически невозможная поза),
   повороты > 12° (угол наклона позвоночника — часть будущей задачи
   контроля качества, Шаг 3; учить модель игнорировать большие повороты
   значит смешивать её с другой, более поздней, задачей) и сильные
   эластичные деформации (искажают форму кости — саму суть сигнала).

3. Контраст/гамма/шум аугментируются заметно сильнее, чем обычно
   принято для классификации на чистых фото. Причина обсуждалась с
   командой отдельно: реальных снимков с других DXA-аппаратов
   (Hologic/iDXA, не только GE Lunar Prodigy Advance, на котором собран
   весь обучающий датасет) у нас нет, а с организаторами уже
   подтверждено, что "здорово, если будет работать на снимках других
   аппаратов". Вендоры DXA различаются в первую очередь контрастной
   обработкой/LUT и уровнем шума, а не только пиксельным разрешением
   (см. обсуждение в истории работы над этим файлом) — поэтому
   агрессивная контрастная аугментация здесь служит суррогатом
   multi-vendor данных, пока настоящих таких данных нет.

4. CoarseDropout по краям имитирует чёрные прямоугольные области,
   которые уже встречаются на части снимков бедра в нашем датасете
   (похоже на артефакт обезличивания/экспорта, см. вопрос №13
   организаторам) — модель не должна учиться на наличии/отсутствии
   этой маски как на признаке зоны/стороны.
"""

from __future__ import annotations

import random
from typing import Tuple

import albumentations as A
import cv2
import numpy as np

IMAGE_SIZE = 224

# Метки, для которых горизонтальный флип должен поменять класс на
# "зеркальный". spine отсутствует в словаре -> при флипе метка не меняется.
FLIP_LABEL_SWAP = {
    "hip_left": "hip_right",
    "hip_right": "hip_left",
}


def flip_with_label_swap(image: np.ndarray, label: str, p: float = 0.5) -> Tuple[np.ndarray, str]:
    """Горизонтальный флип с учётом смены анатомической стороны.

    Это единственная геометрическая аугментация, которая физически
    "размножает" данные, а не просто зашумляет существующие снимки:
    отражённое бедро — это валидный, просто зеркальный, снимок другой
    стороны, а не искажение.
    """
    if random.random() >= p:
        return image, label
    flipped = cv2.flip(image, 1)
    new_label = FLIP_LABEL_SWAP.get(label, label)
    return flipped, new_label


def _clahe(image: np.ndarray) -> np.ndarray:
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    return clahe.apply(image)


def build_train_transform(image_size: int = IMAGE_SIZE) -> A.Compose:
    """Аугментации для обучения. Применяются ПОСЛЕ flip_with_label_swap."""
    return A.Compose(
        [
            # Контраст/яркость/гамма — умеренно-сильно, суррогат
            # multi-vendor разброса (см. докстринг модуля, п.3)
            A.RandomBrightnessContrast(brightness_limit=0.25, contrast_limit=0.25, p=0.8),
            A.RandomGamma(gamma_limit=(70, 130), p=0.5),
            # Шум/резкость — имитация разного уровня детектора/пост-обработки
            A.OneOf(
                [
                    A.GaussNoise(std_range=(0.02, 0.08), p=1.0),
                    A.MultiplicativeNoise(multiplier=(0.9, 1.1), p=1.0),
                ],
                p=0.4,
            ),
            A.OneOf(
                [
                    A.GaussianBlur(blur_limit=(3, 5), p=1.0),
                    A.Sharpen(alpha=(0.1, 0.3), p=1.0),
                ],
                p=0.3,
            ),
            # Небольшой сдвиг/масштаб/поворот — имитация позиционирования
            # пациента. rotate ограничен 12 градусами намеренно (см. п.2).
            A.Affine(
                scale=(0.92, 1.08),
                translate_percent=(0.0, 0.06),
                rotate=(-12, 12),
                fit_output=False,
                p=0.7,
            ),
            # Имитация чёрных прямоугольных масок по краям (см. п.4)
            A.CoarseDropout(
                num_holes_range=(1, 2),
                hole_height_range=(0.05, 0.18),
                hole_width_range=(0.05, 0.18),
                fill=0,
                p=0.25,
            ),
            A.LongestMaxSize(max_size=image_size),
            A.PadIfNeeded(
                min_height=image_size,
                min_width=image_size,
                border_mode=cv2.BORDER_CONSTANT,
                fill=0,
            ),
        ]
    )


def build_eval_transform(image_size: int = IMAGE_SIZE) -> A.Compose:
    """Детерминированный препроцессинг для валидации/инференса — без
    случайности, только приведение к единому размеру. CLAHE применяется
    отдельно в preprocess_image (и для train, и для eval одинаково) —
    это не аугментация, а часть препроцессинга, консистентная с
    services/region_classifier/classify.py.
    """
    return A.Compose(
        [
            A.LongestMaxSize(max_size=image_size),
            A.PadIfNeeded(
                min_height=image_size,
                min_width=image_size,
                border_mode=cv2.BORDER_CONSTANT,
                fill=0,
            ),
        ]
    )


def preprocess_image(image_u8: np.ndarray) -> np.ndarray:
    """CLAHE-препроцессинг, одинаковый для train и eval (не аугментация)."""
    return _clahe(image_u8)


def augment_sample(
    image_u8: np.ndarray,
    label: str,
    train: bool,
    image_size: int = IMAGE_SIZE,
) -> Tuple[np.ndarray, str]:
    """Полный пайплайн для одного примера: CLAHE -> (train: flip+aug) -> resize/pad."""
    image = preprocess_image(image_u8)

    if train:
        image, label = flip_with_label_swap(image, label)
        transform = build_train_transform(image_size)
    else:
        transform = build_eval_transform(image_size)

    augmented = transform(image=image)["image"]
    return augmented, label
