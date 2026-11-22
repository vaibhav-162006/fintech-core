import { send } from 'vite';
import { pool } from '../src/db';
import { transfer } from '../src/transfer';

const N = Number(process.env.N ?? 200);
const SHARED = process.env.SHARED === '1';
const AMOUNT = 1000;
const runId = Date.now();

async function makeAccounts(prefix: string, count: number, fundEach: number) {
  const created = await pool.query(
    `INSERT INTO accounts (owner_name)
     SELECT $1::text || g::text FROM generate_series(1, $2::int) AS g
     RETURNING id`,
    [prefix, count],
  );
  const ids: number[] = created.rows.map((r) => r.id);
  const treasury = await pool.query(`SELECT id FROM accounts WHERE owner_name = 'Treasury'`);

  await pool.query(
    `WITH t AS (INSERT INTO transfers (idempotency_key) VALUES ($1) RETURNING id)
     INSERT INTO journal_entries (transfer_id, account_id, direction, amount_minor)
     SELECT t.id, $2::int, 'DEBIT', ($4::bigint * $5::bigint) FROM t
     UNION ALL
     SELECT t.id, a.id, 'CREDIT', $4::bigint FROM t, unnest($3::int[]) AS a(id)`,
    [prefix + 'fund', treasury.rows[0].id, ids, fundEach, count],
  );
  return ids;
}

async function makeReceivers(prefix: string, count: number) {
  const created = await pool.query(
    `INSERT INTO accounts (owner_name)
     SELECT $1::text || g::text FROM generate_series(1, $2::int) AS g
     RETURNING id`,
    [prefix, count],
  );
  return created.rows.map((r) => r.id as number);
}

function percentile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function run(label: string, senders: number[], receivers: number[]) {
  const times: number[] = [];
  const started = performance.now();

  const results = await Promise.allSettled(
    senders.map(async (senderId, i) => {
      const t0 = performance.now();
      const result = await transfer(label + '-' + runId + '-' + i, senderId, receivers[i], AMOUNT);
      times.push(performance.now() - t0);
      return result;
    }),
  );

  const total = performance.now() - started;
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  times.sort((a, b) => a - b);
  const reasons: Record<string , number> = {};
  for(const r of results){
    if (r.status === 'rejected'){
      const message = String((r.reason as Error).message).slice(0,80);
      reasons[message] = (reasons[message] ?? 0)+ 1;

    }
  }
  if(ok < senders.length){
    console.log('   failures' , JSON.stringify(reasons));
    process.exitCode = 1;
  }

  console.log(
    label.padEnd(8),
    `payments ${ok}/${senders.length}`,
    `| total ${Math.round(total)} ms`,
    `| ${Math.round((ok / total) * 1000)} payments/s`,
    `| ${SHARED ? 'shared receiver' : 'own receiver'}`,
  );
}

async function main() {
  const own = await makeReceivers('rcv-' + runId + '-', N);
  const receivers = SHARED ? Array(N).fill(own[0]) : own;

  const many = await makeAccounts('many-' + runId + '-', N, AMOUNT * 2);
  const hot = await makeAccounts('hot-' + runId + '-', 1, AMOUNT * N * 2);

  await run('warmup', many.slice(0, Math.min(50, N)), receivers);

  console.log('--- N = ' + N + ' ---');
  await run('many', many, receivers);
  await run('one', Array(N).fill(hot[0]), receivers);

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
