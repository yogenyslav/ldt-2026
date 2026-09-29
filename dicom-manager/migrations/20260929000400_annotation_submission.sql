-- +goose Up
create table annotation_submission
(
    submission_id   text primary key,
    organization_id bigint not null references organization (id),
    job_id          uuid not null references dicom_job_result (job_id),
    task           text not null check (task in ('hip_keypoints', 'pelvis_crest', 'foreign_seg')),
    status         text not null check (status in ('done', 'uncertain', 'skipped')),
    annotator_id   bigint not null references "user" (id),
    annotator_role text not null,
    payload        jsonb not null,
    supersedes     text unique references annotation_submission (submission_id),
    received_at    timestamp with time zone not null default now(),
    check (supersedes is null or supersedes <> submission_id)
);

create index annotation_submission_organization_page_idx
    on annotation_submission (organization_id, received_at desc, submission_id desc);
create index annotation_submission_job_idx
    on annotation_submission (organization_id, job_id);

-- +goose Down
drop table annotation_submission;
