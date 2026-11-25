package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"time"
)

type momoStatusRequest struct {
	PartnerCode string `json:"partnerCode"`
	RequestID   string `json:"requestId"`
	OrderID     string `json:"orderId"`
	Lang        string `json:"lang"`
	Signature   string `json:"signature"`
}

type momoStatusResponse struct {
	PartnerCode string `json:"partnerCode"`
	RequestID   string `json:"requestId"`
	OrderID     string `json:"orderId"`
	Amount      int64  `json:"amount"`
	ResultCode  *int   `json:"resultCode"`
}

// Only documented final payment results may close an order. API/configuration
// errors and unrecognized codes cannot establish the outcome of a payment.
func isFinalMomoResult(code int) bool {
	switch code {
	case 0, 98, 99, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1017, 1026, 4001, 4002, 4100:
		return true
	default:
		return false
	}
}

func (s *WalletService) reconcileMomoDeposit(ctx context.Context, order RoomTopUpOrder) error {
	if s.cfg == nil || s.cfg.MomoPartnerCode == "" || s.cfg.MomoAccessKey == "" || s.cfg.MomoSecretKey == "" {
		return errors.New("MoMo status lookup is not configured")
	}
	endpoint, err := url.Parse(s.cfg.MomoAPIURL)
	if err != nil || endpoint.Host == "" || (endpoint.Scheme != "https" && !(endpoint.Scheme == "http" && endpoint.Hostname() == "127.0.0.1")) {
		return errors.New("invalid MoMo API URL")
	}
	endpoint.Path = "/v2/gateway/api/query"
	endpoint.RawQuery = ""
	endpoint.Fragment = ""
	requestID, err := newPaymentOrderCode("QUERY")
	if err != nil {
		return err
	}
	raw := fmt.Sprintf("accessKey=%s&orderId=%s&partnerCode=%s&requestId=%s", s.cfg.MomoAccessKey, order.OrderID, s.cfg.MomoPartnerCode, requestID)
	mac := hmac.New(sha256.New, []byte(s.cfg.MomoSecretKey))
	mac.Write([]byte(raw))
	request := momoStatusRequest{PartnerCode: s.cfg.MomoPartnerCode, RequestID: requestID, OrderID: order.OrderID, Lang: "en", Signature: hex.EncodeToString(mac.Sum(nil))}
	var response momoStatusResponse
	if err := s.postJSON(ctx, endpoint.String(), request, &response, 30*time.Second); err != nil {
		return err
	}
	if response.ResultCode == nil || response.PartnerCode != request.PartnerCode || response.RequestID != requestID || response.OrderID != order.OrderID || response.Amount != order.AmountVnd {
		return errors.New("MoMo status response does not match the payment order")
	}
	code := *response.ResultCode
	if !isFinalMomoResult(code) {
		if code == 1000 || code == 7000 || code == 7002 || code == 9000 {
			return nil
		}
		return errors.New("MoMo could not confirm the payment outcome")
	}
	// The webhook processor locks the order and wallet, validates the amount,
	// and credits at most once even when IPN arrives during this lookup.
	return s.ProcessDepositWebhook(ctx, order.OrderID, response.Amount, code)
}
