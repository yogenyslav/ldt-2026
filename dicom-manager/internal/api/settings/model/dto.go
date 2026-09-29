package model

// RotationSettings описывает параметры ротации в запросах и ответах API.
type RotationSettings struct {
	Centre    float64 `json:"trochanter_center_mm" minimum:"0.1" maximum:"8" example:"2.7"`
	Tolerance float64 `json:"trochanter_tol_percent" minimum:"0" maximum:"100" example:"63"`
	Yellow    float64 `json:"trochanter_yellow_percent" minimum:"0" maximum:"100" example:"30"`
}
