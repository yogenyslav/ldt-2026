package model

// UserRole представляет роль пользователя в системе.
type UserRole string

const (
	UserRoleSpecialist UserRole = "specialist" // Специалист, который может принимать решения по обработке DICOM-файлов.
	UserRoleAdmin      UserRole = "admin"      // Администратор системы.
)
