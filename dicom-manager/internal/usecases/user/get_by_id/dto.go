package get_by_id

// User структура пользователя для слоя бизнес-логики.
type User struct {
	ID             int64
	FullName       string
	Email          string
	Role           string
	OrganizationID int64
}
