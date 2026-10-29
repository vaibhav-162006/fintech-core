# Learning Log

## Day 1 - Ledger basics
- Float math breaks money (0.1 + 0.2 != 0.3), so store integers in paise.
- Double-entry: every transfer = a debit row + a credit row, same amount, same transfer_id.
- Balance is derived (credits minus debits), not stored.
- DB enforces: positive amounts, valid account, valid direction.
- DB does NOT enforce: balanced transfers, duplicate transfers (fixed on Day 2).
- Sequence ids can have gaps; failed inserts still consume ids.

## Day 2 - Atomicity, idempotency, balanced transfers
- BEGIN ... COMMIT groups steps; a failure rolls back everything, including the transfers row.
- UNIQUE idempotency_key in the DB blocks duplicate (retried) payments, even from buggy code.
- A deferred constraint trigger checks "debits = credits" at COMMIT, after all rows are in.
- Migrations: numbered .sql files record how the schema evolved.

## Day 3 - Race conditions and row locking
- Race condition: two transactions both read the balance, both pass the check, both write. The account goes negative.
- Constraints did not catch it: each transfer balanced on its own. "Transfer balances" and "account never goes negative" are separate rules.
- Fix: SELECT ... FOR UPDATE on the account row. The second transaction waits, then reads the true balance.
- The lock only works if every transfer path takes it first.
- Open transactions hold locks: watch for "idle in transaction" in pg_stat_activity.
- Pessimistic locking (lock first) vs optimistic (detect conflict at commit, retry): compare later.

## Day 4 - Node connects to Postgres
- pg Pool: a set of reusable connections. Scripts must call pool.end() or they never exit.
- Config lives in .env (git-ignored) and is loaded with --env-file=.env.
- db.ts throws if DATABASE_URL is missing, so a forgotten variable fails loudly.
- Bug: "localhost" reached a different Postgres on my Mac. 127.0.0.1 reached the Docker one.
- Errors by layer: ECONNREFUSED = nothing listening; role/database does not exist = Postgres rejected login; relation does not exist = Postgres rejected the query.

## Day 5 - transfer() function
- One client from the pool for the whole transaction: BEGIN, lock, check, write, COMMIT.
- Idempotency key returns the original result on retry (replayed: true) and moves no money.
- ROLLBACK in catch undoes every step since BEGIN, including the transfers row.
- Gap: same key with different values is silently treated as a retry. Fix: store the request details and compare.

## Day 6 - Concurrency stress test
- Fired 50 simultaneous transfers at an account that could afford 10. With FOR UPDATE: exactly 10 succeeded, sender ended at 0.
- Without FOR UPDATE: more than 10 succeeded and the sender went negative. The lock does real work.
- The total across accounts still summed correctly even in the failing run, so "ledger balances" does not mean "no account overspent".
- Promise.allSettled starts everything at once and keeps failures as results. A for loop with await would run them one by one and test nothing.
- Bug: the test compared against a misspelled error string, so 40 correct rejections were counted as unexpected errors. Strings are checked by no one, so share them as constants.

## Day 7 - Reconciliation job
- A script re-checks the whole ledger: every transfer balances, no customer account negative, total is zero, no completed transfer without entries.
- It is a second line of defense for bugs, direct SQL edits, and bypassed code paths.
- It found 9 real overdrafts left by my no-lock stress runs (-33000 = 21 successes instead of 10).
- Fixed with one balanced correcting transfer from Treasury, never by editing or deleting history.
- A balanced transfer can still overdraw an account (caught by check 2); an unbalanced one breaks the ledger total (caught by checks 1 and 3).
- Triggers guard new writes only; reconciliation finds old problems.
- Treasury is allowed to be negative because it issues the money.
