import {randomBytes , scryptSync, timingSafeEqual} from 'node:crypto';
import jwt from "jsonwebtoken";

const SecretValue = process.env.JWT_SECRET;
if(!SecretValue){
    throw new Error('JWT_SECRET is not set . Run with : npx tsx --env-file = .env <file>');

}
const secret : string = SecretValue;

export function hashPassword(password : string){
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password,salt,64).toString('hex');
    return salt + ':' + hash;

}
export function verifyPassword(password : string, stored : string){
    const [salt, hash] = stored.split(':');
    if(!salt || !hash){
        return false;
    }
    const candidate = scryptSync(password , salt , 64);
    const expected = Buffer.from(hash ,'hex');
    return candidate.length === expected.length && timingSafeEqual(candidate , expected);
}
export function signToken(user: {id : number , role : string}){
    return jwt.sign({
        sub: String(user.id) ,
        role : user.role
    },
    secret , {
        expiresIn : '1h'
    })
}

export function readToken(token : string){
    const payload = jwt.verify(token , secret) as jwt.JwtPayload;
    return {
        userId: Number(payload.sub),
        role: String(payload.role)
    };
}