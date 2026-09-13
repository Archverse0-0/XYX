import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { apiConfig, loadConfig, requireOpenPurchaseRuntimeConfig, requireWitnessRuntimeConfig } from '../src/config.js';
import { requireEvidenceStorage, registerJobs } from '../../../apps/api/src/jobs.js';

const preA4Env: Record<string,string> = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/xyx',
  ARC_RPC_URL: 'https://rpc.testnet.arc.io',
  CIRCLE_AGENT_ADDRESS: '0x' + '1'.repeat(40),
  CIRCLE_API_KEY: 'test-circle-api-key',
  CIRCLE_ENTITY_SECRET: 'test-circle-entity-secret',
  GRAPH_URL: 'https://api.studio.thegraph.com/query/123/xyx',
  GRAPH_DEPLOYMENT_ID: 'QmTestDeploymentId',
  XYX_EVALUATOR_ADDRESS: '0x' + '2'.repeat(40),
  PRIVY_APP_ID: 'test-privy-app',
  PRIVY_VERIFICATION_KEY: 'test-privy-key',
  OPERATOR_PRIVY_DID: 'did:privy:test-operator',
  PROTECTED_JOB_PROVIDER_ADDRESS: '0x' + '3'.repeat(40),
};

const completeEnv: Record<string,string> = {
  ...preA4Env,
  EVIDENCE_REGISTRY_ADDRESS: '0x' + '4'.repeat(40),
  INTERNAL_SERVICE_TOKEN: 'i'.repeat(32),
  WITNESS_URL: 'http://localhost:3002',
  LLM_COMPLETIONS_URL: 'http://localhost:8080',
  LLM_MODEL: 'test-model',
  LLM_API_KEY: 'test-llm-key',
  IPFS_API_URL: 'http://localhost:5001',
};

test('Protected select/create route registration does not instantiate IPFS', async () => {
  const cfg=loadConfig(apiConfig,preA4Env);
  const app=Fastify();
  const db={query:async()=>({rowCount:0,rows:[]}),connect:async()=>({query:async()=>({rowCount:0,rows:[]}),release:()=>{}})} as never;
  const graph={query:async()=>({})} as never;
  assert.doesNotThrow(()=>registerJobs(app,db,graph,cfg,()=>preA4Env.OPERATOR_PRIVY_DID));
  await app.ready();
  const routes=app.printRoutes();
  assert.match(routes,/select-provider/);
  assert.match(routes,/:jobId/);
  await app.close();
});

test('Storage is required explicitly only when an evidence operation needs it', () => {
  assert.throws(()=>requireEvidenceStorage({IPFS_PROVIDER:'kubo'}),/IPFS_STORAGE_CONFIGURATION_REQUIRED/);
  assert.equal(requireEvidenceStorage({IPFS_PROVIDER:'kubo',IPFS_API_URL:'http://localhost:5001'}).options.provider,'kubo');
});

test('Protected pre-A4 config remains independent of Open Purchase and later guards', () => {
  const cfg=loadConfig(apiConfig,preA4Env);
  assert.throws(()=>requireOpenPurchaseRuntimeConfig(cfg),/EVIDENCE_REGISTRY_NOT_CONFIGURED/);
  assert.throws(()=>requireWitnessRuntimeConfig(cfg),/WITNESS_NOT_CONFIGURED/);
});

test('Open Purchase without Planner configuration fails before any runtime call', () => {
  const cfg=loadConfig(apiConfig,{...preA4Env,EVIDENCE_REGISTRY_ADDRESS:'0x'+'4'.repeat(40),WITNESS_URL:'http://localhost:3002',INTERNAL_SERVICE_TOKEN:'i'.repeat(32)});
  assert.throws(()=>requireOpenPurchaseRuntimeConfig(cfg),/OPEN_PURCHASE_NOT_CONFIGURED/);
});

test('Witness configuration reports missing internal auth separately', () => {
  const withWitness=loadConfig(apiConfig,{...preA4Env,WITNESS_URL:'http://localhost:3002'});
  assert.throws(()=>requireWitnessRuntimeConfig(withWitness),/INTERNAL_SERVICE_AUTH_NOT_CONFIGURED/);
  const withToken=loadConfig(apiConfig,{...preA4Env,INTERNAL_SERVICE_TOKEN:'i'.repeat(32)});
  assert.throws(()=>requireWitnessRuntimeConfig(withToken),/WITNESS_NOT_CONFIGURED/);
});

test('Open Purchase and Witness guards accept complete configuration', () => {
  const cfg=loadConfig(apiConfig,completeEnv);
  assert.equal(requireOpenPurchaseRuntimeConfig(cfg).LLM_MODEL,completeEnv.LLM_MODEL);
  assert.equal(requireWitnessRuntimeConfig(cfg).INTERNAL_SERVICE_TOKEN,completeEnv.INTERNAL_SERVICE_TOKEN);
});

test('Missing Witness auth never becomes a Protected Job decision', () => {
  const cfg=loadConfig(apiConfig,preA4Env);
  assert.throws(()=>requireWitnessRuntimeConfig(cfg),/WITNESS_NOT_CONFIGURED/);
  assert.throws(()=>requireOpenPurchaseRuntimeConfig(cfg),/EVIDENCE_REGISTRY_NOT_CONFIGURED/);
});
