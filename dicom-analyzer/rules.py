from __future__ import annotations
import dataclasses
CRITERIA_IMPLEMENTED = {'spine': ['axis', 'artifacts', 'placement'], 'hip': ['positioning', 'rotation']}
CRITERIA_ALL = {'spine': ['placement', 'axis', 'artifacts'], 'hip': ['positioning', 'rotation', 'roi']}

@dataclasses.dataclass
class ZoneVerdict:
    anatomical_region: str
    quality_class: int
    violation_type: str
    confidence: float
    criteria_evaluated: str
    criteria_missing: str
    notes: str = ''

def _region_group(anatomical_region: str) -> str:
    return 'spine' if anatomical_region == 'spine' else 'hip'

def _axis_confidence(angle_deg: float, threshold: float=5.0) -> float:
    margin = abs(abs(angle_deg) - threshold)
    return float(min(0.99, 0.5 + 0.05 * margin))

def evaluate_spine(axis_angle_deg: float | None, axis_note: str, artifact_result=None, placement_result=None) -> ZoneVerdict:
    criteria_evaluated = list(CRITERIA_IMPLEMENTED['spine'])
    criteria_missing = [c for c in CRITERIA_ALL['spine'] if c not in criteria_evaluated]
    violations = []
    confidences = []
    notes = []
    if axis_angle_deg is not None:
        axis_violation = abs(axis_angle_deg) > 5.0
        if axis_violation:
            violations.append('axis')
        confidences.append(_axis_confidence(axis_angle_deg))
        notes.append(f'angle={axis_angle_deg:+.1f}°')
    else:
        criteria_evaluated = [c for c in criteria_evaluated if c != 'axis']
        criteria_missing.append('axis(не посчитана)')
        notes.append(f'ось не посчитана: {axis_note}')
    if artifact_result is not None:
        if artifact_result.has_artifact:
            violations.append('artifacts')
        from spine_artifacts import ARTIFACT_THRESHOLD
        margin = abs(artifact_result.score - ARTIFACT_THRESHOLD)
        confidences.append(float(min(0.99, 0.5 + 0.02 * margin)))
        notes.append(f'artifact_score={artifact_result.score:.1f}')
    else:
        criteria_evaluated = [c for c in criteria_evaluated if c != 'artifacts']
        criteria_missing.append('artifacts(модель недоступна)')
    if placement_result is not None:
        if placement_result.placement_violation:
            violations.append('placement')
        confidences.append(0.5)
        notes.append(f'wing_coverage={placement_result.wing_coverage:.3f} [low_confidence: правило не проверено на отложенных данных, n=6]')
    else:
        criteria_evaluated = [c for c in criteria_evaluated if c != 'placement']
        criteria_missing.append('placement(модель недоступна)')
    quality_class = int(len(violations) > 0)
    confidence = float(sum(confidences) / len(confidences)) if confidences else 0.0
    return ZoneVerdict(anatomical_region='spine', quality_class=quality_class, violation_type=','.join(violations), confidence=confidence, criteria_evaluated=','.join(criteria_evaluated), criteria_missing=','.join(criteria_missing), notes='; '.join(notes))
POSITIONING_MIN_MISSING = 2
'Сколько из 3 точек должны быть не видны, чтобы засчитать нарушение\n"positioning". Не 1 (как логично звучит из ТЗ буквально) — у каждой точки\nсвоя ошибка модели на предсказании видимости (7-23% на честном отложенном\nтесте, см. kp_cv_summary.json), и при правиле "хотя бы одна" эти ошибки\nперемножаются: 1-0.93*0.93*0.77 ≈ 33% ложных срабатываний на НОРМАЛЬНЫХ\nбёдрах — проверено на TEST_FOLD (30 бёдер, честная сверка со сборкой всего\nпайплайна: report_full_dataset.csv vs разметка.xlsx). Порог >=2 снижает\nдолю ложных срабатываний с 13/27 до 5/27 на том же тесте, ценой recall\n(модель и так почти не ловит редкие настоящие нарушения — 1 из 3 при любом\nпороге, слишком мало данных). Порог 3 (все точки) даёт ещё меньше ложных\nсрабатываний (4/27), но это уже подгонка под n=30 — не взяли.'

def evaluate_hip(side_label: str, keypoints, rotation) -> ZoneVerdict:
    criteria_evaluated = list(CRITERIA_IMPLEMENTED['hip'])
    criteria_missing = [c for c in CRITERIA_ALL['hip'] if c not in criteria_evaluated]
    n_missing = sum((1 for kp in keypoints if not kp.visible))
    positioning_violation = n_missing >= POSITIONING_MIN_MISSING
    positioning_confidence = float(sum((kp.confidence for kp in keypoints)) / len(keypoints)) if keypoints else 0.0
    missing_names = [kp.name for kp in keypoints if not kp.visible]
    violations = []
    if positioning_violation:
        violations.append('positioning')
    confidences = [positioning_confidence]
    notes = [f'visible={[kp.name for kp in keypoints if kp.visible]}']
    if missing_names:
        notes.append(f'не видны: {missing_names}')
    if rotation is not None:
        if rotation.position_error == 1:
            violations.append('rotation')
        confidences.append(rotation.confidence)
        notes.append(f'rotation_conf={rotation.confidence:.2f} seg_conf={rotation.seg_confidence:.2f}' + (' [low_confidence]' if rotation.low_confidence else ''))
    else:
        criteria_evaluated = [c for c in criteria_evaluated if c != 'rotation']
        criteria_missing.append('rotation(модель недоступна)')
    quality_class = int(len(violations) > 0)
    confidence = float(sum(confidences) / len(confidences)) if confidences else 0.0
    return ZoneVerdict(anatomical_region=side_label, quality_class=quality_class, violation_type=','.join(violations), confidence=confidence, criteria_evaluated=','.join(criteria_evaluated), criteria_missing=','.join(criteria_missing), notes='; '.join(notes))
