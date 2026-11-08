import test from "node:test";
import assert from "node:assert";
import { measure } from "./metrics";

test("the stroy's guard : 99% accurate , but 10% precision and 50% recall" , ()=>{
    const result = measure({
        caught : 10,
        falseAlarams : 90,
        missed : 10,
        passed: 9890
    });
    assert.equal(result.accuracy , 0.99);
    assert.equal(result.precision , 0.1);
    assert.equal(result.recall , 0.5);
})
test('a guard that never holds anything is 99.8% accurate and catches mo fraud' , ()=> {
    const result = measure({
        caught : 0,
        falseAlarams : 0,
        missed : 20,
        passed : 9980,
    });
    assert.equal(result.accuracy , 0.998);
    assert.equal(result.precision , 0);
    assert.equal(result.recall , 0);
});