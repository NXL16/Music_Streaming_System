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

type RoomTopUpService interface {
	RoomTopUpCatalog(context.Context) ([]service.RoomTopUpPackage, error)
	CreateRoomTopUp(context.Context, service.RoomTopUpRequest) (service.RoomTopUpOrder, error)
	RoomTopUpStatus(context.Context, service.RoomTopUpRequest) (service.RoomTopUpOrder, error)
}

func RoomTopUpHandler(s RoomTopUpService, secret, operation string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Cache-Control", "private, no-store")
		if len(secret) < 32 || subtle.ConstantTimeCompare([]byte(c.GetHeader("x-internal-token")), []byte(secret)) != 1 {
			c.JSON(401, gin.H{"success": false, "code": "UNAUTHORIZED"})
			return
		}
		var req service.RoomTopUpRequest
		dec := json.NewDecoder(http.MaxBytesReader(c.Writer, c.Request.Body, 4096))
		dec.DisallowUnknownFields()
		if dec.Decode(&req) != nil || dec.Decode(new(any)) != io.EOF {
			c.JSON(400, gin.H{"success": false, "code": "MUSIC_TOPUP_INVALID"})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
		defer cancel()
		var result any
		var err error
		code := "MUSIC_TOPUP_ORDER"
		switch operation {
		case "catalog":
			result, err = s.RoomTopUpCatalog(ctx)
			code = "MUSIC_TOPUP_CATALOG"
		case "create":
			result, err = s.CreateRoomTopUp(ctx, req)
		case "status":
			result, err = s.RoomTopUpStatus(ctx, req)
		default:
			c.Status(404)
			return
		}
		if err != nil {
			status, errorCode := 503, "MUSIC_TOPUP_UNAVAILABLE"
			if errors.Is(err, service.ErrRoomTopUpInvalid) {
				status, errorCode = 400, "MUSIC_TOPUP_INVALID"
			}
			if errors.Is(err, service.ErrRoomTopUpNotFound) {
				status, errorCode = 404, "MUSIC_TOPUP_NOT_FOUND"
			}
			c.JSON(status, gin.H{"success": false, "code": errorCode})
			return
		}
		c.JSON(200, gin.H{"success": true, "code": code, "data": result})
	}
}
