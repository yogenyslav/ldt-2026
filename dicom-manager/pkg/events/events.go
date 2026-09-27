// Пакет events описывает контракт событий обработки DICOM-файлов.
// Содержимое пакета должно совпадать в независимых модулях manager и worker.
package events

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// ErrInvalidEvent ошибка некорректного события обработки DICOM-файла.
var ErrInvalidEvent = errors.New("invalid event")

// New создает событие с новым идентификатором и текущим временем.
func New(jobID, dicomID, status string) Event {
	return Event{
		Version:    1,
		EventID:    uuid.NewString(),
		JobID:      jobID,
		DicomID:    dicomID,
		Status:     status,
		OccurredAt: time.Now().UTC(),
	}
}

// Decode декодирует и проверяет событие указанного топика.
func Decode(subject string, payload []byte) (Event, error) {
	var event Event
	if err := json.Unmarshal(payload, &event); err != nil {
		return event, fmt.Errorf("%w: %v", ErrInvalidEvent, err)
	}
	if err := event.Validate(subject); err != nil {
		return event, fmt.Errorf("%w: %v", ErrInvalidEvent, err)
	}
	return event, nil
}
