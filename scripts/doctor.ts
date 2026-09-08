import { loadConfig, apiConfig, witnessConfig } from '../packages/shared/src/config.js';
function check(name:string,schema:typeof apiConfig|typeof witnessConfig){try{loadConfig(schema);console.log(`${name}: configured`);}catch(error){console.error(`${name}: ${error instanceof Error?error.message:'invalid configuration'}`);process.exitCode=1;}}
check('API',apiConfig);check('Witness',witnessConfig);
