import {pool} from './db';
import { hashPassword } from './auth';
import { error } from 'node:console';

async function main(){
    const [email , password , role] = process.argv.slice(2);
    if(!email || !password || !role){
        throw new Error('usage: create user <email> <password> <customer> | <reviewer> ');

    }
    await pool.query(
        'INSERT INTO users(email , password_hash, role) VALUES ($1, $2, $3)',
        [email.trim().toLowerCase() , hashPassword(password),role],

    );
    console.log('created' ,role , email);
    await pool.end();
}
main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
})