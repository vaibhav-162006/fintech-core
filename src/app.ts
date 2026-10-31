import express from "express";
import { pool } from "./db"
import{ transfer } from "./transfer";
import { error } from "node:console";

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
export default app;