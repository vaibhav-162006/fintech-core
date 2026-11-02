import { pool } from "./db"
import { assessTransfer } from "./risk"
import { getFeatures } from "./features"

export async function screenTransfer(
    key : string,
    fromAccountId: number,
    toAccountId: number,
    amountMinor: number,
){
    const existing = await pool.query(
        `SELECT 1 FROM transfers WHERE idempotency_key = $1`,
        [key],
    );
    if(existing.rows.length > 0){
        return{
            action : 'PROCEED',
            decisionId: null
        };

    }
    const features = await getFeatures(fromAccountId , toAccountId);

    if(features.senderBalanceMinor < amountMinor){
        return{
            action: 'PROCEED',
            decisionId:null,
        };
    }
    const result = assessTransfer(
        {fromAccountId: fromAccountId , toAccountId: toAccountId , amountMinor: amountMinor },
        features,
    );

    const saved = await pool.query(
        `INSERT INTO risk_decision
        (idempotency_key , from_account_id , to_account_id,amount_minor,decision ,score , reasons)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        RETURNING id`,
        [key , fromAccountId , toAccountId , amountMinor , result.decision , result.score , JSON.stringify(result.reasons)],
    );
    const decisionId = saved.rows[0].id;

    if(result.decision === 'BLOCK'){
        return{
            action : 'DECLINE' , 
            decisionId : decisionId
        };
    }
    if(result.decision === 'REVIEW'){
        return{
            action : 'HOLD',
            decisionId : decisionId
        };
    }
    return{
        action: 'PROCEED',
        decisionId : decisionId
    };
}