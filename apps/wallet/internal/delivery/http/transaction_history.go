package http

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"Music_Streaming_System/apps/wallet/internal/service"
	"github.com/gin-gonic/gin"
)

type TransactionHistoryService interface {
	GetTransactionHistory(context.Context, service.TransactionHistoryRequest) (service.TransactionHistoryResponse, error)
}

func TransactionHistoryHandler(s TransactionHistoryService, secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Cache-Control", "private, no-store")
		if len(secret) < 32 || subtle.ConstantTimeCompare([]byte(c.GetHeader("x-internal-token")), []byte(secret)) != 1 {
			c.JSON(401, gin.H{"success": false, "code": "UNAUTHORIZED"})
			return
		}

		var req service.TransactionHistoryRequest
		dec := json.NewDecoder(http.MaxBytesReader(c.Writer, c.Request.Body, 4096))
		dec.DisallowUnknownFields()
		if dec.Decode(&req) != nil || dec.Decode(new(any)) != io.EOF {
			c.JSON(400, gin.H{"success": false, "code": "WALLET_HISTORY_INVALID"})
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		result, err := s.GetTransactionHistory(ctx, req)
		if err != nil {
			if errors.Is(err, service.ErrTransactionHistoryInvalid) {
				c.JSON(400, gin.H{"success": false, "code": "WALLET_HISTORY_INVALID"})
				return
			}
			c.JSON(503, gin.H{"success": false, "code": "WALLET_HISTORY_UNAVAILABLE"})
			return
		}

		c.JSON(200, result)
	}
}
