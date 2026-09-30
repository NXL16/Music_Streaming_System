package database

import "testing"

func TestNFBankWithdrawalMigrationIsRegistered(t *testing.T) {
	if len(migrations) < 2 || migrations[1].version != 2 {
		t.Fatal("NF-Bank withdrawal migration must be registered as version 2")
	}
	if migrations[1].sql == "" {
		t.Fatal("NF-Bank withdrawal migration SQL must not be empty")
	}
}
