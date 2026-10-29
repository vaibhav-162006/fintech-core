import { pool } from "./db"

async function main(){
    let problems = 0;
    

    const unbalanced = await pool.query(
        `SELECT transfer_id ,
        SUM(CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE -amount_minor END)
        FROM journal_entries
        GROUP BY transfer_id
        HAVING SUM(CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE -amount_minor END) <> 0`,

    );
    console.log('1) Unbalanced Transfers: ' , unbalanced.rows.length);
    if(unbalanced.rows.length > 0){
        console.table(unbalanced.rows);
        problems++;
    }
    const negative = await pool.query(
        `SELECT a.id , a.owner_name ,
        SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount_minor else -e.amount_minor END) AS balance
        FROM journal_entries e
        JOIN accounts a ON a.id = e.account_id
        WHERE a.owner_name <> 'Treasury'
        GROUP BY a.id , a.owner_name
        HAVING SUM (CASE WHEN e.direction = 'CREDIT' THEN e.amount_minor ELSE -e.amount_minor END) < 0` ,
    );
    console.log("2) negative customer accounts: " , negative.rows.length);
    if(negative.rows.length > 0){
        console.table(negative.rows);
        problems++;
    }
    const total = await pool.query(
        `SELECT COALESCE (SUM(CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE -amount_minor END), 0)AS total
        FROM journal_entries`
    );
    const totalValues = Number(total.rows[0].total);
    console.log("3) total of whole ledger: " , totalValues , "(should be 0)")
    if(totalValues !== 0){
        problems++;
    }

    const empty = await pool.query(
        `SELECT t.id , t.idempotency_key
        FROM transfers t 
        LEFT JOIN journal_entries e ON e.transfer_id = t.id
        WHERE t.status = 'COMPLETED' AND e.id is NULL`,
    );
    console.log('4) Completed transfers with no entries :' , empty.rows.length);
    if(empty.rows.length > 0){
        console.table(empty.rows);
        problems++;
    }
    console.log('');
    if(problems === 0){
    console.log('RECONCILLATION OK ');
    }else {
        console.log('RECONCILLATION FOUND' , problems , 'PROBLEM(S)');
        process.exitCode = 1;
    }
    await pool.end();
}
main();