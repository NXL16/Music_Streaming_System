package repository

import (
	"Music_Streaming_System/apps/wallet/internal/domain"
	"context"
	"database/sql"
	"errors"
	"fmt"
)

type PostgresRepository struct {
	db *sql.DB
}

func NewPostgresRepository(db *sql.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) CreateWalletTx(ctx context.Context, tx *sql.Tx, w *domain.Wallet) (string, error) {
	query := `
		INSERT INTO wallets (id, user_id, coin_balance, frozen_balance, currency_type, status, version, signature, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
		ON CONFLICT (user_id) DO NOTHING
		RETURNING id`

	var insertedID string
	var err error
	if tx != nil {
		err = tx.QueryRowContext(ctx, query, w.ID, w.UserID, w.CoinBalance, w.FrozenBalance, w.CurrencyType, w.Status, w.Version, w.Signature).Scan(&insertedID)
	} else {
		err = r.db.QueryRowContext(ctx, query, w.ID, w.UserID, w.CoinBalance, w.FrozenBalance, w.CurrencyType, w.Status, w.Version, w.Signature).Scan(&insertedID)
	}

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	return insertedID, nil
}

func (r *PostgresRepository) GetByUserIdTx(ctx context.Context, tx *sql.Tx, userID string) (*domain.Wallet, error) {
	query := `
		SELECT id, user_id, coin_balance, frozen_balance, currency_type, status, version, signature, withdraw_pin_hash, created_at, updated_at
		FROM wallets
		WHERE user_id = $1 LIMIT 1`

	var w domain.Wallet
	var err error

	if tx != nil {
		err = tx.QueryRowContext(ctx, query, userID).Scan(&w.ID, &w.UserID, &w.CoinBalance, &w.FrozenBalance, &w.CurrencyType, &w.Status, &w.Version, &w.Signature, &w.WithdrawPinHash, &w.CreatedAt, &w.UpdatedAt)
	} else {
		err = r.db.QueryRowContext(ctx, query, userID).Scan(&w.ID, &w.UserID, &w.CoinBalance, &w.FrozenBalance, &w.CurrencyType, &w.Status, &w.Version, &w.Signature, &w.WithdrawPinHash, &w.CreatedAt, &w.UpdatedAt)
	}

	if err != nil {
		return nil, err
	}
	return &w, nil
}

// GetByUserIdForUpdateTx: Lấy thông tin ví và thực hiện khóa dòng dữ liệu để ghi (Pessimistic Locking)
func (r *PostgresRepository) GetByUserIdForUpdateTx(ctx context.Context, tx *sql.Tx, userID string) (*domain.Wallet, error) {
	if tx == nil {
		return nil, errors.New("transaction is required for pessimistic lock")
	}

	query := `
		SELECT id, user_id, coin_balance, frozen_balance, currency_type, status, version, signature, withdraw_pin_hash, created_at, updated_at
		FROM wallets
		WHERE user_id = $1 LIMIT 1
		FOR UPDATE`

	var w domain.Wallet
	err := tx.QueryRowContext(ctx, query, userID).Scan(&w.ID, &w.UserID, &w.CoinBalance, &w.FrozenBalance, &w.CurrencyType, &w.Status, &w.Version, &w.Signature, &w.WithdrawPinHash, &w.CreatedAt, &w.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &w, nil
}

// UpdateBalanceTx: Cập nhật số dư và tăng version với Optimistic Locking
func (r *PostgresRepository) UpdateBalanceTx(ctx context.Context, tx *sql.Tx, id string, balance int64, version int64, signature string, oldVersion int64) error {
	query := `
		UPDATE wallets 
		SET coin_balance = $1, version = $2, signature = $3, updated_at = NOW() 
		WHERE id = $4 AND version = $5`

	var res sql.Result
	var err error

	if tx != nil {
		res, err = tx.ExecContext(ctx, query, balance, version, signature, id, oldVersion)
	} else {
		res, err = r.db.ExecContext(ctx, query, balance, version, signature, id, oldVersion)
	}

	if err != nil {
		return err
	}

	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return errors.New("optimistic locking conflict: version changed by concurrent transaction")
	}

	return nil
}

func (r *PostgresRepository) CreateTransactionTx(ctx context.Context, tx *sql.Tx, log *domain.TransactionLog) error {
	query := `
		INSERT INTO wallet_transactions (
			wallet_id, idempotency_key, amount, balance_before, balance_after, transaction_type, status, reference_type, reference_id, description, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
		RETURNING id`

	var err error
	var insertedID string
	if tx != nil {
		err = tx.QueryRowContext(ctx, query, log.WalletID, log.IdempotencyKey, log.Amount, log.BalanceBefore, log.BalanceAfter, log.TransactionType, log.Status, log.ReferenceType, log.ReferenceID, log.Description).Scan(&insertedID)
	} else {
		err = r.db.QueryRowContext(ctx, query, log.WalletID, log.IdempotencyKey, log.Amount, log.BalanceBefore, log.BalanceAfter, log.TransactionType, log.Status, log.ReferenceType, log.ReferenceID, log.Description).Scan(&insertedID)
	}

	if err != nil {
		return fmt.Errorf("failed to insert transaction log: %w", err)
	}
	log.ID = insertedID
	return nil
}

func (r *PostgresRepository) CreateDepositOrderTx(ctx context.Context, tx *sql.Tx, order *domain.BankPaymentOrder) error {
	query := `
		INSERT INTO bank_payment_orders (
			user_id, wallet_id, order_code, amount_vnd, coin_amount, bank_account_number, bank_tx_reference, status, callback_logs, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
		RETURNING id`

	var err error
	var insertedID string
	if tx != nil {
		err = tx.QueryRowContext(ctx, query, order.UserID, order.WalletID, order.OrderCode, order.AmountVnd, order.CoinAmount, order.BankAccountNumber, order.BankTxReference, order.Status, order.CallbackLogs).Scan(&insertedID)
	} else {
		err = r.db.QueryRowContext(ctx, query, order.UserID, order.WalletID, order.OrderCode, order.AmountVnd, order.CoinAmount, order.BankAccountNumber, order.BankTxReference, order.Status, order.CallbackLogs).Scan(&insertedID)
	}

	if err != nil {
		return fmt.Errorf("failed to create bank payment order: %w", err)
	}
	order.ID = insertedID
	return nil
}

// GetDepositOrderByCodeForUpdateTx serializes callbacks for the same order.
// A callback must hold this lock until its status update, wallet credit, and
// ledger entry are committed together.
func (r *PostgresRepository) GetDepositOrderByCodeForUpdateTx(ctx context.Context, tx *sql.Tx, orderCode string) (*domain.BankPaymentOrder, error) {
	if tx == nil {
		return nil, errors.New("transaction is required to lock a payment order")
	}

	query := `
		SELECT id, user_id, wallet_id, order_code, amount_vnd, coin_amount, bank_account_number, bank_tx_reference, status, callback_logs, created_at, updated_at
		FROM bank_payment_orders
		WHERE order_code = $1
		FOR UPDATE`

	var order domain.BankPaymentOrder
	err := tx.QueryRowContext(ctx, query, orderCode).Scan(
		&order.ID, &order.UserID, &order.WalletID, &order.OrderCode, &order.AmountVnd, &order.CoinAmount,
		&order.BankAccountNumber, &order.BankTxReference, &order.Status, &order.CallbackLogs, &order.CreatedAt, &order.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &order, nil
}

func (r *PostgresRepository) UpdateDepositOrderStatusByCodeTx(ctx context.Context, tx *sql.Tx, orderCode string, status string) error {
	query := `
		UPDATE bank_payment_orders 
		SET status = $1, updated_at = NOW() 
		WHERE order_code = $2`

	var res sql.Result
	var err error

	if tx != nil {
		res, err = tx.ExecContext(ctx, query, status, orderCode)
	} else {
		res, err = r.db.ExecContext(ctx, query, status, orderCode)
	}

	if err != nil {
		return err
	}

	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return fmt.Errorf("payment order not found with code: %s", orderCode)
	}

	return nil
}

func (r *PostgresRepository) SetWithdrawPin(ctx context.Context, userID string, pinHash string) error {
	query := `UPDATE wallets SET withdraw_pin_hash = $1, updated_at = NOW() WHERE user_id = $2`
	res, err := r.db.ExecContext(ctx, query, pinHash, userID)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return fmt.Errorf("wallet not found for user: %s", userID)
	}
	return nil
}

func (r *PostgresRepository) GetUserBankAccounts(ctx context.Context, userID string) ([]*domain.UserBankAccount, error) {
	query := `
		SELECT id, user_id, bank_code, bank_name, account_number, account_name, is_default, created_at, updated_at
		FROM user_bank_accounts
		WHERE user_id = $1
		ORDER BY is_default DESC, created_at DESC`
	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*domain.UserBankAccount
	for rows.Next() {
		var acc domain.UserBankAccount
		if err := rows.Scan(&acc.ID, &acc.UserID, &acc.BankCode, &acc.BankName, &acc.AccountNumber, &acc.AccountName, &acc.IsDefault, &acc.CreatedAt, &acc.UpdatedAt); err != nil {
			return nil, err
		}
		list = append(list, &acc)
	}
	return list, nil
}

func (r *PostgresRepository) LinkBankAccount(ctx context.Context, acc *domain.UserBankAccount) error {
	var count int
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM user_bank_accounts WHERE user_id = $1`, acc.UserID).Scan(&count); err != nil {
		return err
	}

	isDefault := count == 0
	query := `
		INSERT INTO user_bank_accounts (user_id, bank_code, bank_name, account_number, account_name, is_default)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (user_id, bank_code, account_number) DO UPDATE
		SET account_name = EXCLUDED.account_name, updated_at = NOW()
		RETURNING id, is_default, created_at, updated_at`

	err := r.db.QueryRowContext(ctx, query, acc.UserID, acc.BankCode, acc.BankName, acc.AccountNumber, acc.AccountName, isDefault).Scan(&acc.ID, &acc.IsDefault, &acc.CreatedAt, &acc.UpdatedAt)
	if err != nil {
		return fmt.Errorf("link bank account: %w", err)
	}
	return nil
}

func (r *PostgresRepository) GetBankAccountByID(ctx context.Context, id string, userID string) (*domain.UserBankAccount, error) {
	query := `
		SELECT id, user_id, bank_code, bank_name, account_number, account_name, is_default, created_at, updated_at
		FROM user_bank_accounts
		WHERE id = $1 AND user_id = $2`

	var acc domain.UserBankAccount
	err := r.db.QueryRowContext(ctx, query, id, userID).Scan(&acc.ID, &acc.UserID, &acc.BankCode, &acc.BankName, &acc.AccountNumber, &acc.AccountName, &acc.IsDefault, &acc.CreatedAt, &acc.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &acc, nil
}
