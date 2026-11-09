import { mkdirSync, writeFileSync } from "node:fs";
export function makeRandom(seed : number){
    let state = seed >>> 0;
    return function next(){
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15) , t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7) , t | 61);
        return((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
export interface Payment{
    transfersLastMinute : number;
    pastTransferCount : number;
    averageAmountMinor : number;
    isNewReceiver : boolean;
    sentLast24hMinor : number;
    senderBalanceMinor : number;
    amountMinor : number;
    isFraud : boolean;
}
function between(random: () => number, low: number, high: number) {
  return low + Math.floor(random() * (high - low + 1));
}

function honestPayment (random: () => number): Payment{
const average = between(random , 20000 , 150000);
const amount = Math.max(1000 , Math.round(average * (0.4 + random() * 1.6)));
const balance = between(random , 5, 60) * average;
return{
    transfersLastMinute : random() < 0.97 ? 0 : 1,
    pastTransferCount : between(random , 3 , 60),
    averageAmountMinor : average,
    isNewReceiver: random() < 0.12,
    sentLast24hMinor: between(random , 0 ,3) * average,
    senderBalanceMinor : balance,
    amountMinor : Math.min(amount ,balance),
    isFraud : false,
};
}
function fraudPayment (random : ()=> number) : Payment{
    const average = between(random , 20000 , 150000);
    const amount = between(random , 80000 , 95000);
    const balance = between(random , 10 , 40) * amount;

    return{
        transfersLastMinute : random() < 0.9 ? 0 : 1,
        pastTransferCount : between(random , 0 , 12),
        averageAmountMinor : average , 
        isNewReceiver : random() < 0.9,
        sentLast24hMinor : between(random, 2 ,10) * amount,
        senderBalanceMinor : balance ,
        amountMinor : amount,
        isFraud : true,
    };
}
export function generatePayments(count : number , fraudShare : number, seed : number){
    const random = makeRandom(seed);
    const payments: Payment[] = [];
    for(let i = 0; i < count; i++){
        payments.push(random() < fraudShare ? fraudPayment(random) : honestPayment(random));
    }
    return payments;
}
const columns: (keyof Payment)[] = [
    'transfersLastMinute' , 'pastTransferCount' ,'averageAmountMinor',
    'sentLast24hMinor' , 'amountMinor' , 'isFraud' , 'senderBalanceMinor' , 'isNewReceiver',
];

export function toCsv(payments : Payment[]){
    const lines = [columns.join(',')];
    for(const p of payments){
        lines.push(columns.map((c) => String(p[c])).join(','));
    }
    return lines.join('\n') + '\n';
}

if(process.argv[1] && process.argv[1].endsWith('generate-data.ts')){
    mkdirSync('data' , {recursive : true});
    const payments = generatePayments(20000 , 0.015, 42);
    writeFileSync('data/payments.csv' , toCsv(payments));
    const fraud = payments.filter((p) => p.isFraud).length;
    console.log('wrote data/payments.csv:' , payments.length , 'payments,' , fraud , 'fraud');
    
}
