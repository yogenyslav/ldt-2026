package auth

// LoginRequest структура для передачи данных при аутентификации пользователя.
type LoginRequest struct {
	Email       string
	RawPassword string
}

// Role тип для роли пользователя.
type Role string

const (
	RoleAdmin Role = "admin"      // RoleAdmin роль администратора.
	RoleUser  Role = "specialist" // RoleUser роль специалиста (лаборанта).
)

// UserAuthData структура для передачи данных о пользователе после успешной аутентификации.
type UserAuthData struct {
	Token          string
	Role           Role
	UserID         int64
	OrganizationID int64
}
