import { loadConfig, apiConfig, witnessConfig } from '../packages/shared/src/config.js';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
async function check(name:string,file:string,schema:typeof apiConfig|typeof witnessConfig){
  let values:Record<string,string|undefined>={};
  try {values=parseEnv(await readFile(file,'utf8'));}catch{console.error(`${name}: environment file unavailable or invalid (${file})`);}
  try{loadConfig(schema,{...values,...process.env});console.log(`${name}: configuration schema valid (live services not verified)`);}
  catch(error){console.error(`${name}: ${error instanceof Error?error.message:'invalid configuration'}`);process.exitCode=1;}
}
await check('API','.env',apiConfig);
await check('Witness','.env.witness',witnessConfig);
