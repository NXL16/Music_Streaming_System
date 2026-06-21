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
	repo domain.WalletRepository
	db   *sql.DB
	cfg  *config.Config
}

// NewWalletService khởi tạo Service với đầy đủ kết nối Repo, DB và Config
func NewWalletService(repo domain.WalletRepository, db *sql.DB, cfg *config.Config) *WalletService {
	return &WalletService{
		repo: repo,
		db:   db,
		cfg:  cfg,
	}
}

// GetConfig hỗ trợ lấy thông tin cấu hình phục vụ các tầng bên ngoài (ví dụ: HTTP Delivery Handler)
func (s *WalletService) GetConfig() *config.Config {
	return s.cfg
}

// CreateWallet: Tạo ví mới cho user
func (s *WalletService) CreateWallet(ctx context.Context, req *walletpb.CreateWalletRequest) (*walletpb.CreateWalletResponse, error) {
	if req.UserId == "" {
		return nil, errors.New("user_id cannot be empty")
	}

	// Mở Transaction
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("Failed to begin tx: %w", err)
	}
	defer tx.Rollback()

	// 1. Tạo ví trống với signature tạm thời
	newWallet := &domain.Wallet{
		UserID:        req.UserId,
		CoinBalance:   0,
		FrozenBalance: 0,
		CurrencyType:  "VND",
		Status:        "ACTIVE",
		Version:       1,
		Signature:     "TEMPORARY_SIGNATURE",
	}

	// 2. Insert vào DB để lấy ID thật do Postgres cấp dạng UUID
	realID, err := s.repo.CreateWalletTx(ctx, tx, newWallet)
	if err != nil {
		return nil, fmt.Errorf("Failed to insert wallet: %w", err)
	}

	// Nếu user đã có ví rồi (bị trùng do ON CONFLICT trả về id rỗng)
	if realID == "" {
		return nil, errors.New("Wallet already exists for this user")
	}

	newWallet.ID = realID

	// 3. Bây giờ đã có realID thật từ Postgres, tiến hành ký Signature chuẩn 100%
	finalSignature := s.generateSignature(newWallet.ID, newWallet.UserID, newWallet.CoinBalance, newWallet.FrozenBalance, newWallet.Version, newWallet.CurrencyType, newWallet.Status)

	// 4. Cập nhật chữ ký xịn này ngược lại vào dòng vừa tạo
	err = s.repo.UpdateBalanceTx(ctx, tx, newWallet.ID, newWallet.CoinBalance, newWallet.Version, finalSignature, newWallet.Version)
	if err != nil {
		return nil, fmt.Errorf("Failed to update final signature: %w", err)
	}

	// Đóng gói transaction thành công
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

	// Kiểm tra xem dữ liệu trong DB có bị sửa trộm không
	if !s.verifySignature(wallet) {
		return nil, errors.New("Critical error: Wallet data tampering detected")
	}

	return &walletpb.GetBalanceResponse{
		CoinBalance:   wallet.CoinBalance,
		FrozenBalance: wallet.FrozenBalance,
	}, nil
}

// DebitWallet: Trừ tiền từ ví (Thanh toán nội bộ bằng Coin) áp dụng Khóa bi quan và Idempotency Check
func (s *WalletService) DebitWallet(ctx context.Context, req *walletpb.DebitWalletRequest) (*walletpb.DebitWalletResponse, error) {
	if req.Amount <= 0 {
		return nil, errors.New("Amount must be greater than zero")
	}
	if req.IdempotencyKey == "" {
		return nil, errors.New("idempotency_key is required")
	}

	// Khởi động Database Transaction
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("Failed to start write tx: %w", err)
	}
	defer tx.Rollback()

	// Bước A: Kiểm tra Idempotency chống trùng lặp giao dịch
	var existID string
	var existTxType string
	err = tx.QueryRowContext(ctx, "SELECT id, transaction_type FROM wallet_transactions WHERE idempotency_key = $1", req.IdempotencyKey).Scan(&existID, &existTxType)
	if err == nil {
		// Đã xử lý thành công giao dịch này trước đó, trả về kết quả cũ luôn
		return &walletpb.DebitWalletResponse{
			TransactionId: fmt.Sprintf("TX-%s-%s", existTxType, existID),
			Status:        "SUCCESS",
		}, nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("Failed to check idempotency key: %w", err)
	}

	// Bước B: Đọc ví và Lock dòng dữ liệu (Pessimistic Locking - SELECT FOR UPDATE)
	wallet, err := s.repo.GetByUserIdForUpdateTx(ctx, tx, req.UserId)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("Wallet not found")
		}
		return nil, fmt.Errorf("Failed to get wallet: %w", err)
	}

	// Bước C: Xác thực chữ ký an toàn dữ liệu
	if !s.verifySignature(wallet) {
		return nil, errors.New("Critical: Secure signature validation failed")
	}

	// Bước D: Check số dư tài khoản
	if wallet.CoinBalance < req.Amount {
		return nil, errors.New("Insufficient balance")
	}

	// Bước E: Tính toán dữ liệu mới
	balanceBefore := wallet.CoinBalance
	balanceAfter := wallet.CoinBalance - req.Amount
	newVersion := wallet.Version + 1
	newSignature := s.generateSignature(wallet.ID, wallet.UserID, balanceAfter, wallet.FrozenBalance, newVersion, wallet.CurrencyType, wallet.Status)

	// Bước F: Update số dư ví tiền
	err = s.repo.UpdateBalanceTx(ctx, tx, wallet.ID, balanceAfter, newVersion, newSignature, wallet.Version)
	if err != nil {
		return nil, fmt.Errorf("Failed to update user balance: %w", err)
	}

	// Bước G: Ghi sổ cái lịch sử giao dịch (Ledger Log)
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

	// Hoàn tất giao dịch thành công dữ liệu được commit vĩnh viễn vào DB
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("Failed to commit transaction: %w", err)
	}

	return &walletpb.DebitWalletResponse{
		TransactionId: fmt.Sprintf("TX-%s-%s", txLog.TransactionType, txLog.ID),
		Status:        "SUCCESS",
	}, nil
}

// CreateDepositOrder: Lưu đơn hàng nạp và gọi API sang MoMo để lấy link QR thanh toán
type MomoRequest struct {
	PartnerCode string `json:"partnerCode"`
	RequestType string `json:"requestType"`
	IPNUrl      string `json:"ipnUrl"`
	RedirectUrl string `json:"redirectUrl"`
	OrderId     string `json:"orderId"`
	Amount      int64  `json:"amount"`
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

func (s *WalletService) CreateDepositOrder(ctx context.Context, req *walletpb.DepositOrderRequest) (*walletpb.DepositOrderResponse, error) {
	if req.AmountVnd <= 0 {
		return nil, errors.New("Deposit amount must be greater than zero")
	}

	// 1. Kiểm tra ví người dùng
	wallet, err := s.repo.GetByUserIdTx(ctx, nil, req.UserId)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("Wallet not found for this user")
		}
		return nil, fmt.Errorf("Failed to find wallet: %w", err)
	}

	// 2. Lấy tỷ giá quy đổi coin động từ bảng coin_rates (nếu không có sẽ dùng fallback 1000 VND = 1 Coin)
	var rateVnd int64 = 1000
	var rateCoin int64 = 1
	err = s.db.QueryRowContext(ctx, "SELECT amount_vnd, coin_amount FROM coin_rates WHERE is_active = true AND effective_at <= NOW() ORDER BY effective_at DESC LIMIT 1").Scan(&rateVnd, &rateCoin)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("Failed to fetch exchange rates: %w", err)
	}

	coinAmount := (req.AmountVnd * rateCoin) / rateVnd
	orderCode := fmt.Sprintf("MOMO-%d", time.Now().UnixNano())

	// 3. Tạo bản ghi đơn hàng nạp với trạng thái PENDING
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

	// 4. Chuẩn bị gọi đối tác MoMo thanh toán
	orderInfo := fmt.Sprintf("Nạp %d Coin vào hệ thống Music Streaming", coinAmount)
	requestId := orderCode
	extraData := ""
	amountStr := fmt.Sprintf("%d", req.AmountVnd)

	rawSignature := fmt.Sprintf(
		"accessKey=%s&amount=%s&extraData=%s&ipnUrl=%s&orderId=%s&orderInfo=%s&partnerCode=%s&redirectUrl=%s&requestId=%s&requestType=%s",
		s.cfg.MomoAccessKey,
		amountStr,
		extraData,
		s.cfg.MomoNotifyURL,
		orderCode,
		orderInfo,
		s.cfg.MomoPartnerCode,
		s.cfg.MomoRedirectURL,
		requestId,
		"captureWallet",
	)

	h := hmac.New(sha256.New, []byte(s.cfg.MomoSecretKey))
	h.Write([]byte(rawSignature))
	momoSignature := hex.EncodeToString(h.Sum(nil))

	momoBody := map[string]interface{}{
		"partnerCode": s.cfg.MomoPartnerCode,
		"accessKey":   s.cfg.MomoAccessKey,
		"requestId":   requestId,
		"amount":      amountStr,
		"orderId":     orderCode,
		"orderInfo":   orderInfo,
		"redirectUrl": s.cfg.MomoRedirectURL,
		"ipnUrl":      s.cfg.MomoNotifyURL,
		"extraData":   extraData,
		"requestType": "captureWallet",
		"signature":   momoSignature,
		"lang":        "vi",
	}

	jsonValue, _ := json.Marshal(momoBody)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(s.cfg.MomoAPIURL, "application/json", bytes.NewBuffer(jsonValue))
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
		OrderId:    orderCode, // Trả về orderCode để client đối soát và lưu
		PaymentUrl: momoResp.PayUrl,
	}, nil
}

// ProcessDepositWebhook: Nhận phản hồi kết quả từ MoMo (IPN), cập nhật trạng thái đơn và cộng tiền ví thật
func (s *WalletService) ProcessDepositWebhook(ctx context.Context, orderID string, amountVnd int64, resultCode int) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("Failed to start webhook tx: %w", err)
	}
	defer tx.Rollback()

	// 1. Truy vấn thông tin đơn hàng trong database theo mã order_code (Sử dụng tx)
	order, err := s.repo.GetDepositOrderByCodeTx(ctx, tx, orderID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("Payment order not found with code: %s", orderID)
		}
		return fmt.Errorf("Failed to check payment order: %w", err)
	}

	// 2. Cơ chế Webhook Idempotency: Nếu đơn hàng đã hoàn thành trước đó (thành công hoặc thất bại)
	// Ta trả về nil (success) để báo cho MoMo ngừng gửi retry webhook.
	if order.Status == domain.OrderStatusSuccess || order.Status == domain.OrderStatusFailed {
		return nil
	}

	// Phân loại trạng thái mới
	status := domain.OrderStatusFailed
	if resultCode == 0 {
		status = domain.OrderStatusSuccess
	}

	// 3. Cập nhật trạng thái đơn hàng (sử dụng tx)
	err = s.repo.UpdateDepositOrderStatusByCodeTx(ctx, tx, order.OrderCode, status)
	if err != nil {
		return fmt.Errorf("Failed to update order status: %w", err)
	}

	// Nếu MoMo báo giao dịch thất bại, chỉ đổi trạng thái đơn nạp và dừng xử lý cộng tiền
	if resultCode != 0 {
		return tx.Commit()
	}

	// 4. Lấy thông tin ví và thực hiện khóa bản ghi (Row-level lock - SELECT FOR UPDATE)
	wallet, err := s.repo.GetByUserIdForUpdateTx(ctx, tx, order.UserID)
	if err != nil {
		return fmt.Errorf("Failed to lock user wallet for deposit: %w", err)
	}

	// Xác thực tính toàn vẹn của chữ ký dòng trước khi tăng số dư
	if !s.verifySignature(wallet) {
		return errors.New("Critical: Secure signature validation failed during deposit")
	}

	// Tính toán các tham số mới cho số dư và bảo mật chữ ký
	balanceBefore := wallet.CoinBalance
	balanceAfter := wallet.CoinBalance + order.CoinAmount
	newVersion := wallet.Version + 1
	newSignature := s.generateSignature(wallet.ID, wallet.UserID, balanceAfter, wallet.FrozenBalance, newVersion, wallet.CurrencyType, wallet.Status)

	// Ghi nhận số tiền mới vào DB
	err = s.repo.UpdateBalanceTx(ctx, tx, wallet.ID, balanceAfter, newVersion, newSignature, wallet.Version)
	if err != nil {
		return fmt.Errorf("Deposit transaction conflict, failed to update balance: %w", err)
	}

	// Ghi lại biến động số dư vào Sổ cái lịch sử giao dịch (Ledger)
	refID := order.ID // Khóa ngoại reference_id
	txLog := &domain.TransactionLog{
		WalletID:        wallet.ID,
		Amount:          order.CoinAmount,
		BalanceBefore:   balanceBefore,
		BalanceAfter:    balanceAfter,
		TransactionType: domain.TxTypeCredit,
		Status:          "SUCCESS",
		ReferenceType:   "MOMO_ORDER",
		ReferenceID:     &refID,
		IdempotencyKey:  order.OrderCode, // Sử dụng mã order_code làm khóa Idempotency
		Description:     fmt.Sprintf("Nạp thành công %d Coin từ MoMo", order.CoinAmount),
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
