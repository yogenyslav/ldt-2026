package login

import (
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
)

// LoginIn структура запроса для входа пользователя в систему.
type LoginIn struct {
	Email    string `json:"email"`    // Email пользователя для входа в систему.
	Password string `json:"password"` // Пароль пользователя для входа в систему.
}

// LoginOut структура ответа после успешного входа пользователя в систему.
type LoginOut struct {
	Token          string         `json:"token"`           // JWT-токен, который будет использоваться для аутентификации последующих запросов.
	Role           model.UserRole `json:"role"`            // Роль пользователя (specialist, admin).
	UserID         int64          `json:"user_id"`         // ID пользователя.
	OrganizationID int64          `json:"organization_id"` // ID организации, к которой принадлежит пользователь.
}
