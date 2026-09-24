-- +goose Up
create table if not exists outbox_events
(
    id                uuid primary key,                                    -- id outbox события
    job_id            uuid                     not null,                   -- id job, к которому относится событие
    event_type        text                     not null,                   -- тип события: analysis.requested, document.updated, document.failed
    payload           jsonb                    not null,                   -- полезная нагрузка события

    publishing_status text                     not null default 'pending', -- pending, processing, published
    attempts          integer                  not null default 0,         -- количество попыток обработки события
    available_at      timestamp with time zone not null default now(),     -- время, когда событие доступно для обработки

    created_at        timestamp with time zone not null default now(),
    published_at      timestamp with time zone,                            -- время публикации события

    locked_until      timestamp with time zone,                            -- время, до которого событие заблокировано для обработки
    last_error        text                                                 -- текст последней ошибки при обработке события
);

create index if not exists idx_outbox_events_job_id on outbox_events (job_id);

-- индекс для pending событий, ожидающих отправки
create index if not exists idx_outbox_events_pending on outbox_events (available_at, created_at)
    where publishing_status = 'pending';

-- индекс для заблокированных событий, которые в данный момент обрабатываются
create index if not exists idx_outbox_events_locked on outbox_events (locked_until)
    where publishing_status = 'pending' and locked_until is not null;

-- +goose Down
drop index if exists idx_outbox_events_job_id;
drop index if exists idx_outbox_events_pending;
drop index if exists idx_outbox_events_locked;
drop table if exists outbox_events;
