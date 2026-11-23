SELECT id AS hot FROM accounts WHERE owner_name = 'bench-hot' \gset
SELECT id AS ord FROM accounts WHERE owner_name = 'bench-1' \gset

\echo == hot account, 200000 entries: SUM with index
EXPLAIN ANALYZE SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE -amount_minor END), 0) FROM journal_entries WHERE account_id = :hot;

\echo == ordinary account , 1000 entries : SUM with index
EXPLAIN ANALYZE SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE -amount_minor END),0) FROM journal_entries WHERE account_id = :ord;

\echo == hot account : stored balance
EXPLAIN ANALYZE SELECT balance_minor FROM accounts WHERE id = :hot;

DROP INDEX idx_journal_entries_account_id;

\echo == hot account , 200000 entries : SUM , no index
EXPLAIN ANALYZE SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE -amount_minor END) , 0) FROM journal_entries WHERE account_id = :hot;

\echo == ordinary account, 1000 entries: SUM , no index
EXPLAIN ANALYZE SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE -amount_minor END) , 0) FROM journal_entries WHERE account_id = :ord;

CREATE INDEX idx_journal_entries_account_id ON journal_entries (account_id);
ANALYZE journal_entries;
