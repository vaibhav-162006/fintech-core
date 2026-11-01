DROP TRIGGER IF EXISTS trg_transfer_balanced ON journal_entries;

CREATE OR REPLACE FUNCTION check_transfer_balanced() RETURNS trigger AS $$
DECLARE
  net BIGINT;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT'
                           THEN amount_minor ELSE -amount_minor END), 0)
    INTO net
    FROM journal_entries
   WHERE transfer_id = NEW.transfer_id;

  IF net <> 0 THEN
    RAISE EXCEPTION 'Transfer % is unbalanced (net = %)', NEW.transfer_id, net;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_transfer_balanced
AFTER INSERT ON journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_transfer_balanced();
