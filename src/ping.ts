import {pool} from "./db"

async function main(){
    const result = await pool.query('SELECT id , owner_name  FROM accounts ORDER by id');
    console.log(result.rows);
    await pool.end();
}
main();