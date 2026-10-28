import { send } from "vite";
import { pool } from "./db"

import { transfer } from "./transfer"

const Funding  = 30000;
const amount = 3000;
const attempts = 50;
const Expected_success = Math.floor(Funding / amount);

async function balanceOf(account_id : number){
    const result = await pool.query(
        `SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' 
        THEN amount_minor ELSE -amount_minor END) , 0) AS balance
        FROM journal_entries
        WHERE account_id = $1`,
        [account_id],
    );
    return Number(result.rows[0].balance);
}
async function createAccount(name : string){
    const result = await pool.query(
    `INSERT INTO accounts (owner_name) VALUES ($1) RETURNING id`,
    [name],
    );
    return result.rows[0].id;
}
async function main(){
    const runId = 'stress-' + Date.now();

    const treasury = await pool.query(
        `SELECT id FROM accounts WHERE owner_name = 'Treasury'`,

    );
    const treasuryId = treasury.rows[0].id;

    const senderId = await createAccount(runId + '-sender');
    const recieverId = await createAccount(runId + '-reciever');

    await pool.query(
        `WITH t AS (INSERT INTO transfers(idempotency_key) VALUES ($1) RETURNING id)
        INSERT INTO journal_entries (transfer_id , account_id , direction, amount_minor)
        SELECT t.id, $2::int ,  'DEBIT', $4::bigint FROM t
        UNION ALL 
        SELECT t.id , $3::int , 'CREDIT' , $4::bigint FROM t`,
        [runId + '-fund' , treasuryId , senderId , Funding],
    );
    console.log('Sender starts with' , await balanceOf(senderId) , 'paise.');
    console.log('Firing' , attempts , 'transfers of' , amount , 'at once...');

    const result = await Promise.allSettled(
        Array.from({length : attempts} , (_ , i) => 
        transfer(runId + '-' + i , senderId , recieverId, amount),
    ),
    );
    let succeeded = 0;
    let insuffecient = 0;
    let otherErrors = 0;

    for(const r of result){
        if(r.status === 'fulfilled'){
            succeeded++;
        } else if(r.reason.message === 'INSUFFICIENT_FUNDS'){
            insuffecient++;
        } else {
            otherErrors++;
        }
    }
    const senderBalance = await balanceOf(senderId);
    const recieverBalance = await balanceOf(recieverId);

    console.log('');
    console.log('succeeded      ' , succeeded , '(expected', Expected_success + ')' );
    console.log('Insuffecient funds : ' , insuffecient);
    console.log('other errors :     ' , otherErrors );
    console.log('sender Balance : ' , senderBalance);
    console.log('reciever Balance : ' , recieverBalance);
    console.log('')


    const check1 = senderBalance >= 0;
    const check2 = succeeded === Expected_success;
    const check3 = otherErrors === 0;
    const check4 = senderBalance + recieverBalance === Funding;

    console.log(check1 ? 'PASS' : 'FAIL', 'sender never negative');
    console.log(check2 ? 'PASS' : 'FAIL' , 'exactly 10 transfers succeeded');
    console.log(check3 ? 'PASS' : 'FAIL' , 'no unexpected errors');
    console.log(check4 ? 'PASS' : 'FAIL' , 'sender + reciever still equals the funding');

    if(check1 && check2 && check3 && check4){
        console.log('\n ALL CHECKS PASSED');
    } else{
        console.log('\n TEST FAILED');
    }
    await pool.end();
}
main();