\timing on 
SET session_replication_role = replica;
SELECT id AS hot FROM accounts WHERE owner_name = 'bench-hot' \gset

\echo  == insert 100000 rows WITH the account index 
INSERT INTO journal_entries(transfer_id, account_id , direction , amount_minor)
SELECT gen_random_uuid() , :hot , 'CREDIT' , 100 FROM generate_series(1,100000);

DROP INDEX idx_journal_entries_account_id;

\echo == insert 100000 rows WITHOUT the index
INSERT INTO journal_entries(transfer_id , account_id , direction , amount_minor)
SELECT gen_random_uuid() , :hot, 'CREDIT',100 FROM generate_series(1,100000);

CREATE INDEX idx_journal_entries_account_id ON journal_entries (account_id);
