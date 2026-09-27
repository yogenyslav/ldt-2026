-- +goose Up
create table if not exists organization
(
    id         bigserial primary key,
    name       text not null,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create table if not exists "user"
(
    id              bigserial primary key,
    organization_id bigint references organization (id) on delete cascade,
    full_name       text not null,
    email           text not null unique,
    password_hash   text not null,
    role            text not null            default 'specialist', -- specialist, admin
    created_at      timestamp with time zone default now(),
    updated_at      timestamp with time zone default now()
);

create table if not exists dicom_file
(
    id               text primary key,
    file_name        text   not null,
    study_id         text   not null,
    series_id        text   not null,
    dicom_study_uid  text   not null,
    dicom_series_uid text   not null,
    dicom_image_uid  text   not null,
    creator_id       bigint not null references "user" (id) on delete set default,
    organization_id  bigint not null references organization (id) on delete set default,
    created_at       timestamp with time zone default now(),
    updated_at       timestamp with time zone default now()
);

create table if not exists dicom_job_result
(
    job_id              uuid primary key,
    dicom_file_id       text not null references dicom_file (id) on delete cascade,
    job_status          text not null            default 'pending',          -- pending, running, completed, failed
    anatomical_region   text,                                                -- анатомическая область исследования
    confidence          double precision,                                    -- уверенность в результатах анализа от 0 до 1
    violations          text[],                                              -- типы нарушений по критериям
    duration_ms         integer,                                             -- время обработки в миллисекундах
    metadata            jsonb,                                               -- дополнительные данные
    specialist_decision text,                                                -- решение лаборанта (approved, rejected, force_approved)
    specialist_id       bigint references "user" (id) on delete set default, -- id лаборанта, который принял решение
    comment             text,                                                -- комментарий лаборанта
    created_at          timestamp with time zone default now(),
    updated_at          timestamp with time zone default now()
);

create table if not exists report
(
    id                   bigserial primary key,
    dicom_job_result_ids text[] not null,
    creator_id           bigint not null references "user" (id) on delete set default,
    created_at           timestamp with time zone default now()
);

-- +goose Down
drop table if exists report;
drop table if exists dicom_job_result;
drop table if exists dicom_file;
drop table if exists "user";
drop table if exists organization;
