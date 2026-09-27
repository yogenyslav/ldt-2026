# Модели (сюда кладутся веса)

Весов в репозитории нет — они слишком много весят и передаются отдельно; в git лежат только пороги решений (`*_gate.json`).
Без весов пайплайн работает на математике, а критерии, которым нужна модель, возвращают `ok: null` (не оценён).
Подключение модели = положить файл + добавить loader в `qc/hub.py` (`LOADERS["имя"] = lambda path: <объект с predict>`).

| имя | файл | predict(img_u8) возвращает | что без неё |
|---|---|---|---|
| region | region_classifier.pt | `{label: spine/hip_left/hip_right, confidence}` | эвристика classify.py |
| hip_keypoints | hip_keypoints.pt + hip_keypoints_gate.json | `predict(img, side)` -> `{points: {greater_trochanter_apex, femoral_neck, ischium: (x, y, conf)} (только взятые точки), found_all}`; точка берётся при оценке ≥ порога из gate.json и внутри маски кости | ротация меряется без отсева |
| pelvis_crest | pelvis_crest.pt | `{left: (x, y, p)/None, right: ...}` | голос не участвует |
| pelvis_presence | pelvis_presence.pt | `{left: p, right: p}` | голос не участвует |
| foreign_seg | foreign_seg.pt | `{wire: mask, object: mask}` (uint8, размер снимка) | `ok: null` |
