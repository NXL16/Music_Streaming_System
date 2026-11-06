package http

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"Music_Streaming_System/apps/wallet/internal/service"
	"github.com/gin-gonic/gin"
)

type roomGiftCreditStub struct{}

func (roomGiftCreditStub) CreditRoomGift(_ context.Context, _ service.RoomGiftCreditRequest) (service.RoomGiftCreditResult, error) {
	return service.RoomGiftCreditResult{
		TransactionID: "TX-CREDIT-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		CoinBalance:   20,
	}, nil
}

func TestRoomGiftCreditPrivateBoundary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	secret := strings.Repeat("t", 32)
	router := gin.New()
	router.POST("/credit", RoomGiftCreditHandler(roomGiftCreditStub{}, secret))

	for _, tc := range []struct {
		token  string
		body   string
		status int
	}{
		{"", "{}", http.StatusUnauthorized},
		{secret, "{\"userId\":\"x\",\"coins\":9999}", http.StatusBadRequest},
		{secret, "{} {}", http.StatusBadRequest},
		{secret, "{\"userId\":\"x\",\"requestId\":\"room-credit:aaaaaaaaaaaaaaaaaaaaaaaa\"}", http.StatusOK},
	} {
		req := httptest.NewRequest(http.MethodPost, "/credit", strings.NewReader(tc.body))
		req.Header.Set("x-internal-token", tc.token)
		res := httptest.NewRecorder()
		router.ServeHTTP(res, req)
		if res.Code != tc.status {
			t.Fatalf("got %d want %d", res.Code, tc.status)
		}
	}
}
