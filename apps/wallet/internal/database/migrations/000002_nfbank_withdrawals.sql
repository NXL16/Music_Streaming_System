CREATE TABLE IF NOT EXISTS nfbank_withdrawal_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    order_code VARCHAR(100) UNIQUE NOT NULL,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    account_number VARCHAR(100) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    amount_vnd BIGINT NOT NULL CHECK (amount_vnd > 0),
    coin_amount BIGINT NOT NULL CHECK (coin_amount > 0),
    bank_tx_reference VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    failure_reason VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nfbank_withdrawal_orders_user_id ON nfbank_withdrawal_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_nfbank_withdrawal_orders_wallet_id ON nfbank_withdrawal_orders(wallet_id);
