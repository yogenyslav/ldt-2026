-- +goose Up
alter table dicom_file
    add column patient_id text not null default '',
    add column device_model text not null default '';

-- +goose Down
alter table dicom_file
    drop column device_model,
    drop column patient_id;
