package grpc

import (
	"Music_Streaming_System/apps/wallet/internal/service"
	walletpb "Music_Streaming_System/packages/shared-proto/wallet"
	"context"
)

type WalletGRPCHandler struct {
	walletpb.UnimplementedWalletServiceServer
	walletService *service.WalletService
}

func NewWalletGRPCHandler(walletService *service.WalletService) *WalletGRPCHandler {
	return &WalletGRPCHandler{
		walletService: walletService,
	}
}

func (h *WalletGRPCHandler) CreateWallet(ctx context.Context, req *walletpb.CreateWalletRequest) (*walletpb.CreateWalletResponse, error) {
	return h.walletService.CreateWallet(ctx, req)
}

func (h *WalletGRPCHandler) GetBalance(ctx context.Context, req *walletpb.GetBalanceRequest) (*walletpb.GetBalanceResponse, error) {
	return h.walletService.GetBalance(ctx, req)
}

func (h *WalletGRPCHandler) DebitWallet(ctx context.Context, req *walletpb.DebitWalletRequest) (*walletpb.DebitWalletResponse, error) {
	return h.walletService.DebitWallet(ctx, req)
}

func (h *WalletGRPCHandler) CreateDepositOrder(ctx context.Context, req *walletpb.DepositOrderRequest) (*walletpb.DepositOrderResponse, error) {
	return h.walletService.CreateDepositOrder(ctx, req)
}

func (h *WalletGRPCHandler) VerifyNFBankAccount(ctx context.Context, req *walletpb.VerifyNFBankAccountRequest) (*walletpb.VerifyNFBankAccountResponse, error) {
	return h.walletService.VerifyNFBankAccount(ctx, req)
}

func (h *WalletGRPCHandler) CreateNFBankWithdrawal(ctx context.Context, req *walletpb.NFBankWithdrawalRequest) (*walletpb.NFBankWithdrawalResponse, error) {
	return h.walletService.CreateNFBankWithdrawal(ctx, req)
}

func (h *WalletGRPCHandler) GetWithdrawStatus(ctx context.Context, req *walletpb.GetWithdrawStatusRequest) (*walletpb.GetWithdrawStatusResponse, error) {
	return h.walletService.GetWithdrawStatus(ctx, req)
}

func (h *WalletGRPCHandler) SetWithdrawPIN(ctx context.Context, req *walletpb.SetWithdrawPINRequest) (*walletpb.SetWithdrawPINResponse, error) {
	return h.walletService.SetWithdrawPIN(ctx, req)
}

func (h *WalletGRPCHandler) LinkBankAccount(ctx context.Context, req *walletpb.LinkBankAccountRequest) (*walletpb.BankAccountResponse, error) {
	return h.walletService.LinkBankAccount(ctx, req)
}

func (h *WalletGRPCHandler) GetUserBankAccounts(ctx context.Context, req *walletpb.GetUserBankAccountsRequest) (*walletpb.GetUserBankAccountsResponse, error) {
	return h.walletService.GetUserBankAccounts(ctx, req)
}
