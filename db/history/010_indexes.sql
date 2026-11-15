CREATE INDEX IF NOT EXISTS idx_journal_entries_accounts_id ON journal_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_transfer_id ON journal_entries(transfer_id);
