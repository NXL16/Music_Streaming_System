package service

import (
	"context"
	"errors"
	"testing"
)

func TestCreditRoomGiftRejectsInvalidRequestsBeforeDatabaseAccess(t *testing.T) {
	valid := RoomGiftCreditRequest{
		UserID:             "11111111-1111-4111-8111-111111111111",
		FromUserID:         "22222222-2222-4222-8222-222222222222",
		RequestID:          "room-credit:aaaaaaaaaaaaaaaaaaaaaaaa",
		DebitTransactionID: "TX-DEBIT-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		GiftType:           "rose",
		Quantity:           1,
	}
	for _, mutate := range []func(*RoomGiftCreditRequest){
		func(req *RoomGiftCreditRequest) { req.UserID = req.FromUserID },
		func(req *RoomGiftCreditRequest) { req.RequestID = "wrong" },
		func(req *RoomGiftCreditRequest) { req.DebitTransactionID = "TX-CREDIT-x" },
		func(req *RoomGiftCreditRequest) { req.Quantity = 0 },
	} {
		req := valid
		mutate(&req)
		_, err := (&WalletService{}).CreditRoomGift(context.Background(), req)
		if !errors.Is(err, ErrRoomGiftCreditInvalid) {
			t.Fatalf("expected invalid credit error, got %v", err)
		}
	}
}
