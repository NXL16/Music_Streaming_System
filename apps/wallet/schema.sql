-- Enable uuid-ossp if gen_random_uuid() is not available (though gen_random_uuid() is built-in for PG 13+)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: wallets
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL,
    coin_balance BIGINT NOT NULL DEFAULT 0,
    frozen_balance BIGINT NOT NULL DEFAULT 0,
    currency_type VARCHAR(50) NOT NULL DEFAULT 'VND',
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    version BIGINT NOT NULL DEFAULT 1,
    signature VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Table: bank_payment_orders
CREATE TABLE IF NOT EXISTS bank_payment_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    order_code VARCHAR(100) UNIQUE NOT NULL,
    amount_vnd BIGINT NOT NULL,
    coin_amount BIGINT NOT NULL,
    bank_account_number VARCHAR(100),
    bank_tx_reference VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    callback_logs TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Table: wallet_transactions (Ledger)
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    amount BIGINT NOT NULL,
    balance_before BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    transaction_type VARCHAR(50) NOT NULL, -- DEBIT, CREDIT
    status VARCHAR(50) NOT NULL DEFAULT 'SUCCESS',
    reference_type VARCHAR(100),
    reference_id UUID,
    description VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Table: coin_rates
CREATE TABLE IF NOT EXISTS coin_rates (
    id SERIAL PRIMARY KEY,
    amount_vnd BIGINT NOT NULL,
    coin_amount BIGINT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    effective_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_payment_orders_user_id ON bank_payment_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_payment_orders_wallet_id ON bank_payment_orders(wallet_id);
CREATE INDEX IF NOT EXISTS idx_bank_payment_orders_order_code ON bank_payment_orders(order_code);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_idempotency_key ON wallet_transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_created ON wallet_transactions(wallet_id, created_at DESC);
