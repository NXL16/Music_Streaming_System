package service

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"strings"
	"testing"
)

type topUpConnector struct {
	values   []driver.Value
	wantUser string
	seen     *bool
}

func (c topUpConnector) Connect(context.Context) (driver.Conn, error) { return &topUpConn{c}, nil }
func (c topUpConnector) Driver() driver.Driver                        { return topUpDriver{} }

// Keep this test self-contained. sql.OpenDB uses the connector directly, but
// the driver is still required by the database/sql Connector contract.
type topUpDriver struct{}

func (topUpDriver) Open(string) (driver.Conn, error) {
	return nil, errors.New("unexpected open")
}

type topUpConn struct{ topUpConnector }

func (c *topUpConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("unexpected prepare")
}
func (c *topUpConn) Close() error              { return nil }
func (c *topUpConn) Begin() (driver.Tx, error) { return nil, errors.New("unexpected write") }
func (c *topUpConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	if c.wantUser != "" {
		if !strings.Contains(query, "WHERE user_id = $1 AND order_code = $2") || len(args) != 2 || args[0].Value != c.wantUser {
			return nil, errors.New("unbound payer")
		}
	}
	*c.seen = true
	return &topUpRows{values: c.values}, nil
}

type topUpRows struct {
	values []driver.Value
	read   bool
}

func (r *topUpRows) Columns() []string {
	if len(r.values) == 2 {
		return []string{"amount_vnd", "coin_amount"}
	}
	return []string{"order_code", "amount_vnd", "coin_amount", "status"}
}
func (r *topUpRows) Close() error { return nil }
func (r *topUpRows) Next(dest []driver.Value) error {
	if r.read || r.values == nil {
		return io.EOF
	}
	r.read = true
	copy(dest, r.values)
	return nil
}

func TestRoomTopUpCatalogUsesActiveRate(t *testing.T) {
	seen := false
	db := sql.OpenDB(topUpConnector{values: []driver.Value{int64(1000), int64(2)}, seen: &seen})
	defer db.Close()
	s := &WalletService{db: db}
	packages, err := s.RoomTopUpCatalog(context.Background())
	if err != nil || !seen || len(packages) != 6 || packages[0].Coins != 20 || packages[5].Coins != 1000 {
		t.Fatalf("catalog=%#v err=%v", packages, err)
	}
}

func TestRoomTopUpStatusIsPayerScopedAndDoesNotWrite(t *testing.T) {
	user := "11111111-1111-4111-8111-111111111111"
	for _, state := range []string{"PENDING", "SUCCESS", "FAILED", "missing"} {
		t.Run(state, func(t *testing.T) {
			seen := false
			id := "NFBANK-" + strings.Repeat("a", 32)
			values := []driver.Value{id, int64(20000), int64(20), state}
			if state == "missing" {
				values = nil
			}
			db := sql.OpenDB(topUpConnector{values: values, wantUser: user, seen: &seen})
			defer db.Close()
			order, err := (&WalletService{db: db}).RoomTopUpStatus(context.Background(), RoomTopUpRequest{UserID: user, OrderID: id})
			if state == "missing" {
				if !errors.Is(err, ErrRoomTopUpNotFound) {
					t.Fatal(err)
				}
				return
			}
			if err != nil || !seen || order.Status != state || order.PaymentMethod != "NFBANK" {
				t.Fatalf("%#v %v", order, err)
			}
		})
	}
}

func TestRoomTopUpRejectsInvalidCreateBeforeAnyPayment(t *testing.T) {
	s := &WalletService{}
	for _, req := range []RoomTopUpRequest{{UserID: "victim", PackageID: "10000", PaymentMethod: "MOMO"}, {UserID: "11111111-1111-4111-8111-111111111111", PackageID: "1", PaymentMethod: "MOMO"}, {UserID: "11111111-1111-4111-8111-111111111111", PackageID: "10000", PaymentMethod: "CASH"}} {
		if _, err := s.CreateRoomTopUp(context.Background(), req); !errors.Is(err, ErrRoomTopUpInvalid) {
			t.Fatal(err)
		}
	}
}
