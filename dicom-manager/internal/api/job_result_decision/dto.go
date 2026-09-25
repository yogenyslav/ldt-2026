package job_result_decision

// Decision решение специалиста по результату задачи.s
type Decision string

const (
	DecisionApprove       Decision = "approved"       // Результат задачи принят специалистом.
	DecisionReject        Decision = "rejected"       // Результат задачи отклонен специалистом.
	DecisionForceApproved Decision = "force_approved" // Результат задачи принят специалистом, несмотря на рекомендацию системы.
)

// JobResultDecisionIn структура запроса для смены решения по результатам обработки DICOM-файлов.
type JobResultDecisionIn struct {
	JobIDs   []string `json:"job_ids"`           // Список ID задач на обработку DICOM-файлов, для которых необходимо принять решение по результатам.
	Decision Decision `json:"decision"`          // Решение по результатам обработки DICOM-файлов ("approved", "reject", "force_approved").
	Comment  *string  `json:"comment,omitempty"` // Комментарий к решению по результатам обработки DICOM-файлов (необязательный).
}
