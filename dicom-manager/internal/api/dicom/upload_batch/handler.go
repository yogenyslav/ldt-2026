package upload_batch

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"io"
	"mime"
	"strings"
	"uuid"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/upload"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

const (
	contentTypeMultipartFormData = "multipart/form-data"
)

type usecase interface {
	UploadDicomFiles(ctx context.Context, dicoms upload.DicomUploadRequest) (map[string]uuid.UUID, error)
}

// Handler обработчик для загрузки DICOM файлов батчами.
type Handler struct {
	log     *zerolog.Logger
	metrics observability.MetricsClient
	uc      usecase
}

// New создает новый экземпляр Handler.
func New(log *zerolog.Logger, metrics observability.MetricsClient, us usecase) *Handler {
	return &Handler{
		log:     log,
		metrics: metrics,
		uc:      us,
	}
}

// UploadBatch обработчик для загрузки DICOM файлов батчами.
//
//	@Summary		Загрузить DICOM файлы батчами
//	@Description	Загрузить несколько DICOM файлов. Файлы с активными задачами пропускаются; ответ содержит только новые задачи.
//	@Tags			dicom
//	@Accept			multipart/form-data
//	@Produce		json
//	@Param			file	formData	file			true	".zip архив с DICOM файлами для загрузки."
//	@Success		201		{object}	UploadBatchOut	"Файлы успешно загружены."
//	@Failure		400		string		"Некорректный запрос."
//	@Failure		403		string		"Нет доступа к файлу."
//	@Failure		409		string		"У всех файлов батча уже есть активные задачи."
//	@Failure		500		string		"Внутренняя ошибка сервера."
//	@Router			/dicom/upload/batch [post]
func (h *Handler) UploadBatch(c fiber.Ctx) error {
	var (
		data []byte
		size int64
	)

	contentType, _, err := mime.ParseMediaType(c.Get("Content-Type"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid content type")
	}
	switch contentType {
	case contentTypeMultipartFormData:
		file, err := c.FormFile("file")
		if err != nil {
			h.metrics.Counter("handler.dicom.upload.get_file.error").Inc()
			h.log.Warn().Err(err).Msg("failed to get file from form data")
			return fiber.NewError(fiber.StatusBadRequest, "can't access file form data")
		}

		size = file.Size
		if !strings.HasSuffix(strings.ToLower(file.Filename), ".zip") {
			h.log.Warn().Str("file_name", file.Filename).Msg("file is not a .zip archive")
			return fiber.NewError(fiber.StatusBadRequest, "file must be a .zip archive")
		}

		fileData, err := file.Open()
		if err != nil {
			h.metrics.Counter("handler.dicom.upload.open_file.error").Inc()
			h.log.Warn().Err(err).Msg("failed to open file")
			return fiber.NewError(fiber.StatusBadRequest, "can't open file")
		}
		defer fileData.Close()

		data, err = io.ReadAll(fileData)
		if err != nil {
			h.metrics.Counter("handler.dicom.upload.read_file.error").Inc()
			h.log.Warn().Err(err).Msg("failed to read file")
			return fiber.NewError(fiber.StatusBadRequest, "can't read file")
		}
	default:
		h.metrics.Counter("handler.dicom.upload.invalid_content_type").Inc()
		h.log.Warn().Str("content_type", contentType).Msg("invalid content type")
		return fiber.NewError(fiber.StatusBadRequest, "invalid content type")
	}

	req, err := h.getDicomUploadRequest(c, data, size)
	if err != nil {
		h.metrics.Counter("handler.dicom.upload.get_upload_request.error").Inc()
		h.log.Error().Err(err).Msg("failed to get dicom upload request")
		return fiber.NewError(fiber.StatusInternalServerError, "failed to get dicom upload request")
	}

	dicomJobs, err := h.uc.UploadDicomFiles(c.Context(), req)
	if err != nil {
		if errors.Is(err, upload.ErrDicomForbidden) {
			return fiber.NewError(fiber.StatusForbidden, "access denied")
		}

		if errors.Is(err, upload.ErrActiveJob) {
			return fiber.NewError(fiber.StatusConflict, "DICOM already has an active job")
		}
		h.metrics.Counter("handler.dicom.upload.uc_upload_dicom_files.error").Inc()
		h.log.Error().Err(err).Msg("failed to upload dicom files")
		return fiber.NewError(fiber.StatusInternalServerError, "failed to upload dicom files")
	}

	out := convertToOut(dicomJobs)
	return c.Status(fiber.StatusCreated).JSON(out)
}

func (h *Handler) getDicomUploadRequest(c fiber.Ctx, data []byte, size int64) (
	upload.DicomUploadRequest, error,
) {
	tokenClaims := c.Locals("tokenClaims")
	if tokenClaims == nil {
		h.metrics.Counter("handler.dicom.upload.missing_token_claims").Inc()
		h.log.Error().Msg("tokenClaims is nil")
		return upload.DicomUploadRequest{}, fiber.NewError(fiber.StatusForbidden, "access denied")
	}

	claims, ok := tokenClaims.(jwt.TokenClaims)
	if !ok {
		h.metrics.Counter("handler.dicom.upload.invalid_token_claims").Inc()
		h.log.Error().Msg("invalid tokenClaims format")
		return upload.DicomUploadRequest{}, fiber.NewError(fiber.StatusForbidden, "access denied")
	}

	req := upload.DicomUploadRequest{
		RawDicoms:      make([]upload.RawDicomData, 0),
		CreatorID:      claims.UserID,
		OrganizationID: claims.OrganizationID,
		SyncOrthanc:    true,
	}

	r := bytes.NewReader(data)
	zipReader, err := zip.NewReader(r, size)
	if err != nil {
		h.metrics.Counter("handler.dicom.upload.zip_reader.error").Inc()
		h.log.Error().Err(err).Msg("failed to create zip reader")
		return upload.DicomUploadRequest{}, fiber.NewError(
			fiber.StatusInternalServerError, "failed to create zip reader",
		)
	}

	// ZIP содержит плоский список записей всех уровней вложенности.
	// Пропускаем только саму запись каталога: его файлы идут отдельными записями.
	for _, file := range zipReader.File {
		if file.FileInfo().IsDir() {
			continue
		}
		if !strings.HasSuffix(strings.ToLower(file.Name), ".dcm") {
			h.log.Warn().Str("file_name", file.Name).Msg("skipping non-DICOM file in zip")
			continue
		}

		fileData, errFileOpen := file.Open()
		if errFileOpen != nil {
			h.metrics.Counter("handler.dicom.upload.zip_file_open.error").Inc()
			h.log.Error().Err(errFileOpen).Str("file_name", file.Name).Msg("failed to open file in zip")
			return upload.DicomUploadRequest{}, fiber.NewError(
				fiber.StatusInternalServerError, "failed to open file in zip",
			)
		}

		rawDicom, errReadDicom := io.ReadAll(fileData)
		fileData.Close()
		if errReadDicom != nil {
			h.metrics.Counter("handler.dicom.upload.zip_file_read.error").Inc()
			h.log.Error().Err(errReadDicom).Str("file_name", file.Name).Msg("failed to read file in zip")
			return upload.DicomUploadRequest{}, fiber.NewError(
				fiber.StatusInternalServerError, "failed to read file in zip",
			)
		}

		req.RawDicoms = append(
			req.RawDicoms, upload.RawDicomData{
				Payload:  rawDicom,
				FileName: file.Name, // Полный путь сохраняет вложенность при упаковке для Orthanc.
			},
		)
	}

	return req, nil
}

func convertToOut(dicomJobs map[string]uuid.UUID) UploadBatchOut {
	out := UploadBatchOut{Data: make([]DicomData, 0, len(dicomJobs))}
	for dicomID, jobID := range dicomJobs {
		out.Data = append(
			out.Data, DicomData{
				DicomID: dicomID,
				JobID:   jobID.String(),
			},
		)
	}
	return out
}
