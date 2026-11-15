import autocannon from "autocannon";
import { Client } from "pg";


const API = process.env.API_URL ?? "http://127.0.0.1:4001";
const DB = process.env.LOAD_DATABSE_URL ?? 'postgres://postgres:ved@127.0.0.1:5433/fintech';
const TOTAL = Number(process.env.TOTAL ?? 2000);
const CONNECTIONS = Number(process.env.CONNECTIONS ?? 20);

async function main(){

    const client = new Client({
        connectionString : DB
    });
    await client.connect();
    const senders = await client.query(
    `SELECT id FROM accounts WHERE owner_name LIKE 'load-sender-%' ORDER BY id`,

    );
    const receiver = await client.query(
        `SELECT id FROM accounts WHERE owner_name = 'load-receiver'`,

    );
    await client.end();

    const senderIds = senders.rows.map((r) => r.id);
   const receiverId = receiver.rows[0].id;
    if(senderIds.length === 0){
        throw new Error('no load-sender accounts found , run loadtest/setup.sql first');
    }
    const runId = Date.now();
    let counter = 0;
    console.log(`sending ${TOTAL} payments over ${CONNECTIONS} connections from ${senderIds.length} senders...`);

    const result = await autocannon({
        url: API,
        connections: CONNECTIONS,
        amount: TOTAL,
        requests:[
            {
                method: 'POST',
                path: '/transfers',
                headers:{ 'content-type' : 'application/json'

                },
                setupRequest: (req:any) => {
                    const n = counter++;
                    req.headers['idempotency-key'] = 'load-' + runId + '-' + n;
                    req.body = JSON.stringify({
                        fromAccountId: senderIds[n % senderIds.length],
                        toAccountId:receiverId,
                        amount_minor:1000,
                    });
                    return req;
                },
            },
        ],
    });
  
    console.log('');
    console.log("requests finished:" , result.requests.total);
    console.log("seconds:" , result.duration);
    console.log("throughput (req/s): " , Math.round(result.requests.total/ result.duration));
    console.log("latency ms p50:" ,  result.latency.p50 , 'p97.5:' , result.latency.p97_5
        , "p99:" , result.latency.p99 , "max:" , result.latency.max 
    );
    console.log("2xx:" , result['2xx'], ' non-2xx:' ,result.non2xx , ' errors:' , result.errors , ' timeouts:' , result.timeouts);
    console.log("status codes: ", JSON.stringify(result.statusCodeStats));

}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});