package events

// Топики запросов анализа, результатов и уведомлений manager.
const (
	AnalysisRequested = "dicom.analysis.requested"
	AnalysisCompleted = "dicom.analysis.completed"
	AnalysisFailed    = "dicom.analysis.failed"
	DocumentUpdated   = "dicom.document.updated"
	DocumentFailed    = "dicom.document.failed"
)
