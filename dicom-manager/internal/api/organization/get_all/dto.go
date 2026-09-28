package get_all

// Organization представляет организацию в ответе API.
type Organization struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

// GetAllOut содержит список всех организаций.
type GetAllOut struct {
	Organizations []Organization `json:"organizations"`
}
