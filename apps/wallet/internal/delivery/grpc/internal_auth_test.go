package grpc

import (
	"context"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

func TestInternalAuthInterceptor(t *testing.T) {
	expectedToken := "0123456789abcdef0123456789abcdef"
	interceptor := InternalAuthInterceptor(expectedToken)
	handlerCalled := false
	handler := func(context.Context, any) (any, error) {
		handlerCalled = true
		return "ok", nil
	}
	info := &grpc.UnaryServerInfo{FullMethod: "/wallet_service.WalletService/GetBalance"}

	tests := []struct {
		name    string
		ctx     context.Context
		wantErr codes.Code
	}{
		{name: "rejects missing metadata", ctx: context.Background(), wantErr: codes.Unauthenticated},
		{
			name: "rejects incorrect token",
			ctx: metadata.NewIncomingContext(
				context.Background(),
				metadata.Pairs(internalTokenMetadataKey, "wrong-token"),
			),
			wantErr: codes.Unauthenticated,
		},
		{
			name: "accepts exactly one matching token",
			ctx: metadata.NewIncomingContext(
				context.Background(),
				metadata.Pairs(internalTokenMetadataKey, expectedToken),
			),
			wantErr: codes.OK,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			handlerCalled = false
			response, err := interceptor(test.ctx, nil, info, handler)
			if got := status.Code(err); got != test.wantErr {
				t.Fatalf("status.Code(err) = %v, want %v", got, test.wantErr)
			}
			if test.wantErr == codes.OK {
				if response != "ok" || !handlerCalled {
					t.Fatal("authorized request did not reach handler")
				}
			} else if handlerCalled {
				t.Fatal("unauthorized request reached handler")
			}
		})
	}
}
