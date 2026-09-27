package get_by_id

// GetByIDOut структура ответа для запроса организации по ID.
type GetByIDOut struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}
