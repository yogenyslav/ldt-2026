-- +goose Up
create table analysis_settings (
    organization_id bigint primary key references organization (id),
    settings jsonb not null check (jsonb_typeof(settings) = 'object'),
    updated_at timestamptz not null default now()
);

-- +goose Down
drop table analysis_settings;
