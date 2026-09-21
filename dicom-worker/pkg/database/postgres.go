package database

import (
	"context"
	"database/sql"

	"github.com/georgysavva/scany/v2/pgxscan"
	"github.com/ilyakaznacheev/cleanenv"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yogenyslav/errs"
)

// Postgres клиент PostgreSQL.
type Postgres struct {
	pool *pgxpool.Pool
}

// NewPostgres создает новый инстанс pg.
func NewPostgres(ctx context.Context) (*Postgres, error) {
	var cfg Config
	if err := cleanenv.ReadEnv(&cfg); err != nil {
		return nil, errs.Wrap(err, "parse postgres config from env")
	}

	if cfg.Driver == "" {
		cfg.Driver = "postgres"
	}
	if cfg.SSLMode == "" {
		cfg.SSLMode = "disable"
	}

	pool, err := pgxpool.New(ctx, cfg.DSN())
	if err != nil {
		return nil, err
	}

	return &Postgres{
		pool: pool,
	}, nil
}

// SQLDB возвращает sql.DB подключение к БД.
func (p *Postgres) SQLDB() (*sql.DB, error) {
	db, err := sql.Open("pgx", p.pool.Config().ConnString())
	if err != nil {
		return nil, err
	}
	return db, nil
}

// Close возвращает пулл соединений.
func (p *Postgres) Close() {
	p.pool.Close()
}

// Ping пинг БД.
func (p *Postgres) Ping(ctx context.Context) error {
	return p.pool.Ping(ctx)
}

// Exec выполнить DML запрос.
func (p *Postgres) Exec(ctx context.Context, query string, args ...any) (int64, error) {
	tag, err := p.pool.Exec(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// TxExec выполнить DML запрос в транзакции.
// Если нет активной транзакции, то fallback к обычному Exec.
func (p *Postgres) TxExec(ctx context.Context, query string, args ...any) (int64, error) {
	tx, ok := ctx.Value(TxKey).(pgx.Tx)
	if !ok {
		return p.Exec(ctx, query, args...)
	}

	var (
		tag pgconn.CommandTag
		err error
	)

	defer func() {
		if err != nil {
			tx.Rollback(ctx) //nolint:errcheck // nothing to do with it
		}
	}()

	tag, err = tx.Exec(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// QueryRow выполнить DQL запрос, который вернет не более одной строки.
func (p *Postgres) QueryRow(ctx context.Context, dst any, query string, args ...any) error {
	return pgxscan.Get(ctx, p.pool, dst, query, args...)
}

// TxQueryRow выполнить DQL запрос, который вернет не более одной строки в транзакции.
// Если нет активной транзакции, то fallback к обычному QueryRow.
func (p *Postgres) TxQueryRow(ctx context.Context, dst any, query string, args ...any) error {
	tx, ok := ctx.Value(TxKey).(pgx.Tx)
	if !ok {
		return p.QueryRow(ctx, dst, query, args...)
	}
	return pgxscan.Get(ctx, tx, dst, query, args...)
}

// QuerySlice выполнить DQL запрос, который вернет несколько строк.
func (p *Postgres) QuerySlice(ctx context.Context, dst any, query string, args ...any) error {
	return pgxscan.Select(ctx, p.pool, dst, query, args...)
}

// TxQuerySlice выполнить DQL запрос, который вернет несколько строк в транзакции.
// Если нет активной транзакции, то fallback к обычному QuerySlice.
func (p *Postgres) TxQuerySlice(ctx context.Context, dst any, query string, args ...any) error {
	tx, ok := ctx.Value(TxKey).(pgx.Tx)
	if !ok {
		return p.QuerySlice(ctx, dst, query, args...)
	}
	return pgxscan.Select(ctx, tx, dst, query, args...)
}

// beginTx начинает транзакцию с заданным уровнем изоляции и возвращает новый контекст с транзакцией.
func (p *Postgres) beginTx(ctx context.Context, level TxLevel) (context.Context, error) {
	var opts pgx.TxOptions
	switch level {
	case TxLevelReadCommitted:
		opts.IsoLevel = pgx.ReadCommitted
	case TxLevelSerializable:
		opts.IsoLevel = pgx.Serializable
	}

	tx, err := p.pool.BeginTx(ctx, opts)
	if err != nil {
		return nil, err
	}
	ctx = context.WithValue(ctx, TxKey, tx)
	return ctx, nil
}

// commitTx коммитит транзакцию в контексте.
func (p *Postgres) commitTx(ctx context.Context) error {
	tx, ok := ctx.Value(TxKey).(pgx.Tx)
	if !ok {
		return ErrNoTx
	}
	return tx.Commit(ctx)
}

// rollbackTx откатывает транзакцию в контексте.
func (p *Postgres) rollbackTx(ctx context.Context) error {
	tx, ok := ctx.Value(TxKey).(pgx.Tx)
	if !ok {
		return ErrNoTx
	}
	return tx.Rollback(ctx)
}
