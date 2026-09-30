ALTER TABLE wallets ADD COLUMN IF NOT EXISTS withdraw_pin_hash VARCHAR(255);

CREATE TABLE IF NOT EXISTS user_bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    bank_code VARCHAR(50) NOT NULL DEFAULT 'NFBANK',
    bank_name VARCHAR(100) NOT NULL DEFAULT 'NF Bank',
    account_number VARCHAR(100) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_bank_account UNIQUE(user_id, bank_code, account_number)
);

CREATE INDEX IF NOT EXISTS idx_user_bank_accounts_user_id ON user_bank_accounts(user_id);
