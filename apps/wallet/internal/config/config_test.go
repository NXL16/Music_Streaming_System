package config

import "testing"

func TestIsLoopbackListenAddr(t *testing.T) {
	tests := []struct {
		address string
		want    bool
	}{
		{address: "127.0.0.1:50051", want: true},
		{address: "[::1]:50051", want: true},
		{address: "localhost:50051", want: true},
		{address: ":50051", want: false},
		{address: "0.0.0.0:50051", want: false},
		{address: "wallet.internal:50051", want: false},
	}

	for _, test := range tests {
		if got := isLoopbackListenAddr(test.address); got != test.want {
			t.Errorf("isLoopbackListenAddr(%q) = %t, want %t", test.address, got, test.want)
		}
	}
}
