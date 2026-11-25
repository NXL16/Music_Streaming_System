package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"database/sql/driver"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"Music_Streaming_System/apps/wallet/internal/config"
	"Music_Streaming_System/apps/wallet/internal/domain"
	walletpb "Music_Streaming_System/packages/shared-proto/wallet"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type momoState struct {
	domain.WalletRepository
	order   domain.BankPaymentOrder
	wallet  domain.Wallet
	credits int
}

func (s *momoState) GetDepositOrderByCodeForUpdateTx(context.Context, *sql.Tx, string) (*domain.BankPaymentOrder, error) {
	return &s.order, nil
}
func (s *momoState) UpdateDepositOrderStatusByCodeTx(_ context.Context, _ *sql.Tx, _ string, state string) error {
	s.order.Status = state
	return nil
}
func (s *momoState) GetByUserIdForUpdateTx(context.Context, *sql.Tx, string) (*domain.Wallet, error) {
	return &s.wallet, nil
}
func (s *momoState) UpdateBalanceTx(_ context.Context, _ *sql.Tx, _ string, balance, version int64, signature string, _ int64) error {
	s.wallet.CoinBalance, s.wallet.Version, s.wallet.Signature = balance, version, signature
	return nil
}
func (s *momoState) CreateTransactionTx(context.Context, *sql.Tx, *domain.TransactionLog) error {
	s.credits++
	return nil
}

type momoConnector struct{ state *momoState }

func (c momoConnector) Connect(context.Context) (driver.Conn, error) {
	return &momoConn{state: c.state}, nil
}
func (momoConnector) Driver() driver.Driver { return topUpDriver{} }

type momoConn struct {
	topUpConn
	state *momoState
}

func (c *momoConn) Begin() (driver.Tx, error) { return momoTx{}, nil }
func (c *momoConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	order := c.state.order
	if !strings.Contains(query, "WHERE user_id = $1 AND order_code = $2") || args[0].Value != order.UserID || args[1].Value != order.OrderCode {
		return &topUpRows{}, nil
	}
	return &topUpRows{values: []driver.Value{order.OrderCode, order.AmountVnd, order.CoinAmount, order.Status}}, nil
}

type momoTx struct{}

func (momoTx) Commit() error   { return nil }
func (momoTx) Rollback() error { return nil }

func TestMomoLookupReconcilesWithoutTrustingRedirectOrDuplicatingCredit(t *testing.T) {
	for _, test := range []struct {
		name        string
		code        int
		corrupt     string
		want        string
		unavailable bool
	}{
		{"cancelled", 1006, "", "FAILED", false},
		{"expired", 1005, "", "FAILED", false},
		{"success", 0, "", "SUCCESS", false},
		{"pending", 1000, "", "PENDING", false},
		{"processing", 7002, "", "PENDING", false},
		{"authorized", 9000, "", "PENDING", false},
		{"access denied", 11, "", "PENDING", true},
		{"unknown code", 123456, "", "PENDING", true},
		{"missing result", 0, "resultCode", "PENDING", true},
		{"wrong amount", 0, "amount", "PENDING", true},
		{"wrong order", 0, "orderId", "PENDING", true},
		{"wrong merchant", 0, "partnerCode", "PENDING", true},
		{"wrong request", 0, "requestId", "PENDING", true},
		{"gateway unavailable", 0, "http", "PENDING", true},
	} {
		t.Run(test.name, func(t *testing.T) {
			state := &momoState{order: domain.BankPaymentOrder{ID: "order", UserID: "11111111-1111-4111-8111-111111111111", OrderCode: "MOMO-" + strings.Repeat("a", 32), AmountVnd: 50000, CoinAmount: 50, Status: "PENDING"}, wallet: domain.Wallet{ID: "wallet", CoinBalance: 100, Version: 1}}
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				var request momoStatusRequest
				if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
					t.Error(err)
					w.WriteHeader(400)
					return
				}
				mac := hmac.New(sha256.New, []byte("secret"))
				mac.Write([]byte("accessKey=access&orderId=" + state.order.OrderCode + "&partnerCode=partner&requestId=" + request.RequestID))
				if r.URL.Path != "/v2/gateway/api/query" || request.Signature != hex.EncodeToString(mac.Sum(nil)) || request.Lang != "en" {
					t.Error("incorrect MoMo query request")
				}
				if test.corrupt == "http" {
					w.WriteHeader(403)
					return
				}
				response := map[string]any{"partnerCode": request.PartnerCode, "requestId": request.RequestID, "orderId": request.OrderID, "amount": 50000, "resultCode": test.code}
				if test.corrupt == "amount" {
					response["amount"] = 1
				} else if test.corrupt != "" {
					delete(response, test.corrupt)
				}
				json.NewEncoder(w).Encode(response)
			}))
			defer server.Close()
			db := sql.OpenDB(momoConnector{state})
			defer db.Close()
			s := NewWalletService(state, db, &config.Config{SecretKey: "wallet-secret", MomoPartnerCode: "partner", MomoAccessKey: "access", MomoSecretKey: "secret", MomoAPIURL: server.URL + "/v2/gateway/api/create"})
			state.wallet.Signature = s.generateSignature(state.wallet.ID, state.wallet.UserID, state.wallet.CoinBalance, 0, 1, "", "")
			req := &walletpb.GetPaymentOrderRequest{UserId: state.order.UserID, Reference: state.order.OrderCode, Kind: "DEPOSIT"}
			// Ownership is checked before any provider call.
			foreign := *req
			foreign.UserId = "22222222-2222-4222-8222-222222222222"
			if _, err := s.GetPaymentOrder(context.Background(), &foreign); status.Code(err) != codes.NotFound || calls != 0 {
				t.Fatalf("unscoped lookup: calls=%d err=%v", calls, err)
			}
			order, err := s.GetPaymentOrder(context.Background(), req)
			if state.order.Status != test.want {
				t.Fatalf("state=%s want=%s", state.order.Status, test.want)
			}
			if test.unavailable {
				if status.Code(err) != codes.Unavailable || state.credits != 0 {
					t.Fatalf("err=%v credits=%d", err, state.credits)
				}
				return
			}
			if err != nil || order.Status != test.want {
				t.Fatalf("order=%v err=%v", order, err)
			}
			if test.want != "PENDING" {
				if _, err := s.GetPaymentOrder(context.Background(), req); err != nil || calls != 1 {
					t.Fatalf("terminal order queried again: %v calls=%d", err, calls)
				}
				if err := s.ProcessDepositWebhook(context.Background(), req.Reference, 50000, test.code); err != nil {
					t.Fatal(err)
				}
			}
			if test.want == "SUCCESS" {
				if state.credits != 1 || state.wallet.CoinBalance != 150 {
					t.Fatalf("credits=%d balance=%d", state.credits, state.wallet.CoinBalance)
				}
			} else if state.credits != 0 || state.wallet.CoinBalance != 100 {
				t.Fatal("non-successful lookup changed balance")
			}
		})
	}
}
