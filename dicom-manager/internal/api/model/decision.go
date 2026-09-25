package model

// Decision решение специалиста по результату задачи.
type Decision string

const (
	DecisionApprove       Decision = "approved"       // Результат задачи принят специалистом.
	DecisionReject        Decision = "rejected"       // Результат задачи отклонен специалистом.
	DecisionForceApproved Decision = "force_approved" // Результат задачи принят специалистом, несмотря на рекомендацию системы.
)
