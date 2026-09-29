import type { IDicomInfo, IJobInfo } from '@/types'

/* Данные пациента и идентификаторы исследования приходят в карточке DICOM,
   отдельно от результатов анализа. Пустые теги не заменяют известные значения. */
export function enrichJob(job: IJobInfo, dicom?: IDicomInfo): IJobInfo {
  return {
    ...job,
    dicom_study_uid: dicom?.dicom_study_uid?.trim() || job.dicom_study_uid,
    dicom_image_uid: dicom?.dicom_image_uid?.trim() || job.dicom_image_uid,
    study_id: dicom?.study_id?.trim() || job.study_id || job.metadata?.study_id,
    patient_ref: dicom?.patient_id?.trim() || job.patient_ref || job.metadata?.patient_ref,
    file_name: dicom?.file_name || job.file_name,
  }
}

/* Идентификатор задачи используется только как внутренний ключ, если данные
   исследования еще не загрузились. Пользователю он как UID не показывается. */
export function studyKeyOf(job: IJobInfo): string {
  return job.dicom_study_uid || job.study_id || job.metadata?.study_id || job.id
}
