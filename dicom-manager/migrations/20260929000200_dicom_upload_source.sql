-- +goose Up
alter table dicom_file
    add column upload_source text not null default 'unknown'
    check (upload_source in ('unknown', 'manual', 'orthanc'));
create index idx_dicom_file_organization_upload_source on dicom_file (organization_id, upload_source);

-- +goose Down
drop index idx_dicom_file_organization_upload_source;
alter table dicom_file drop column upload_source;
