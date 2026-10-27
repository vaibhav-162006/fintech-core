import { pool } from "./db"
import{ transfer } from './transfer'

async function main(){
    console.log('1.) normal transfer : ');
    console.log(await transfer('node-002' , 0, 2, 10000));

    console.log('2.) same key again (a retry) : ');
    console.log(await transfer('node-002' , 0, 2, 10000));

    console.log('3.) more than Asha has : ');
    try {
        await transfer('node-too-much' , 1 , 2 , 999999);

    } catch(e) {
        console.log("rejected" , (e as Error).message);
    }

    const balances = await pool.query(
        `SELECT account_id , 
                        SUM(CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE -amount_minor END) AS balance
                      FROM journal_entries GROUP BY account_id ORDER by account_id` ,

    );
    console.table(balances.rows);
    await pool.end();
}
main();