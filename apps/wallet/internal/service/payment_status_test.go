package service

import (
	walletpb "Music_Streaming_System/packages/shared-proto/wallet"
	"context"
	"database/sql"
	"database/sql/driver"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"testing"
	"time"
)

func TestWithdrawalStatusReadIsPayerScoped(t *testing.T) {
	user := "11111111-1111-4111-8111-111111111111"
	for _, state := range []string{"PENDING", "PROCESSING", "SUCCESS", "FAILED"} {
		t.Run(state, func(t *testing.T) {
			seen := false
			db := sql.OpenDB(topUpConnector{values: []driver.Value{"NFBANK-WITHDRAW-order", state, int64(20000), int64(20), time.Now()}, wantUser: user, wantWithdrawal: true, seen: &seen})
			defer db.Close()
			order, err := (&WalletService{db: db}).GetPaymentOrder(context.Background(), &walletpb.GetPaymentOrderRequest{UserId: user, Kind: "WITHDRAWAL", Reference: "request-key"})
			if err != nil || !seen || order.Status != state || order.CoinAmount != 20 {
				t.Fatalf("order=%v err=%v", order, err)
			}
		})
	}
}

func TestPaymentStatusRejectsInvalidKindBeforeReading(t *testing.T) {
	_, err := (&WalletService{}).GetPaymentOrder(context.Background(), &walletpb.GetPaymentOrderRequest{UserId: "payer", Kind: "UNKNOWN", Reference: "key"})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatal(err)
	}
}

func TestPaymentStatusMissingDoesNotInventAFailure(t *testing.T) {
	seen := false
	db := sql.OpenDB(topUpConnector{seen: &seen})
	defer db.Close()
	_, err := (&WalletService{db: db}).GetPaymentOrder(context.Background(), &walletpb.GetPaymentOrderRequest{UserId: "payer", Kind: "WITHDRAWAL", Reference: "key"})
	if status.Code(err) != codes.NotFound {
		t.Fatal(err)
	}
}

func TestPendingMomoResultsAreNotTerminal(t *testing.T) {
	for _, code := range []int{1000, 7000, 7002, 9000} {
		if isFinalMomoResult(code) {
			t.Fatalf("pending code %d marked final", code)
		}
	}
	for _, code := range []int{0, 99, 1001, 1005, 1006} {
		if !isFinalMomoResult(code) {
			t.Fatalf("final code %d marked pending", code)
		}
	}
}
