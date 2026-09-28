package wrappers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/generated/orthanc"
	"github.com/yogenyslav/ldt-2026/dicom-manager/internal/usecases/dicom/upload/wrappers/dto"
	"golang.org/x/sync/errgroup"
)

var (
	// ErrCreateInstance ошибка, возникающая при неудачной попытке создания экземпляра в Orthanc.
	ErrCreateInstance = errors.New("failed to create instance in Orthanc")
)

const (
	instanceStatusSuccess = "Success"
)

// Orthanc структура для работы с Orthanc API.
type Orthanc struct {
	client orthanc.ClientInterface
}

// NewOrthanc создает новый экземпляр Orthanc с указанным клиентом Orthanc API.
func NewOrthanc(client orthanc.ClientInterface) *Orthanc {
	return &Orthanc{
		client: client,
	}
}

// UploadInstances загружает DICOM-файлы в Orthanc.
// При ошибке возвращает известные ID и признак Created для компенсирующего удаления.
// Для различения новых и существующих экземпляров требуется OverwriteInstances=false.
func (o *Orthanc) UploadInstances(ctx context.Context, dicoms []byte) ([]dto.OrthancDicomProperties, error) {
	const (
		contentType = "application/zip"
	)

	resp, err := o.client.PostInstancesWithBody(ctx, contentType, bytes.NewReader(dicoms))
	if err != nil {
		return nil, fmt.Errorf("failed to call orthanc API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("orthanc API returned code %d", resp.StatusCode)
	}

	bodyRaw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	var uploadResponses []dto.OrthancNewDicom
	err = json.Unmarshal(bodyRaw, &uploadResponses)
	if err != nil {
		var singleResponse dto.OrthancNewDicom
		if err := json.Unmarshal(bodyRaw, &singleResponse); err == nil {
			uploadResponses = append(uploadResponses, singleResponse)
		} else {
			return nil, fmt.Errorf("failed to unmarshal response body: %w", err)
		}
	}

	// Сохраняем ID всех созданных экземпляров даже при ошибке получения метаданных.
	props := make([]dto.OrthancDicomProperties, len(uploadResponses))
	var statusErr error
	for i, instance := range uploadResponses {
		props[i] = dto.OrthancDicomProperties{ID: instance.ID, Created: instance.Status == instanceStatusSuccess}
		if instance.ID == "" || (instance.Status != instanceStatusSuccess && instance.Status != "AlreadyStored") {
			statusErr = errors.Join(statusErr, fmt.Errorf("%w: %s", ErrCreateInstance, instance.Status))
		}
	}
	if statusErr != nil {
		return props, statusErr
	}

	eg, gCtx := errgroup.WithContext(ctx)
	for i, instance := range uploadResponses {
		eg.Go(func() error {
			collected, err := o.collectProperties(gCtx, instance)
			if err != nil {
				return fmt.Errorf("failed to collect properties for instance %s: %w", instance.ID, err)
			}
			collected.Created = props[i].Created
			props[i] = collected
			return nil
		})
	}
	if err := eg.Wait(); err != nil {
		return props, fmt.Errorf("error occurred while processing instances: %w", err)
	}

	return props, nil
}

// DeleteInstances удаляет экземпляры по всем ID, продолжая работу при ошибках отдельных удалений.
// Отсутствующий экземпляр считается уже удалённым.
func (o *Orthanc) DeleteInstances(ctx context.Context, ids []string) error {
	var result error

	for _, id := range ids {
		resp, err := o.client.DeleteInstancesId(ctx, id)
		if err != nil {
			result = errors.Join(result, fmt.Errorf("delete instance %s: %w", id, err))
			continue
		}

		resp.Body.Close()

		if resp.StatusCode != 200 && resp.StatusCode != 204 && resp.StatusCode != 404 {
			result = errors.Join(result, fmt.Errorf("delete instance %s: orthanc API returned code %d", id, resp.StatusCode))
		}
	}

	return result
}

// GetDicomProperties получает свойства DICOM-файла из Orthanc по ID.
func (o *Orthanc) GetDicomProperties(ctx context.Context, dicomID string) (dto.OrthancDicomProperties, error) {
	return o.collectProperties(ctx, dto.OrthancNewDicom{ID: dicomID, Status: instanceStatusSuccess})
}

func (o *Orthanc) collectProperties(ctx context.Context, instance dto.OrthancNewDicom) (
	dto.OrthancDicomProperties, error,
) {
	dicom, errGetDicom := o.getDicomInstance(ctx, instance.ID)
	if errGetDicom != nil {
		return dto.OrthancDicomProperties{}, fmt.Errorf("failed to get dicom instance: %w", errGetDicom)
	}

	series, errGetSeries := o.getParentSeries(ctx, dicom.ParentSeries)
	if errGetSeries != nil {
		return dto.OrthancDicomProperties{}, fmt.Errorf("failed to get parent series: %w", errGetSeries)
	}

	study, errGetStudy := o.getParentStudy(ctx, series.ParentStudy)
	if errGetStudy != nil {
		return dto.OrthancDicomProperties{}, fmt.Errorf("failed to get parent study: %w", errGetStudy)
	}

	return dto.OrthancDicomProperties{
		ID:             instance.ID,
		ParentStudy:    series.ParentStudy,
		ParentSeries:   dicom.ParentSeries,
		FileName:       dicom.FileUuid,
		DicomStudyUid:  study.Tags.DicomStudyUid,
		DicomSeriesUid: series.Tags.DicomSeriesUid,
		DicomImageUid:  dicom.Tags.SOPInstanceUID,
	}, nil
}

func (o *Orthanc) getDicomInstance(ctx context.Context, instanceID string) (dto.OrthancDicom, error) {
	resp, err := o.client.GetInstancesId(ctx, instanceID, nil)
	if err != nil {
		return dto.OrthancDicom{}, fmt.Errorf("failed to call orthanc API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return dto.OrthancDicom{}, fmt.Errorf("orthanc API returned code %d", resp.StatusCode)
	}

	bodyRaw, err := io.ReadAll(resp.Body)
	if err != nil {
		return dto.OrthancDicom{}, fmt.Errorf("failed to read response body: %w", err)
	}

	var dicomInfo dto.OrthancDicom
	err = json.Unmarshal(bodyRaw, &dicomInfo)
	if err != nil {
		return dto.OrthancDicom{}, fmt.Errorf("failed to unmarshal response body: %w", err)
	}

	return dicomInfo, nil
}

func (o *Orthanc) getParentSeries(ctx context.Context, seriesID string) (dto.OrthancSeries, error) {
	resp, err := o.client.GetSeriesId(ctx, seriesID, nil)
	if err != nil {
		return dto.OrthancSeries{}, fmt.Errorf("failed to call orthanc API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return dto.OrthancSeries{}, fmt.Errorf("orthanc API returned code %d", resp.StatusCode)
	}

	bodyRaw, err := io.ReadAll(resp.Body)
	if err != nil {
		return dto.OrthancSeries{}, fmt.Errorf("failed to read response body: %w", err)
	}

	var seriesInfo dto.OrthancSeries
	err = json.Unmarshal(bodyRaw, &seriesInfo)
	if err != nil {
		return dto.OrthancSeries{}, fmt.Errorf("failed to unmarshal response body: %w", err)
	}

	return seriesInfo, nil
}

func (o *Orthanc) getParentStudy(ctx context.Context, studyID string) (dto.OrthancStudy, error) {
	resp, err := o.client.GetStudiesId(ctx, studyID, nil)
	if err != nil {
		return dto.OrthancStudy{}, fmt.Errorf("failed to call orthanc API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return dto.OrthancStudy{}, fmt.Errorf("orthanc API returned code %d", resp.StatusCode)
	}

	bodyRaw, err := io.ReadAll(resp.Body)
	if err != nil {
		return dto.OrthancStudy{}, fmt.Errorf("failed to read response body: %w", err)
	}

	var studyInfo dto.OrthancStudy
	err = json.Unmarshal(bodyRaw, &studyInfo)
	if err != nil {
		return dto.OrthancStudy{}, fmt.Errorf("failed to unmarshal response body: %w", err)
	}

	return studyInfo, nil
}
