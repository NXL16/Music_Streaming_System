package grpc

import (
	"context"
	"crypto/subtle"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

const internalTokenMetadataKey = "x-internal-token"

// InternalAuthInterceptor keeps every Wallet RPC behind the same authenticated
// service boundary, including future methods added to the generated service.
func InternalAuthInterceptor(expectedToken string) grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req any,
		info *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (any, error) {
		if !hasValidInternalToken(ctx, expectedToken) {
			return nil, status.Error(codes.Unauthenticated, "Unauthorized internal request")
		}
		return handler(ctx, req)
	}
}

func hasValidInternalToken(ctx context.Context, expectedToken string) bool {
	requestMetadata, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return false
	}

	providedTokens := requestMetadata.Get(internalTokenMetadataKey)
	if len(providedTokens) != 1 {
		return false
	}
	provided := []byte(providedTokens[0])
	expected := []byte(expectedToken)
	return len(provided) == len(expected) && subtle.ConstantTimeCompare(provided, expected) == 1
}
