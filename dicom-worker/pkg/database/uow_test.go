package database

import (
 "context"
 "errors"
 "testing"

)

type transactionDB struct {
	DB
	commitErr             error
	committed, rolledBack bool
}

func (d *transactionDB) beginTx(ctx context.Context, _ TxLevel) (context.Context, error) {
	return ctx, nil
}
func (d *transactionDB) commitTx(context.Context) error   { d.committed = true; return d.commitErr }
func (d *transactionDB) rollbackTx(context.Context) error { d.rolledBack = true; return nil }

func TestTransactionCommitFailureIsReturned(t *testing.T) {
	want := errors.New("commit failed")
	db := &transactionDB{commitErr: want}
	err := NewUnitOfWork(db).WithTx(context.Background(), TxLevelReadCommitted, func(context.Context) error { return nil })
	if !errors.Is(err, want) || !db.committed {
		t.Fatalf("commit failure lost: %v", err)
	}
}
func TestTransactionRollback(t *testing.T) {
	want := errors.New("operation failed")
	db := &transactionDB{}
	err := NewUnitOfWork(db).WithTx(context.Background(), TxLevelReadCommitted, func(context.Context) error { return want })
	if !errors.Is(err, want) || !db.rolledBack || db.committed {
		t.Fatalf("unexpected transaction outcome: %v", err)
	}
}
