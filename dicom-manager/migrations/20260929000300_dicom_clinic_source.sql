-- +goose Up
alter table dicom_file drop constraint dicom_file_upload_source_check;

update dicom_file set upload_source = 'clinic' where upload_source = 'orthanc';
update dicom_file d set upload_source = 'clinic'
from "user" u
where d.creator_id = u.id and d.upload_source = 'manual' and u.role = 'specialist';

alter table dicom_file add constraint dicom_file_upload_source_check
    check (upload_source in ('unknown', 'manual', 'clinic'));

-- +goose Down
alter table dicom_file drop constraint dicom_file_upload_source_check;

update dicom_file set upload_source = 'orthanc' where upload_source = 'clinic';
alter table dicom_file add constraint dicom_file_upload_source_check
    check (upload_source in ('unknown', 'manual', 'orthanc'));
