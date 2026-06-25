package http

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strconv"

	"Music_Streaming_System/apps/wallet/internal/config"
	"Music_Streaming_System/apps/wallet/internal/service"
	"github.com/gin-gonic/gin"
)

type NFBankHandler struct {
	walletService *service.WalletService
	cfg           *config.Config
}

func NewNFBankHandler(ws *service.WalletService, cfg *config.Config) *NFBankHandler {
	return &NFBankHandler{
		walletService: ws,
		cfg:           cfg,
	}
}

type NFBankWebhookPayload struct {
	PartnerCode  string `json:"partnerCode"`
	OrderId      string `json:"orderId"`
	RequestId    string `json:"requestId"`
	Amount       int64  `json:"amount"`
	OrderInfo    string `json:"orderInfo"`
	OrderType    string `json:"orderType"`
	TransId      int64  `json:"transId"`
	ResultCode   int    `json:"resultCode"`
	Message      string `json:"message"`
	PayType      string `json:"payType"`
	ResponseTime int64  `json:"responseTime"`
	ExtraData    string `json:"extraData"`
	Signature    string `json:"signature"`
}

func (h *NFBankHandler) HandleWebhook(c *gin.Context) {
	var payload NFBankWebhookPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Payload không hợp lệ"})
		return
	}

	// 1. Lấy Secret Key từ config (NFBANK_SECRET_KEY)
	secretKey := h.cfg.NFBankSecretKey

	// 2. Ghép chuỗi thô (Raw String) theo chuẩn Alphabet từ tài liệu đối tác cấp
	rawSignature := fmt.Sprintf(
		"amount=%s&extraData=%s&message=%s&orderId=%s&partnerCode=%s&requestId=%s&resultCode=%s&transId=%s",
		strconv.FormatInt(payload.Amount, 10),
		payload.ExtraData,
		payload.Message,
		payload.OrderId,
		payload.PartnerCode,
		payload.RequestId,
		strconv.Itoa(payload.ResultCode),
		strconv.FormatInt(payload.TransId, 10),
	)

	// 3. Tính toán Signature cục bộ đối chiếu
	mac := hmac.New(sha256.New, []byte(secretKey))
	mac.Write([]byte(rawSignature))
	expectedSignature := hex.EncodeToString(mac.Sum(nil))

	// 4. So khớp chữ ký chống giả mạo dữ liệu dòng tiền
	if payload.Signature != expectedSignature {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Chữ ký xác thực không khớp!"})
		return
	}

	// 5. Gọi Service để xử lý Database Transaction (Cập nhật trạng thái đơn + Cộng tiền ví)
	// Đã sửa đổi: Gọi chính xác hàm ProcessNFBankDepositWebhook và truyền đủ tham số đối soát
	err := h.walletService.ProcessNFBankDepositWebhook(c.Request.Context(), payload.OrderId, payload.Amount, payload.ResultCode)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Lỗi xử lý giao dịch hệ thống"})
		return
	}

	// Trả về chuỗi "OK" với trạng thái HTTP 200 theo đúng yêu cầu spec của NF Bank
	c.String(http.StatusOK, "OK")
}
