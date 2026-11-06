package http

import (
	"github.com/gin-gonic/gin"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRoomTopUpPrivateBoundary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	secret := strings.Repeat("t", 32)
	for _, tc := range []struct {
		token, body string
		status      int
	}{
		{"", `{}`, 401}, {"wrong", `{}`, 401},
		{secret, `{"userId":"x","coins":9999}`, 400},
		{secret, `{"userId":"x","status":"SUCCESS"}`, 400},
		{secret, `{} {}`, 400},
	} {
		router := gin.New()
		router.POST("/topup", RoomTopUpHandler(nil, secret, "create"))
		req := httptest.NewRequest("POST", "/topup", strings.NewReader(tc.body))
		req.Header.Set("x-internal-token", tc.token)
		res := httptest.NewRecorder()
		router.ServeHTTP(res, req)
		if res.Code != tc.status {
			t.Fatalf("got %d want %d", res.Code, tc.status)
		}
	}
}
