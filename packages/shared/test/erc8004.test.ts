import test from 'node:test';
import assert from 'node:assert/strict';
import { ERC8004Client, validationScore, isPublicAddress } from '../../erc8004/client.js';
import { acceptedValidatorsSchema, hashJSON } from '../src/index.js';
const a='0x'+'1'.repeat(40),b='0x'+'2'.repeat(40);
test('only buyer-accepted validators influence score; missing is unavailable',()=>{
  const rows=[{id:'a',validator:a,response:100,updatedAt:100},{id:'b',validator:b,response:0,updatedAt:100}];
  assert.equal(validationScore(rows,[],100),null);
  assert.equal(validationScore([], [{address:a,weight:1}],100),null);
  assert.equal(validationScore(rows,[{address:a,weight:1}],100),1);
  assert.equal(validationScore(rows,[{address:a,weight:0.75},{address:b,weight:0.25}],100),0.75);
  assert.throws(()=>acceptedValidatorsSchema.parse([{address:a,weight:1},{address:a,weight:1}]));
});
test('validation latest selection is deterministic and ignores future/expired signals',()=>{
  const rows=[{id:'b',validator:a,response:100,updatedAt:99},{id:'a',validator:a,response:20,updatedAt:99},{id:'c',validator:a,response:0,updatedAt:101}];
  assert.equal(validationScore(rows,[{address:a,weight:1}],100),0.2);
  assert.equal(validationScore([...rows].reverse(),[{address:a,weight:1}],100),0.2);
  assert.equal(validationScore(rows,[{address:a,weight:1}],100+31*86400),null);
  assert.notEqual(hashJSON({acceptedValidators:[]}),hashJSON({acceptedValidators:[{address:a,weight:1}]}));
});
test('identity fetch excludes loopback, private, mapped private and metadata addresses',()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','192.168.1.1','169.254.169.254','::1','::ffff:127.0.0.1','fc00::1'])assert.equal(isPublicAddress(ip),false,ip);
  assert.equal(isPublicAddress('8.8.8.8'),true);
});
test('identity resolution fails closed before metadata lookup on the wrong chain',async()=>{
  const client=new ERC8004Client('https://rpc.example');
  Object.defineProperty(client,'client',{value:{getChainId:async()=>1}});
  assert.equal(await client.resolve('https://provider.example/path','0x'+'1'.repeat(40),1n),null);
});
test('unmapped provider (null validation) remains eligible when policy allows',()=>{
  const score=validationScore([],[],100);
  assert.equal(score,null,'unmapped validation is null, not zero');
});
test('no fabricated identity: empty registrations produce null validation',()=>{
  assert.equal(validationScore([],[],100),null);
});
test('validation score is zero-bounded and one-bounded',()=>{
  assert.equal(validationScore([{id:'1',validator:a,response:0,updatedAt:100}],[{address:a,weight:1}],100),0);
  assert.equal(validationScore([{id:'1',validator:a,response:100,updatedAt:100}],[{address:a,weight:1}],100),1);
});
test('validation score weights are applied correctly across multiple validators',()=>{
  const c='0x'+'3'.repeat(40);
  const rows=[
    {id:'1',validator:a,response:100,updatedAt:100},
    {id:'2',validator:b,response:50,updatedAt:100},
    {id:'3',validator:c,response:0,updatedAt:100},
  ];
  assert.equal(validationScore(rows,[{address:a,weight:1},{address:b,weight:1},{address:c,weight:1}],100),(100/100+50/100+0/100)/3);
  assert.equal(validationScore(rows,[{address:a,weight:2},{address:b,weight:1}],100),(2*1+1*0.5)/3);
});
test('expired validation signals are ignored (beyond 30-day window)',()=>{
  const now=1000000;
  const rows=[{id:'1',validator:a,response:100,updatedAt:now-31*86400}];
  assert.equal(validationScore(rows,[{address:a,weight:1}],now),null);
});
test('future validation signals are ignored',()=>{
  const now=1000000;
  const rows=[{id:'1',validator:a,response:100,updatedAt:now+1}];
  assert.equal(validationScore(rows,[{address:a,weight:1}],now),null);
});
test('deterministic: same inputs always produce same output regardless of row order',()=>{
  const rows=[
    {id:'c',validator:a,response:30,updatedAt:90},
    {id:'a',validator:a,response:100,updatedAt:100},
    {id:'b',validator:a,response:70,updatedAt:95},
  ];
  const score1=validationScore(rows,[{address:a,weight:1}],100);
  const score2=validationScore([...rows].reverse(),[{address:a,weight:1}],100);
  assert.equal(score1,score2);
});
