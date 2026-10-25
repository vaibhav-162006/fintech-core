Day 1 - Ledger basics
- Float math breaks money (0.1+0.2 != 0.3), so store integers in paise.
- Double-entry: every transfer = a debit row + a credit row, same amount, same transfer_id.
- Balance is derived (credits minus debits), not stored.
- DB enforces: positive amounts, valid account, valid direction.
- DB does NOT enforce: balanced transfers, duplicate transfers. (Day 2)
- Sequence ids can have gaps; failed inserts still consume ids.

## Day 2 - (title here)
- your notes
