package service

import (
	"errors"
	"math"
	"regexp"
	"strings"
	"testing"
)

func TestNewWalletIDCreatesUUIDv4(t *testing.T) {
	walletID, err := newWalletID()
	if err != nil {
		t.Fatalf("newWalletID() error = %v", err)
	}

	if !regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).MatchString(walletID) {
		t.Fatalf("newWalletID() = %q, want UUIDv4", walletID)
	}
}

func TestCalculateCoinAmountRejectsUnsafeRates(t *testing.T) {
	tests := []struct {
		name      string
		amountVnd int64
		rateVnd   int64
		rateCoin  int64
		want      int64
		wantErr   error
	}{
		{
			name:      "valid active rate",
			amountVnd: 250_000,
			rateVnd:   1_000,
			rateCoin:  1,
			want:      250,
		},
		{
			name:      "zero VND rate",
			amountVnd: 250_000,
			rateVnd:   0,
			rateCoin:  1,
			wantErr:   ErrInvalidActiveCoinRate,
		},
		{
			name:      "zero coin rate",
			amountVnd: 250_000,
			rateVnd:   1_000,
			rateCoin:  0,
			wantErr:   ErrInvalidActiveCoinRate,
		},
		{
			name:      "conversion overflows",
			amountVnd: math.MaxInt64,
			rateVnd:   1,
			rateCoin:  2,
			wantErr:   ErrInvalidActiveCoinRate,
		},
		{
			name:      "conversion would credit zero coins",
			amountVnd: 1,
			rateVnd:   1_000,
			rateCoin:  1,
			wantErr:   ErrInvalidActiveCoinRate,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := calculateCoinAmount(tt.amountVnd, tt.rateVnd, tt.rateCoin)
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("calculateCoinAmount() error = %v, want errors.Is(..., %v)", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("calculateCoinAmount() error = %v", err)
			}
			if got != tt.want {
				t.Fatalf("calculateCoinAmount() = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestValidateWebhookAmount(t *testing.T) {
	if err := validateWebhookAmount(100_000, 100_000); err != nil {
		t.Fatalf("matching callback amount was rejected: %v", err)
	}

	err := validateWebhookAmount(100_000, 99_000)
	if !errors.Is(err, ErrWebhookAmountMismatch) {
		t.Fatalf("mismatched callback amount error = %v, want errors.Is(..., ErrWebhookAmountMismatch)", err)
	}
}

func TestCreditWalletBalanceRejectsOverflow(t *testing.T) {
	if _, err := creditWalletBalance(math.MaxInt64, 1); !errors.Is(err, ErrWalletBalanceOverflow) {
		t.Fatalf("overflow credit error = %v, want ErrWalletBalanceOverflow", err)
	}

	balance, err := creditWalletBalance(100, 25)
	if err != nil || balance != 125 {
		t.Fatalf("safe credit = (%d, %v), want (125, nil)", balance, err)
	}
}

func TestNextWalletVersionRejectsOverflow(t *testing.T) {
	if _, err := nextWalletVersion(math.MaxInt64); !errors.Is(err, ErrWalletVersionOverflow) {
		t.Fatalf("overflow version error = %v, want ErrWalletVersionOverflow", err)
	}

	version, err := nextWalletVersion(41)
	if err != nil || version != 42 {
		t.Fatalf("next version = (%d, %v), want (42, nil)", version, err)
	}
}

func TestNewPaymentOrderCodeUsesProviderPrefixAndRandomValue(t *testing.T) {
	first, err := newPaymentOrderCode("MOMO")
	if err != nil {
		t.Fatalf("newPaymentOrderCode() error = %v", err)
	}
	second, err := newPaymentOrderCode("MOMO")
	if err != nil {
		t.Fatalf("newPaymentOrderCode() error = %v", err)
	}

	if !strings.HasPrefix(first, "MOMO-") {
		t.Fatalf("order code %q does not have provider prefix", first)
	}
	if len(strings.TrimPrefix(first, "MOMO-")) != 32 {
		t.Fatalf("order code %q does not contain a 128-bit random suffix", first)
	}
	if first == second {
		t.Fatalf("two order codes must not be equal: %q", first)
	}
}
