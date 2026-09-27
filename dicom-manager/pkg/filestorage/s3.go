// Package filestorage предоставляет враппер для клиента MinioS3.
package filestorage

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net"
	"time"

	"github.com/ilyakaznacheev/cleanenv"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

var (
	// ErrNewS3 ошибка, возникающая при создании нового клиента S3.
	ErrNewS3 = errors.New("failed to create new s3 client")
)

// Config конфигурация для подключения к S3.
type Config struct {
	Host      string `env:"DICOM_MANAGER_S3_HOST"`
	Port      string `env:"DICOM_MANAGER_S3_PORT"`
	AccessKey string `env:"S3_ACCESS_KEY"`
	SecretKey string `env:"S3_SECRET_KEY"`
	Bucket    string `env:"DICOM_MANAGER_S3_BUCKET"`
}

// S3 структура для работы с хранилищем S3.
type S3 struct {
	cfg  Config
	conn *minio.Client
}

// New создает новый экземпляр S3.
func New() (*S3, error) {
	var cfg Config
	if err := cleanenv.ReadEnv(&cfg); err != nil {
		return nil, fmt.Errorf("failed to read env: %w", err)
	}

	minioClient, err := minio.New(
		net.JoinHostPort(cfg.Host, cfg.Port), &minio.Options{
			Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
			Secure: false,
		},
	)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrNewS3, err)
	}

	bucketExists, err := minioClient.BucketExists(context.Background(), cfg.Bucket)
	if err != nil {
		return nil, fmt.Errorf("failed to check if bucket exists: %w", err)
	}
	if !bucketExists {
		err = minioClient.MakeBucket(
			context.Background(), cfg.Bucket, minio.MakeBucketOptions{
				Region:        "eu-central-1",
				ObjectLocking: false,
			},
		)
		if err != nil {
			return nil, fmt.Errorf("failed to create bucket: %w", err)
		}
	}

	return &S3{
		cfg:  cfg,
		conn: minioClient,
	}, nil
}

// PresignedGetObject возвращает presigned URL для получения объекта из S3.
func (s3 *S3) PresignedGetObject(ctx context.Context, bucket, obj string, exp time.Duration) (string, error) {
	objURL, err := s3.conn.PresignedGetObject(ctx, bucket, obj, exp, nil)
	if err != nil {
		return "", fmt.Errorf("failed to get presigned object: %w", err)
	}
	return objURL.String(), nil
}

// PutObject загружает объект в S3.
func (s3 *S3) PutObject(ctx context.Context, bucket, obj string, payload []byte) error {
	reader := bytes.NewReader(payload)
	size := int64(len(payload))
	opts := minio.PutObjectOptions{
		ContentType: "application/octet-stream",
	}

	_, err := s3.conn.PutObject(ctx, bucket, obj, reader, size, opts)
	if err != nil {
		return fmt.Errorf("failed to put object: %w", err)
	}
	return nil
}
