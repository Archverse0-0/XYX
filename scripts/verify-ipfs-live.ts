import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJSON, hashText } from '../packages/shared/src/index.js';
import { evidenceStorageFromEnvironment } from '../packages/shared/src/evidence.js';

function loadEnv(path:string) {
  if(!existsSync(path))return {} as Record<string,string|undefined>;
  const out:Record<string,string|undefined>={};
  for(const line of readFileSync(path,'utf8').split(/\r?\n/)) {
    const match=line.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);if(!match)continue;
    let value=match[2].trim();if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
    out[match[1]]=value;
  }
  return out;
}
function safeCode(error:unknown) {
  const message=error instanceof Error?error.message:'IPFS_LIVE_PROBE_FAILED';
  return /^(INVALID_IPFS_CID|EVIDENCE_[A-Z_]+|IPFS_STORAGE_CONFIGURATION_REQUIRED)$/.test(message)?message:'IPFS_LIVE_PROBE_FAILED';
}

export async function verifyIpfsLive(root=process.cwd()) {
  const env={...loadEnv(join(root,'.env')),...loadEnv(join(root,'.env.witness')),...process.env};
  const storage=evidenceStorageFromEnvironment(env);
  if(!storage||storage.options.provider!=='pinata')throw new Error('IPFS_STORAGE_CONFIGURATION_REQUIRED');
  const observedAt=new Date().toISOString();
  const payload={kind:'XYX_SESSION_06_IPFS_PROBE',version:'1',network:'arc-testnet',chainId:5042002,purpose:'live-ipfs-write-readback-verification',circleMachineWallet:'0x55763d498fd057d17ffcc2fb540789ce76f4f085',observedAt};
  const originalCanonicalHash=hashText(canonicalJSON(payload));
  const write=await storage.persist(payload);
  const read=await storage.readJSON(write.evidenceURI,originalCanonicalHash);
  const semanticContentMatches=canonicalJSON(read)===canonicalJSON(payload);
  if(!semanticContentMatches||!write.readback.byteMatch||!write.readback.hashMatches)throw new Error('EVIDENCE_PERSISTENCE_MISMATCH');
  return {session:6,component:'ipfs',provider:'pinata',networkMode:'public',observedAt,cid:write.evidenceURI.slice(7),write:{status:'PASS'},readback:{status:'PASS',parsed:true},integrity:{originalCanonicalHash,retrievedCanonicalHash:write.evidenceHash,byteMatch:write.readback.byteMatch,hashMatches:write.readback.hashMatches,semanticContentMatches}};
}

if(process.argv[1]?.endsWith('verify-ipfs-live.ts'))void verifyIpfsLive().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(`IPFS live probe failed: ${safeCode(error)}`);process.exitCode=1;});
