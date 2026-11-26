import test, {before , after} from "node:test";
import assert from "node:assert/strict";
import app from "./app"
import { pool } from "./db";
import { hashPassword ,readToken } from "./auth";
import { resolve } from "node:dns";
import { transfer } from "./transfer";
import { fail } from "node:assert";
import { mainModule, ref } from "node:process";
import { read } from "node:fs";
import { log } from "node:console";

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

async function send(key : string | null , from : number , to : number , amount : any , token? : string){
    const headers : any = {'Content-Type' : 'application/json'};
    if(key){
        headers['Idempotency-Key'] = key;
    }
    if(token){
        headers['Authorization'] = 'Bearer ' + token;
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
    const from = await createAccount(label + '-from-' + RUN , 100000);
     const to = await createAccount(label + '-to-' + RUN , 0);

     for(let i = 1; i <=5; i++){
        await send(label + '-' + i + '-' + RUN,from, to , 1000)
     }
     const held = await send(label + '-6-' + RUN , from ,to, 1000);
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
test('approving a held payment moves the money once : a second approval gets 409' , async()=>{
    const held = await makeHeldPayment('t11');

    const first = await approve(held.reviewId);
    assert.equal(first.status, 200);
    assert.equal(await balanceOf(held.from) ,94000);
    assert.equal(await balanceOf(held.to) , 6000);

    const second = await approve(held.reviewId);
    assert.equal(second.status , 409);
    assert.equal(await balanceOf(held.from) , 94000);
});

test('two reviews approving on same moment : one wins , one get : 409' , async() =>{
    const held = await makeHeldPayment('t12');

    const anwsers = await Promise.all([approve(held.reviewId) , approve(held.reviewId)]);
    const statuses = anwsers.map((a) => a.status).sort();
    
    assert.deepEqual(statuses , [200,409]);
    assert.equal(await balanceOf(held.from) , 94000);
});

function reject(reviewId : number , reason: string){
    return fetch(BASE_URL + '/reviews/' + reviewId + '/reject' , {
        method : 'POST',
        headers : {
            'Content-Type' : 'application/json'
        } , 
        body : JSON.stringify({
            reason : reason , reviewer : 'Vaibhav'
        }),
    });
}
test('rejecting a held payment moves no money and records who and why' , async()=>{ 
    const held = await makeHeldPayment('t13');

const res = await reject(held.reviewId, 'customer reports stolen phone');
assert.equal(res.status, 200, await res.clone().text());
    assert.equal(await balanceOf(held.from) , 95000);
    assert.equal(await balanceOf(held.to) , 5000);

    const row = await pool.query(
        `SELECT status, decision_note , decided_by FROM reviews WHERE id = $1`,
        [held.reviewId],
    );
    assert.equal(row.rows[0].status , 'REJECTED');
    assert.equal(row.rows[0].decision_note , 'customer reports stolen phone');
    assert.equal(row.rows[0].decided_by , 'Vaibhav');

});
test('a rejection needs a reason , and a decided review is final' , async()=>{
    const held = await makeHeldPayment('t14');

    const noReason = await reject(held.reviewId , '');
    assert.equal(noReason.status , 400);

    const first = await reject (held.reviewId , 'stolen phone');
    assert.equal(first.status , 200);

    const lateApprove = await approve(held.reviewId);
    assert.equal(lateApprove.status , 409);
    assert.equal(await balanceOf(held.from) , 95000);
});
test('retrying a reject payment returns 403 and does not look like review' , async()=>{
    const held = await makeHeldPayment('t15');
    await reject(held.reviewId , 'stolen phone');

    const retry = await send('t15-6-' + RUN , held.from , held.to , 1000);
    assert.equal(retry.status , 403);
    assert.equal(retry.body.error, 'TRANSFER_DECLINED');
});
test('a risk decision saves the fact that guard saw' , async()=> {
    await makeHeldPayment('t16');

    const row = await pool.query(
        `SELECT features FROM risk_decision WHERE idempotency_key = $1`,
        ['t16-6-' + RUN],
    );
    const f = row.rows[0].features;

    assert.equal(f.transfersLastMinute , 5);
    assert.equal(f.pastTransferCount , 5);
    assert.equal(f.averageAmountMinor , 1000);
    assert.equal(f.sentLast24hMinor , 5000);
    assert.equal(f.senderBalanceMinor , 95000);
    assert.equal(f.isNewReceiver , false);
});
test('the stored balance matches the ledger after a transfer' , async()=>{
    const from = await createAccount('t17-from-' + RUN , 100000);
    const to = await createAccount('t17-to-' + RUN , 0);

    const res = await send('t17-1-' + RUN , from , to , 4000);
    assert.equal(res.status , 201);

    const stored = await pool.query(
        'SELECT id , balance_minor FROM accounts WHERE id = ANY($1::int[])',
        [[from , to]],
    );
    const byId: any = {};
    for(const row of stored.rows){
        byId[row.id] = Number(row.balance_minor);
    }
    assert.equal(byId[from] , 96000);
    assert.equal(byId[to] , 4000);
    assert.equal(byId[from] , await balanceOf(from));
    assert.equal(byId[to] , await balanceOf(to));
});
test('opposite transfers at the same amount do not deadlock' , async()=>{
    const a = await createAccount('t18-a-' + RUN , 1000000);
    const b = await createAccount('t18-b-' + RUN , 1000000);

    const jobs = [];
    for(let i = 0; i < 30; i++){
        jobs.push(transfer('t18-ab-' + i + '-' + RUN , a , b , 1000));
        jobs.push(transfer('t18-ba-' + i + '-' + RUN , b , a , 1000));

    }
    const results = await Promise.allSettled(jobs);
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    
    assert.equal(failed.length , 0 , failed.length ? String(failed[0].reason) : '');
    assert.equal(await balanceOf(a) , 1000000);
    assert.equal(await balanceOf(b) , 1000000);
});

test('the balance check reads the sender , not the receiver' , async()=>{
    const poor = await createAccount('t19-poor-'+RUN , 1000);
    const rich = await createAccount('t19-rich-' + RUN , 1000000);

    const refused = await send('t19-1-' + RUN, poor , rich , 5000);
    assert.equal(refused.status , 422);

    const allowed = await send('t19-2-' + RUN , rich , poor, 5000);
    assert.equal(allowed.status , 201);
});

async function makeUser(label: string, role: string, password: string){
    const email = label + '-' + RUN + "@example.com";
    await pool.query(
        `INSERT INTO users (email , password_hash , role) VALUES ($1,$2,$3)`,
        [email , hashPassword(password), role],
    );
    return email;
}
async function login(email: string, password : string){
    const response = await fetch(BASE_URL + '/auth/login', {
        method : 'POST',
        headers: {'Content-Type' : 'application/json'},
        body: JSON.stringify({email : email , password : password}),

    });
    return{
        status : response.status,
        body: await response.json()
    };

}
test('a correct login returns a token that carries the user and the role ' ,async () => {
    const email = await makeUser('u1','reviewer' , 'correct-horse-9');
    const res = await login(email , 'correct-horse-9');

    assert.equal(res.status , 200);
    const who = readToken(res.body.token);
    assert.equal(who.role , 'reviewer');
    assert.ok(who.userId > 0);
});
test('a wrong password and a unknow email get the same 401' , async() => {
    const email = await makeUser('u2' , 'customer' , 'right-password-1');

    const wrongPassword = await login(email , 'wrong-password-1');
    const unknownEmail = await login('nobody-' + RUN + '@example.com' , 'whatever-1');

    assert.equal(wrongPassword.status , 401);
    assert.equal(unknownEmail.status , 401);
    assert.deepEqual(wrongPassword.body , unknownEmail.body);

});
test('the password is stored as a stored as a selected hash, never as plain text', async() => {
    const email = await makeUser('u3' , 'customer' , 'plain-secret-3');
    const row = await pool.query('SELECT password_hash FROM users WHERE email = $1' , [email]);
    
    assert.ok(!row.rows[0].password_hash.includes('plain-secret-3'));
    assert.ok(row.rows[0].password_hash.includes(':'));
    
});

async function userWithToken(label : string , role : string){
    const email = label + '-' + RUN + '@example.com';
    const password = 'test-password-1';
    const made = await pool.query(
        'INSERT INTO users(email , password_hash , role) VALUES ($1, $2, $3) RETURNING id',
        [email , hashPassword(password) , role],
    );
    const res = await login(email , password);
    return{userId: made.rows[0].id as number, token: res.body.token as string
    };
}
async function ownAccount(userId: number , name: string , fundingPaise : number){
    const id = await createAccount(name , fundingPaise);
    await pool.query('UPDATE accounts SET user_id = $1 WHERE id = $2' , [userId ,id]);
    return id;
}

test('no token gets 401 , and a forged one get 401' , async ()=> {
    const none = await fetch(BASE_URL + '/reviews');
    assert.equal(none.status , 401);

    const forged = await fetch(BASE_URL + '/reviews' , { headers: {Authorization: 'Bearer abc.def.ghi'}});
    assert.equal(forged.status , 401);
});
test('a customer cannot send from an account they do not own and gets 403' , async() => {
    const rajat = await userWithToken('rajat' , 'customer');
    const Vaibhav = await userWithToken('Vaibhav' , 'customer');
    const VaibhavAccount = await ownAccount(Vaibhav.userId , 'Vaibhav-acct-' + RUN , 100000);
    const target = await createAccount('target-' + RUN , 0);

    const res = await send('own-1-' + RUN , VaibhavAccount , target , 1000 , rajat.token);
    assert.equal(res.status , 403);
    assert.equal(await balanceOf(VaibhavAccount) , 100000);

});
test('a customer cannot read the review queue' , async () => {
    const rajat = await userWithToken('rajat2-', 'customer');
    const res = await fetch(BASE_URL + '/reviews' , {headers : { Authorization : 'Bearer' + rajat.token}});
    assert.equal(res.status,403);
});
test('a reviewer cannot approve a payment from their own account , and decided_by is the token user' , async() => {
    const password = 'reviewer-password-1';

    const reviewerEmail = await makeUser('t20-reviews1' , 'reviewer' , password);

    const reviewer = await login(reviewerEmail , password);
    const reviewId = readToken(reviewer.body.token).userId;

    const from = await createAccount('t20-from-' + RUN , 100000);
    
    await pool.query(
        `UPDATE accounts SET user_id = $1 WHERE id = $2`,
        [reviewId , from]
    );
    const to = await createAccount('t20-to-' + RUN , 0);

    for(let i = 1; i <= 5; i++){
        await send('t20' + i + '-' + RUN , from ,to , 1000);
    }
    const held = await send('t20-6-' + RUN , from ,to , 1000);
    assert.equal(held.status, 202);

    const ownApproval = await fetch(
        BASE_URL + '/reviews/' + held.body.reviewId + '/approve',
        {
            method : 'POST',
            headers: {
                Authorization : 'Bearer ' + reviewer.body.token;
            }
        }
    );
    assert.equal(ownApproval.status,403);

    const ownReview = await pool.query(
        `SELECT status FROM reviews WHERE id = $1`,
        [held.body.reviewId],
    );
    assert.equal(ownReview.rows[0].status, 'PENDING_REVIEW');

    const password2 = 'reviewer-password-2';
    const review2Email = await makeUser('t20-reviewer2' , 'reviewer' , password);

    const review2 = await login(review2Email , password2);
    const review2Id = readToken(review2.body.token).userId;

    const held2 = await makeHeldPayment('t20-second');
    
    const rejection = await fetch(BASE_URL + '/reviews/' + held2.reviewId + '/reject/',
        {
            method : 'POST',
            headers: {
                'Content-Type' : 'application/json',
                Authorization : 'Bearer ' + review2.body.token
            },
            body : JSON.stringify({
                reason : 'Stolen-phone'
            })
        }
    );
    assert.equal(rejection.status , 200);
    const row = await pool.query(
        `SELECT status , decided_by FROM reviews WHERE id = $1`,
        [held2.reviewId]
    );
    assert.equal(row.rows[0].status , 'REJECTED');
    assert.equal(Number(row.rows[0].decided_by) , review2Id);

});