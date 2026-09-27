-- +goose Up
create index if not exists idx_dicom_file_study_id on dicom_file (study_id);
create index if not exists idx_dicom_file_creator_id on dicom_file (creator_id);
create index if not exists idx_dicom_file_organization_id on dicom_file (organization_id);

create index if not exists idx_dicom_job_result_dicom_file_id on dicom_job_result (dicom_file_id);

create index if not exists idx_report_dicom_job_result_id on report (dicom_job_result_id);
create index if not exists idx_report_creator_id on report (creator_id);

-- +goose Down
drop index if exists idx_dicom_file_study_id;
drop index if exists idx_dicom_file_creator_id;
drop index if exists idx_dicom_file_organization_id;
drop index if exists idx_dicom_job_result_dicom_file_id;
drop index if exists idx_report_dicom_job_result_id;
drop index if exists idx_report_creator_id;
