package user_login

// UserLoginIn структура запроса для входа пользователя в систему.
type UserLoginIn struct {
	Username string `json:"username"` // Имя пользователя для входа в систему.
	Password string `json:"password"` // Пароль пользователя для входа в систему.
}

// UserLoginOut структура ответа после успешного входа пользователя в систему.
type UserLoginOut struct {
	Token string `json:"token"` // JWT-токен, который будет использоваться для аутентификации последующих запросов.
}
