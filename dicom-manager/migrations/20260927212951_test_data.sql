-- +goose Up
-- Демонстрационные данные. Пароль всех пользователей: test123456.
insert into organization (id, name)
values (12345, 'Тестовый диагностический центр'),
       (12346, 'Тестовая городская поликлиника');

insert into "user" (id, organization_id, full_name, email, password_hash, role)
values (12345, 12345, 'Тестовый администратор центра', 'admin.center@example.test',
        '$2a$10$gTLPIjZlg7.gRSbazk5mEOzWvaOJAEg/w9cfV5pbLaNFI7B.lIX8q', 'admin'),
       (12346, 12345, 'Тестовый лаборант центра', 'specialist.center@example.test',
        '$2a$10$gTLPIjZlg7.gRSbazk5mEOzWvaOJAEg/w9cfV5pbLaNFI7B.lIX8q', 'specialist'),
       (12347, 12346, 'Тестовый администратор поликлиники', 'admin.clinic@example.test',
        '$2a$10$gTLPIjZlg7.gRSbazk5mEOzWvaOJAEg/w9cfV5pbLaNFI7B.lIX8q', 'admin'),
       (12348, 12346, 'Тестовый лаборант поликлиники', 'specialist.clinic@example.test',
        '$2a$10$gTLPIjZlg7.gRSbazk5mEOzWvaOJAEg/w9cfV5pbLaNFI7B.lIX8q', 'specialist');

-- +goose Down
delete from "user" where id in (12345, 12346, 12347, 12348);
delete from organization where id in (12345, 12346);
