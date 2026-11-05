import express from "express";
import { pool } from "./db"
import{ transfer , transferInTransiction } from "./transfer";
import { screenTransfer } from "./screen";
import { error } from "node:console";
import { stat } from "node:fs";

const app = express();
app.use(express.json());

app.post('/transfers' , async(req,res) => {
    const key = req.header('Idempotency-Key');
    const body = req.body ?? {};
    const fromAccountId = body.fromAccountId;
    const toAccountId = body.toAccountId;
    const amount_minor = body.amount_minor;
     
    if(!key){
        res.status(400).json({
            error : 'idempotency-key header is required'
        })
        return;
    }
    if(!Number.isInteger(fromAccountId) || !Number.isInteger(toAccountId)){
        res.status(400).json({
            error : 'fromAccountId and toAccountId must be a whole number'
        })
        return;
    }
    if(!Number.isInteger(amount_minor) || amount_minor <= 0){
        res.status(400).json({
            error : 'amount_minor must be a positive whole number'
        })
        return;
    }
    if(fromAccountId === toAccountId){
        res.status(400).json({
            error: 'cannot transfer to same account'
        })
        return;
    }
    const found = await pool.query(
  'SELECT id FROM accounts WHERE id = ANY($1)',
  [[fromAccountId, toAccountId]],
);
if (found.rows.length !== 2) {
  res.status(404).json({ error: 'account not found' });
  return;
}
const verdict = await screenTransfer(key , fromAccountId , toAccountId ,amount_minor);
     if(verdict.action === 'DECLINE'){
        res.status(403).json({
            error : 'TRANSFER_DECLINED'
        });
        return;

     }
     if(verdict.action === 'HOLD'){
        if(verdict.reviewStatus === 'PENDING_REVIEW'){
   res.status(202).json({
            status : 'PENDING_REVIEW',
            reviewId: verdict.reviewId
        });
        } else{
            res.status(200).json({
                status : verdict.reviewStatus,
                reviewId: verdict.reviewId
            })
        }
     
        return;
     }

    try{
        const result = await transfer(key , fromAccountId , toAccountId , amount_minor);
        const status = result.replayed ? 200 : 201;
        res.status(status).json(result);
    }
    catch (error) {
    const message = (error as Error).message;

    if (message === 'INSUFFICIENT_FUNDS') {
        res.status(422).json({ error: 'INSUFFICIENT_FUNDS' });
        return;
    }

    console.error(error);
    res.status(500).json({ error: 'internal error' });
}

})
app.get("/accounts/:id/balance" , async(req,res)=> {
    const id = Number(req.params.id);
    if(!Number.isInteger(id)){
        res.status(400).json({
            error: "account id must be a whole number"
        })
        return;
    }
    const account = await pool.query(
        `SELECT id,owner_name  FROM accounts WHERE id = $1`,
        [id],
    );
    if(account.rows.length === 0){
        res.status(404).json({
            error: "account not found"
        })
        return;
    }
    const result = await pool.query(
        `SELECT COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE -amount_minor END) , 0) AS balance FROM journal_entries WHERE account_id = $1`,
        [id],
    );
    res.json({
        accountId : id,
        owner: account.rows[0].owner_name,
        balanceMinor : Number(result.rows[0].balance),
    });

});

app.get('/reviews' , async(req, res) => {
    const result = await pool.query(
        `SELECT r.id, r.idempotency_key, r.from_account_id,r.to_account_id,
        r.amount_minor , r.created_at , d.score , d.reasons
        FROM reviews r
        LEFT JOIN risk_decision d ON d.id = r.decision_id
        WHERE r.status = 'PENDING_REVIEW'
        ORDER BY r.created_at ASC , r.id ASC `
    );
    const reviews = result.rows.map((row) => ({
        id: Number(row.id),
        fromAccountId: row.from_account_id,
        toAccountId: row.to_account_id,
        amountMinor: Number(row.amount_minor),
        score : row.score,
        reasons: row.reasons,
        waitingSince : row.created_at,
 
    }));
    res.json({
        reviews: reviews
    })
})

app.post('/reviews/:id/approve' ,async(req,res) => {
    const id = Number(req.params.id);
    if(!Number.isInteger(id)){
        res.status(400).json({
            error : 'review id must be a whole number'
        });
        return;
    }
    const client = await pool.connect();
    try{
        await client.query('BEGIN');

        const found = await client.query(
            `SELECT id, idempotency_key , from_account_id , to_account_id, amount_minor , status 
            FROM reviews WHERE id = $1 FOR UPDATE`,
            [id],

        );
        if(found.rows.length === 0){
            await client.query('ROLLBACK');
            res.status(404).json({
                error : 'Review not found'
            });
            return;
        }
        const review = found.rows[0];

        if(review.status !== 'PENDING_REVIEW'){
            await client.query('ROLLBACK');
            res.status(409).json({
                error : "REVIEW ALREADY_DECIDED" , status : review.status
            });
            return;
        }
        await client.query('SAVEPOINTS attempts');
        try{
            const moved = await transferInTransiction(
                client,
                review.idempotency_key,
                review.from_account_id,
                review.to_account_id,
                Number(review.amount_minor),
            );
            await client.query(
                `UPDATE reviews SET status = 'COMPLETED' , resolved_at = now() WHERE id =$1`,
                [id],
            );
            await client.query('COMMIT');
            res.status(200).json({
                status : 'COMPLETED',
                transferId : moved.transferId,
            });
            return;

        } catch (error){
            if((error as Error).message === 'INSUFFECIENT_FUNDS'){
                await client.query('ROLLBACK to SAVEPOINT attempt');
                await client.query(
                    `UPDATE reviews
                        SET status = 'FAILED' , failure_reason = 'INSUFFECIENT_FUNDS' , resolved_at = now()
                        WHERE id = $1`,
                    [id],
                );
                await client.query('COMMIT');
                res.status(422).json({
                    status : 'FAILED',
                    reason : 'INSUFFECIENT_FUNDS'
                });
                return;
            }
            throw error;

        }
    } catch (error){
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({
            error : "INTERNAL ERROR"
        });
    } finally{
        client.release();
    }

});
export default app;