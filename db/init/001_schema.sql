CREATE TABLE accounts(
    id SERIAL PRIMARY KEY,
    owner_name TEXT NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'INR' ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    CHECK (status IN ('PENDING', 'COMPLETED' , 'FAILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now ()
);
CREATE TABLE journal_entries(
    id BIGSERIAL PRIMARY KEY,
    transfer_id UUID NOT NULL REFERENCES transfers(id),
    account_id INT NOT NULL REFERENCES accounts(id),
    direction TEXT NOT NULL CHECK (direction IN('CREDIT','DEBIT')),
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION check_transfered_balanced() RETURNS trigger AS $$
DECLARE
    net BIGINT;
BEGIN 
SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' 
                                            THEN amount_minor ELSE -amount_minor END) , 0)
        INTO net
        FROM journal_entries
        WHERE transfer_id = NEW.transfer_id;

if net <> 0 THEN
RAISE EXCEPTION 'Transfer % is unbalanced (net = %)' , NEW.transfer_id , net;
END IF;
RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_transfer_balanced
AFTER INSERT ON journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_transfered_balanced();