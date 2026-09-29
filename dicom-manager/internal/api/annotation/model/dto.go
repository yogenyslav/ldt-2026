package model

// ModelsRequest задаёт модели для запуска обучения или переключения версий.
type ModelsRequest struct {
	Models []string `json:"models"`
}

// ErrorResponse описывает общий формат ошибки API.
type ErrorResponse struct {
	Message string `json:"message"`
}
