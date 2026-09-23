from __future__ import annotations
import argparse
import os
import time
import dicom_io
import classify
import spine_axis
import spine_artifacts
import spine_placement
import rules
import report
DEFAULT_KEYPOINTS_DIR = 'C:\\Users\\MSI\\Downloads\\outputs_keypoints'
DEFAULT_ROTATION_DIR = 'C:\\Users\\MSI\\Downloads\\outputs_lesser_trochanter'

def _discover_studies(root: str) -> list[str]:
    if os.path.isfile(root):
        return [root]
    children = os.listdir(root)
    if any((c.lower().endswith('.dcm') for c in children)):
        return [root]
    return [os.path.join(root, c) for c in children if os.path.isdir(os.path.join(root, c))]

def process_study(study_path: str, kp_ensemble, rot_ensemble, fold_lookup: dict | None=None) -> list[report.ReportRow]:
    rows: list[report.ReportRow] = []
    images, read_errors = dicom_io.collect_study(study_path, dedupe=True)
    oof_fold = None
    if fold_lookup is not None:
        oof_fold = fold_lookup.get(os.path.basename(study_path.rstrip('/\\')))
    for path, exc in read_errors:
        rows.append(report.ReportRow(path_to_study=study_path, study_uid='', image_uid='', anatomical_region='', quality_class='', violation_type='', processing_status='Failure', time_of_processing=0.0, notes=f'{path}: {exc}'))
    for img in images:
        t0 = time.perf_counter()
        try:
            region_result = classify.classify_file(img.path)
            override_side = dicom_io.KNOWN_HIP_MISCLASSIFIED_AS_SPINE.get(img.pixel_hash)
            if override_side is not None:
                region_result.region = 'hip'
                region_result.side = override_side
            if region_result.region == 'spine':
                axis_result = spine_axis.analyze(img.pixels_u8)
                artifact_result = spine_artifacts.analyze(img.pixels_u8)
                placement_result = spine_placement.analyze(img.pixels_u8)
                verdict = rules.evaluate_spine(axis_result.angle_deg, axis_result.note, artifact_result=artifact_result, placement_result=placement_result)
                anatomical_region = 'spine'
            else:
                side_label = 'hip_left' if region_result.side == 'image_left' else 'hip_right'
                kp_result = kp_ensemble.predict(img.pixels_u8, oof_fold=oof_fold) if kp_ensemble else []
                rot_result = rot_ensemble.predict(img.pixels_u8, oof_fold=oof_fold) if rot_ensemble else None
                verdict = rules.evaluate_hip(side_label, kp_result, rot_result)
                anatomical_region = side_label
                import hip_roi
                spacing = dicom_io.pixel_spacing_mm(img.path)
                roi_result = hip_roi.analyze(img.pixels_u8.shape, kp_result, side_label.replace('hip_', 'image_'), spacing)
                if roi_result is not None:
                    verdict.notes += f"; ROI(прототип, не в quality_class): top={roi_result.top_cm:.1f}см bottom={roi_result.bottom_cm:.1f}см lateral={roi_result.lateral_cm:.1f}см {('[по правилу ТЗ — нарушение]' if roi_result.roi_violation else '[в норме]')}"
            elapsed = time.perf_counter() - t0
            rows.append(report.ReportRow(path_to_study=study_path, study_uid=img.study_uid, image_uid=img.sop_uid, anatomical_region=anatomical_region, quality_class=verdict.quality_class, violation_type=verdict.violation_type, processing_status='Success', time_of_processing=round(elapsed, 3), confidence=round(verdict.confidence, 3), criteria_evaluated=verdict.criteria_evaluated, criteria_missing=verdict.criteria_missing, notes=verdict.notes))
        except Exception as exc:
            elapsed = time.perf_counter() - t0
            rows.append(report.ReportRow(path_to_study=study_path, study_uid=img.study_uid, image_uid=img.sop_uid, anatomical_region='', quality_class='', violation_type='', processing_status='Failure', time_of_processing=round(elapsed, 3), notes=str(exc)))
    return rows

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('path', help='Папка с исследованиями, одно исследование или один DICOM-файл')
    parser.add_argument('--out', default='report.csv', help='Путь к результату (.csv или .xlsx)')
    parser.add_argument('--keypoints-dir', default=DEFAULT_KEYPOINTS_DIR)
    parser.add_argument('--rotation-dir', default=DEFAULT_ROTATION_DIR)
    parser.add_argument('--no-hip-models', action='store_true', help='Не грузить нейросети бедра (только зона/сторона + ось позвоночника)')
    parser.add_argument('--study-summary', default=None, help='Доп. файл: сводка по исследованию (не по зоне/снимку) для демо/UI. НЕ заменяет основной --out — ТЗ 2.5 требует строку на изображение, это дополнительный агрегат сверх минимальной схемы.')
    parser.add_argument('--fold-manifest', default=None, help='ТОЛЬКО для честной OOF-оценки на своих размеченных данных: путь к manifest.csv (колонки study_uid, fold). На CV-фолдах (0-3) для каждого исследования используется только та модель, что его не видела при обучении, вместо полного ансамбля. На закрытом тесте не передавать.')
    args = parser.parse_args()
    fold_lookup = None
    if args.fold_manifest:
        import pandas as pd
        m = pd.read_csv(args.fold_manifest)
        fold_lookup = m.drop_duplicates('study_uid').set_index('study_uid')['fold'].astype(int).to_dict()
        print(f'OOF-режим: загружено {len(fold_lookup)} исследований с фолдами из {args.fold_manifest}')
    kp_ensemble = rot_ensemble = None
    if not args.no_hip_models:
        import hip_keypoints
        import hip_rotation
        try:
            kp_ensemble = hip_keypoints.HipKeypointEnsemble(args.keypoints_dir)
            print(f'Ключевые точки бедра: {len(kp_ensemble.models)} моделей загружено')
        except FileNotFoundError as exc:
            print(f'[!] Ключевые точки бедра недоступны: {exc}')
        try:
            rot_ensemble = hip_rotation.HipRotationEnsemble(args.rotation_dir)
            print(f'Ротация бедра: {len(rot_ensemble.seg_models)} seg + {len(rot_ensemble.clf_models)} clf моделей')
        except FileNotFoundError as exc:
            print(f'[!] Ротация бедра недоступна: {exc}')
    studies = _discover_studies(args.path)
    print(f'Найдено исследований: {len(studies)}')
    all_rows: list[report.ReportRow] = []
    t_start = time.perf_counter()
    for i, study_path in enumerate(studies, 1):
        rows = process_study(study_path, kp_ensemble, rot_ensemble, fold_lookup=fold_lookup)
        all_rows.extend(rows)
        print(f'[{i}/{len(studies)}] {study_path}: {len(rows)} строк')
    report.write_report(all_rows, args.out)
    if args.study_summary:
        report.write_study_summary(all_rows, args.study_summary)
        print(f'Сводка по исследованиям -> {args.study_summary}')
    total_time = time.perf_counter() - t_start
    n_success = sum((1 for r in all_rows if r.processing_status == 'Success'))
    n_failure = sum((1 for r in all_rows if r.processing_status == 'Failure'))
    print(f'\nГотово: {len(all_rows)} строк ({n_success} Success, {n_failure} Failure) -> {args.out}')
    print(f'Общее время: {total_time:.1f}с, среднее на исследование: {total_time / max(1, len(studies)):.2f}с')
if __name__ == '__main__':
    main()
