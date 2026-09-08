import { canonicalJSON, hashText } from './index.js';
export class EvidenceStorage {
  constructor(readonly api:string,readonly authorization:string|undefined) {}
  async health() {
    const response=await fetch(new URL('/api/v0/version',this.api),{method:'POST',headers:this.authorization?{authorization:this.authorization}:{},signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('EVIDENCE_STORAGE_UNAVAILABLE');
  }
  async persist(bundle:unknown) {
    const text=canonicalJSON(bundle);const form=new FormData();
    form.append('file',new Blob([text],{type:'application/json'}),'evidence.json');
    const url=new URL('/api/v0/add',this.api);url.search='pin=true&cid-version=1&raw-leaves=true';
    const response=await fetch(url,{method:'POST',body:form,headers:this.authorization?{authorization:this.authorization}:{},signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('EVIDENCE_STORAGE_UNAVAILABLE');
    const data=await response.json() as {Hash:string};
    if(!/^b[a-z2-7]{20,}$/.test(data.Hash))throw new Error('INVALID_IPFS_CID');
    const uri='ipfs://'+data.Hash;
    // Read back the actual object before signing. A successful upload alone is insufficient.
    const read=new URL('/api/v0/cat',this.api);read.searchParams.set('arg',data.Hash);
    const verify=await fetch(read,{method:'POST',headers:this.authorization?{authorization:this.authorization}:{},signal:AbortSignal.timeout(15000)});
    if(!verify.ok||await verify.text()!==text)throw new Error('EVIDENCE_PERSISTENCE_MISMATCH');
    return {evidenceHash:hashText(text),evidenceURI:uri,evidenceURIHash:hashText(uri)};
  }
}
