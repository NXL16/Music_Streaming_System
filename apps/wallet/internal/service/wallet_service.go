package service

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
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

var (
	ErrActiveCoinRateNotFound = errors.New("no active coin exchange rate is available")
	ErrInvalidActiveCoinRate  = errors.New("active coin exchange rate is invalid")
	ErrWebhookAmountMismatch  = errors.New("webhook amount does not match payment order")
	ErrWalletBalanceOverflow  = errors.New("wallet balance credit overflows int64")
	ErrWalletVersionOverflow  = errors.New("wallet version increment overflows int64")
	ErrIdempotencyKeyConflict = errors.New("idempotency key conflicts with a different debit request")
)

const maxGatewayResponseBytes int64 = 64 * 1024

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
	walletID, err := newWalletID()
	if err != nil {
		return nil, fmt.Errorf("generate wallet id: %w", err)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("Failed to begin tx: %w", err)
	}
	defer tx.Rollback()

	newWallet := &domain.Wallet{
		ID:            walletID,
		UserID:        req.UserId,
		CoinBalance:   0,
		FrozenBalance: 0,
		CurrencyType:  "VND",
		Status:        "ACTIVE",
		Version:       1,
	}
	newWallet.Signature = s.generateSignature(newWallet.ID, newWallet.UserID, newWallet.CoinBalance, newWallet.FrozenBalance, newWallet.Version, newWallet.CurrencyType, newWallet.Status)

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

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("Failed to commit tx: %w", err)
	}

	return &walletpb.CreateWalletResponse{
		Status:  "SUCCESS",
		Message: "Wallet created successfully with absolute secure signature",
	}, nil
}

func newWalletID() (string, error) {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", err
	}
	value[6] = (value[6] & 0x0f) | 0x40
	value[8] = (value[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", value[:4], value[4:6], value[6:8], value[8:10], value[10:]), nil
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
	if req.UserId == "" {
		return nil, errors.New("user_id cannot be empty")
	}
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

	wallet, err := s.repo.GetByUserIdForUpdateTx(ctx, tx, req.UserId)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("Wallet not found")
		}
		return nil, fmt.Errorf("Failed to get wallet: %w", err)
	}

	var existID, existingWalletID, existTxType, existingDescription string
	var existingAmount int64
	err = tx.QueryRowContext(
		ctx,
		`SELECT id, wallet_id, amount, transaction_type, COALESCE(description, '')
		 FROM wallet_transactions
		 WHERE idempotency_key = $1`,
		req.IdempotencyKey,
	).Scan(&existID, &existingWalletID, &existingAmount, &existTxType, &existingDescription)
	if err == nil {
		if existingWalletID != wallet.ID ||
			existingAmount != req.Amount ||
			existTxType != domain.TxTypeDebit ||
			existingDescription != req.Description {
			return nil, ErrIdempotencyKeyConflict
		}
		return &walletpb.DebitWalletResponse{
			TransactionId: fmt.Sprintf("TX-%s-%s", existTxType, existID),
			Status:        "SUCCESS",
		}, nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("Failed to check idempotency key: %w", err)
	}

	if !s.verifySignature(wallet) {
		return nil, errors.New("Critical: Secure signature validation failed")
	}

	if wallet.CoinBalance < req.Amount {
		return nil, errors.New("Insufficient balance")
	}

	balanceBefore := wallet.CoinBalance
	balanceAfter := wallet.CoinBalance - req.Amount
	newVersion, err := nextWalletVersion(wallet.Version)
	if err != nil {
		return nil, err
	}
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

// coinAmountForDeposit snapshots the currently active exchange rate before an
// order is persisted. Orders retain that calculated coin amount, so a later
// rate change cannot alter a payment that is already in progress.
func (s *WalletService) coinAmountForDeposit(ctx context.Context, amountVnd int64) (int64, error) {
	var rateVnd, rateCoin int64
	err := s.db.QueryRowContext(ctx, `
		SELECT amount_vnd, coin_amount
		FROM coin_rates
		WHERE is_active = true AND effective_at <= NOW()
		ORDER BY effective_at DESC
		LIMIT 1`).Scan(&rateVnd, &rateCoin)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrActiveCoinRateNotFound
	}
	if err != nil {
		return 0, fmt.Errorf("fetch active exchange rate: %w", err)
	}

	coinAmount, err := calculateCoinAmount(amountVnd, rateVnd, rateCoin)
	if err != nil {
		return 0, err
	}
	return coinAmount, nil
}

func calculateCoinAmount(amountVnd, rateVnd, rateCoin int64) (int64, error) {
	if rateVnd <= 0 || rateCoin <= 0 {
		return 0, fmt.Errorf("%w: amount_vnd=%d, coin_amount=%d", ErrInvalidActiveCoinRate, rateVnd, rateCoin)
	}
	if amountVnd <= 0 {
		return 0, errors.New("deposit amount must be greater than zero")
	}
	if amountVnd > math.MaxInt64/rateCoin {
		return 0, fmt.Errorf("%w: conversion overflows int64", ErrInvalidActiveCoinRate)
	}

	coinAmount := amountVnd * rateCoin / rateVnd
	if coinAmount <= 0 {
		return 0, fmt.Errorf("%w: deposit amount does not convert to a positive coin amount", ErrInvalidActiveCoinRate)
	}
	return coinAmount, nil
}

// coinAmountForWithdrawal rounds up so a withdrawal can never pay out more VND
// than the Coin value debited from the user's wallet.
func (s *WalletService) coinAmountForWithdrawal(ctx context.Context, amountVnd int64) (int64, error) {
	var rateVnd, rateCoin int64
	err := s.db.QueryRowContext(ctx, `
		SELECT amount_vnd, coin_amount FROM coin_rates
		WHERE is_active = true AND effective_at <= NOW()
		ORDER BY effective_at DESC LIMIT 1`).Scan(&rateVnd, &rateCoin)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrActiveCoinRateNotFound
	}
	if err != nil {
		return 0, fmt.Errorf("fetch active exchange rate: %w", err)
	}
	return calculateWithdrawalCoinAmount(amountVnd, rateVnd, rateCoin)
}

func calculateWithdrawalCoinAmount(amountVnd, rateVnd, rateCoin int64) (int64, error) {
	if rateVnd <= 0 || rateCoin <= 0 || amountVnd <= 0 || amountVnd > math.MaxInt64/rateCoin {
		return 0, ErrInvalidActiveCoinRate
	}
	product := amountVnd * rateCoin
	coinAmount := product / rateVnd
	if product%rateVnd != 0 {
		coinAmount++
	}
	return coinAmount, nil
}

func (s *WalletService) createPendingDepositOrder(ctx context.Context, req *walletpb.DepositOrderRequest, provider string) (*domain.BankPaymentOrder, error) {
	wallet, err := s.repo.GetByUserIdTx(ctx, nil, req.UserId)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("wallet not found for this user")
		}
		return nil, fmt.Errorf("find wallet: %w", err)
	}

	coinAmount, err := s.coinAmountForDeposit(ctx, req.AmountVnd)
	if err != nil {
		return nil, err
	}
	orderCode, err := newPaymentOrderCode(provider)
	if err != nil {
		return nil, err
	}

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
		return nil, fmt.Errorf("save payment order: %w", err)
	}

	return order, nil
}

func newPaymentOrderCode(provider string) (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("generate payment order code: %w", err)
	}
	return fmt.Sprintf("%s-%s", provider, hex.EncodeToString(bytes)), nil
}

func validateWebhookAmount(expectedAmount, callbackAmount int64) error {
	if callbackAmount != expectedAmount {
		return fmt.Errorf("%w: received=%d, expected=%d", ErrWebhookAmountMismatch, callbackAmount, expectedAmount)
	}
	return nil
}

func creditWalletBalance(balance, credit int64) (int64, error) {
	if balance < 0 || credit <= 0 || balance > math.MaxInt64-credit {
		return 0, ErrWalletBalanceOverflow
	}

	return balance + credit, nil
}

func nextWalletVersion(version int64) (int64, error) {
	if version < 0 || version == math.MaxInt64 {
		return 0, ErrWalletVersionOverflow
	}

	return version + 1, nil
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
	AutoCapture bool   `json:"autoCapture,omitempty"`
}

type MomoResponse struct {
	PayUrl     string `json:"payUrl"`
	ResultCode int    `json:"resultCode"`
	Message    string `json:"message"`
	QRCodeURL  string `json:"qrCodeUrl"`
}

func (s *WalletService) createMomoDepositOrder(ctx context.Context, req *walletpb.DepositOrderRequest) (*walletpb.DepositOrderResponse, error) {
	order, err := s.createPendingDepositOrder(ctx, req, "MOMO")
	if err != nil {
		return nil, fmt.Errorf("cannot create MoMo deposit order: %w", err)
	}
	orderCode := order.OrderCode
	coinAmount := order.CoinAmount

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

	var momoResp MomoResponse
	if err := s.postJSON(ctx, s.cfg.MomoAPIURL, momoBody, &momoResp); err != nil {
		return nil, fmt.Errorf("MoMo create order request: %w", err)
	}

	if momoResp.ResultCode != 0 {
		return nil, fmt.Errorf("Momo gateway rejected request: %s", momoResp.Message)
	}
	if momoResp.PayUrl == "" {
		return nil, errors.New("MoMo gateway response is missing payUrl")
	}

	return &walletpb.DepositOrderResponse{
		OrderId:    orderCode,
		PaymentUrl: momoResp.PayUrl,
	}, nil
}

func (s *WalletService) ProcessDepositWebhook(ctx context.Context, orderID string, amountVnd int64, resultCode int) error {
	return s.processDepositWebhook(ctx, orderID, amountVnd, resultCode, "MOMO_ORDER", "MoMo")
}

func (s *WalletService) processDepositWebhook(ctx context.Context, orderID string, amountVnd int64, resultCode int, referenceType, gatewayName string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("Failed to start webhook tx: %w", err)
	}
	defer tx.Rollback()

	// Lock the order before reading its status. Concurrent delivery attempts for
	// the same provider order serialize here; only the callback that first turns
	// a PENDING order into SUCCESS can proceed to credit the wallet.
	order, err := s.repo.GetDepositOrderByCodeForUpdateTx(ctx, tx, orderID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("Payment order not found with code: %s", orderID)
		}
		return fmt.Errorf("Failed to check payment order: %w", err)
	}

	// A verified signature alone is insufficient: the payment must match the
	// amount fixed when the local order was created. Check it before any status
	// transition, including failed callbacks, so a malformed provider callback
	// cannot finalize the order.
	if err := validateWebhookAmount(order.AmountVnd, amountVnd); err != nil {
		return err
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
	balanceAfter, err := creditWalletBalance(wallet.CoinBalance, order.CoinAmount)
	if err != nil {
		return err
	}
	newVersion, err := nextWalletVersion(wallet.Version)
	if err != nil {
		return err
	}
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
		ReferenceType:   referenceType,
		ReferenceID:     &refID,
		IdempotencyKey:  order.OrderCode,
		Description:     fmt.Sprintf("Nạp thành công %d Coin từ %s", order.CoinAmount, gatewayName),
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
	if s.cfg.NFBankPartnerCode == "" || s.cfg.NFBankAccessKey == "" || s.cfg.NFBankSecretKey == "" || s.cfg.NFBankAPIURL == "" || s.cfg.NFBankRedirectURL == "" || s.cfg.NFBankNotifyURL == "" {
		return nil, errors.New("NF-Bank payment gateway is not fully configured")
	}

	order, err := s.createPendingDepositOrder(ctx, req, "NFBANK")
	if err != nil {
		return nil, fmt.Errorf("cannot create NF-Bank deposit order: %w", err)
	}
	orderCode := order.OrderCode
	coinAmount := order.CoinAmount

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

	var nfBankResp NFBankCreateResponse
	apiURL := strings.TrimRight(s.cfg.NFBankAPIURL, "/")
	if err := s.postJSON(
		ctx,
		fmt.Sprintf("%s/payments/create", apiURL),
		nfBankBody,
		&nfBankResp,
	); err != nil {
		return nil, fmt.Errorf("NF-Bank create order request: %w", err)
	}

	if nfBankResp.ResultCode != 0 {
		return nil, fmt.Errorf("NF Bank gateway rejected request: %s", nfBankResp.Message)
	}
	if nfBankResp.PayUrl == "" {
		return nil, errors.New("NF-Bank gateway response is missing payUrl")
	}

	return &walletpb.DepositOrderResponse{
		OrderId:    orderCode,
		PaymentUrl: nfBankResp.PayUrl,
	}, nil
}

func (s *WalletService) ProcessNFBankDepositWebhook(ctx context.Context, orderID string, amountVnd int64, resultCode int) error {
	return s.processDepositWebhook(ctx, orderID, amountVnd, resultCode, "NFBANK_ORDER", "NF-Bank")
}

type nfBankVerifyAccountRequest struct {
	PartnerCode   string `json:"partnerCode"`
	AccessKey     string `json:"accessKey"`
	RequestID     string `json:"requestId"`
	AccountNumber string `json:"accountNumber"`
	Signature     string `json:"signature"`
}

type nfBankVerifyAccountResponse struct {
	ResultCode  int    `json:"resultCode"`
	Message     string `json:"message"`
	AccountName string `json:"accountName"`
}

type nfBankPayoutRequest struct {
	PartnerCode   string `json:"partnerCode"`
	AccessKey     string `json:"accessKey"`
	RequestID     string `json:"requestId"`
	OrderID       string `json:"orderId"`
	Amount        int64  `json:"amount"`
	AccountNumber string `json:"accountNumber"`
	OrderInfo     string `json:"orderInfo"`
	Signature     string `json:"signature"`
}

type nfBankPayoutResponse struct {
	ResultCode int    `json:"resultCode"`
	Message    string `json:"message"`
	TransID    string `json:"transId"`
}

func (s *WalletService) nfBankEnabled() error {
	if s.cfg.NFBankPartnerCode == "" || s.cfg.NFBankAccessKey == "" || s.cfg.NFBankSecretKey == "" || s.cfg.NFBankAPIURL == "" {
		return errors.New("NF-Bank payment gateway is not fully configured")
	}
	return nil
}

func (s *WalletService) nfBankSignature(raw string) string {
	h := hmac.New(sha256.New, []byte(s.cfg.NFBankSecretKey))
	h.Write([]byte(raw))
	return hex.EncodeToString(h.Sum(nil))
}

func validNFBankAccountNumber(accountNumber string) bool {
	if len(accountNumber) < 6 || len(accountNumber) > 30 {
		return false
	}
	for _, char := range accountNumber {
		if char < '0' || char > '9' {
			return false
		}
	}
	return true
}

// VerifyNFBankAccount is deliberately server-side: neither access nor secret
// keys are ever exposed to the browser while a customer enters an account.
func (s *WalletService) VerifyNFBankAccount(ctx context.Context, req *walletpb.VerifyNFBankAccountRequest) (*walletpb.VerifyNFBankAccountResponse, error) {
	if err := s.nfBankEnabled(); err != nil {
		return nil, err
	}
	if !validNFBankAccountNumber(req.AccountNumber) {
		return nil, errors.New("invalid NF-Bank account number")
	}
	requestID, err := newPaymentOrderCode("NFVERIFY")
	if err != nil {
		return nil, err
	}
	raw := fmt.Sprintf("accessKey=%s&accountNumber=%s&partnerCode=%s&requestId=%s", s.cfg.NFBankAccessKey, req.AccountNumber, s.cfg.NFBankPartnerCode, requestID)
	body := nfBankVerifyAccountRequest{PartnerCode: s.cfg.NFBankPartnerCode, AccessKey: s.cfg.NFBankAccessKey, RequestID: requestID, AccountNumber: req.AccountNumber, Signature: s.nfBankSignature(raw)}
	var response nfBankVerifyAccountResponse
	if err := s.postJSON(ctx, strings.TrimRight(s.cfg.NFBankAPIURL, "/")+"/payments/verify-account", body, &response); err != nil {
		return nil, fmt.Errorf("NF-Bank verify account request: %w", err)
	}
	if response.ResultCode != 0 || strings.TrimSpace(response.AccountName) == "" {
		return nil, fmt.Errorf("NF-Bank could not verify account: %s", response.Message)
	}
	return &walletpb.VerifyNFBankAccountResponse{AccountName: response.AccountName}, nil
}

func (s *WalletService) CreateNFBankWithdrawal(ctx context.Context, req *walletpb.NFBankWithdrawalRequest) (*walletpb.NFBankWithdrawalResponse, error) {
	if err := s.nfBankEnabled(); err != nil {
		return nil, err
	}
	if req.UserId == "" || req.AmountVnd <= 0 || req.IdempotencyKey == "" {
		return nil, errors.New("invalid NF-Bank withdrawal request")
	}

	accountNumber := req.AccountNumber
	if req.BankAccountId != "" {
		bankAcc, err := s.repo.GetBankAccountByID(ctx, req.BankAccountId, req.UserId)
		if err != nil {
			return nil, fmt.Errorf("không tìm thấy tài khoản ngân hàng liên kết: %w", err)
		}
		accountNumber = bankAcc.AccountNumber
	} else if accountNumber == "" {
		accounts, err := s.repo.GetUserBankAccounts(ctx, req.UserId)
		if err != nil || len(accounts) == 0 {
			return nil, errors.New("vui lòng liên kết tài khoản ngân hàng trước khi rút tiền")
		}
		accountNumber = accounts[0].AccountNumber
	}

	if !validNFBankAccountNumber(accountNumber) {
		return nil, errors.New("số tài khoản NF Bank không hợp lệ")
	}

	walletForPin, err := s.repo.GetByUserIdTx(ctx, nil, req.UserId)
	if err != nil {
		return nil, fmt.Errorf("wallet not found: %w", err)
	}
	if req.Pin == "" || !s.verifyPIN(walletForPin, req.Pin) {
		return nil, errors.New("Mã PIN rút tiền không chính xác")
	}

	// A retry must not require NF-Bank to be available. It also must be scoped
	// to its original request so an idempotency key cannot reveal another user's
	// order or be reused with different payout details.
	var existingOrder, existingStatus, existingTransaction, existingUserID, existingAccount string
	var existingAmount, existingCoin int64
	err = s.db.QueryRowContext(ctx, `SELECT order_code, status, coin_amount, COALESCE(bank_tx_reference, ''), user_id, account_number, amount_vnd FROM nfbank_withdrawal_orders WHERE idempotency_key = $1`, req.IdempotencyKey).Scan(&existingOrder, &existingStatus, &existingCoin, &existingTransaction, &existingUserID, &existingAccount, &existingAmount)
	if err == nil {
		if existingUserID != req.UserId || existingAccount != accountNumber || existingAmount != req.AmountVnd {
			return nil, ErrIdempotencyKeyConflict
		}
		return &walletpb.NFBankWithdrawalResponse{OrderId: existingOrder, Status: existingStatus, CoinAmount: existingCoin, TransactionId: existingTransaction}, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("check withdrawal idempotency: %w", err)
	}
	// Verify immediately before debit, preventing payout to an account which was
	// changed or closed after the UI's earlier verification.
	verified, err := s.VerifyNFBankAccount(ctx, &walletpb.VerifyNFBankAccountRequest{AccountNumber: accountNumber})
	if err != nil {
		return nil, err
	}
	coinAmount, err := s.coinAmountForWithdrawal(ctx, req.AmountVnd)
	if err != nil {
		return nil, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin withdrawal transaction: %w", err)
	}
	defer tx.Rollback()
	wallet, err := s.repo.GetByUserIdForUpdateTx(ctx, tx, req.UserId)
	if err != nil {
		return nil, fmt.Errorf("find wallet: %w", err)
	}
	err = tx.QueryRowContext(ctx, `SELECT order_code, status, coin_amount, COALESCE(bank_tx_reference, ''), user_id, account_number, amount_vnd FROM nfbank_withdrawal_orders WHERE idempotency_key = $1`, req.IdempotencyKey).Scan(&existingOrder, &existingStatus, &existingCoin, &existingTransaction, &existingUserID, &existingAccount, &existingAmount)
	if err == nil {
		if existingUserID != req.UserId || existingAccount != accountNumber || existingAmount != req.AmountVnd {
			return nil, ErrIdempotencyKeyConflict
		}
		return &walletpb.NFBankWithdrawalResponse{OrderId: existingOrder, Status: existingStatus, CoinAmount: existingCoin, TransactionId: existingTransaction}, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("check withdrawal idempotency: %w", err)
	}
	if !s.verifySignature(wallet) {
		return nil, errors.New("wallet signature validation failed")
	}
	if wallet.CoinBalance < coinAmount {
		return nil, errors.New("insufficient balance")
	}
	orderCode, err := newPaymentOrderCode("NFBANK-WITHDRAW")
	if err != nil {
		return nil, err
	}
	balanceAfter := wallet.CoinBalance - coinAmount
	version, err := nextWalletVersion(wallet.Version)
	if err != nil {
		return nil, err
	}
	if err := s.repo.UpdateBalanceTx(ctx, tx, wallet.ID, balanceAfter, version, s.generateSignature(wallet.ID, wallet.UserID, balanceAfter, wallet.FrozenBalance, version, wallet.CurrencyType, wallet.Status), wallet.Version); err != nil {
		return nil, err
	}
	var withdrawalID string
	err = tx.QueryRowContext(ctx, `INSERT INTO nfbank_withdrawal_orders (user_id, wallet_id, order_code, idempotency_key, account_number, account_name, amount_vnd, coin_amount, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING') RETURNING id`, req.UserId, wallet.ID, orderCode, req.IdempotencyKey, accountNumber, verified.AccountName, req.AmountVnd, coinAmount).Scan(&withdrawalID)
	if err != nil {
		return nil, fmt.Errorf("create withdrawal order: %w", err)
	}
	if err := s.repo.CreateTransactionTx(ctx, tx, &domain.TransactionLog{WalletID: wallet.ID, Amount: coinAmount, BalanceBefore: wallet.CoinBalance, BalanceAfter: balanceAfter, TransactionType: domain.TxTypeDebit, Status: "SUCCESS", ReferenceType: "NFBANK_WITHDRAWAL", ReferenceID: &withdrawalID, IdempotencyKey: "withdrawal:" + req.IdempotencyKey, Description: fmt.Sprintf("Rút %d VND qua NF-Bank", req.AmountVnd)}); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}

	requestID := "REQ_" + orderCode
	raw := fmt.Sprintf("accessKey=%s&accountNumber=%s&amount=%d&orderId=%s&partnerCode=%s&requestId=%s", s.cfg.NFBankAccessKey, accountNumber, req.AmountVnd, orderCode, s.cfg.NFBankPartnerCode, requestID)
	var payout nfBankPayoutResponse
	payoutErr := s.postJSON(ctx, strings.TrimRight(s.cfg.NFBankAPIURL, "/")+"/payments/payout", nfBankPayoutRequest{PartnerCode: s.cfg.NFBankPartnerCode, AccessKey: s.cfg.NFBankAccessKey, RequestID: requestID, OrderID: orderCode, Amount: req.AmountVnd, AccountNumber: accountNumber, OrderInfo: fmt.Sprintf("Rút tiền Chillfy %s", orderCode), Signature: s.nfBankSignature(raw)}, &payout)
	if payoutErr != nil { // Outcome is unknown: retain the debit for later reconciliation, never risk a double payout.
		_ = s.updateWithdrawalStatus(ctx, orderCode, "PROCESSING", "", "NF-Bank payout request outcome is unknown")
		return &walletpb.NFBankWithdrawalResponse{OrderId: orderCode, Status: "PROCESSING", CoinAmount: coinAmount}, nil
	}
	if payout.ResultCode != 0 {
		if err := s.refundNFBankWithdrawal(ctx, orderCode, payout.Message); err != nil {
			return nil, err
		}
		return &walletpb.NFBankWithdrawalResponse{OrderId: orderCode, Status: "FAILED", CoinAmount: coinAmount}, nil
	}
	if err := s.updateWithdrawalStatus(ctx, orderCode, "SUCCESS", payout.TransID, ""); err != nil {
		return nil, err
	}
	return &walletpb.NFBankWithdrawalResponse{OrderId: orderCode, Status: "SUCCESS", CoinAmount: coinAmount, TransactionId: payout.TransID}, nil
}

func (s *WalletService) updateWithdrawalStatus(ctx context.Context, orderCode, status, transactionID, failureReason string) error {
	result, err := s.db.ExecContext(ctx, `UPDATE nfbank_withdrawal_orders SET status=$1, bank_tx_reference=NULLIF($2,''), failure_reason=NULLIF($3,''), updated_at=NOW() WHERE order_code=$4`, status, transactionID, failureReason, orderCode)
	if err != nil {
		return err
	}
	updated, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if updated != 1 {
		return fmt.Errorf("withdrawal order not found with code: %s", orderCode)
	}
	return nil
}

func (s *WalletService) refundNFBankWithdrawal(ctx context.Context, orderCode, reason string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var userID, walletID, status, withdrawalID string
	var coinAmount int64
	err = tx.QueryRowContext(ctx, `SELECT id, user_id, wallet_id, coin_amount, status FROM nfbank_withdrawal_orders WHERE order_code=$1 FOR UPDATE`, orderCode).Scan(&withdrawalID, &userID, &walletID, &coinAmount, &status)
	if err != nil {
		return err
	}
	if status != "PENDING" {
		return nil
	}
	wallet, err := s.repo.GetByUserIdForUpdateTx(ctx, tx, userID)
	if err != nil {
		return err
	}
	if !s.verifySignature(wallet) {
		return errors.New("wallet signature validation failed during refund")
	}
	balanceAfter, err := creditWalletBalance(wallet.CoinBalance, coinAmount)
	if err != nil {
		return err
	}
	version, err := nextWalletVersion(wallet.Version)
	if err != nil {
		return err
	}
	if err := s.repo.UpdateBalanceTx(ctx, tx, walletID, balanceAfter, version, s.generateSignature(wallet.ID, wallet.UserID, balanceAfter, wallet.FrozenBalance, version, wallet.CurrencyType, wallet.Status), wallet.Version); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE nfbank_withdrawal_orders SET status='FAILED', failure_reason=$1, updated_at=NOW() WHERE id=$2`, reason, withdrawalID); err != nil {
		return err
	}
	if err := s.repo.CreateTransactionTx(ctx, tx, &domain.TransactionLog{WalletID: walletID, Amount: coinAmount, BalanceBefore: wallet.CoinBalance, BalanceAfter: balanceAfter, TransactionType: domain.TxTypeCredit, Status: "SUCCESS", ReferenceType: "NFBANK_WITHDRAWAL_REFUND", ReferenceID: &withdrawalID, IdempotencyKey: "withdrawal-refund:" + orderCode, Description: "Hoàn Coin do NF-Bank từ chối yêu cầu rút tiền"}); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *WalletService) postJSON(
	ctx context.Context,
	endpoint string,
	payload any,
	response any,
) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode request: %w", err)
	}
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		endpoint,
		bytes.NewReader(body),
	)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")

	result, err := s.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("send request: %w", err)
	}
	defer result.Body.Close()
	if result.StatusCode < http.StatusOK || result.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("gateway returned HTTP %d", result.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(result.Body, maxGatewayResponseBytes)).Decode(response); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}
	return nil
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

func (s *WalletService) hashPIN(pin string) string {
	h := sha256.New()
	h.Write([]byte(fmt.Sprintf("%s:pin:%s", s.cfg.NFBankSecretKey, pin)))
	return hex.EncodeToString(h.Sum(nil))
}

func (s *WalletService) verifyPIN(wallet *domain.Wallet, pin string) bool {
	if wallet == nil || wallet.WithdrawPinHash == nil || *wallet.WithdrawPinHash == "" {
		return false
	}
	return *wallet.WithdrawPinHash == s.hashPIN(pin)
}

func (s *WalletService) GetWithdrawStatus(ctx context.Context, req *walletpb.GetWithdrawStatusRequest) (*walletpb.GetWithdrawStatusResponse, error) {
	if req.UserId == "" {
		return nil, errors.New("user_id is required")
	}
	wallet, err := s.repo.GetByUserIdTx(ctx, nil, req.UserId)
	isPinSet := false
	if err == nil && wallet != nil && wallet.WithdrawPinHash != nil && *wallet.WithdrawPinHash != "" {
		isPinSet = true
	}

	accounts, err := s.repo.GetUserBankAccounts(ctx, req.UserId)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("get bank accounts: %w", err)
	}

	var protoAccounts []*walletpb.BankAccountResponse
	for _, acc := range accounts {
		protoAccounts = append(protoAccounts, &walletpb.BankAccountResponse{
			Id:            acc.ID,
			UserId:        acc.UserID,
			BankCode:      acc.BankCode,
			BankName:      acc.BankName,
			AccountNumber: acc.AccountNumber,
			AccountName:   acc.AccountName,
			IsDefault:     acc.IsDefault,
		})
	}

	return &walletpb.GetWithdrawStatusResponse{
		IsPinSet:     isPinSet,
		BankAccounts: protoAccounts,
	}, nil
}

func (s *WalletService) SetWithdrawPIN(ctx context.Context, req *walletpb.SetWithdrawPINRequest) (*walletpb.SetWithdrawPINResponse, error) {
	if req.UserId == "" {
		return nil, errors.New("user_id is required")
	}
	if len(req.Pin) != 5 {
		return nil, errors.New("Mã PIN rút tiền phải đúng 5 chữ số")
	}
	for _, ch := range req.Pin {
		if ch < '0' || ch > '9' {
			return nil, errors.New("Mã PIN rút tiền chỉ bao gồm chữ số")
		}
	}

	pinHash := s.hashPIN(req.Pin)
	if err := s.repo.SetWithdrawPin(ctx, req.UserId, pinHash); err != nil {
		return nil, fmt.Errorf("set withdraw pin: %w", err)
	}
	return &walletpb.SetWithdrawPINResponse{Success: true}, nil
}

func (s *WalletService) LinkBankAccount(ctx context.Context, req *walletpb.LinkBankAccountRequest) (*walletpb.BankAccountResponse, error) {
	if req.UserId == "" || req.AccountNumber == "" || len(req.Pin) != 5 {
		return nil, errors.New("thông tin liên kết tài khoản ngân hàng không hợp lệ")
	}
	wallet, err := s.repo.GetByUserIdTx(ctx, nil, req.UserId)
	if err != nil {
		return nil, fmt.Errorf("wallet not found: %w", err)
	}
	if !s.verifyPIN(wallet, req.Pin) {
		return nil, errors.New("Mã PIN rút tiền không chính xác")
	}

	verified, err := s.VerifyNFBankAccount(ctx, &walletpb.VerifyNFBankAccountRequest{AccountNumber: req.AccountNumber})
	if err != nil {
		return nil, fmt.Errorf("không thể xác thực số tài khoản NF Bank: %w", err)
	}

	bankCode := req.BankCode
	if bankCode == "" {
		bankCode = "NFBANK"
	}
	bankName := "NF Bank"

	acc := &domain.UserBankAccount{
		UserID:        req.UserId,
		BankCode:      bankCode,
		BankName:      bankName,
		AccountNumber: req.AccountNumber,
		AccountName:   verified.AccountName,
	}

	if err := s.repo.LinkBankAccount(ctx, acc); err != nil {
		return nil, fmt.Errorf("link bank account: %w", err)
	}

	return &walletpb.BankAccountResponse{
		Id:            acc.ID,
		UserId:        acc.UserID,
		BankCode:      acc.BankCode,
		BankName:      acc.BankName,
		AccountNumber: acc.AccountNumber,
		AccountName:   acc.AccountName,
		IsDefault:     acc.IsDefault,
	}, nil
}

func (s *WalletService) GetUserBankAccounts(ctx context.Context, req *walletpb.GetUserBankAccountsRequest) (*walletpb.GetUserBankAccountsResponse, error) {
	if req.UserId == "" {
		return nil, errors.New("user_id is required")
	}
	accounts, err := s.repo.GetUserBankAccounts(ctx, req.UserId)
	if err != nil {
		return nil, err
	}
	var list []*walletpb.BankAccountResponse
	for _, acc := range accounts {
		list = append(list, &walletpb.BankAccountResponse{
			Id:            acc.ID,
			UserId:        acc.UserID,
			BankCode:      acc.BankCode,
			BankName:      acc.BankName,
			AccountNumber: acc.AccountNumber,
			AccountName:   acc.AccountName,
			IsDefault:     acc.IsDefault,
		})
	}
	return &walletpb.GetUserBankAccountsResponse{BankAccounts: list}, nil
}
