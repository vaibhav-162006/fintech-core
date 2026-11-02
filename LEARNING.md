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

## Day 8 - HTTP API
- Express wraps transfer(): read the Idempotency-Key header and the JSON body, validate, call transfer(), answer with a status code.
- 201 = created, 200 = replayed retry, 400 = caller's mistake, 422 = understood but cannot be done (insufficient funds), 500 = our fault.
- The idempotency key lives in a header, like Stripe, so "which request" is separate from "what it says".
- Never send internal error text to callers; log it for ourselves.

## Day 9 - Automated API tests
- Tests call the running API over HTTP (black box) and assert the status code AND the effect on balances.
- Each test makes fresh accounts with unique names, so tests never depend on each other or on old data.
- Failing tests found real bugs: a typo in the response key (trnasferId), a missing 404 for unknown accounts, and no 422 mapping for INSUFFICIENT_FUNDS.
- A retry test must reuse the SAME idempotency key; different keys mean different transfers.
- The server must be restarted after editing code, because tsx does not reload by itself.
- Changing code on purpose to see a test fail proves the test can catch the bug.

## Day 10 - Self-starting tests and Docker Compose
- Split app.ts (builds the Express app) from server.ts (calls listen), so tests can start their own copy on a free port (port 0 = pick any free one).
- Compose runs the database and the API together with one command.
- Postgres runs .sql files in docker-entrypoint-initdb.d on first start, only on an empty data directory. A failed init needs docker compose down -v before retrying.
- depends_on with a healthcheck waits until the database is READY, not merely started.
- down keeps data (named volume); down -v wipes it.
- .dockerignore keeps .env and node_modules out of the image.
- Bugs found: a missing ":" in a test URL, double quotes in SQL (column name, not text), and a space inside 'CREDIT ' that a CHECK constraint rejected.

## Day 11 - GitHub Actions CI
- CI runs the same steps on a clean machine for every push: fresh Postgres service container, schema, seed, tests, stress test, reconciliation.
- The workflow creates its own .env, because the real one is git-ignored and must never be committed.
- A green badge in the README is proof a recruiter can see without running anything.
- First failure: "password authentication failed". The database was started with one password and the URL used another. The log line named the cause directly.
- Annotations show only the exit code; the step log has the real error. psql exit code 2 = could not connect.
- git revert adds a correcting commit instead of rewriting history, like a correcting transfer in the ledger.

## Day 13 - Risk engine, rules layer
- A risk engine scores a transfer BEFORE it is posted: ALLOW, REVIEW (human check), or BLOCK.
- Rules: velocity, unusual amount vs the sender's average, large payment to a new receiver, draining the balance, daily limit. Each adds points and a reason.
- assessTransfer is a pure function (features in, decision out), so it is tested with simple cases and no database.
- Boundaries are tested on purpose (4 vs 5 transfers, exactly 5x the average), because off-by-one mistakes live there.
- Reasons make every decision explainable, which regulators and customers both need.
- Thresholds are invented for learning; real ones come from data. The rules also give a baseline for the machine learning model later.
- Known gap: many small transfers that each stay under every threshold.

## Day 14 - Risk engine connected to the ledger
- Flow: collect facts from the ledger, ask the guard, save the decision, then act: ALLOW runs transfer(), REVIEW holds (202), BLOCK declines (403).
- Facts (features.ts) come from plain SQL over journal_entries: velocity, average size, new receiver, last 24 hours, balance.
- risk_decisions stores every decision with its reasons, as an audit trail and for tuning rules.
- Customers see only TRANSFER_DECLINED; reasons stay internal so fraudsters cannot learn which rule fired.
- A retry of an already-completed key is not judged again. A transfer the sender cannot afford skips the guard and is rejected as insufficient funds (422).
- Known gaps: the guard runs outside the transfer's transaction, so two simultaneous requests can both pass the velocity check. Held transfers have no approve/reject flow yet. Retrying a held request adds another decision row.
