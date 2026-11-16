import { ALL } from "node:dns";
import{ pool } from "../src/db";
import{ transfer } from "../src/transfer";
import { error, time } from "node:console";

const N = Number(process.env.N ?? 200);
const AMOUNT = 1000;
const runId = Date.now();

async function makeAccounts(prefix: string, count: number, fundEach:number){
    const created = await pool.query(
        `SELECT INTO accounts(owner_name)
        SELECT $1::text || g::text FROM generate_series(1 , $2::int) AS g
        RETURNING id `,
        [prefix,count],
    );
    const ids:  number[] = created.rows.map((r)=> r.id);
    const treasury = await pool.query(
        `SELECT id FROM accounts WHERE owner_name = 'Treasury'`
    );
    await pool.query(
`WITH t AS (INSERT INTO transfers (idempotency_key) VALUES ($1) RETURNING id)
     INSERT INTO journal_entries (transfer_id, account_id, direction, amount_minor)
     SELECT t.id, $2::int, 'DEBIT', ($4::bigint * $5::bigint) FROM t
     UNION ALL
     SELECT t.id, a.id, 'CREDIT', $4::bigint FROM t, unnest($3::int[]) AS a(id)`,
     [prefix + 'fund-' , treasury.rows[0].id, ids , fundEach , count],
        );
        return ids;
}
function prenctile(sorted:number[] ,p : number){
    return sorted[Math.min(sorted.length - 1 , Math.floor((p/100) * sorted.length))];

}
async function run(label: string, senders : number[] , receiver: number){
    const times: number[] = [];
    const started = performance.now();

    const results = await Promise.allSettled(
        senders.map(async (senderId , i) => {
            const t0 = performance.now();
            const result = await transfer(label + '-' + runId + '-' + i, senderId , receiver, AMOUNT);
            times.push(performance.now()-t0);
            return result;
        }),
    );
    const total = performance.now() - started;
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    times.sort((a,b) => a - b);

    console.log(
        label.padEnd(8),
        `payments ${ok}/${senders.length}`,
        `| total ${Math.round(total)} ms`,
        `| ${Math.round((ok/total) * 1000)} payments/s`,
        `  latency p50 : ${Math.round(prenctile(times,50))} ms , p99 : ${Math.round(prenctile(times,99))} ms `,

    );
}
async function main(){
    const receiverRow = await pool.query(
        `INSERT INTO accounts (owner_name) VALUES ($1) RETURNING id`,
        ['hot-receiver-' + runId],

    );
    const receiver : number = receiverRow.rows[0].id;

    const many = await makeAccounts('many-'+ runId + '-' , N , AMOUNT * 2);
    
    const hot = await makeAccounts('hot-' + runId + '-' ,1, AMOUNT * N * 2);

    await run('warmup' , many.slice(0 , Math.min(50,N)) , receiver);
    
    console.log('--- the numbers that count (N = ' + N + ')---');
    await run('many' , many,receiver);
    await run('one' , Array(N).fill(hot[0]) , receiver);

    await pool.end();
    
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;

});