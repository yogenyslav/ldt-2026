package settings

// Settings содержит сохраненные параметры анализа организации.
type Settings struct {
	Payload []byte `db:"settings"`
}
