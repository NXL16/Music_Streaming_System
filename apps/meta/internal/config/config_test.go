package config

import "testing"

func TestGRPCListenAddrUsesExplicitAddressOrLoopbackFallback(t *testing.T) {
	t.Setenv("META_GRPC_LISTEN_ADDR", "meta.internal:4410")
	t.Setenv("META_GRPC_PORT", "4410")
	if got := grpcListenAddr(); got != "meta.internal:4410" {
		t.Fatalf("grpcListenAddr() = %q, want explicit address", got)
	}

	t.Setenv("META_GRPC_LISTEN_ADDR", "")
	if got := grpcListenAddr(); got != "127.0.0.1:4410" {
		t.Fatalf("grpcListenAddr() = %q, want loopback fallback", got)
	}
}
