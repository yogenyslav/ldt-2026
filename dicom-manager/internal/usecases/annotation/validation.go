package annotation

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"slices"
	"strings"

	"github.com/google/uuid"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/annotation/model"
)

var submissionIDPattern = regexp.MustCompile(`^[0-7][0-9A-HJKMNP-TV-Z]{25}$`)

// DecodeSubmission проверяет наличие обязательных полей и разбирает запрос.
func DecodeSubmission(data []byte) (model.Submission, error) {
	var in model.Submission
	if err := requiredFields(data, "schema_version", "submission_id", "task_id", "job_id", "image",
		"created_at", "duration_ms", "image_flags", "status", "comment", "annotations", "supersedes"); err != nil {
		return in, err
	}
	if err := json.Unmarshal(data, &in); err != nil {
		return in, invalid("Некорректный формат разметки")
	}
	return in, nil
}

func requiredFields(data []byte, names ...string) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil || fields == nil {
		return invalid("Ожидается объект разметки")
	}
	for _, name := range names {
		value, ok := fields[name]
		if !ok || (bytes.Equal(bytes.TrimSpace(value), []byte("null")) && name != "supersedes" && name != "x" && name != "y") {
			return invalid("Обязательное поле: " + name)
		}
	}
	return nil
}

func validateSubmission(in model.Submission) (string, error) {
	if in.SchemaVersion != "1.0" {
		return "", invalid("Неподдерживаемая версия формата разметки")
	}
	if !submissionIDPattern.MatchString(in.SubmissionID) {
		return "", invalid("submission_id должен быть ULID из 26 символов")
	}
	if _, err := uuid.Parse(in.JobID); err != nil {
		return "", invalid("Некорректный job_id")
	}
	if in.CreatedAt.IsZero() || in.DurationMs < 0 {
		return "", invalid("Некорректное время или длительность разметки")
	}
	if in.Image.Rows <= 0 || in.Image.Cols <= 0 || !slices.Contains([]string{"spine", "hip_left", "hip_right"}, in.Image.Region) {
		return "", invalid("Некорректные размеры или область снимка")
	}
	if !validStatus(in.Status) {
		return "", invalid("Неизвестный статус разметки")
	}
	if in.Status != "done" && strings.TrimSpace(in.Comment) == "" {
		return "", invalid("Для сомнения или отказа от разметки нужен комментарий")
	}
	if in.ImageFlags == nil {
		return "", invalid("image_flags должен быть массивом")
	}
	for _, flag := range in.ImageFlags {
		if !slices.Contains([]string{"wrong_region", "implant", "bad_image", "other"}, flag) {
			return "", invalid("Неизвестный признак снимка")
		}
	}
	if in.Supersedes != nil && (!submissionIDPattern.MatchString(*in.Supersedes) || *in.Supersedes == in.SubmissionID) {
		return "", invalid("Некорректная ссылка supersedes")
	}
	if len(in.Annotations) != 1 {
		return "", invalid("Отправка должна содержать ровно одну задачу разметки")
	}
	for task, data := range in.Annotations {
		if in.TaskID != in.JobID+":"+task {
			return "", invalid("task_id не соответствует снимку и задаче разметки")
		}
		switch task {
		case "hip_keypoints":
			return task, validatePoints(data, in.Image, []string{"greater_trochanter_apex", "femoral_neck", "ischium"})
		case "pelvis_crest":
			return task, validatePoints(data, in.Image, []string{"crest_left", "crest_right"})
		case "foreign_seg":
			return task, validateSegmentation(data, in.Image)
		default:
			return "", invalid("Неизвестная задача разметки")
		}
	}
	return "", invalid("Не указана задача разметки")
}

func validStatus(status string) bool {
	return slices.Contains([]string{"done", "uncertain", "skipped"}, status)
}

func validatePoints(data []byte, image model.Image, names []string) error {
	var raw struct {
		Points []json.RawMessage `json:"points"`
	}
	if err := json.Unmarshal(data, &raw); err != nil || len(raw.Points) != len(names) {
		return invalid("Некорректное число точек разметки")
	}
	for i, item := range raw.Points {
		if err := requiredFields(item, "name", "present", "x", "y", "origin"); err != nil {
			return err
		}
		var point model.Point
		if err := json.Unmarshal(item, &point); err != nil || point.Present == nil {
			return invalid("Некорректный формат точки")
		}
		if point.Name != names[i] || !slices.Contains([]string{"human", "model_confirmed", "model"}, point.Origin) {
			return invalid("Некорректное имя, порядок или источник точки")
		}
		if !*point.Present {
			if point.X != nil || point.Y != nil {
				return invalid("У отсутствующей точки координаты должны быть null")
			}
			continue
		}
		if point.X == nil || point.Y == nil || !inside(*point.X, *point.Y, image) {
			return invalid("Координаты точки должны находиться внутри исходного кадра")
		}
	}
	return nil
}

func validateSegmentation(data []byte, image model.Image) error {
	var segmentation model.Segmentation
	if err := json.Unmarshal(data, &segmentation); err != nil || segmentation.Polygons == nil {
		return invalid("Некорректный массив контуров")
	}
	if !slices.Contains([]string{"ПРЕДМЕТ", "проверить", "чисто"}, segmentation.Verdict) {
		return invalid("Неизвестный вердикт по посторонним предметам")
	}
	for _, polygon := range segmentation.Polygons {
		if !slices.Contains([]string{"wire", "object"}, polygon.Class) || len(polygon.Points) < 3 || len(polygon.Points) > 5000 {
			return invalid("Контур должен иметь класс wire или object и от 3 до 5000 точек")
		}
		for _, point := range polygon.Points {
			if len(point) != 2 || point[0] == nil || point[1] == nil || !inside(*point[0], *point[1], image) {
				return invalid("Координаты контура должны находиться внутри исходного кадра")
			}
		}
		first, last := polygon.Points[0], polygon.Points[len(polygon.Points)-1]
		if *first[0] == *last[0] && *first[1] == *last[1] {
			return invalid("Первая точка контура не должна повторяться в конце")
		}
	}
	return nil
}

func inside(x, y float64, image model.Image) bool {
	return !math.IsNaN(x) && !math.IsNaN(y) && x >= 0 && y >= 0 && x <= float64(image.Cols-1) && y <= float64(image.Rows-1)
}

func invalid(message string) error {
	return fmt.Errorf("%w: %s", ErrInvalid, message)
}
