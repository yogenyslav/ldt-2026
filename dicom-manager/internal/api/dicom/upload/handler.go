package upload

import (
	"context"
	"errors"
	"mime"
	"uuid"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/upload"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/jwt"
	"github.com/yogenyslav/ldt-2026/dicom-manager/pkg/observability"
)

const (
	contentTypeApplicationDicom = "application/dicom"
)

type usecase interface {
	UploadDicomFiles(ctx context.Context, dicoms upload.DicomUploadRequest) (map[string]uuid.UUID, error)
}

// Handler обработчик для загрузки DICOM файлов.
type Handler struct {
	log     *zerolog.Logger
	metrics observability.MetricsClient
	uc      usecase
}

// New создает новый экземпляр Handler.
func New(log *zerolog.Logger, metrics observability.MetricsClient, uc usecase) *Handler {
	return &Handler{
		log:     log,
		metrics: metrics,
		uc:      uc,
	}
}

// Upload обработчик для загрузки DICOM файлов.
//
//	@Summary		Загрузить DICOM файл
//	@Description	Загрузить DICOM файл на сервер.
//	@Tags			dicom
//	@Accept			application/dicom
//	@Produce		json
//	@Param			Content-Disposition	header	string	false	"Исходное имя файла: attachment; filename*=UTF-8''scan.dcm"
//	@Param			file	body		string		true	"DICOM файл для загрузки."
//	@Success		201		{object}	UploadOut	"Файл успешно загружен."
//	@Failure		400		string		"Некорректный запрос."
//	@Failure		403		string		"Нет доступа к файлу."
//	@Failure		409		string		"Обработка файла ещё не завершена."
//	@Failure		500		string		"Внутренняя ошибка сервера."
//	@Router			/dicom/upload [post]
func (h *Handler) Upload(c fiber.Ctx) error {
	var (
		data        []byte
		fileName    string
	)

	contentType := c.Get("Content-Type")
	switch contentType {
	case contentTypeApplicationDicom:
		if c.Get("X-Instance-ID") != "" {
			return fiber.NewError(fiber.StatusBadRequest, "use /dicom/upload/orthanc for Orthanc callbacks")
		}

		fileName = uuid.New().String() + ".dcm"
		if disposition := c.Get("Content-Disposition"); disposition != "" {
			_, params, err := mime.ParseMediaType(disposition)
			if err != nil {
				return fiber.NewError(fiber.StatusBadRequest, "invalid Content-Disposition")
			}
			if params["filename"] != "" {
				fileName = params["filename"]
			}
		}

		data = c.Body()
		if len(data) == 0 {
			return fiber.NewError(fiber.StatusBadRequest, "DICOM body is empty")
		}
	default:
		h.metrics.Counter("handler.dicom.upload.invalid_content_type").Inc()
		h.log.Warn().Str("content_type", contentType).Msg("invalid content type")
		return fiber.NewError(fiber.StatusBadRequest, "invalid content type")
	}

	req, err := h.getDicomUploadRequest(c, data, fileName, true)
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

func (h *Handler) getDicomUploadRequest(
	c fiber.Ctx, data []byte, fileName string, syncOrthanc bool,
) (upload.DicomUploadRequest, error) {
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
		RawDicoms:      make([]upload.RawDicomData, 0, 1),
		CreatorID:      claims.UserID,
		OrganizationID: claims.OrganizationID,
		SyncOrthanc:    syncOrthanc,
	}

	req.RawDicoms = append(
		req.RawDicoms, upload.RawDicomData{
			Payload:    data,
			FileName:   fileName,
		},
	)
	return req, nil
}

func convertToOut(dicomJobs map[string]uuid.UUID) UploadOut {
	var out UploadOut
	for dicomID, jobID := range dicomJobs {
		out.DicomID = dicomID
		out.JobID = jobID.String()
		break
	}
	return out
}
