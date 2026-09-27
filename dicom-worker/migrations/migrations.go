package migrations

import "embed"

//go:embed *.sql
var migrations embed.FS

// GetMigrationsFS возвращает embedded файлы с миграциями.
func GetMigrationsFS() embed.FS {
	return migrations
}
