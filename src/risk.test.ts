import test from "node:test";
import assert from "node:assert";
import { assessTransfer } from "./risk"
import { from } from "node:stream/iter";


function quietFeatures() {
    return {
        transfersLastMinute: 0,
        averageAmountMinor : 0,
        pastTransferCount : 0,
        isNewReciever : false,
        sentLast24hMinor : 0,
        senderBalanceMinor: 100000
    };
}
function request (amountMinor : number){
    return{
        fromAccountId : 1,
        toAccountId : 2,
        amountMinor : amountMinor
    };
}
function codes (result: {reasons : {code : string} []}){
    return result.reasons.map((r) => r.code);
}
test('a) normal small transfer is allowed with no reasons' , () => {
    const result = assessTransfer(request(1000), quietFeatures());

    assert.equal(result.decision , 'ALLOW');
    assert.equal(result.score , 0);
    assert.deepEqual(codes(result) , []);
});

test('5 Transfer in a minute triggers a review' , () => {
    const features = {...quietFeatures() , transfersLastMinute: 5};
    const result = assessTransfer(request(1000) , features);
    
    assert.equal(result.decision , 'REVIEW');
    assert.equal(result.score , 40);
    assert.deepEqual(codes(result) , ['HIGH_VELOCITY']);
});

test('4 transfers in a minute is still allowed (boundary)', () => {
  const features = { ...quietFeatures(), transfersLastMinute: 4 };
  const result = assessTransfer(request(1000), features);

  assert.equal(result.decision, 'ALLOW');
});

test('an amount over 5x the average is flagged but still allowed alone', () => {
  const features = { ...quietFeatures(), pastTransferCount: 5, averageAmountMinor: 10000 };
  const result = assessTransfer(request(60000), features);

  assert.deepEqual(codes(result), ['UNUSUAL_AMOUNT']);
  assert.equal(result.score, 30);
  assert.equal(result.decision, 'ALLOW');
});
test('too little history means the unusual-amount rules stay quiet' , () => {
    const features = {...quietFeatures() , pastTransferCount: 2 , averageAmountMinor : 10000};
    const result = assessTransfer(request(60000) , features);

    assert.deepEqual(codes(result) , []);
});
test('a large payment to a new reciever that drains the account is reviewed' , () => {
    const features = {...quietFeatures() , isNewReciever : true , senderBalanceMinor : 100000};
    const result = assessTransfer(request(100000),features);


    assert.deepEqual(codes(result), ['NEW_RECEIVER_LARGE' , 'DRAINS_ACCOUNT']);
    assert.equal(result.score , 45);
    assert.equal(result.decision, 'REVIEW');

});
test('going over the daily limit is blocked ' , () => {
    const features = {...quietFeatures() , sentLast24hMinor : 950000};
    const result = assessTransfer(request(60000) , features);

    assert.deepEqual(codes(result) , ['DAILY_LIMIT_EXCEEDED']);
    assert.equal(result.decision , 'BLOCK');
});

test('two signals together add up to a block' , ()=> {
    const features = {
        ...quietFeatures(),
        transfersLastMinute: 5,
        pastTransferCount: 5,
        averageAmountMinor: 10000,
    };
    const result = assessTransfer(request(60000), features);

    assert.equal(result.score , 70);
    assert.equal(result.decision , 'BLOCK');
});