-- +goose Up
alter table analyzer_jobs alter column dicom_id type text using dicom_id::text;
alter table analyzer_jobs add column error text not null default '';
alter table analyzer_jobs add constraint analyzer_jobs_status_check check (status in ('pending','running','completed','failed'));
alter table analyzer_job_results add constraint analyzer_job_results_job_fk foreign key (id) references analyzer_jobs(id) on delete cascade;

-- +goose Down
alter table analyzer_job_results drop constraint analyzer_job_results_job_fk;
alter table analyzer_jobs drop constraint analyzer_jobs_status_check;
alter table analyzer_jobs drop column error;
-- Оставляем dicom_id строкой: обратное приведение Orthanc ID к UUID приведет к потере данных.
