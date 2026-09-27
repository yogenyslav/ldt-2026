package organization

// Organization структура для представления организации в БД.
type Organization struct {
	ID   int64  `db:"id"`
	Name string `db:"name"`
}

// User структура для представления пользователя организации в БД.
type User struct {
	ID       string `db:"id"`
	FullName string `db:"full_name"`
}
