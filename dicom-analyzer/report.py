from __future__ import annotations
import dataclasses
import pandas as pd
REQUIRED_COLUMNS = ['path_to_study', 'study_uid', 'image_uid', 'anatomical_region', 'quality_class', 'violation_type', 'processing_status', 'time_of_processing']
EXTRA_COLUMNS = ['confidence', 'criteria_evaluated', 'criteria_missing', 'notes']
ALL_COLUMNS = REQUIRED_COLUMNS + EXTRA_COLUMNS

@dataclasses.dataclass
class ReportRow:
    path_to_study: str
    study_uid: str
    image_uid: str
    anatomical_region: str
    quality_class: object
    violation_type: str
    processing_status: str
    time_of_processing: float
    confidence: object = ''
    criteria_evaluated: str = ''
    criteria_missing: str = ''
    notes: str = ''

def build_dataframe(rows: list[ReportRow]) -> pd.DataFrame:
    df = pd.DataFrame([dataclasses.asdict(r) for r in rows])
    for col in ALL_COLUMNS:
        if col not in df.columns:
            df[col] = ''
    return df[ALL_COLUMNS]

def write_report(rows: list[ReportRow], out_path: str) -> None:
    df = build_dataframe(rows)
    if out_path.lower().endswith('.xlsx'):
        df.to_excel(out_path, index=False)
    else:
        df.to_csv(out_path, index=False, encoding='utf-8')

def aggregate_by_study(rows: list[ReportRow]) -> pd.DataFrame:
    df = build_dataframe(rows)
    df['quality_class_num'] = pd.to_numeric(df['quality_class'], errors='coerce')
    df['confidence_num'] = pd.to_numeric(df['confidence'], errors='coerce')
    out_rows = []
    for study_path, g in df.groupby('path_to_study'):
        success = g[g['processing_status'] == 'Success']
        failure = g[g['processing_status'] == 'Failure']
        if len(success) == 0:
            out_rows.append(dict(path_to_study=study_path, study_uid=g['study_uid'].iloc[0] if len(g) else '', n_images=len(g), n_success=0, n_failure=len(failure), quality_class='', violation_zones='', confidence='', processing_status='Failure', notes='все изображения исследования дали ошибку'))
            continue
        violated = success[success['quality_class_num'] == 1]
        quality_class = int(len(violated) > 0)
        if quality_class:
            confidence = float(violated['confidence_num'].min())
        else:
            confidence = float(success['confidence_num'].mean())
        out_rows.append(dict(path_to_study=study_path, study_uid=g['study_uid'].iloc[0] if len(g) else '', n_images=len(g), n_success=len(success), n_failure=len(failure), quality_class=quality_class, violation_zones=','.join((f'{r.anatomical_region}:{r.violation_type}' for r in violated.itertuples() if r.violation_type)), confidence=round(confidence, 3) if confidence == confidence else '', processing_status='Success' if len(failure) == 0 else 'PartialFailure', notes=f'{len(failure)} изображений с ошибкой' if len(failure) else ''))
    return pd.DataFrame(out_rows)

def write_study_summary(rows: list[ReportRow], out_path: str) -> None:
    df = aggregate_by_study(rows)
    if out_path.lower().endswith('.xlsx'):
        df.to_excel(out_path, index=False)
    else:
        df.to_csv(out_path, index=False, encoding='utf-8')
