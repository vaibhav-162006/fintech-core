import  { pool }  from './config/db';
export async function getFeatures(fromAccountId: number , toAccountId: number){
    const LastMinute = await pool.query(
        `SELECT COUNT (DISTINCT transfer_id) AS n
        FROM journal_entries
        WHERE account_id = $1
        AND direction = 'DEBIT'
        AND created_at > now() - interval '60 seconds' `,
        [fromAccountId],
    );
    const history = await pool.query(
        `SELECT COUNT(*) AS n , COALESCE(AVG(amount_minor),0) AS average
        FROM journal_entries
        WHERE account_id = $1
        AND direction = 'DEBIT'` , 
        [fromAccountId],
    );
    const paidBefore = await pool.query(
        `SELECT 1
        FROM journal_entries d
        JOIN journal_entries c ON c.transfer_id = d.transfer_id
        WHERE d.account_id = $1 AND d.direction = 'DEBIT'
        AND c.account_id = $2 AND c.direction = 'CREDIT'
        LIMIT 1`,
        [fromAccountId , toAccountId],
    );

    const last24h = await pool.query(
        `SELECT COALESCE (SUM(amount_minor) , 0) AS total
       FROM journal_entries
        WHERE account_id = $1
        AND direction = 'DEBIT'
        AND created_at > now() - interval '24 hours'`,
        [fromAccountId],
    );

    const balance = await pool.query(
        `SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT'
                                    THEN amount_minor ELSE -amount_minor END), 0) AS balance
         FROM journal_entries
         WHERE account_id = $1`,
         [fromAccountId]
    );
    return{
        transfersLastMinute:Number(LastMinute.rows[0].n),
        pastTransferCount: Number(history.rows[0].n),
        averageAmountMinor:Number(history.rows[0].average),
        isNewReceiver : paidBefore.rows.length === 0,
        sentLast24hMinor:Number(last24h.rows[0].total),
        senderBalanceMinor: Number(balance.rows[0].balance),
    };
}
