package upload_orthanc

import (
	"context"
	"errors"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"
	storage "github.com/yogenyslav/ldt-2026/dicom-manager/internal/storage/dicom"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/upload"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
)

type usecase interface {
	RegisterOrthanc(context.Context, storage.Dicom) error
	StartOrthanc(context.Context, string, int64, int64) error
}

// Handler принимает уведомления о файлах, которые уже хранятся в Orthanc.
type Handler struct {
	log *zerolog.Logger
	uc  usecase
}

// New создаёт обработчик callback Orthanc.
func New(log *zerolog.Logger, uc usecase) *Handler { return &Handler{log: log, uc: uc} }

// UploadIn содержит метаданные из локального REST API Orthanc.
type UploadIn struct {
	DeviceModel string `json:"device_model"`
	PatientID   string `json:"patient_id"`

	DicomID        string `json:"dicom_id"`
	FileName       string `json:"file_name"`
	SeriesID       string `json:"series_id"`
	StudyID        string `json:"study_id"`
	DicomSeriesUID string `json:"dicom_series_uid"`
	DicomStudyUID  string `json:"dicom_study_uid"`
	DicomImageUID  string `json:"dicom_image_uid"`
}

// UploadOut подтверждает сохранение файла; задача обработки ещё не создана.
type UploadOut struct {
	DicomID string `json:"dicom_id"`
}

// Upload сохраняет запись до ответа Orthanc, не вызывая Orthanc и worker.
//
//	@Summary	Зарегистрировать файл из Orthanc
//	@Tags		dicom
//	@Accept		json
//	@Produce	json
//	@Param		file	body		UploadIn	true	"Метаданные файла в Orthanc"
//	@Success	201		{object}	UploadOut
//	@Failure	400		{string}	string
//	@Failure	403		{string}	string
//	@Failure	500		{string}	string
//	@Router		/dicom/upload/orthanc [post]
func (h *Handler) Upload(c fiber.Ctx) error {
	claims, ok := c.Locals("tokenClaims").(jwt.TokenClaims)
	if !ok {
		return fiber.ErrForbidden
	}

	var in UploadIn
	if !c.Is("json") || c.Bind().Body(&in) != nil || in.DicomID == "" || in.FileName == "" ||
		in.SeriesID == "" || in.StudyID == "" || in.DicomSeriesUID == "" || in.DicomStudyUID == "" || in.DicomImageUID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "invalid Orthanc metadata")
	}

	err := h.uc.RegisterOrthanc(c.Context(), storage.Dicom{
		DeviceModel: in.DeviceModel,
		PatientID:   in.PatientID,
		ID:          in.DicomID, FileName: in.FileName, SeriesID: in.SeriesID, StudyID: in.StudyID,
		DicomSeriesUid: in.DicomSeriesUID, DicomStudyUid: in.DicomStudyUID, DicomImageUid: in.DicomImageUID,
		CreatorID: claims.UserID, OrganizationID: claims.OrganizationID,
	})
	if err != nil {
		return h.handleError(err)
	}

	return c.Status(fiber.StatusCreated).JSON(UploadOut{DicomID: in.DicomID})
}

// Start вызывается Orthanc только после успешного ответа регистрации.
//
//	@Summary	Запустить обработку зарегистрированного файла Orthanc
//	@Tags		dicom
//	@Produce	json
//	@Param		dicom_id	path		string	true	"ID экземпляра Orthanc"
//	@Success	202			{object}	UploadOut
//	@Failure	403			{string}	string
//	@Failure	404			{string}	string
//	@Failure	500			{string}	string
//	@Router		/dicom/upload/orthanc/{dicom_id}/process [post]
func (h *Handler) Start(c fiber.Ctx) error {
	claims, ok := c.Locals("tokenClaims").(jwt.TokenClaims)
	if !ok {
		return fiber.ErrForbidden
	}

	// Строка из Fiber не должна ссылаться на переиспользуемый буфер запроса.
	id := strings.Clone(c.Params("dicom_id"))
	if err := h.uc.StartOrthanc(c.Context(), id, claims.UserID, claims.OrganizationID); err != nil {
		return h.handleError(err)
	}

	return c.Status(fiber.StatusAccepted).JSON(UploadOut{DicomID: id})
}

func (h *Handler) handleError(err error) error {
	if errors.Is(err, upload.ErrDicomForbidden) {
		return fiber.ErrForbidden
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return fiber.ErrNotFound
	}

	h.log.Error().Err(err).Msg("Orthanc callback failed")
	return fiber.ErrInternalServerError
}
