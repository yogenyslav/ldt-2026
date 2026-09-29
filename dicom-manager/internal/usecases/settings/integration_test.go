package settings_test

import (
	"context"
	"reflect"
	"testing"

	"github.com/rs/zerolog"
	settingsstorage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/settings"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/settings/get"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/settings/save"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
)

func TestSettingsPersistAndAreIsolated(t *testing.T) {
	db := integrationDB(t)
	ctx := context.Background()
	if _, err := db.Exec(ctx, `insert into organization(id,name) values(9901,'settings'),(9902,'other')`); err != nil {
		t.Fatal(err)
	}

	log := zerolog.Nop()
	metricClient, err := metrics.New("settings_integration_test")
	if err != nil {
		t.Fatal(err)
	}

	store := settingsstorage.New(db)
	getter := get.New(&log, metricClient, store)
	saver := save.New(&log, metricClient, store)
	initial, err := getter.Get(ctx, 9901)
	if err != nil || initial["trochanter_center_mm"] != 2.7 {
		t.Fatalf("defaults: %v %v", initial, err)
	}

	want := map[string]float64{"trochanter_center_mm": 3, "trochanter_tol_percent": 50, "trochanter_yellow_percent": 20}
	if _, err := saver.Save(ctx, 9901, want); err != nil {
		t.Fatal(err)
	}

	got, err := get.New(&log, metricClient, settingsstorage.New(db)).Get(ctx, 9901)
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("persisted settings: %v %v", got, err)
	}

	other, err := getter.Get(ctx, 9902)
	if err != nil || !reflect.DeepEqual(other, initial) {
		t.Fatalf("organization leak: %v %v", other, err)
	}

	want["trochanter_tol_percent"] = 0
	if _, err := saver.Save(ctx, 9901, want); err != nil {
		t.Fatal(err)
	}

	got, err = getter.Get(ctx, 9901)
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("update: %v %v", got, err)
	}
}
