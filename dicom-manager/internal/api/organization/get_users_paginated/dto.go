package get_users_paginated

// OrganizationUser структура для представления пользователя организации.
type OrganizationUser struct {
	ID       string `json:"id"`
	FullName string `json:"full_name"`
}

// GetUsersPaginatedOut структура ответа для запроса пользователей организации с пагинацией.
type GetUsersPaginatedOut struct {
	Users []OrganizationUser `json:"users"` // Список пользователей организации.
}
