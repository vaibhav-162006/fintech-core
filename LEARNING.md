Day 1 - Ledger basics
- Float math breaks money (0.1+0.2 != 0.3), so store integers in paise.
- Double-entry: every transfer = a debit row + a credit row, same amount, same transfer_id.
- Balance is derived (credits minus debits), not stored.
- DB enforces: positive amounts, valid account, valid direction.
- DB does NOT enforce: balanced transfers, duplicate transfers. (Day 2)
- Sequence ids can have gaps; failed inserts still consume ids.

## Day 2 - (title here)
- your notes

## Day 2 - Atomicity, idempotency, balanced transfers
- BEGIN ... COMMIT groups steps; a failure rolls back everything, including the transfers row.
- UNIQUE idempotency_key in the DB blocks duplicate (retried) payments, even from buggy code.
- A deferred constraint trigger checks "debits = credits" at COMMIT, after all rows are in.
- Migrations: numbered .sql files record how the schema evolved.
