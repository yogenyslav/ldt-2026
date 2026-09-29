"""Точка входа: один DICOM-файл на вход -> словарь с результатами на выход (поля совпадают с model.JobInfo из swagger.yaml/json коллеги).

    from main import QCService
    svc = QCService()                     # инициализация один раз: реестр моделей, математика
    result = svc.process("file.dcm")      # dict; по умолчанию критерии со значениями, подобранными на наших данных
    result = svc.process("file.dcm", {"trochanter_center_mm": 3.0, "trochanter_tol_percent": 50})   # параметры из запроса (см. qc/settings.py)

    python main.py file.dcm [--overlay out.png] [--settings '{"trochanter_center_mm": 3.0}']     # печатает JSON

Результат (ключи model.JobInfo):
    status            "completed" | "failed"
    anatomical_region "spine" | "hip_left" | "hip_right"
    confidence        float 0..1 — уверенность классификатора региона
    violations        list[str] — нарушенные критерии (пусто — снимок годен)
    duration_ms       int
    metadata          dict — shape, classification (без label/confidence/side: они выше), criteria, verdict, models, settings (с чем считали)
    error             str — только при status == "failed"
"""
import argparse
import json
import time

import cv2

from qc.hub import ModelHub
from qc.pipeline import analyze, read_image
from qc.settings import resolve

VIOLATION_TEXT = {
    "spine_axis": "Ось позвоночника отклонена более чем на 5°",
    "pelvis_crest": "Верхние края подвздошных костей не в кадре",
    "foreign_objects": "Посторонние предметы или артефакты",
    "hip_keypoints": "Не найдены ключевые точки бедра",
    "lesser_trochanter": "Неправильная ротация бедра (малый вертел)",
}

VIOLATION_TYPE_MAP = {
    "Ось позвоночника отклонена более чем на 5°": "Не выровнена ось позвоночника",
    "Верхние края подвздошных костей не в кадре": "Некорректная укладка",
    "Посторонние предметы или артефакты": "Присутствуют посторонние предметы",
    "Область интереса: верх < 3 см": "Некорректная область интереса",
    "Область интереса: низ < 3 см": "Некорректная область интереса",
    "Область интереса: бок < 2 см": "Некорректная область интереса",
    "Область интереса: низ: седалищная кость не найдена": "Некорректная область интереса",
    "Не найдены ключевые точки бедра": "Некорректная укладка",
    "Неправильная ротация бедра (малый вертел)": "Некорректная укладка",
}

ANATOMICAL_REGION_MAP = {
    "spine": "Поясничный отдел позвоночника",
    "hip_left": "Проксимальный отдел бедра",
    "hip_right": "Проксимальный отдел бедра",
}


def violations_of(criteria: dict) -> list:
    out = []
    for name, c in criteria.items():
        if c["ok"] != 0:                     # 1 — норма, None — не оценён: в нарушения не попадает
            continue
        if name == "hip_margins":
            d = c["details"]                                     # минимумы: верх 3 см, низ 3 см, бок 2 см
            for text, val, low in (("верх < 3 см", d["top_cm"], 3.0), ("низ < 3 см", d["bottom_cm"], 3.0), ("бок < 2 см", d["side_cm"], 2.0)):
                if val is None:
                    out.append("Область интереса: низ: седалищная кость не найдена")
                elif val < low:
                    out.append("Область интереса: " + text)
        else:
            out.append(VIOLATION_TEXT.get(name, name))
    return out


class QCService:
    def __init__(self, models_dir: str = None):
        self.hub = ModelHub(models_dir) if models_dir else ModelHub()      # веса подтягиваются из models/, чего нет — запасные пути

    def warmup(self) -> dict:
        """Загрузить все модели сразу (иначе они грузятся при первом снимке). Возвращает статус каждой: подключена / нет весов."""
        from qc.hub import FILES
        for name in FILES:
            self.hub.get(name)
        return self.hub.status()

    def process(self, dicom_path: str, settings: dict | None = None) -> dict:
        t0 = time.time()
        try:
            cfg = resolve(settings)                                            # параметры из запроса поверх значений по умолчанию (проверяются до чтения файла)
            img = read_image(dicom_path)
            res = analyze(img, self.hub, dicom_path, cfg)
        except Exception as e:                                             # для воркера: упасть результатом, а не исключением
            return {"status": "failed", "anatomical_region": None, "confidence": None, "violations": [], "error": f"{type(e).__name__}: {e}",
                    "duration_ms": int((time.time() - t0) * 1000), "metadata": {}}
        cls = res["classification"]
        violations = violations_of(res["criteria"])
        meta = {"shape": res["shape"], "classification": {k: v for k, v in cls.items() if k not in ("label", "confidence", "side")},    # label/confidence/side уже в верхних полях
                "criteria": res["criteria"], "verdict": res["verdict"], "models": res["models"], "settings": cfg,
                "anatomical_region": ANATOMICAL_REGION_MAP.get(cls["label"], cls["label"]),
                "violation_type": [VIOLATION_TYPE_MAP.get(v, v) for v in violations]}
        return {"status": "completed", "anatomical_region": cls["label"], "confidence": cls["confidence"],
                "violations": violations, "duration_ms": int((time.time() - t0) * 1000), "metadata": meta}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dicom"); ap.add_argument("--overlay", help="сохранить картинку с разметкой (отладка)")
    ap.add_argument("--settings", help="JSON с параметрами, например '{\"trochanter_center_mm\": 3.0}'")
    a = ap.parse_args()
    out = QCService().process(a.dicom, json.loads(a.settings) if a.settings else None)
    if a.overlay and out["status"] == "completed":
        from render import render
        cv2.imencode(".png", render(read_image(a.dicom), out))[1].tofile(a.overlay)
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
