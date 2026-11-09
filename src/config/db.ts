import {Pool} from "pg";

   const connectionString = process.env.DATABASE_URL;

    if(!connectionString){
        throw new Error('DATABASE_URL is not set . Run with : npx tsx --env-file=.env <file>');
    }

export const pool = new Pool({connectionString, max : 20});
