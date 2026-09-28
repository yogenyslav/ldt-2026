-- +goose Up
create index idx_analyzer_jobs_timeout on analyzer_jobs (updated_at, id)
    where status in ('pending', 'running');

-- +goose Down
drop index idx_analyzer_jobs_timeout;
