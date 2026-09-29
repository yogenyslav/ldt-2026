package annotation

import (
	"context"
	"errors"
	"slices"

	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
)

var (
	// ErrTrainingUnavailable обозначает отсутствие исполнителя дообучения.
	ErrTrainingUnavailable = errors.New("Дообучение моделей пока недоступно")
	// ErrVersionNotFound обозначает отсутствие новой обученной версии.
	ErrVersionNotFound = errors.New("Новая версия модели не найдена")
)

// TrainingTarget описывает накопленную разметку и доступность дообучения.
type TrainingTarget struct {
	ID          string   `json:"id"`
	Have        int64    `json:"have"`
	Need        int64    `json:"need"`
	Hard        string   `json:"hard"`
	Ready       bool     `json:"ready"`
	Busy        bool     `json:"busy"`
	Done        *float64 `json:"done"`
	LeftMinutes *int64   `json:"left_minutes"`
}

// TrainingResponse содержит статистику разметки; версии появятся после подключения обучения.
type TrainingResponse struct {
	Targets  []TrainingTarget  `json:"targets"`
	Versions []TrainingVersion `json:"versions"`
}

// TrainingVersion резервирует контракт новой версии модели.
type TrainingVersion struct {
	ID      string           `json:"id"`
	Trained string           `json:"trained"`
	Checked int64            `json:"checked"`
	Metrics []TrainingMetric `json:"metrics"`
}

// TrainingMetric описывает сравнение действующей и новой версии модели.
type TrainingMetric struct {
	Name string  `json:"name"`
	Unit string  `json:"unit"`
	Goal string  `json:"goal"`
	Now  float64 `json:"now"`
	Next float64 `json:"next"`
}

var trainingModels = []string{"hip_keypoints", "pelvis_crest", "pelvis_presence", "foreign_seg"}

// Training возвращает статистику без запуска или имитации обучения.
func (uc *Usecase) Training(ctx context.Context, claims jwt.TokenClaims) (out TrainingResponse, err error) {
	uc.metrics.Counter("usecases.annotation.training.total").Inc()
	defer func() { uc.observe("training", err) }()

	if err = authorize(claims); err != nil {
		return out, err
	}
	counts, err := uc.repo.TrainingCounts(ctx, claims.OrganizationID)
	if err != nil {
		return out, err
	}
	byTask := make(map[string]int64, len(counts))
	for _, count := range counts {
		byTask[count.Task] = count.Have
	}
	byTask["pelvis_presence"] = byTask["pelvis_crest"]

	out.Versions = []TrainingVersion{}
	for _, id := range trainingModels {
		out.Targets = append(out.Targets, TrainingTarget{
			ID:   id,
			Have: byTask[id],
			Hard: "Дообучение пока недоступно; требования к выборке не настроены",
		})
	}
	return out, nil
}

// StartTraining проверяет запрос; исполнитель дообучения подключается отдельно.
func (uc *Usecase) StartTraining(_ context.Context, claims jwt.TokenClaims, models []string) (err error) {
	uc.metrics.Counter("usecases.annotation.training_start.total").Inc()
	defer func() { uc.observe("training_start", err) }()

	if err = authorize(claims); err != nil {
		return err
	}
	if err = validateModels(models); err != nil {
		return err
	}
	return ErrTrainingUnavailable
}

// SwitchTraining проверяет запрос; до появления обученных версий переключение невозможно.
func (uc *Usecase) SwitchTraining(_ context.Context, claims jwt.TokenClaims, models []string) (err error) {
	uc.metrics.Counter("usecases.annotation.training_switch.total").Inc()
	defer func() { uc.observe("training_switch", err) }()

	if err = authorize(claims); err != nil {
		return err
	}
	if err = validateModels(models); err != nil {
		return err
	}
	return ErrVersionNotFound
}

func validateModels(models []string) error {
	if len(models) == 0 {
		return invalid("Выберите хотя бы одну модель")
	}
	seen := make(map[string]bool, len(models))
	for _, id := range models {
		if !slices.Contains(trainingModels, id) || seen[id] {
			return invalid("Список моделей содержит неизвестную или повторяющуюся модель")
		}
		seen[id] = true
	}
	return nil
}
