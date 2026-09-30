package domain

import (
	"context"
	"database/sql"
)

// WalletRepository quy định các ràng buộc tương tác với Cơ sở dữ liệu
type WalletRepository interface {
	// Tạo ví mới cho User (hỗ trợ transaction)
	CreateWalletTx(ctx context.Context, tx *sql.Tx, w *Wallet) (string, error)

	// Lấy thông tin ví của User nằm trong 1 Transaction (hoặc đọc thường nếu tx = nil)
	GetByUserIdTx(ctx context.Context, tx *sql.Tx, userID string) (*Wallet, error)

	// Lấy thông tin ví và LOCK dòng dữ liệu (Pessimistic Lock - SELECT FOR UPDATE)
	GetByUserIdForUpdateTx(ctx context.Context, tx *sql.Tx, userID string) (*Wallet, error)

	// Cập nhật số dư áp dụng Optimistic Locking
	UpdateBalanceTx(ctx context.Context, tx *sql.Tx, id string, balance int64, version int64, signature string, oldVersion int64) error

	// Ghi sổ cái lịch sử giao dịch
	CreateTransactionTx(ctx context.Context, tx *sql.Tx, log *TransactionLog) error

	// Tạo đơn hàng nạp tiền qua cổng thanh toán (MoMo)
	CreateDepositOrderTx(ctx context.Context, tx *sql.Tx, order *BankPaymentOrder) error

	// Lấy và khóa đơn hàng nạp tiền để một callback tại một thời điểm quyết định
	// trạng thái cuối cùng và việc ghi có vào ví.
	GetDepositOrderByCodeForUpdateTx(ctx context.Context, tx *sql.Tx, orderCode string) (*BankPaymentOrder, error)

	// Cập nhật trạng thái đơn hàng nạp tiền theo mã order_code khi Webhook báo về
	UpdateDepositOrderStatusByCodeTx(ctx context.Context, tx *sql.Tx, orderCode string, status string) error

	// Quản lý PIN rút tiền và Tài khoản ngân hàng liên kết
	SetWithdrawPin(ctx context.Context, userID string, pinHash string) error
	GetUserBankAccounts(ctx context.Context, userID string) ([]*UserBankAccount, error)
	LinkBankAccount(ctx context.Context, acc *UserBankAccount) error
	GetBankAccountByID(ctx context.Context, id string, userID string) (*UserBankAccount, error)
}
