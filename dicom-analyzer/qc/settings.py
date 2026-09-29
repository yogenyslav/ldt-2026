"""Настраиваемые параметры критериев. Приходят вместе с запросом (QCService.process(path, settings)) или берутся по умолчанию (значения, подобранные на наших данных).

trochanter_center_mm     середина окна нормы расстояния до малого вертела, мм (по умолчанию 2)
trochanter_tol_percent   допуск нормы в процентах от центра, в обе стороны (по умолчанию 50: норма 1.0-3.0 мм)
trochanter_yellow_percent  ширина жёлтой полосы «проверить» за окном нормы, % от центра (по умолчанию 50: 0-4 мм границы строгие, не включены)
Красный (нарушение, ok = 0) — за пределами нормы и жёлтой полосы; жёлтый — не нарушение (ok = 1)."""
from __future__ import annotations

DEFAULTS = {
    "trochanter_center_mm": 2.0,
    "trochanter_tol_percent": 50.0,
    "trochanter_yellow_percent": 50.0,
}


def resolve(user: dict | None) -> dict:
    """Значения по умолчанию, поверх них присланные; проверка. Неизвестные ключи и неверные значения -> ValueError."""
    s = dict(DEFAULTS)
    for k, v in (user or {}).items():
        if k not in DEFAULTS:
            raise ValueError(f"неизвестный параметр: {k} (допустимые: {', '.join(DEFAULTS)})")
        try:
            s[k] = float(v)
        except (TypeError, ValueError):
            raise ValueError(f"параметр {k} должен быть числом, получено: {v!r}")
    if not s["trochanter_center_mm"] > 0:
        raise ValueError("trochanter_center_mm должен быть больше 0")
    if not 0 < s["trochanter_tol_percent"] <= 100:
        raise ValueError("trochanter_tol_percent должен быть в диапазоне (0, 100]")
    if s["trochanter_yellow_percent"] < 0:
        raise ValueError("trochanter_yellow_percent не может быть отрицательным")
    return s
