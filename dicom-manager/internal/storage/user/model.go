package user

// User модель пользователя в БД.
type User struct {
	ID             int64  `db:"id"`
	OrganizationID int64  `db:"organization_id"`
	FullName       string `db:"full_name"`
	Email          string `db:"email"`
	PasswordHash   string `db:"password_hash"`
	Role           string `db:"role"`
}
