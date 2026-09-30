package database

import (
	"context"
	"database/sql"
	_ "embed"
	"fmt"
)

type migration struct {
	version int
	name    string
	sql     string
}

//go:embed migrations/000001_init.sql
var initialSchema string

//go:embed migrations/000002_nfbank_withdrawals.sql
var nfBankWithdrawalsSchema string

//go:embed migrations/000003_withdraw_pin_and_bank_accounts.sql
var withdrawPinAndBankAccountsSchema string

var migrations = []migration{
	{version: 1, name: "init", sql: initialSchema},
	{version: 2, name: "nfbank_withdrawals", sql: nfBankWithdrawalsSchema},
	{version: 3, name: "withdraw_pin_and_bank_accounts", sql: withdrawPinAndBankAccountsSchema},
}

const walletMigrationAdvisoryLockID int64 = 4_409_210_001

// ApplyMigrations applies every pending Wallet schema migration atomically.
// A migration is recorded only after its SQL succeeds, so restarting the
// service after a failed deploy is safe.
func ApplyMigrations(ctx context.Context, db *sql.DB) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin wallet migration transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	// Multiple replicas may start together. A transaction-scoped PostgreSQL
	// advisory lock serializes the schema check and DDL without relying on
	// process-local startup order.
	if _, err := tx.ExecContext(
		ctx,
		`SELECT pg_advisory_xact_lock($1)`,
		walletMigrationAdvisoryLockID,
	); err != nil {
		return fmt.Errorf("acquire wallet migration advisory lock: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS wallet_schema_migrations (
			version BIGINT PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`); err != nil {
		return fmt.Errorf("create wallet migration table: %w", err)
	}

	for _, migration := range migrations {
		var applied bool
		if err := tx.QueryRowContext(
			ctx,
			`SELECT EXISTS(SELECT 1 FROM wallet_schema_migrations WHERE version = $1)`,
			migration.version,
		).Scan(&applied); err != nil {
			return fmt.Errorf("read wallet migration %d: %w", migration.version, err)
		}
		if applied {
			continue
		}

		if _, err := tx.ExecContext(ctx, migration.sql); err != nil {
			return fmt.Errorf("apply wallet migration %d (%s): %w", migration.version, migration.name, err)
		}
		if _, err := tx.ExecContext(
			ctx,
			`INSERT INTO wallet_schema_migrations (version, name) VALUES ($1, $2)`,
			migration.version,
			migration.name,
		); err != nil {
			return fmt.Errorf("record wallet migration %d: %w", migration.version, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit wallet migrations: %w", err)
	}

	return nil
}
