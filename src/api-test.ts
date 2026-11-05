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

test('a new transfer moves the money and return 202' , async () => {
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
test('the 6th transfer in a minute in a held for review and moves no money ' , async() => {
    const from = await createAccount('t7-from-' + RUN , 100000);
    const to  = await createAccount('t7-to-' + RUN , 0);

    for(let i = 1; i <= 5; i++){
        const ok = await send('t7-' + i + '-' + RUN , from , to , 1000);
        assert.equal(ok.status, 201);

    }
    const held = await send('t7-6-' + RUN , from , to , 1000 );

    assert.equal(held.status , 202);
    assert.equal(held.body.status , 'PENDING_REVIEW');
    assert.equal(await balanceOf(from) , 95000);

    const saved = await pool.query(
        `SELECT decision, reasons FROM risk_decision WHERE idempotency_key = $1`,
        ['t7-6-' + RUN],
    );
    assert.equal(saved.rows[0].decision , 'REVIEW');
    assert.equal(saved.rows[0].reasons[0].code , 'HIGH_VELOCITY');
});

test('going over the daily limit is declined with 403 and moves no money' , async() => {
    const from = await createAccount('t8-from-' + RUN , 2000000);
    const to = await createAccount('t8-to-' + RUN , 0);

    const first = await send('t8-1-' + RUN , from , to , 950000);
    assert.equal(first.status , 201);

    const second = await send('t8-2-' + RUN , from , to , 60000);
    assert.equal(second.status , 403);
    assert.equal(second.body.error , 'TRANSFER_DECLINED');
    assert.equal(await balanceOf(from) , 1050000);
});
test('retrying a held payment returns to same review and crates no second one' , async () => {
    const from = await createAccount('t9-from-' + RUN , 100000);
    const to = await createAccount('t9-to-' + RUN , 0);
    
    for(let i = 1 ; i <= 5; i++){
        await send('t9-' + i + '-' + RUN , from , to , 1000);

    }
    const first = await send('t9-6-' + RUN , from ,to , 1000);
    const retry = await send('t9-6-' + RUN , from , to , 1000);

    assert.equal(first.status ,202);
    assert.equal(retry.status, 202);
    assert.equal(retry.body.reviewId , first.body.reviewId);

    const reviews = await pool.query(
        `SELECT COUNT(*) AS n FROM reviews WHERE idempotency_key = $1`,
        ['t9-6-' + RUN],
    );
    assert.equal(Number(reviews.rows[0].n) , 1);

    const decisions = await pool.query(
        `SELECT COUNT(*) AS n FROM risk_decision WHERE idempotency_key = $1`,
        ['t9-6-' + RUN],
    );
    assert.equal(Number(decisions.rows[0].n) , 1);

});

test('a held payment appears in review queueu with its reasons ' , async()=> {
    const from = await createAccount('t10-from-' + RUN , 1000000);
    const to = await createAccount('t10-to-' + RUN , 0);

    for(let i = 1; i <= 5; i++){
        await send ('t10-' + i + '-' + RUN , from , to , 1000);

    }
    const held = await send('t10-6-' + RUN , from, to , 1000);
    assert.equal(held.status , 202);

    const response = await fetch(BASE_URL + '/reviews');
    const body = await response.json();
  assert.equal(response.status, 200);

  const mine = body.reviews.find((r: any) => r.id === Number(held.body.reviewId));
  assert.ok(mine, 'the held payment should be in the queue');
  assert.equal(mine.amountMinor, 1000);
  assert.equal(mine.reasons[0].code, 'HIGH_VELOCITY');
})

async function makeHeldPayment(label : string){
    const from = await createAccount(label + '-from-' + RUN , 1000000);
     const to = await createAccount(label + '-to-' + RUN , 0);

     for(let i = 1; i <=5; i++){
        await send(label + '-' + i + '-' + RUN,from, to , 1000)
     }
     const held = await send(label + '-' + '-6-' + RUN , from ,to, 1000);
     assert.equal(held.status , 202);

     return{
        from: from,
        to : to ,
        reviewId : held.body.reviewId
     };
    
}
function approve(reviewId : number){
    return fetch(BASE_URL + '/reviews/' + reviewId + '/approve' , {
        method : "POST"
    });

}
test('approving a held payment moves the money once ; a second approval gets 409' , async()=>{
    const held = await makeHeldPayment('t11');

    const first = await approve(held.reviewId);
    assert.equal(first.status, 200);
    assert.equal(await balanceOf(held.from) , 94000);
    assert.equal(await balanceOf(held.to) , 6000);

    const second = await approve(held.reviewId);
    assert.equal(second.status , 409);
    assert.equal(await balanceOf(held.from) , 94000);
});

test('two reviews approving on same moment : one wins , one get : 409' , async() =>{
    const held = await makeHeldPayment('t12');

    const anwsers = await Promise.all([approve(held.reviewId) , approve(held.reviewId)]);
    const statuses = anwsers.map((a) => {
        
    })
})
