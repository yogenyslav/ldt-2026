package get_paginated

import (
	"time"

	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/api/user/model"
)

// GetJobsRequest структура запроса для получения списка задач.
type GetJobsRequest struct {
	Offset         uint64
	Limit          uint64
	CreatorID      int64
	OrganizationID int64
	RequesterRole  model.UserRole
}

// Job структура для хранения информации о задаче.
type Job struct {
	ID                 string
	DicomFileID        string
	Status             string
	AnatomicalRegion   *string
	Confidence         *float64
	Violations         []string
	DurationMs         *int64
	Metadata           []byte
	SpecialistDecision *string
	SpecialistID       *int64
	Comment            *string
	CreatedAt          time.Time
	UpdatedAt          time.Time
}
