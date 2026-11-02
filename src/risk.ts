
export interface transferRequest{
    fromAccountId: number;
    toAccountId: number;
    amountMinor : number;

}
export interface Features{
    transfersLastMinute: number;
    averageAmountMinor: number;
    pastTransferCount: number;
    isNewReceiver : boolean;
    sentLast24hMinor : number;
    senderBalanceMinor: number; 
}

export interface RiskReason{
    code: string;
    points: number;
    message : string;
}
export interface RiskResult{
    decision:  'ALLOW' | 'REVIEW' | 'BLOCK';
    score: number;
    reasons : RiskReason[]; 
}

export const CONFIG = {
    velocityLimitPerMinute: 5,
    unusualAmountMultiplier : 5,
    minHistoryForUsual:  3,
    newReceiverLargeAmountMinor : 100000,
    drainPercent : 90,
    dailyLimitMinor : 1000000,
    reviewAt : 40,
    blockAt : 70,
};

export function assessTransfer(request:  transferRequest , features: Features): RiskResult {
const reasons : RiskReason[] = [];
const amount = request.amountMinor;


if(features.transfersLastMinute >= CONFIG.velocityLimitPerMinute){
    reasons.push({
        code : 'HIGH_VELOCITY',
        points: 40,
        message : features.transfersLastMinute + 'transfers in Last Minute',
    });

}
if(
    features.pastTransferCount >= CONFIG.minHistoryForUsual && 
    features.averageAmountMinor > 0 &&
    amount > features.averageAmountMinor * CONFIG.unusualAmountMultiplier
) {
    reasons.push({
        code : 'UNUSUAL_AMOUNT',
        points : 30,
        message : 'amount is more than' + CONFIG.unusualAmountMultiplier + 'x the sender Average',

    });
}
if(features.isNewReceiver && amount >= CONFIG.newReceiverLargeAmountMinor){
    reasons.push({
        code: 'NEW_RECEIVER_LARGE',
        points: 25,
        message: 'large first-time payment to a new receiver'
    });
}
if(
    features.senderBalanceMinor > 0 &&
    amount * 100 >= features.senderBalanceMinor * CONFIG.drainPercent
) {
    reasons.push({
        code : 'DRAINS_ACCOUNT',
        points: 20,
        message : 'transfer is at least' + CONFIG.drainPercent + '% of the balance ',
    });

}
if(features.sentLast24hMinor + amount > CONFIG.dailyLimitMinor){
    reasons.push({
        code: 'DAILY_LIMIT_EXCEEDED',
        points : 70,
        message: 'would exceed the daily sending limit'
    });
}

let score = 0;
for(const reason of reasons){
    score = score + reason.points;
}
if(score > 100){
    score = 100;
}
let decision: 'ALLOW' | 'REVIEW' | 'BLOCK' = 'ALLOW';
if(score >= CONFIG.blockAt){
    decision = 'BLOCK';
} else if (score >= CONFIG.reviewAt){
    decision = 'REVIEW';
}
return {
    decision : decision,
    score : score,
    reasons : reasons
};
}