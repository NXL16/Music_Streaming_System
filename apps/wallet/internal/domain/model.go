package domain

import "time"

// Các hằng số định nghĩa trạng thái đơn nạp tiền
const (
	OrderStatusPending = "PENDING"
	OrderStatusSuccess = "SUCCESS"
	OrderStatusFailed  = "FAILED"
)

// Các hằng số định nghĩa loại giao dịch ví
const (
	TxTypeDebit  = "DEBIT"  // Trừ tiền / Thanh toán
	TxTypeCredit = "CREDIT" // Cộng tiền / Nạp tiền
)

// Wallet đại diện cho bảng wallets trong DB
type Wallet struct {
	ID              string    `json:"id"`
	UserID          string    `json:"user_id"`
	CoinBalance     int64     `json:"coin_balance"`
	FrozenBalance   int64     `json:"frozen_balance"`
	CurrencyType    string    `json:"currency_type"`
	Status          string    `json:"status"`
	Version         int64     `json:"version"`
	Signature       string    `json:"signature"`
	WithdrawPinHash *string   `json:"withdraw_pin_hash"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// UserBankAccount đại diện cho bảng user_bank_accounts
type UserBankAccount struct {
	ID            string    `json:"id"`
	UserID        string    `json:"user_id"`
	BankCode      string    `json:"bank_code"`
	BankName      string    `json:"bank_name"`
	AccountNumber string    `json:"account_number"`
	AccountName   string    `json:"account_name"`
	IsDefault     bool      `json:"is_default"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// TransactionLog đại diện cho bảng wallet_transactions (Sổ cái lịch sử)
type TransactionLog struct {
	ID              string    `json:"id"`
	WalletID        string    `json:"wallet_id"`
	Amount          int64     `json:"amount"`
	BalanceBefore   int64     `json:"balance_before"`
	BalanceAfter    int64     `json:"balance_after"`
	TransactionType string    `json:"transaction_type"` // DEBIT hoặc CREDIT
	Status          string    `json:"status"`           // SUCCESS hoặc FAILED
	ReferenceType   string    `json:"reference_type"`   // e.g. MOMO_ORDER, PURCHASE
	ReferenceID     *string   `json:"reference_id"`     // ID của tham chiếu liên quan
	IdempotencyKey  string    `json:"idempotency_key"`  // Chống trùng lặp giao dịch
	Description     string    `json:"description"`
	CreatedAt       time.Time `json:"created_at"`
}

// BankPaymentOrder đại diện cho bảng bank_payment_orders (Đơn nạp tiền qua MoMo/Ngân hàng)
type BankPaymentOrder struct {
	ID                string    `json:"id"` // Mã đơn hàng dạng UUID
	UserID            string    `json:"user_id"`
	WalletID          string    `json:"wallet_id"`
	OrderCode         string    `json:"order_code"` // Mã code đơn hàng đối tác (ví dụ: MOMO-xxx)
	AmountVnd         int64     `json:"amount_vnd"` // Số tiền VND thực tế
	CoinAmount        int64     `json:"coin_amount"`
	BankAccountNumber string    `json:"bank_account_number"`
	BankTxReference   string    `json:"bank_tx_reference"`
	Status            string    `json:"status"` // PENDING, SUCCESS, FAILED
	CallbackLogs      string    `json:"callback_logs"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}
