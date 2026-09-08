import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJSON, atomicAmount, serviceIdentity, hashJSON } from '../src/index.js';
import { classify } from '../src/verify.js';
test('canonical JSON is stable and rejects lossy values',()=>{
  assert.equal(hashJSON({b:2,a:[1,{z:true,x:null}]}),hashJSON({a:[1,{x:null,z:true}],b:2}));
  for(const value of [undefined,NaN,Infinity,1n,new Date(),{x:undefined},Array(2)]) assert.throws(()=>canonicalJSON(value));
});
test('identity uses origin, method and path; display/query do not redefine endpoint',()=>{
  const a=serviceIdentity('https://EXAMPLE.com:443/api?query=1#fragment','post');
  assert.deepEqual(a,serviceIdentity('https://example.com/api','POST'));
  assert.notEqual(a.endpointKey,serviceIdentity('https://example.com/api','GET').endpointKey);
  assert.throws(()=>serviceIdentity('http://example.com/api','GET'));
});
test('amounts use exact validated token precision',()=>{
  assert.equal(atomicAmount('0.02',6),20000n);
  assert.equal(atomicAmount('99999999999999999.000001',6),99999999999999999000001n);
  assert.throws(()=>atomicAmount('0.0000001',6));
});
test('payment and ambiguous faults never become provider failures',()=>{
  const o={payment:'accepted' as const,requestValid:true,responseReceived:true,httpStatus:200,schemaValid:true,timedOut:false,providerTimeoutProven:false,withinDeclaredLimits:false};
  assert.equal(classify(o),0);assert.equal(classify({...o,payment:'failed'}),6);
  assert.equal(classify({...o,payment:'rail_error'}),7);assert.equal(classify({...o,httpStatus:429}),8);
  assert.equal(classify({...o,httpStatus:429,withinDeclaredLimits:true}),4);
  assert.equal(classify({...o,schemaValid:null}),8);assert.equal(classify({...o,httpStatus:503}),2);
});
