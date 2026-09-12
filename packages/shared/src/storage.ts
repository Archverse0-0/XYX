import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export const poolFor=(url:string)=>new pg.Pool({connectionString:url,max:10,connectionTimeoutMillis:5000,statement_timeout:15000});
export type DB=ReturnType<typeof poolFor>;
export async function migrate(db:DB) {
  const client=await db.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended('xyx-migrations',0))");
    for(const file of ['001_initial.sql','002_job_operations.sql','003_reconciliation.sql']) {
      await client.query(await readFile(fileURLToPath(new URL('../../../apps/api/migrations/'+file,import.meta.url)),'utf8'));
    }
  } catch(error) { await client.query('ROLLBACK');throw error; }
  finally {try {await client.query("SELECT pg_advisory_unlock(hashtextextended('xyx-migrations',0))");} finally {client.release();}}
}
export async function event(db:DB,runId:string,type:string,data:unknown) {
  await db.query('INSERT INTO run_events(run_id,type,data) VALUES($1,$2,$3)',[runId,type,JSON.stringify(data)]);
}
export async function createRun(db:DB,userId:string,key:string,objective:string,policy:unknown) {
  const client=await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO users(id) VALUES($1) ON CONFLICT DO NOTHING',[userId]);
    const id=randomUUID();
    const insert=await client.query(`INSERT INTO agent_runs(id,user_id,idempotency_key,status,objective,policy_json)
      VALUES($1,$2,$3,'QUEUED',$4,$5) ON CONFLICT(user_id,idempotency_key) DO NOTHING RETURNING *`,[id,userId,key,objective,JSON.stringify(policy)]);
    const row=insert.rows[0]??(await client.query('SELECT * FROM agent_runs WHERE user_id=$1 AND idempotency_key=$2',[userId,key])).rows[0];
    if(row.objective!==objective||JSON.stringify(row.policy_json)!==JSON.stringify(JSON.parse(JSON.stringify(policy)))) {
      // JSONB sorts keys; compare JSONB in Postgres rather than client serialization.
      const equal=await client.query('SELECT objective=$2 AND policy_json=$3::jsonb AS equal FROM agent_runs WHERE id=$1',[row.id,objective,JSON.stringify(policy)]);
      if(!equal.rows[0].equal)throw new Error('IDEMPOTENCY_CONFLICT');
    }
    await client.query('COMMIT');return {row,created:insert.rowCount===1};
  } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
}
