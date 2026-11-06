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

type RoomGiftCreditService interface {
	CreditRoomGift(context.Context, service.RoomGiftCreditRequest) (service.RoomGiftCreditResult, error)
}

func RoomGiftCreditHandler(s RoomGiftCreditService, secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Cache-Control", "private, no-store")
		if len(secret) < 32 || subtle.ConstantTimeCompare([]byte(c.GetHeader("x-internal-token")), []byte(secret)) != 1 {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "code": "UNAUTHORIZED"})
			return
		}
		var req service.RoomGiftCreditRequest
		dec := json.NewDecoder(http.MaxBytesReader(c.Writer, c.Request.Body, 4096))
		dec.DisallowUnknownFields()
		if dec.Decode(&req) != nil || dec.Decode(new(any)) != io.EOF {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "code": "MUSIC_COIN_SOURCE_INVALID"})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
		defer cancel()
		result, err := s.CreditRoomGift(ctx, req)
		if err != nil {
			status := http.StatusInternalServerError
			if errors.Is(err, service.ErrRoomGiftCreditInvalid) {
				status = http.StatusBadRequest
			} else if errors.Is(err, service.ErrRoomGiftCreditConflict) {
				status = http.StatusConflict
			}
			c.JSON(status, gin.H{"success": false, "code": "MUSIC_COIN_SOURCE_INVALID"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "code": "MUSIC_COIN_GIFT_CREDIT", "data": result})
	}
}
