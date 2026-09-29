package upload

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"uuid"

	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability/metrics"
)

type settingsStub struct {
	org   int64
	value map[string]float64
	err   error
}

func (s *settingsStub) Get(_ context.Context, org int64) (map[string]float64, error) {
	s.org = org

	return s.value, s.err
}

type settingsWorker struct {
	got    map[string]float64
	called bool
}

func (s *settingsWorker) ProcessDicomFiles(_ context.Context, ids []string, settings map[string]float64) (map[string]uuid.UUID, error) {
	s.got = settings
	s.called = true

	return map[string]uuid.UUID{}, nil
}

func TestProcessingReadsOrganizationSettings(t *testing.T) {
	log := zerolog.Nop()
	m, err := metrics.New("settings_upload")
	if err != nil {
		t.Fatal(err)
	}

	settings := &settingsStub{value: map[string]float64{"trochanter_center_mm": 3}}
	worker := &settingsWorker{}
	uc := &Usecase{log: &log, metrics: m, jobCreator: jobsStub{}, worker: worker, settings: settings}
	if _, err := uc.processDicoms(context.Background(), []string{"dicom"}, 23); err != nil {
		t.Fatal(err)
	}

	if settings.org != 23 || !reflect.DeepEqual(worker.got, settings.value) {
		t.Fatal("organization settings not delivered")
	}

	settings.err = errors.New("storage unavailable")
	worker.called = false
	if _, err := uc.processDicoms(context.Background(), []string{"dicom"}, 23); err == nil || worker.called {
		t.Fatal("settings read failure must prevent dispatch")
	}
}
