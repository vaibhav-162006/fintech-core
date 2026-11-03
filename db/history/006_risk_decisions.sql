CREATE TABLE IF NOT EXISTS risk_decisions(
    id BIGSERIAL PRIMARY KEY,
    idempotency_key TEXT NOT NULL,
    from_account_id INT NOT NULL,
    to_account_id INT NOT NULL,
    amount_minor INT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN('ALLOW' , 'REVIEW' , 'BLOCK')),
    score INT NOT NULL,
    reasons JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);