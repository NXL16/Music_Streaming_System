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
