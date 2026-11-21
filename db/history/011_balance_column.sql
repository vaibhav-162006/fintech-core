ALTER TABLE accounts ADD COLUMN IF NOT EXISTS balance_minor BIGINT NOT NULL DEFAULT 0;

UPDATE accounts a
   SET balance_minor = COALESCE((
         SELECT SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount_minor ELSE -e.amount_minor END)
           FROM journal_entries e WHERE e.account_id = a.id), 0);

CREATE OR REPLACE FUNCTION apply_entry_to_balance() RETURNS trigger AS $$
BEGIN
  UPDATE accounts
     SET balance_minor = balance_minor
         + CASE WHEN NEW.direction = 'CREDIT' THEN NEW.amount_minor ELSE -NEW.amount_minor END
   WHERE id = NEW.account_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_apply_entry_to_balance ON journal_entries;
CREATE TRIGGER trg_apply_entry_to_balance
AFTER INSERT ON journal_entries
FOR EACH ROW EXECUTE FUNCTION apply_entry_to_balance();
