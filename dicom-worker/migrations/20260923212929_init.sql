-- +goose Up
create table if not exists analyzer_jobs
(
    id         uuid primary key,                                    -- внутренний job_id
    dicom_id   uuid                     not null,                   -- реальный id dicom файла
    status     text                     not null default 'pending', -- pending, running, completed, failed
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
);

create table if not exists analyzer_job_results
(
    id                uuid primary key,                                           -- job_id
    anatomical_region text                     not null,                          -- анатомическая область исследования
    confidence        double precision         not null default 0,                -- уверенность в результатах анализа от 0 до 1
    violations        text[]                   not null default array []::text[], -- типы нарушений по критериям
    duration_ms       integer                  not null default 0,                -- время обработки в миллисекундах
    created_at        timestamp with time zone not null default now()
);

-- +goose Down
drop table if exists analyzer_jobs;
drop table if exists analyzer_job_results;
