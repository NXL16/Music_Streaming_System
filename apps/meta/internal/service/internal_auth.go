package service

import (
	"context"
	"crypto/subtle"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

const internalTokenMetadataKey = "x-internal-token"

// InternalAuthInterceptor permits only callers that know the service-to-service
// token. Metadata is deliberately protected at the gRPC boundary so a newly
// added RPC cannot accidentally bypass authorization.
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
