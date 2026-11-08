ALTER TABLE risk_decision
    ADD COLUMN IF NOT EXISTS features JSONB;
    