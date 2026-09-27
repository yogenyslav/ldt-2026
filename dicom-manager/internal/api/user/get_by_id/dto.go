package get_by_id

import (
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
)

// GetByIDOut структура ответа получения информации о пользователе.
type GetByIDOut struct {
	ID             int64          `json:"id"`              // ID пользователя.
	FullName       string         `json:"full_name"`       // Имя пользователя.
	Role           model.UserRole `json:"role"`            // Роль пользователя (specialist, admin).
	OrganizationID int64          `json:"organization_id"` // Список ID организаций, к которым принадлежит пользователь.
}
