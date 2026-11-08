import { access } from "node:fs";

export interface Outcomes{
    caught : number;
    falseAlarams : number;
    missed: number;
    passed: number;
}
export function measure(o : Outcomes){
    const total = o.caught + o.falseAlarams + o.missed + o.passed;
    const held = o.caught + o.falseAlarams;
    const fraud = o.caught + o.missed;

    return{
        accuracy: total === 0 ? 0 : (o.caught + o.passed) / total,
        precision : held === 0 ? 0 : o.caught/held,
        recall: fraud === 0 ? 0: o.caught/fraud,
    };
}