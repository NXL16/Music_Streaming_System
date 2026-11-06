package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"Music_Streaming_System/apps/wallet/internal/domain"
)

var (
	ErrRoomGiftCreditInvalid   = errors.New("invalid room gift credit")
	ErrRoomGiftCreditConflict  = errors.New("room gift debit was already consumed")
	roomGiftTransactionPattern = regexp.MustCompile(`^TX-DEBIT-([0-9a-fA-F-]{36})$`)
	roomGiftRequestPattern     = regexp.MustCompile(`^room-credit:[0-9a-f]{24}$`)
)

type RoomGiftCreditRequest struct {
	UserID             string `json:"userId"`
	RequestID          string `json:"requestId"`
	DebitTransactionID string `json:"debitTransactionId"`
	FromUserID         string `json:"fromUserId"`
	GiftType           string `json:"giftType"`
	Quantity           int64  `json:"quantity"`
}

type RoomGiftCreditResult struct {
	TransactionID string `json:"transactionId"`
	CoinBalance   int64  `json:"coinBalance"`
	FrozenBalance int64  `json:"frozenBalance"`
}

// CreditRoomGift credits a recipient only after binding the request to the
// original Room debit.  The debit transaction ID, rather than browser input,
// is the source of truth for the Coin amount.
func (s *WalletService) CreditRoomGift(ctx context.Context, req RoomGiftCreditRequest) (RoomGiftCreditResult, error) {
	var result RoomGiftCreditResult
	matches := roomGiftTransactionPattern.FindStringSubmatch(req.DebitTransactionID)
	if !roomUserIDPattern.MatchString(req.UserID) ||
		!roomUserIDPattern.MatchString(req.FromUserID) ||
		req.UserID == req.FromUserID ||
		!roomGiftRequestPattern.MatchString(req.RequestID) ||
		req.GiftType == "" || len(req.GiftType) > 30 || req.Quantity < 1 || req.Quantity > 100 ||
		len(matches) != 2 {
		return result, ErrRoomGiftCreditInvalid
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return result, fmt.Errorf("begin room gift credit: %w", err)
	}
	defer tx.Rollback()

	var sourceType, sourceStatus, sourceKey, sourceDescription string
	var amount int64
	if err := tx.QueryRowContext(ctx, `SELECT t.amount, t.transaction_type, t.status,
		COALESCE(t.idempotency_key, ''), COALESCE(t.description, '')
		FROM wallet_transactions t JOIN wallets w ON w.id = t.wallet_id
		WHERE t.id = $1 AND w.user_id = $2`, matches[1], req.FromUserID).
		Scan(&amount, &sourceType, &sourceStatus, &sourceKey, &sourceDescription); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return result, ErrRoomGiftCreditInvalid
		}
		return result, fmt.Errorf("find room gift debit: %w", err)
	}
	expectedDescription := fmt.Sprintf("Room gift %s x%d to %s", req.GiftType, req.Quantity, req.UserID)
	if sourceType != domain.TxTypeDebit || sourceStatus != "SUCCESS" ||
		!strings.HasPrefix(sourceKey, "room-gift:") || sourceDescription != expectedDescription || amount <= 0 {
		return result, ErrRoomGiftCreditInvalid
	}

	recipient, err := s.repo.GetByUserIdForUpdateTx(ctx, tx, req.UserID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return result, ErrRoomGiftCreditInvalid
		}
		return result, fmt.Errorf("find room gift recipient: %w", err)
	}
	creditKey := "room-gift-credit:" + matches[1]
	var existingID, existingWalletID, existingType, existingReferenceID string
	var existingAmount, existingBalance int64
	err = tx.QueryRowContext(ctx, `SELECT id, wallet_id, amount, transaction_type,
		COALESCE(reference_id::text, ''), balance_after
		FROM wallet_transactions WHERE idempotency_key = $1`, creditKey).
		Scan(&existingID, &existingWalletID, &existingAmount, &existingType, &existingReferenceID, &existingBalance)
	if err == nil {
		if existingWalletID == recipient.ID && existingAmount == amount &&
			existingType == domain.TxTypeCredit && existingReferenceID == matches[1] {
			result = RoomGiftCreditResult{TransactionID: fmt.Sprintf("TX-%s-%s", existingType, existingID), CoinBalance: existingBalance, FrozenBalance: recipient.FrozenBalance}
			return result, nil
		}
		return result, ErrRoomGiftCreditConflict
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return result, fmt.Errorf("check room gift credit idempotency: %w", err)
	}
	if !s.verifySignature(recipient) {
		return result, errors.New("recipient wallet signature validation failed")
	}
	balanceAfter, err := creditWalletBalance(recipient.CoinBalance, amount)
	if err != nil {
		return result, err
	}
	version, err := nextWalletVersion(recipient.Version)
	if err != nil {
		return result, err
	}
	if err := s.repo.UpdateBalanceTx(ctx, tx, recipient.ID, balanceAfter, version,
		s.generateSignature(recipient.ID, recipient.UserID, balanceAfter, recipient.FrozenBalance, version, recipient.CurrencyType, recipient.Status), recipient.Version); err != nil {
		return result, fmt.Errorf("credit room gift recipient: %w", err)
	}
	sourceID := matches[1]
	credit := &domain.TransactionLog{
		WalletID: recipient.ID, Amount: amount, BalanceBefore: recipient.CoinBalance, BalanceAfter: balanceAfter,
		TransactionType: domain.TxTypeCredit, Status: "SUCCESS", ReferenceType: "ROOM_GIFT_DEBIT",
		ReferenceID: &sourceID, IdempotencyKey: creditKey,
		Description: fmt.Sprintf("Room gift %s x%d from %s", req.GiftType, req.Quantity, req.FromUserID),
	}
	if err := s.repo.CreateTransactionTx(ctx, tx, credit); err != nil {
		return result, fmt.Errorf("log room gift credit: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return result, fmt.Errorf("commit room gift credit: %w", err)
	}
	return RoomGiftCreditResult{TransactionID: fmt.Sprintf("TX-%s-%s", credit.TransactionType, credit.ID), CoinBalance: balanceAfter, FrozenBalance: recipient.FrozenBalance}, nil
}
