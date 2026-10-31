INSERT INTO accounts (owner_name) VALUES ('Vaibhav'), ('Ravi'), ('Treasury');

WITH t AS (INSERT INTO transfers (idempotency_key) VALUES ('seed-001') RETURNING id)
INSERT INTO journal_entries (transfer_id, account_id, direction, amount_minor)
SELECT t.id, (SELECT id FROM accounts WHERE owner_name = 'Treasury'), 'DEBIT', 500000 FROM t
UNION ALL
SELECT t.id, (SELECT id FROM accounts WHERE owner_name = 'Vaibhav'), 'CREDIT', 500000 FROM t;
