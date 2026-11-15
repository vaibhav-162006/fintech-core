INSERT INTO accounts(owner_name)
SELECT 'load-sender-' || g FROM generate_series(1,3000) AS g;

INSERT INTO accounts(owner_name) VALUES ('load-receiver');

WITH t AS(
    INSERT INTO transfers(idempotency_key) VALUES ('load-fund') RETURNING id

)
INSERT INTO journal_entries(transfer_id,account_id,direction,amount_minor)
SELECT t.id , (SELECT id FROM accounts WHERE owner_name = 'Treasury') , 'DEBIT' , 300000000 FROM t
UNION ALL
SELECT t.id,a.id , 'CREDIT' , 100000 FROM t , accounts a WHERE a.owner_name LIKE 'load-sender-%';