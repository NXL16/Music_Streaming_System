package service

import (
	"context"
	"database/sql"
	"errors"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	walletpb "Music_Streaming_System/packages/shared-proto/wallet"
)

var ErrRoomTopUpInvalid = errors.New("invalid room top-up")
var ErrRoomTopUpNotFound = errors.New("room top-up not found")
var roomTopUpOrderPattern = regexp.MustCompile(`^(MOMO|NFBANK)-[0-9a-f]{32}$`)

type RoomTopUpRequest struct {
	UserID        string `json:"userId"`
	PackageID     string `json:"packageId,omitempty"`
	PaymentMethod string `json:"paymentMethod,omitempty"`
	OrderID       string `json:"orderId,omitempty"`
}

type RoomTopUpPackage struct {
	ID        string `json:"id"`
	AmountVnd int64  `json:"amountVnd"`
	Coins     int64  `json:"coins"`
}

type RoomTopUpOrder struct {
	OrderID       string `json:"orderId"`
	AmountVnd     int64  `json:"amountVnd"`
	Coins         int64  `json:"coins"`
	PaymentMethod string `json:"paymentMethod"`
	Status        string `json:"status"`
	PaymentURL    string `json:"paymentUrl,omitempty"`
	DeepLink      string `json:"deepLink,omitempty"`
}

// These are the Music profile's six VND packages. Coin quantities come from
// the active database rate, never from a browser or a separate gift currency.
func roomTopUpAmount(id string) int64 {
	for _, amount := range []int64{10000, 20000, 50000, 100000, 200000, 500000} {
		if id == strconv.FormatInt(amount, 10) {
			return amount
		}
	}
	return 0
}

func (s *WalletService) RoomTopUpCatalog(ctx context.Context) ([]RoomTopUpPackage, error) {
	var rateVnd, rateCoin int64
	if err := s.db.QueryRowContext(ctx, `SELECT amount_vnd, coin_amount FROM coin_rates
		WHERE is_active = true AND effective_at <= NOW() ORDER BY effective_at DESC LIMIT 1`).Scan(&rateVnd, &rateCoin); err != nil {
		return nil, err
	}
	packages := make([]RoomTopUpPackage, 0, 6)
	for _, amount := range []int64{10000, 20000, 50000, 100000, 200000, 500000} {
		coins, err := calculateCoinAmount(amount, rateVnd, rateCoin)
		if err != nil {
			return nil, err
		}
		packages = append(packages, RoomTopUpPackage{ID: strconv.FormatInt(amount, 10), AmountVnd: amount, Coins: coins})
	}
	return packages, nil
}

func (s *WalletService) RoomTopUpStatus(ctx context.Context, req RoomTopUpRequest) (RoomTopUpOrder, error) {
	var order RoomTopUpOrder
	if !roomUserIDPattern.MatchString(req.UserID) || !roomTopUpOrderPattern.MatchString(req.OrderID) {
		return order, ErrRoomTopUpInvalid
	}
	// Bind every read to the authenticated payer. Do not expose another user's order.
	err := s.db.QueryRowContext(ctx, `SELECT order_code, amount_vnd, coin_amount, status
		FROM bank_payment_orders WHERE user_id = $1 AND order_code = $2`, req.UserID, req.OrderID).
		Scan(&order.OrderID, &order.AmountVnd, &order.Coins, &order.Status)
	if errors.Is(err, sql.ErrNoRows) {
		return order, ErrRoomTopUpNotFound
	}
	if err != nil {
		return order, err
	}
	order.PaymentMethod = strings.SplitN(order.OrderID, "-", 2)[0]
	if order.Status != "PENDING" && order.Status != "SUCCESS" && order.Status != "FAILED" {
		return RoomTopUpOrder{}, errors.New("unknown deposit state")
	}
	return order, nil
}

func (s *WalletService) CreateRoomTopUp(ctx context.Context, req RoomTopUpRequest) (RoomTopUpOrder, error) {
	amount := roomTopUpAmount(req.PackageID)
	if !roomUserIDPattern.MatchString(req.UserID) || amount == 0 || (req.PaymentMethod != "MOMO" && req.PaymentMethod != "NFBANK") {
		return RoomTopUpOrder{}, ErrRoomTopUpInvalid
	}
	// Reuse the existing order and signed webhook flow. Creating an order does
	// not debit money or credit Coins. Never auto-retry this creation operation.
	created, err := s.CreateDepositOrder(ctx, &walletpb.DepositOrderRequest{UserId: req.UserID, AmountVnd: amount, PaymentMethod: req.PaymentMethod})
	if err != nil {
		return RoomTopUpOrder{}, err
	}
	order, err := s.RoomTopUpStatus(ctx, RoomTopUpRequest{UserID: req.UserID, OrderID: created.OrderId})
	if err != nil {
		return RoomTopUpOrder{}, err
	}
	payURL, err := url.Parse(created.PaymentUrl)
	if err != nil {
		return RoomTopUpOrder{}, errors.New("invalid payment URL")
	}
	localHTTP := payURL.Scheme == "http" && (payURL.Hostname() == "localhost" || payURL.Hostname() == "127.0.0.1" || payURL.Hostname() == "::1")
	if payURL.Host == "" || payURL.User != nil || (payURL.Scheme != "https" && !localHTTP) {
		return RoomTopUpOrder{}, errors.New("invalid payment URL")
	}
	order.PaymentURL = payURL.String()
	if req.PaymentMethod == "NFBANK" {
		token := payURL.Query().Get("token")
		if token == "" || len(token) > 8192 {
			return RoomTopUpOrder{}, errors.New("missing NF Bank payment token")
		}
		order.DeepLink = "nfbank://payment?token=" + url.QueryEscape(token)
	}
	return order, nil
}
