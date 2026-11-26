package service

import (
	"context"
	"errors"
	"strings"
	"time"
)

var ErrTransactionHistoryInvalid = errors.New("invalid transaction history request")

type TransactionHistoryRequest struct {
	UserID string `json:"userId"`
	Kind   string `json:"kind"`
	Limit  int    `json:"limit"`
	Offset int    `json:"offset"`
}

type TransactionHistoryItem struct {
	OrderID    string `json:"orderId"`
	Kind       string `json:"kind"`
	Status     string `json:"status"`
	AmountVnd  int64  `json:"amountVnd"`
	CoinAmount int64  `json:"coinAmount"`
	Provider   string `json:"provider"`
	CreatedAt  int64  `json:"createdAt"`
}

type TransactionHistoryResponse struct {
	Items   []TransactionHistoryItem `json:"items"`
	HasMore bool                     `json:"hasMore"`
}

const (
	defaultHistoryLimit = 20
	maxHistoryLimit     = 50
)

// GetTransactionHistory returns paginated deposit and withdrawal orders for a user.
func (s *WalletService) GetTransactionHistory(ctx context.Context, req TransactionHistoryRequest) (TransactionHistoryResponse, error) {
	if !roomUserIDPattern.MatchString(req.UserID) {
		return TransactionHistoryResponse{}, ErrTransactionHistoryInvalid
	}

	kind := strings.ToUpper(strings.TrimSpace(req.Kind))
	if kind == "" {
		kind = "ALL"
	}
	if kind != "ALL" && kind != "DEPOSIT" && kind != "WITHDRAWAL" {
		return TransactionHistoryResponse{}, ErrTransactionHistoryInvalid
	}

	limit := req.Limit
	if limit == 0 {
		limit = defaultHistoryLimit
	}
	if limit < 1 || limit > maxHistoryLimit || req.Offset < 0 {
		return TransactionHistoryResponse{}, ErrTransactionHistoryInvalid
	}

	const query = `
		SELECT order_code, kind, status, amount_vnd, coin_amount, provider, created_at
		FROM (
			SELECT
				order_code,
				'DEPOSIT' AS kind,
				status,
				amount_vnd,
				coin_amount,
				CASE WHEN order_code LIKE 'MOMO-%' THEN 'MOMO' ELSE 'NFBANK' END AS provider,
				created_at
			FROM bank_payment_orders
			WHERE user_id = $1

			UNION ALL

			SELECT
				order_code,
				'WITHDRAWAL' AS kind,
				status,
				amount_vnd,
				coin_amount,
				'NFBANK' AS provider,
				created_at
			FROM nfbank_withdrawal_orders
			WHERE user_id = $1
		) AS history
		WHERE ($2 = 'ALL' OR kind = $2)
		ORDER BY created_at DESC
		LIMIT $3 OFFSET $4
	`

	rows, err := s.db.QueryContext(ctx, query, req.UserID, kind, limit+1, req.Offset)
	if err != nil {
		return TransactionHistoryResponse{}, err
	}
	defer rows.Close()

	items := make([]TransactionHistoryItem, 0, limit)
	hasMore := false
	for rows.Next() {
		var item TransactionHistoryItem
		var createdAt time.Time
		if err := rows.Scan(
			&item.OrderID,
			&item.Kind,
			&item.Status,
			&item.AmountVnd,
			&item.CoinAmount,
			&item.Provider,
			&createdAt,
		); err != nil {
			return TransactionHistoryResponse{}, err
		}
		if len(items) == limit {
			hasMore = true
			break
		}
		item.CreatedAt = createdAt.UnixMilli()
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return TransactionHistoryResponse{}, err
	}

	return TransactionHistoryResponse{
		Items:   items,
		HasMore: hasMore,
	}, nil
}
