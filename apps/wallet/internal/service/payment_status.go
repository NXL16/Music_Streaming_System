package service

import (
	"context"
	"database/sql"
	"errors"
	"time"

	walletpb "Music_Streaming_System/packages/shared-proto/wallet"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (s *WalletService) GetCoinRate(ctx context.Context, _ *walletpb.GetBalanceRequest) (*walletpb.CoinRateResponse, error) {
	rate := &walletpb.CoinRateResponse{}
	err := s.db.QueryRowContext(ctx, `SELECT amount_vnd, coin_amount FROM coin_rates
    WHERE is_active = true AND effective_at <= NOW() ORDER BY effective_at DESC LIMIT 1`).Scan(&rate.AmountVnd, &rate.CoinAmount)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrActiveCoinRateNotFound
	}
	if err != nil {
		return nil, err
	}
	if rate.AmountVnd <= 0 || rate.CoinAmount <= 0 {
		return nil, ErrInvalidActiveCoinRate
	}
	return rate, nil
}

func (s *WalletService) GetPaymentOrder(ctx context.Context, req *walletpb.GetPaymentOrderRequest) (*walletpb.PaymentOrderResponse, error) {
	if req.UserId == "" || req.Reference == "" || len(req.Reference) > 128 {
		return nil, status.Error(codes.InvalidArgument, "Invalid payment reference")
	}
	var query string
	switch req.Kind {
	case "DEPOSIT":
		saved, err := s.RoomTopUpStatus(ctx, RoomTopUpRequest{UserID: req.UserId, OrderID: req.Reference})
		if errors.Is(err, ErrRoomTopUpNotFound) {
			return nil, status.Error(codes.NotFound, "Payment order not found")
		}
		if errors.Is(err, ErrRoomTopUpInvalid) {
			return nil, status.Error(codes.InvalidArgument, "Invalid payment reference")
		}
		if err != nil {
			return nil, status.Error(codes.Internal, "Could not check payment status")
		}
		if saved.PaymentMethod == "MOMO" && saved.Status == "PENDING" {
			lookupErr := s.reconcileMomoDeposit(ctx, saved)
			// IPN may have completed the order while the lookup was in flight.
			saved, err = s.RoomTopUpStatus(ctx, RoomTopUpRequest{UserID: req.UserId, OrderID: req.Reference})
			if err != nil {
				return nil, status.Error(codes.Internal, "Could not check payment status")
			}
			if lookupErr != nil && saved.Status == "PENDING" {
				return nil, status.Error(codes.Unavailable, "Payment confirmation is temporarily unavailable. Please check again.")
			}
		}
		return &walletpb.PaymentOrderResponse{OrderId: saved.OrderID, Kind: req.Kind, Status: saved.Status, AmountVnd: saved.AmountVnd, CoinAmount: saved.Coins, Provider: saved.PaymentMethod}, nil
	case "WITHDRAWAL":
		query = `SELECT order_code, status, amount_vnd, coin_amount, created_at FROM nfbank_withdrawal_orders WHERE user_id=$1 AND (order_code=$2 OR idempotency_key=$2)`
	default:
		return nil, status.Error(codes.InvalidArgument, "Invalid payment kind")
	}
	order := &walletpb.PaymentOrderResponse{Kind: req.Kind}
	var created time.Time
	err := s.db.QueryRowContext(ctx, query, req.UserId, req.Reference).Scan(&order.OrderId, &order.Status, &order.AmountVnd, &order.CoinAmount, &created)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, status.Error(codes.NotFound, "Payment order not found")
	}
	if err != nil {
		return nil, status.Error(codes.Internal, "Could not check payment status")
	}
	order.CreatedAt = created.UnixMilli()
	order.Provider = "NFBANK"
	return order, nil
}
