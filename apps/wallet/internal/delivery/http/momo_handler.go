package http

import (
	"Music_Streaming_System/apps/wallet/internal/service"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

type MomoHTTPHandler struct {
	walletService *service.WalletService
}

func NewMomoHTTPHandler(walletService *service.WalletService) *MomoHTTPHandler {
	return &MomoHTTPHandler{
		walletService: walletService,
	}
}

// MomoWebhookPayload định nghĩa đầy đủ cấu trúc IPN Webhook MoMo v2 gửi về
type MomoWebhookPayload struct {
	PartnerCode  string `json:"partnerCode"`
	OrderId      string `json:"orderId"`
	RequestId    string `json:"requestId"`
	Amount       int64  `json:"amount"`
	OrderInfo    string `json:"orderInfo"`
	OrderType    string `json:"orderType"`
	TransId      int64  `json:"transId"`
	ResultCode   int    `json:"resultCode"` // 0 = Thành công, khác 0 = Thất bại
	Message      string `json:"message"`
	PayType      string `json:"payType"`
	ExtraData    string `json:"extraData"`
	ResponseTime int64  `json:"responseTime"`
	Signature    string `json:"signature"`
}

func (h *MomoHTTPHandler) HandleWebhook(c *gin.Context) {
	var payload MomoWebhookPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Payload không hợp lệ"})
		return
	}

	// 1. Xác thực chữ ký số (Signature Verification) ngăn chặn giả mạo dữ liệu
	if !h.verifyMomoSignature(payload) {
		fmt.Printf("[WARNING] Phát hiện Webhook giả mạo hoặc chữ ký không hợp lệ! OrderId: %s\n", payload.OrderId)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Chữ ký không hợp lệ"})
		return
	}

	// 2. Gọi Service xử lý giao dịch nạp tiền (cả thành công hoặc thất bại để lưu cập nhật trạng thái đơn)
	err := h.walletService.ProcessDepositWebhook(c.Request.Context(), payload.OrderId, payload.Amount, payload.ResultCode)
	if err != nil {
		fmt.Printf("Lỗi xử lý nghiệp vụ Webhook cho đơn %s: %v\n", payload.OrderId, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if payload.ResultCode == 0 {
		fmt.Printf("[SUCCESS] Đã xử lý nạp tiền thành công cho đơn hàng MoMo: %s\n", payload.OrderId)
	} else {
		fmt.Printf("[FAILED] Đơn hàng MoMo %s thanh toán thất bại với ResultCode: %d, Message: %s\n", payload.OrderId, payload.ResultCode, payload.Message)
	}

	// Trả về 204 No Content cho MoMo biết đã nhận và xử lý xong để họ dừng việc retry gửi IPN
	c.Status(http.StatusNoContent)
}

// verifyMomoSignature: Tính toán lại chữ ký số dựa trên Payload nhận về và so sánh bằng hmac.Equal để chống timing-attacks
func (h *MomoHTTPHandler) verifyMomoSignature(payload MomoWebhookPayload) bool {
	cfg := h.walletService.GetConfig()
	if cfg == nil {
		return false
	}

	// Xây dựng chuỗi raw signature theo đúng tài liệu MoMo v2
	rawSignature := fmt.Sprintf(
		"accessKey=%s&amount=%d&extraData=%s&message=%s&orderId=%s&orderInfo=%s&orderType=%s&partnerCode=%s&payType=%s&requestId=%s&responseTime=%d&resultCode=%d&transId=%d",
		cfg.MomoAccessKey,
		payload.Amount,
		payload.ExtraData,
		payload.Message,
		payload.OrderId,
		payload.OrderInfo,
		payload.OrderType,
		payload.PartnerCode,
		payload.PayType,
		payload.RequestId,
		payload.ResponseTime,
		payload.ResultCode,
		payload.TransId,
	)

	mac := hmac.New(sha256.New, []byte(cfg.MomoSecretKey))
	mac.Write([]byte(rawSignature))
	expectedSignature := hex.EncodeToString(mac.Sum(nil))

	return hmac.Equal([]byte(payload.Signature), []byte(expectedSignature))
}
