package get_users

// User структура для представления пользователя организации.
type User struct {
	ID       string
	FullName string
}

// GetUsersRequest структура запроса для получения пользователей организации.
type GetUsersRequest struct {
	OrganizationID int64
	Limit          uint64
	Offset         uint64
}
