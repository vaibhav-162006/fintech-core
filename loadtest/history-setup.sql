\set ON_ERROR_STOP on
SET session_replication_role = replica;

INSERT INTO accounts(owner_name , balance_minor)
SELECT 'bench-' || g, 100000 FROM generate_series(1,1000) AS g;
INSERT INTO accounts(owner_name , balance_minor) VALUES ('bench-hot' , 20000000);

INSERT INTO jounal_entries(transfer_id, account_id , direction , amount_minor)
SELECT gen_random_uuid() , a.id , 'CREDIT' , 100
FROM accounts a , generate_series(1,1000)
WHERE a.owner_name LIKE 'bench%' AND a.owner_name <> 'bench-hot';

INSERT INTO journal_entries (transfer_id,account_id,direction,amount_minor)
SELECT gen_random_uuid() , (SELECT id FROM accounts WHERE owner_name = 'bench-hot'), 'CREDIT' , 100
FROM generate_series(1,200000);

SET session_replication_role = origin;
CREATE INDEX IF NOT EXISTS idx_journal_entries_account_id ON jounal_entries(account_id);
ANALYZE jounal_entries;

