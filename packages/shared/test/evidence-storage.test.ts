import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJSON, hashText } from '../src/index.js';
import { EvidenceStorage, evidenceStorageFromEnvironment } from '../src/evidence.js';

const cid='b'+'a'.repeat(20);

test('Pinata V3 persists exact canonical bytes and verifies gateway readback', async () => {
  const oldFetch=globalThis.fetch;const payload={z:2,a:{y:true,x:null}};const canonical=canonicalJSON(payload);let uploaded='';
  globalThis.fetch=(async (input,init) => {
    const url=String(input);
    if(url==='https://uploads.pinata.cloud/v3/files') {
      assert.equal((init?.headers as Record<string,string>).authorization,'Bearer test-jwt');
      const form=init?.body as FormData;assert.equal(form.get('network'),'public');uploaded=await (form.get('file') as File).text();
      return new Response(JSON.stringify({data:{cid}}),{status:200});
    }
    assert.equal(url,`https://gateway.example/ipfs/${cid}`);assert.equal(init?.method,'GET');return new Response(canonical,{status:200});
  }) as typeof fetch;
  try {
    const stored=await new EvidenceStorage({provider:'pinata',jwt:'test-jwt',gateway:'https://gateway.example'}).persist(payload);
    assert.equal(uploaded,canonical);assert.equal(stored.evidenceHash,hashText(canonical));assert.deepEqual(stored.readback,{parsed:true,byteMatch:true,hashMatches:true,semanticContentMatches:true});
  } finally {globalThis.fetch=oldFetch;}
});

test('Pinata readback fails closed for hash, bytes, malformed JSON, unavailable gateway, and invalid CID response', async () => {
  const oldFetch=globalThis.fetch;const storage=new EvidenceStorage({provider:'pinata',jwt:'test-jwt',gateway:'https://gateway.example'});const canonical='{"a":1}';
  try {
    globalThis.fetch=(async()=>new Response('{"a":2}',{status:200})) as typeof fetch;
    await assert.rejects(storage.readJSON(`ipfs://${cid}`,hashText(canonical)),/EVIDENCE_HASH_MISMATCH/);
    globalThis.fetch=(async()=>new Response('{bad', {status:200})) as typeof fetch;
    await assert.rejects(storage.readJSON(`ipfs://${cid}`,hashText('{bad')),/EVIDENCE_INVALID_JSON/);
    globalThis.fetch=(async()=>new Response('offline',{status:503})) as typeof fetch;
    await assert.rejects(storage.readJSON(`ipfs://${cid}`,hashText(canonical)),/EVIDENCE_STORAGE_UNAVAILABLE/);
    globalThis.fetch=(async()=>new Response(JSON.stringify({data:{}}),{status:200})) as typeof fetch;
    await assert.rejects(storage.persist({a:1}),/INVALID_IPFS_CID/);
    globalThis.fetch=(async()=>new Response('failure',{status:500})) as typeof fetch;
    await assert.rejects(storage.persist({a:1}),/EVIDENCE_STORAGE_UNAVAILABLE/);
  } finally {globalThis.fetch=oldFetch;}
});

test('Kubo mode remains available and storage configuration selects only complete provider settings', async () => {
  const oldFetch=globalThis.fetch;const canonical='{"a":1}';
  globalThis.fetch=(async (input) => String(input).includes('/api/v0/add')?new Response(JSON.stringify({Hash:cid}),{status:200}):new Response(canonical,{status:200})) as typeof fetch;
  try {
    const stored=await new EvidenceStorage('https://kubo.example').persist({a:1});assert.equal(stored.evidenceURI,`ipfs://${cid}`);
    assert.equal(evidenceStorageFromEnvironment({IPFS_API_URL:'https://kubo.example'})?.options.provider,'kubo');
    assert.equal(evidenceStorageFromEnvironment({IPFS_PROVIDER:'pinata',PINATA_JWT:'jwt',IPFS_GATEWAY_URL:'https://gateway.example'})?.options.provider,'pinata');
    assert.equal(evidenceStorageFromEnvironment({IPFS_PROVIDER:'pinata',PINATA_JWT:'jwt'}),undefined);
  } finally {globalThis.fetch=oldFetch;}
});
