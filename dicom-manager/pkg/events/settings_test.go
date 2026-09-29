package events

import (
	"math"
	"reflect"
	"testing"
)

func TestResolveSettings(t *testing.T) {
	defaults, err := ResolveSettings(nil)
	if err != nil || defaults["trochanter_center_mm"] != 2.7 {
		t.Fatalf("defaults: %v %v", defaults, err)
	}

	for _, invalid := range []map[string]float64{
		{"unknown": 1}, {"trochanter_center_mm": math.Inf(1)}, {"trochanter_tol_percent": math.NaN()},
		{"trochanter_center_mm": 0}, {"trochanter_center_mm": 8},
		{"trochanter_tol_percent": 101}, {"trochanter_yellow_percent": -1}, {"trochanter_yellow_percent": 38},
	} {
		if _, err := ResolveSettings(invalid); err == nil {
			t.Errorf("accepted invalid settings: %v", invalid)
		}
	}

	input := map[string]float64{"trochanter_center_mm": 4, "trochanter_tol_percent": 0, "trochanter_yellow_percent": 100}
	got, err := ResolveSettings(input)
	if err != nil || !reflect.DeepEqual(got, input) {
		t.Fatalf("boundary values: %v %v", got, err)
	}

	input["trochanter_center_mm"] = 1
	if got["trochanter_center_mm"] != 4 {
		t.Fatal("snapshot aliases input")
	}
}
