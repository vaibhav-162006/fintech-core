import {pool} from "./db";



export async function transfer(
    idempotencyKey : string,
    fromAccountId : number,
    toAccountId : number,
    amountMinor : number
){


    if(!idempotencyKey){
        throw new Error('idempotencyKey is required');
    }
    if(!Number.isInteger(amountMinor) || amountMinor <= 0){
        throw new Error('amount must be positive whole number is in paise')
    }
    if(fromAccountId === toAccountId){
        throw new Error('cannot trnasfer to same account')
    }

    const client = await pool.connect();
    try{
        await client.query('BEGIN');

        const existing = await client.query(
            'SELECT id FROM transfers WHERE idempotency_key = $1',
            [idempotencyKey],
        );
        if(existing.rows.length > 0) {
            await client.query('COMMIT')
            return{ transferId : existing.rows[0].id , replayed : true};
        }
        const created = await client.query(
            'INSERT INTO transfers (idempotency_key) VALUES ($1) RETURNING id', 
            [idempotencyKey],
        );
        const trnasferId = created.rows[0].id;

        const lock = await client.query(
            'SELECT id FROM accounts WHERE id = $1 FOR UPDATE',
            [fromAccountId],
        );
        if(lock.rows.length === 0){
            throw new Error ("sender account not found ")
        }
        const result = await client.query(
`SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT'
                                THEN amount_minor ELSE -amount_minor END), 0) AS balance
         FROM journal_entries
        WHERE account_id = $1`,
    [fromAccountId],
        );
        const balance = Number(result.rows[0].balance);

            if(balance < amountMinor){
                throw new Error('INSUFFICIENT_FUNDS');
            }

            await client.query(
`INSERT INTO journal_entries (transfer_id, account_id, direction, amount_minor)
       VALUES ($1, $2, 'DEBIT', $4), ($1, $3, 'CREDIT', $4)`,
    [trnasferId , fromAccountId , toAccountId , amountMinor]           
 );

 await client.query('COMMIT');
 return {trnasferId , replayed : false};
    } catch(error){
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}