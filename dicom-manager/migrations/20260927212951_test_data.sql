-- +goose Up
-- Демонстрационные данные. Пароль всех пользователей: test123456.
insert into organization (id, name)
values (-272901, 'Тестовый диагностический центр'),
       (-272902, 'Тестовая городская поликлиника');

insert into "user" (id, organization_id, full_name, email, password_hash, role)
values (-272901, -272901, 'Тестовый администратор центра', 'admin.center@example.test',
        '$2a$10$gTLPIjZlg7.gRSbazk5mEOzWvaOJAEg/w9cfV5pbLaNFI7B.lIX8q', 'admin'),
       (-272902, -272901, 'Тестовый лаборант центра', 'specialist.center@example.test',
        '$2a$10$gTLPIjZlg7.gRSbazk5mEOzWvaOJAEg/w9cfV5pbLaNFI7B.lIX8q', 'specialist'),
       (-272903, -272902, 'Тестовый администратор поликлиники', 'admin.clinic@example.test',
        '$2a$10$gTLPIjZlg7.gRSbazk5mEOzWvaOJAEg/w9cfV5pbLaNFI7B.lIX8q', 'admin'),
       (-272904, -272902, 'Тестовый лаборант поликлиники', 'specialist.clinic@example.test',
        '$2a$10$gTLPIjZlg7.gRSbazk5mEOzWvaOJAEg/w9cfV5pbLaNFI7B.lIX8q', 'specialist');

-- +goose Down
delete from "user" where id in (-272901, -272902, -272903, -272904);
delete from organization where id in (-272901, -272902);
