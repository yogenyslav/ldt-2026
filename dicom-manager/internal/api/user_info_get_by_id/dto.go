package user_info_get_by_id

// UserRole представляет роль пользователя в системе.
type UserRole string

const (
	UserRoleSpecialist UserRole = "specialist" // Специалист, который может принимать решения по обработке DICOM-файлов.
	UserRoleAdmin      UserRole = "admin"      // Администратор системы.
)

// UserGetInfoOut структура ответа получения информации о пользователе.
type UserGetInfoOut struct {
	ID              int64    `json:"id"`               // ID пользователя.
	FullName        string   `json:"full_name"`        // Имя пользователя.
	Role            UserRole `json:"role"`             // Роль пользователя (specialist, admin).
	OrganisationIDs []int64  `json:"organisation_ids"` // Список ID организаций, к которым принадлежит пользователь.
}
