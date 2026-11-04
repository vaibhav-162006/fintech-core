import { pool } from "./db"
import { assessTransfer } from "./risk"
import { getFeatures } from "./features"
import { stat } from "node:fs";
import { from } from "node:stream/iter";

export async function screenTransfer(
    key : string,
    fromAccountId: number,
    toAccountId: number,
    amountMinor: number,
){
        const heldBefore = await pool.query(
        `SELECT id, status FROM reviews WHERE idempotency_key = $1`,
        [key],

    );
    if(heldBefore.rows.length > 0){
        return{
            action : 'HOLD' ,
            decisionId : null,
            reviewId : heldBefore.rows[0].id,
            reviewStatus : heldBefore.rows[0].status,
        };
    }
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
        const review = await createReview(key , fromAccountId , toAccountId,amountMinor , decisionId);
        return{
            action : 'HOLD',
            decisionId : decisionId ,
            reviewId : review.id,
            reviewStatus: review.status,
        };
    }
    return{
        action: 'PROCEED',
        decisionId : decisionId
    };
}
async function createReview(
    Key : string, 
    fromAccountId : number,
    toAccountId : number,
    amountMinor : number,
    decisionId : number,
){
    const inserted = await pool.query(
        `INSERT INTO reviews
        (idempotency_key , from_account_id , to_account_id , amount_minor , decision_id)
        VALUES ($1 , $2 , $3 , $4 , $5)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id , status`,
        [Key , fromAccountId , toAccountId , amountMinor , decisionId],
    );
    if(inserted.rows.length > 0){
        return inserted.rows[0];
    }
    const existing = await pool.query(
        `SELECT id , status FROM reviews WHERE idempotency_key = $1`,
        [Key],
    );
    return existing.rows[0];

}