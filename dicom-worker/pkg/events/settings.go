package events

import (
	"fmt"
	"math"
)

// ResolveSettings возвращает отдельный снимок параметров для задачи.
// Отсутствующие параметры заполняются для совместимости со старыми клиентами.
func ResolveSettings(input map[string]float64) (map[string]float64, error) {
	settings := map[string]float64{
		"trochanter_center_mm":      2.7,
		"trochanter_tol_percent":    63,
		"trochanter_yellow_percent": 30,
	}

	for key, value := range input {
		if _, ok := settings[key]; !ok || math.IsNaN(value) || math.IsInf(value, 0) {
			return nil, fmt.Errorf("invalid analysis setting: %s", key)
		}

		settings[key] = value
	}

	centre := settings["trochanter_center_mm"]
	tolerance := settings["trochanter_tol_percent"]
	yellow := settings["trochanter_yellow_percent"]

	if centre < 0.1 || centre > 8 || tolerance < 0 || yellow < 0 ||
		tolerance+yellow > 100 || centre*(1+(tolerance+yellow)/100) > 8+1e-9 {
		return nil, fmt.Errorf("analysis settings exceed the rotation scale")
	}

	return settings, nil
}
