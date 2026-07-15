package service

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"Music_Streaming_System/apps/wallet/internal/config"
	"Music_Streaming_System/apps/wallet/internal/domain"
	walletpb "Music_Streaming_System/packages/shared-proto/wallet"
)

// WalletService hiện thực hóa gRPC Server interface được sinh ra từ file .proto
type WalletService struct {
	walletpb.UnimplementedWalletServiceServer
	repo       domain.WalletRepository
	db         *sql.DB
	cfg        *config.Config
	httpClient *http.Client
}

// NewWalletService khởi tạo Service với đầy đủ kết nối Repo, DB và Config
func NewWalletService(repo domain.WalletRepository, db *sql.DB, cfg *config.Config) *WalletService {
	return &WalletService{
		repo:       repo,
		db:         db,
		cfg:        cfg,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// GetConfig hỗ trợ lấy thông tin cấu hình phục vụ các tầng bên ngoài (ví dụ: HTTP Delivery Handler)
func (s *WalletService) GetConfig() *config.Config {
	return s.cfg
}

// CreateWallet
func (s *WalletService) CreateWallet(ctx context.Context, req *walletpb.CreateWalletRequest) (*walletpb.CreateWalletResponse, error) {
	if req.UserId == "" {
		return nil, errors.New("user_id cannot be empty")
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("Failed to begin tx: %w", err)
	}
	defer tx.Rollback()

	newWallet := &domain.Wallet{
		UserID:        req.UserId,
		CoinBalance:   0,
		FrozenBalance: 0,
		CurrencyType:  "VND",
		Status:        "ACTIVE",
		Version:       1,
		Signature:     "TEMPORARY_SIGNATURE",
	}

	realID, err := s.repo.CreateWalletTx(ctx, tx, newWallet)
	if err != nil {
		return nil, fmt.Errorf("Failed to insert wallet: %w", err)
	}

	if realID == "" {
		return &walletpb.CreateWalletResponse{
			Status:  "SUCCESS",
			Message: "Wallet already exists",
		}, nil
	}

	newWallet.ID = realID

	finalSignature := s.generateSignature(newWallet.ID, newWallet.UserID, newWallet.CoinBalance, newWallet.FrozenBalance, newWallet.Version, newWallet.CurrencyType, newWallet.Status)

	err = s.repo.UpdateBalanceTx(ctx, tx, newWallet.ID, newWallet.CoinBalance, newWallet.Version, finalSignature, newWallet.Version)
	if err != nil {
		return nil, fmt.Errorf("Failed to update final signature: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("Failed to commit tx: %w", err)
	}

	return &walletpb.CreateWalletResponse{
		Status:  "SUCCESS",
		Message: "Wallet created successfully with absolute secure signature",
	}, nil
}

// GetBalance: Lấy số dư ví của User và xác thực chữ ký dữ liệu
func (s *WalletService) GetBalance(ctx context.Context, req *walletpb.GetBalanceRequest) (*walletpb.GetBalanceResponse, error) {
	if req.UserId == "" {
		return nil, errors.New("user_id cannot be empty")
	}

	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, fmt.Errorf("Failed to begin read transaction: %w", err)
	}
	defer tx.Rollback()

	wallet, err := s.repo.GetByUserIdTx(ctx, tx, req.UserId)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("Wallet not found")
		}
		return nil, err
	}

	if !s.verifySignature(wallet) {
		return nil, errors.New("Critical error: Wallet data tampering detected")
	}

	return &walletpb.GetBalanceResponse{
		CoinBalance:   wallet.CoinBalance,
		FrozenBalance: wallet.FrozenBalance,
	}, nil
}

// DebitWallet: Trừ tiền từ ví (Thanh toán nội bộ bằng Coin)
func (s *WalletService) DebitWallet(ctx context.Context, req *walletpb.DebitWalletRequest) (*walletpb.DebitWalletResponse, error) {
	if req.Amount <= 0 {
		return nil, errors.New("Amount must be greater than zero")
	}
	if req.IdempotencyKey == "" {
		return nil, errors.New("idempotency_key is required")
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("Failed to start write tx: %w", err)
	}
	defer tx.Rollback()

	var existID string
	var existTxType string
	err = tx.QueryRowContext(ctx, "SELECT id, transaction_type FROM wallet_transactions WHERE idempotency_key = $1", req.IdempotencyKey).Scan(&existID, &existTxType)
	if err == nil {
		return &walletpb.DebitWalletResponse{
			TransactionId: fmt.Sprintf("TX-%s-%s", existTxType, existID),
			Status:        "SUCCESS",
		}, nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("Failed to check idempotency key: %w", err)
	}

	wallet, err := s.repo.GetByUserIdForUpdateTx(ctx, tx, req.UserId)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("Wallet not found")
		}
		return nil, fmt.Errorf("Failed to get wallet: %w", err)
	}

	if !s.verifySignature(wallet) {
		return nil, errors.New("Critical: Secure signature validation failed")
	}

	if wallet.CoinBalance < req.Amount {
		return nil, errors.New("Insufficient balance")
	}

	balanceBefore := wallet.CoinBalance
	balanceAfter := wallet.CoinBalance - req.Amount
	newVersion := wallet.Version + 1
	newSignature := s.generateSignature(wallet.ID, wallet.UserID, balanceAfter, wallet.FrozenBalance, newVersion, wallet.CurrencyType, wallet.Status)

	err = s.repo.UpdateBalanceTx(ctx, tx, wallet.ID, balanceAfter, newVersion, newSignature, wallet.Version)
	if err != nil {
		return nil, fmt.Errorf("Failed to update user balance: %w", err)
	}

	txLog := &domain.TransactionLog{
		WalletID:        wallet.ID,
		Amount:          req.Amount,
		BalanceBefore:   balanceBefore,
		BalanceAfter:    balanceAfter,
		TransactionType: domain.TxTypeDebit,
		Status:          "SUCCESS",
		IdempotencyKey:  req.IdempotencyKey,
		Description:     req.Description,
	}
	if err := s.repo.CreateTransactionTx(ctx, tx, txLog); err != nil {
		return nil, fmt.Errorf("Failed to log wallet transaction: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("Failed to commit transaction: %w", err)
	}

	return &walletpb.DebitWalletResponse{
		TransactionId: fmt.Sprintf("TX-%s-%s", txLog.TransactionType, txLog.ID),
		Status:        "SUCCESS",
	}, nil
}

// ==============================================================================
// CORE GATEWAY ROUTER SECTION (IMPLEMENTING STRATEGY PATTERN / PAYMENT METHOD)
// ==============================================================================

// CreateDepositOrder: Hàm gRPC chính nhận diện và điều hướng cổng thanh toán tương ứng
func (s *WalletService) CreateDepositOrder(ctx context.Context, req *walletpb.DepositOrderRequest) (*walletpb.DepositOrderResponse, error) {
	if req.UserId == "" {
		return nil, errors.New("user_id cannot be empty")
	}

	if req.AmountVnd <= 0 {
		return nil, errors.New("Deposit amount must be greater than zero")
	}

	switch req.PaymentMethod {
	case "MOMO":
		return s.createMomoDepositOrder(ctx, req)
	case "NFBANK":
		return s.createNFBankDepositOrder(ctx, req)
	default:
		return nil, fmt.Errorf("Unsupported payment method: %s", req.PaymentMethod)
	}
}

// ==============================================================================
// MOMO PAYMENT GATEWAY IMPLEMENTATION
// ==============================================================================

type MomoRequest struct {
	PartnerCode string `json:"partnerCode"`
	RequestType string `json:"requestType"`
	IPNUrl      string `json:"ipnUrl"`
	RedirectUrl string `json:"redirectUrl"`
	OrderId     string `json:"orderId"`
	Amount      string `json:"amount"`
	OrderInfo   string `json:"orderInfo"`
	RequestId   string `json:"requestId"`
	ExtraData   string `json:"extraData"`
	Signature   string `json:"signature"`
	Lang        string `json:"lang"`
}

type MomoResponse struct {
	PayUrl     string `json:"payUrl"`
	ResultCode int    `json:"resultCode"`
	Message    string `json:"message"`
}

func (s *WalletService) createMomoDepositOrder(ctx context.Context, req *walletpb.DepositOrderRequest) (*walletpb.DepositOrderResponse, error) {
	wallet, err := s.repo.GetByUserIdTx(ctx, nil, req.UserId)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("Wallet not found for this user")
		}
		return nil, fmt.Errorf("Failed to find wallet: %w", err)
	}

	var rateVnd int64 = 1000
	var rateCoin int64 = 1
	err = s.db.QueryRowContext(ctx, "SELECT amount_vnd, coin_amount FROM coin_rates WHERE is_active = true AND effective_at <= NOW() ORDER BY effective_at DESC LIMIT 1").Scan(&rateVnd, &rateCoin)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("Failed to fetch exchange rates: %w", err)
	}

	coinAmount := (req.AmountVnd * rateCoin) / rateVnd
	orderCode := fmt.Sprintf("MOMO-%d", time.Now().UnixNano())

	order := &domain.BankPaymentOrder{
		UserID:            req.UserId,
		WalletID:          wallet.ID,
		OrderCode:         orderCode,
		AmountVnd:         req.AmountVnd,
		CoinAmount:        coinAmount,
		BankAccountNumber: "",
		BankTxReference:   "",
		Status:            domain.OrderStatusPending,
		CallbackLogs:      "",
	}
	if err := s.repo.CreateDepositOrderTx(ctx, nil, order); err != nil {
		return nil, fmt.Errorf("Failed to save payment order: %w", err)
	}

	orderInfo := fmt.Sprintf("Nạp %d Coin vào hệ thống Music Streaming", coinAmount)
	requestId := orderCode
	extraData := ""
	amountStr := fmt.Sprintf("%d", req.AmountVnd)

	rawSignature := fmt.Sprintf(
		"accessKey=%s&amount=%s&extraData=%s&ipnUrl=%s&orderId=%s&orderInfo=%s&partnerCode=%s&redirectUrl=%s&requestId=%s&requestType=%s",
		s.cfg.MomoAccessKey, amountStr, extraData, s.cfg.MomoNotifyURL, orderCode, orderInfo, s.cfg.MomoPartnerCode, s.cfg.MomoRedirectURL, requestId, "captureWallet",
	)

	h := hmac.New(sha256.New, []byte(s.cfg.MomoSecretKey))
	h.Write([]byte(rawSignature))
	momoSignature := hex.EncodeToString(h.Sum(nil))

	momoBody := MomoRequest{
		PartnerCode: s.cfg.MomoPartnerCode,
		RequestId:   requestId,
		Amount:      amountStr,
		OrderId:     orderCode,
		OrderInfo:   orderInfo,
		RedirectUrl: s.cfg.MomoRedirectURL,
		IPNUrl:      s.cfg.MomoNotifyURL,
		ExtraData:   extraData,
		RequestType: "captureWallet",
		Signature:   momoSignature,
		Lang:        "vi",
	}

	jsonValue, _ := json.Marshal(momoBody)

	resp, err := s.httpClient.Post(s.cfg.MomoAPIURL, "application/json", bytes.NewBuffer(jsonValue))
	if err != nil {
		return nil, fmt.Errorf("Network error connecting to MoMo API: %w", err)
	}
	defer resp.Body.Close()

	var momoResp MomoResponse
	if err := json.NewDecoder(resp.Body).Decode(&momoResp); err != nil {
		return nil, fmt.Errorf("Failed to decode momo response: %w", err)
	}

	if momoResp.ResultCode != 0 {
		return nil, fmt.Errorf("Momo gateway rejected request: %s", momoResp.Message)
	}

	return &walletpb.DepositOrderResponse{
		OrderId:    orderCode,
		PaymentUrl: momoResp.PayUrl,
	}, nil
}

func (s *WalletService) ProcessDepositWebhook(ctx context.Context, orderID string, amountVnd int64, resultCode int) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("Failed to start webhook tx: %w", err)
	}
	defer tx.Rollback()

	order, err := s.repo.GetDepositOrderByCodeTx(ctx, tx, orderID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("Payment order not found with code: %s", orderID)
		}
		return fmt.Errorf("Failed to check payment order: %w", err)
	}

	if order.Status == domain.OrderStatusSuccess || order.Status == domain.OrderStatusFailed {
		return nil
	}

	status := domain.OrderStatusFailed
	if resultCode == 0 {
		status = domain.OrderStatusSuccess
	}

	err = s.repo.UpdateDepositOrderStatusByCodeTx(ctx, tx, order.OrderCode, status)
	if err != nil {
		return fmt.Errorf("Failed to update order status: %w", err)
	}

	if resultCode != 0 {
		return tx.Commit()
	}

	wallet, err := s.repo.GetByUserIdForUpdateTx(ctx, tx, order.UserID)
	if err != nil {
		return fmt.Errorf("Failed to lock user wallet for deposit: %w", err)
	}

	if !s.verifySignature(wallet) {
		return errors.New("Critical: Secure signature validation failed during deposit")
	}

	balanceBefore := wallet.CoinBalance
	balanceAfter := wallet.CoinBalance + order.CoinAmount
	newVersion := wallet.Version + 1
	newSignature := s.generateSignature(wallet.ID, wallet.UserID, balanceAfter, wallet.FrozenBalance, newVersion, wallet.CurrencyType, wallet.Status)

	err = s.repo.UpdateBalanceTx(ctx, tx, wallet.ID, balanceAfter, newVersion, newSignature, wallet.Version)
	if err != nil {
		return fmt.Errorf("Deposit transaction conflict, failed to update balance: %w", err)
	}

	refID := order.ID
	txLog := &domain.TransactionLog{
		WalletID:        wallet.ID,
		Amount:          order.CoinAmount,
		BalanceBefore:   balanceBefore,
		BalanceAfter:    balanceAfter,
		TransactionType: domain.TxTypeCredit,
		Status:          "SUCCESS",
		ReferenceType:   "MOMO_ORDER",
		ReferenceID:     &refID,
		IdempotencyKey:  order.OrderCode,
		Description:     fmt.Sprintf("Nạp thành công %d Coin từ MoMo", order.CoinAmount),
	}
	if err := s.repo.CreateTransactionTx(ctx, tx, txLog); err != nil {
		return fmt.Errorf("Failed to log deposit transaction: %w", err)
	}

	return tx.Commit()
}

// ==============================================================================
// NF BANK PAYMENT GATEWAY IMPLEMENTATION
// ==============================================================================

type NFBankCreateRequest struct {
	PartnerCode string `json:"partnerCode"`
	AccessKey   string `json:"accessKey"`
	RequestId   string `json:"requestId"`
	Amount      int64  `json:"amount"`
	OrderId     string `json:"orderId"`
	OrderInfo   string `json:"orderInfo"`
	RedirectUrl string `json:"redirectUrl"`
	IpnUrl      string `json:"ipnUrl"`
	ExtraData   string `json:"extraData"`
	Signature   string `json:"signature"`
}

type NFBankCreateResponse struct {
	ResultCode int    `json:"resultCode"`
	Message    string `json:"message"`
	PayUrl     string `json:"payUrl"`
}

func (s *WalletService) createNFBankDepositOrder(ctx context.Context, req *walletpb.DepositOrderRequest) (*walletpb.DepositOrderResponse, error) {
	wallet, err := s.repo.GetByUserIdTx(ctx, nil, req.UserId)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("Wallet not found for this user")
		}
		return nil, fmt.Errorf("Failed to find wallet: %w", err)
	}

	var rateVnd int64 = 1000
	var rateCoin int64 = 1
	err = s.db.QueryRowContext(ctx, "SELECT amount_vnd, coin_amount FROM coin_rates WHERE is_active = true AND effective_at <= NOW() ORDER BY effective_at DESC LIMIT 1").Scan(&rateVnd, &rateCoin)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("Failed to fetch exchange rates: %w", err)
	}

	coinAmount := (req.AmountVnd * rateCoin) / rateVnd
	orderCode := fmt.Sprintf("NFBANK-%d", time.Now().UnixNano())

	order := &domain.BankPaymentOrder{
		UserID:            req.UserId,
		WalletID:          wallet.ID,
		OrderCode:         orderCode,
		AmountVnd:         req.AmountVnd,
		CoinAmount:        coinAmount,
		BankAccountNumber: "",
		BankTxReference:   "",
		Status:            domain.OrderStatusPending,
		CallbackLogs:      "",
	}
	if err := s.repo.CreateDepositOrderTx(ctx, nil, order); err != nil {
		return nil, fmt.Errorf("Failed to save payment order: %w", err)
	}

	orderInfo := fmt.Sprintf("Nạp %d Coin vào hệ thống Music Streaming qua NF-Bank", coinAmount)
	requestId := fmt.Sprintf("REQ_%s", orderCode)

	extraMap := map[string]string{"userId": req.UserId}
	extraDataBytes, _ := json.Marshal(extraMap)
	extraData := string(extraDataBytes)

	rawSignature := fmt.Sprintf(
		"accessKey=%s&amount=%d&extraData=%s&ipnUrl=%s&orderId=%s&orderInfo=%s&partnerCode=%s&redirectUrl=%s&requestId=%s",
		s.cfg.NFBankAccessKey, req.AmountVnd, extraData, s.cfg.NFBankNotifyURL, orderCode, orderInfo, s.cfg.NFBankPartnerCode, s.cfg.NFBankRedirectURL, requestId,
	)

	h := hmac.New(sha256.New, []byte(s.cfg.NFBankSecretKey))
	h.Write([]byte(rawSignature))
	nfBankSignature := hex.EncodeToString(h.Sum(nil))

	nfBankBody := NFBankCreateRequest{
		PartnerCode: s.cfg.NFBankPartnerCode,
		AccessKey:   s.cfg.NFBankAccessKey,
		RequestId:   requestId,
		Amount:      req.AmountVnd,
		OrderId:     orderCode,
		OrderInfo:   orderInfo,
		RedirectUrl: s.cfg.NFBankRedirectURL,
		IpnUrl:      s.cfg.NFBankNotifyURL,
		ExtraData:   extraData,
		Signature:   nfBankSignature,
	}

	jsonValue, _ := json.Marshal(nfBankBody)

	resp, err := s.httpClient.Post(fmt.Sprintf("%s/payments/create", s.cfg.NFBankAPIURL), "application/json", bytes.NewBuffer(jsonValue))
	if err != nil {
		return nil, fmt.Errorf("Network error connecting to NF Bank API: %w", err)
	}
	defer resp.Body.Close()

	var nfBankResp NFBankCreateResponse
	if err := json.NewDecoder(resp.Body).Decode(&nfBankResp); err != nil {
		return nil, fmt.Errorf("Failed to decode NF Bank response: %w", err)
	}

	if nfBankResp.ResultCode != 0 {
		return nil, fmt.Errorf("NF Bank gateway rejected request: %s", nfBankResp.Message)
	}

	return &walletpb.DepositOrderResponse{
		OrderId:    orderCode,
		PaymentUrl: nfBankResp.PayUrl,
	}, nil
}

func (s *WalletService) ProcessNFBankDepositWebhook(ctx context.Context, orderID string, amountVnd int64, resultCode int) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("Failed to start webhook tx: %w", err)
	}
	defer tx.Rollback()

	order, err := s.repo.GetDepositOrderByCodeTx(ctx, tx, orderID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("Payment order not found with code: %s", orderID)
		}
		return fmt.Errorf("Failed to check payment order: %w", err)
	}

	if order.Status == domain.OrderStatusSuccess || order.Status == domain.OrderStatusFailed {
		return nil
	}

	status := domain.OrderStatusFailed
	if resultCode == 0 {
		status = domain.OrderStatusSuccess
	}

	err = s.repo.UpdateDepositOrderStatusByCodeTx(ctx, tx, order.OrderCode, status)
	if err != nil {
		return fmt.Errorf("Failed to update order status: %w", err)
	}

	if resultCode != 0 {
		return tx.Commit()
	}

	wallet, err := s.repo.GetByUserIdForUpdateTx(ctx, tx, order.UserID)
	if err != nil {
		return fmt.Errorf("Failed to lock user wallet for deposit: %w", err)
	}

	if !s.verifySignature(wallet) {
		return errors.New("Critical: Secure signature validation failed during deposit")
	}

	balanceBefore := wallet.CoinBalance
	balanceAfter := wallet.CoinBalance + order.CoinAmount
	newVersion := wallet.Version + 1
	newSignature := s.generateSignature(wallet.ID, wallet.UserID, balanceAfter, wallet.FrozenBalance, newVersion, wallet.CurrencyType, wallet.Status)

	err = s.repo.UpdateBalanceTx(ctx, tx, wallet.ID, balanceAfter, newVersion, newSignature, wallet.Version)
	if err != nil {
		return fmt.Errorf("Deposit transaction conflict, failed to update balance: %w", err)
	}

	refID := order.ID
	txLog := &domain.TransactionLog{
		WalletID:        wallet.ID,
		Amount:          order.CoinAmount,
		BalanceBefore:   balanceBefore,
		BalanceAfter:    balanceAfter,
		TransactionType: domain.TxTypeCredit,
		Status:          "SUCCESS",
		ReferenceType:   "NFBANK_ORDER",
		ReferenceID:     &refID,
		IdempotencyKey:  order.OrderCode,
		Description:     fmt.Sprintf("Nạp thành công %d Coin từ NF-Bank", order.CoinAmount),
	}
	if err := s.repo.CreateTransactionTx(ctx, tx, txLog); err != nil {
		return fmt.Errorf("Failed to log deposit transaction: %w", err)
	}

	return tx.Commit()
}

// --- Crypto Helper Functions ---

func (s *WalletService) generateSignature(id string, userID string, balance int64, frozen int64, version int64, currencyType string, status string) string {
	payload := fmt.Sprintf("%s|%s|%d|%d|%d|%s|%s", id, userID, balance, frozen, version, currencyType, status)
	h := hmac.New(sha256.New, []byte(s.cfg.SecretKey))
	h.Write([]byte(payload))
	return hex.EncodeToString(h.Sum(nil))
}

func (s *WalletService) verifySignature(w *domain.Wallet) bool {
	expectedSig := s.generateSignature(w.ID, w.UserID, w.CoinBalance, w.FrozenBalance, w.Version, w.CurrencyType, w.Status)
	return hmac.Equal([]byte(w.Signature), []byte(expectedSig))
}
