import test from "node:test";
import assert from "node:assert/strict";
import { generatePayments , toCsv , makeRandom } from "./generate-data";

test('the same seed gives the same data' , () => {
    const a = toCsv(generatePayments(500 , 0.02 , 7));
    const b = toCsv(generatePayments(500 , 0.02 , 7));

    assert.equal(a,b);
});
test('a different seed gives different data' ,()=> {
    const a = toCsv(generatePayments(500 , 0.02, 7));
    const b = toCsv(generatePayments(500 , 0.02 , 8));
    assert.notEqual(a , b);

});
test('the fraud share is close to what we asked for' , ()=>{
    const payments = generatePayments(20000,0.015,42);
    const share = payments.filter((p) => p.isFraud).length/ payments.length;
    assert.ok(share>0.01 && share < 0.02, 'fraud share was ' + share);
});
test('no payments is bigger than its sender balance and amounts are whole number' , () => {
    const payments = generatePayments(5000 , 0.02 ,1);
    for(const p of payments){
        assert.ok(Number.isInteger(p.amountMinor));
        assert.ok(p.amountMinor > 0);
        assert.ok(p.amountMinor <= p.senderBalanceMinor);
    }
});
test('the fraud pattern stays under the guard thresholds that look at one payment' , ()=> {
    const payments = generatePayments(20000, 0.015, 42);
    for(const p of payments.filter((x) => x.isFraud)){
        assert.ok(p.transfersLastMinute < 5);
        assert.ok(p.amountMinor < 100000);
    }
})
test('the seeded generator always returns a number from 0 up to 1' , ()=> {
    const random = makeRandom(3);
    for(let i = 0; i < 1000; i++){
        const value = random();
        assert.ok(value >= 0 && value < 1);
    }
});
