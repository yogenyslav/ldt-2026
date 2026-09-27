package dicom

import (
	"context"

	sq "github.com/Masterminds/squirrel"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/database"
)

// Storage структура для работы с DICOM файлами в БД.
type Storage struct {
	db database.DB
}

// New создает новый экземпляр репозитория DICOM файлов.
func New(db database.DB) *Storage {
	return &Storage{db: db}
}

// SaveDicomFiles сохраняет несколько DICOM файлов в БД.
func (s *Storage) SaveDicomFiles(ctx context.Context, dicoms []Dicom) error {
	baseQuery := sq.Insert("dicom_file").
		Columns(
			"id", "file_name", "series_id", "study_id", "dicom_series_uid", "dicom_study_uid",
			"dicom_image_uid", "creator_id", "organization_id",
		).
		PlaceholderFormat(sq.Dollar)

	for _, dicom := range dicoms {
		baseQuery = baseQuery.Values(
			dicom.ID, dicom.FileName, dicom.SeriesID, dicom.StudyID, dicom.DicomSeriesUid, dicom.DicomStudyUid,
			dicom.DicomImageUid, dicom.CreatorID, dicom.OrganizationID,
		)
	}

	query, args, err := baseQuery.ToSql()
	if err != nil {
		return err
	}

	_, err = s.db.TxExec(ctx, query, args...)
	return err
}

// GetByID возвращает DICOM файл по его ID.
func (s *Storage) GetByID(ctx context.Context, id string) (Dicom, error) {
	const query = `select 
						id, file_name, series_id, study_id, dicom_series_uid, dicom_study_uid, dicom_image_uid, 
						creator_id, organization_id, created_at, updated_at
					from dicom_file where id = $1;`

	var dicom Dicom
	err := s.db.QueryRow(ctx, &dicom, query, id)
	if err != nil {
		return Dicom{}, err
	}

	return dicom, nil
}
