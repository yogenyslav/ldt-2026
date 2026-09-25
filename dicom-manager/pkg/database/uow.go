package database

import (
	"context"

	"github.com/yogenyslav/errs"
)

// UnitOfWork враппер для атомарных операций с транзакциями в БД.
//
//go:generate mockgen -destination=../../tests/mocks/uow.go -package=mocks . UnitOfWork
type UnitOfWork interface {
	// WithTx выполняет переданную функцию внутри транзакции.
	WithTx(ctx context.Context, level TxLevel, fn func(ctx context.Context) error) error
}

type unitOfWork struct {
	db DB
}

// NewUnitOfWork создает новый инстанс UnitOfWork
func NewUnitOfWork(db DB) *unitOfWork {
	return &unitOfWork{db: db}
}

// WithTx выполняет переданную функцию внутри транзакции.
func (uow *unitOfWork) WithTx(ctx context.Context, level TxLevel, fn func(ctx context.Context) error) error {
	tx, err := uow.db.beginTx(ctx, level)
	if err != nil {
		return errs.Wrap(err, "begin transaction")
	}

	defer func() {
		if e := recover(); e != nil {
			uow.db.rollbackTx(tx) //nolint:errcheck // nothing we can do
			panic(e)
		}

		if err != nil {
			uow.db.rollbackTx(tx) //nolint:errcheck // nothing we can do
		} else {
			err = uow.db.commitTx(tx)
		}
	}()

	err = fn(tx)
	return err
}
