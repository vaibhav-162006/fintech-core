WITH neg AS(
    SELECT a.id AS account_id,
    -SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount_minor ELSE -e.amount_minor END) AS shortfall
    from journal_entries e 
    JOIN accounts a ON a.id = e.account_id
    WHERE a.owner_name <> 'Treasury'
    GROUP BY a.id
    HAVING SUM (CASE WHEN e.direction = 'CREDIT' THEN e.amount_minor ELSE -e.amount_minor END) < 0
), 
t AS (
    INSERT INTO transfers (idempotency_key) VALUES ('correction-day7')  RETURNING id
)
INSERT INTO journal_entries(transfer_id , account_id , direction , amount_minor)
SELECT t.id, (SELECT id FROM accounts WHERE owner_name = 'Treasury'), 'DEBIT' , (SELECT SUM(shortfall) from neg)
FROM t 
UNION ALL 
SELECT t.id , neg.account_id , 'CREDIT' , neg.shortfall
FROM t, neg;
