import { PoolClient } from "pg";
import {pool} from "./config/db";
import { error } from "node:console";
import { replace } from "react-router-dom";


export async function transferInTransiction(
    client : PoolClient,
    idempotencyKey : string,
    fromAccountId : number,
    toAccountId: number,
    amountMinor: number,

){
    if(!idempotencyKey){
        throw new Error('idempotency key is required');
    }
    if(!Number.isInteger(amountMinor) || amountMinor <= 0){
        throw new Error('amount must be positive whole number is in paise');
    }
    if(fromAccountId === toAccountId){
        throw new Error('cannot transfer to the same account')
    }
    
    const existing = await client.query(
        `SELECT id FROM transfers WHERE idempotency_key = $1`,
        [idempotencyKey],
    )
    if(existing.rows.length>0){
        return{
            transferId : existing.rows[0].id, replayed : true
        };
    }
    const created = await client.query(
        `INSERT INTO transfers (idempotency_key) VALUES ($1) returning id`,
        [idempotencyKey]
    );
    const transferId = created.rows[0].id;
    const lock = await client.query(
        `SELECT id FROM accounts WHERE id = $1 FOR UPDATE`,
        [fromAccountId],
    );
    if(lock.rows.length === 0){
        throw new Error('sender account not found');
    }
    const result = await client.query(
        `SELECT COALESCE(SUM(CASE WHEN direction ='CREDIT'
                            THEN amount_minor ELSE -amount_minor END) ,0 ) AS balance
                            FROM journal_entries
                            WHERE account_id = $1`,
                            [fromAccountId],
    );
    const balance = Number(result.rows[0].balance);

    if(balance < amountMinor){
        throw new Error('INSUFFICIENT_FUNDS');
    }

    await client.query(
        `INSERT INTO journal_entries (transfer_id , account_id , direction , amount_minor)
        VALUES ($1 , $2 , 'DEBIT' , $4) , ($1 , $3 , 'CREDIT' , $4)`,
        [transferId , fromAccountId , toAccountId , amountMinor],
    );
    return{
        transferId : transferId , 
        replayed : false
    };


}
export async function transfer(
    idempotencyKey : string,
    fromAccountId : number,
    toAccountId : number,
    amountMinor : number
){
const client = await pool.connect();
    try{
        await client.query('BEGIN');


        const result = await transferInTransiction(
            client, idempotencyKey , fromAccountId , toAccountId , amountMinor,
        );
 await client.query('COMMIT');
 return result;
    } catch (error){
        await client.query('ROLLBACK');
        throw error;
    } finally{
        client.release();
    }
    
}