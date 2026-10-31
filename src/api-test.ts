import test, {before , after} from "node:test";
import assert from "node:assert/strict";
import app from "./app"
import { pool } from "./db";
import { resolve } from "node:dns";

let BASE_URL = '';
let server : any;
before(async ()=> {
    await new Promise((resolve) => {
        server = app.listen(0 , () => resolve(null));
    });
    BASE_URL = 'http://127.0.0.1:' + server.address().port;
})
const RUN = Date.now();

async function balanceOf(accountId : number){
    const result = await pool.query(
        `SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE -amount_minor END), 0) AS balance FROM journal_entries WHERE account_id = $1`,
        [accountId],
    );
    return Number(result.rows[0].balance);
}

async function createAccount(name : string, fundingPaise: number){
    const created = await pool.query(
        `INSERT INTO accounts (owner_name) VALUES ($1) RETURNING id`,
    [name] ,
);
const id = created.rows[0].id;
if(fundingPaise > 0){
    const treasury = await pool.query(
        `SELECT id FROM accounts WHERE owner_name = 'Treasury'`,

    );
    
    await pool.query(
        `WITH t AS(INSERT INTO transfers (idempotency_key) VALUES ($1) RETURNING id)
        INSERT INTO journal_entries(transfer_id , account_id , direction , amount_minor)
        SELECT t.id , $2::int, 'DEBIT' , $4::bigint FROM t
        UNION ALL
        SELECT t.id , $3::int ,'CREDIT' , $4::bigint FROM t`,
        [name + '-fund' , treasury.rows[0].id , id , fundingPaise],

    );


}
return id;
    
    
    

}

async function send(key : string | null , from : number , to : number , amount : any){
    const headers : any = {'Content-Type' : 'application/json'};
    if(key){
        headers['Idempotency-Key'] = key;
    }
    const response = await fetch(BASE_URL + '/transfers' , {
        method : 'POST',
        headers : headers,
        body : JSON.stringify({
            fromAccountId : from,
            toAccountId : to,
            amount_minor : amount,
        }),
    })
    const body = await response.json();
    return{
        status: response.status,
        body: body
    };
}
after(async() => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(() => resolve(null)));
    await pool.end();
});

test('a new transfer moves the money and return 201' , async () => {
    const from = await createAccount('t1-from-'  + RUN, 10000);
    const to = await createAccount('t1-to-' + RUN , 0);

    const res = await send('t1-' + RUN , from , to , 4000);
    assert.equal(res.status,201);
    assert.equal(res.body.replayed , false);
    assert.ok(res.body.transferId);
    assert.equal(await balanceOf(from) , 6000);
    assert.equal(await balanceOf(to) , 4000);
});
test('b  same key twice returns 200 and moves money only once' , async() => {
    const from = await createAccount('t2-from-' + RUN , 10000);
    const to = await createAccount('t2-to-' + RUN , 0);

   const first = await send('t2-' + RUN, from, to, 4000);
const second = await send('t2-' + RUN, from, to, 4000);
    

    assert.equal(first.status , 201, JSON.stringify(first.body));
    assert.equal(second.status , 200);
    assert.equal(second.body.replayed , true);
    assert.equal(second.body.transferId , first.body.transferId);
    assert.equal(await balanceOf(from) , 6000);
});

test('a missing Idempotency_key return 400' , async () => {
    const from = await createAccount('t3-from-' + RUN , 10000);
    const to = await createAccount('t3-to-' + RUN , 0);
const res = await send(null , from , to , 4000);

assert.equal(res.status ,400);
assert.equal(await balanceOf(from) , 10000);

});
test('a String amount return 400' , async () =>{
const from = await createAccount('t4-from-' + RUN , 10000);
const to = await createAccount('t4-to-' +RUN , 0);

const res = await send('t-4-' + RUN , from , to , '4000');
assert.equal(res.status , 400);
assert.equal(await balanceOf(from) , 10000);

});
test('not enough money returns 422 and moves nothing' ,async()=>{
    const from = await createAccount('t5-from-' + RUN , 10000);
    const to = await createAccount('t5-to-' +RUN , 0);

    const res = await send('t5-' + RUN , from ,to , 999999);
    assert.equal(res.status , 422);
    assert.equal(await balanceOf(from), 10000);
    assert.equal(await balanceOf(to) , 0);
});

test('a reciever that does not exist returns 404 and move mothing' , async() => {
    const from = await createAccount('t6-from-' + RUN , 10000);
    const res = await send('t6-' + RUN , from ,999999 ,4000);
    assert.equal(res.status , 404);
    assert.equal(await balanceOf(from) , 10000);
});