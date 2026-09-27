package decision

import (
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/job/model"
	user_model "github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
)

// UpdateDecisionRequest структура запроса на обновление решения по задаче обработки DICOM-файла.
type UpdateDecisionRequest struct {
	JobIDs         []string
	ResultDecision model.Decision
	SpecialistID   int64
	Comment        *string
	RequesterRole  user_model.UserRole
}
