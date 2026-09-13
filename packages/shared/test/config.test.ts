import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, commonConfig, apiConfig, witnessConfig, requireOpenPurchaseRuntimeConfig, requireWitnessRuntimeConfig } from '../src/config.js';
import commerceDeployment from '../../erc8183/deployment.json' with { type: 'json' };

const baseEnv: Record<string,string> = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/xyx',
  ARC_RPC_URL: 'https://rpc.testnet.arc.io',
  CIRCLE_AGENT_ADDRESS: '0x' + '1'.repeat(40),
  CIRCLE_API_KEY: 'test-circle-api-key',
  CIRCLE_ENTITY_SECRET: 'test-circle-entity-secret',
  GRAPH_URL: 'https://api.studio.thegraph.com/query/123/xyx',
  GRAPH_DEPLOYMENT_ID: 'QmTestDeploymentId',
  EVIDENCE_REGISTRY_ADDRESS: '0x' + 'a'.repeat(40),
  XYX_EVALUATOR_ADDRESS: '0x' + 'b'.repeat(40),
  IPFS_API_URL: 'http://localhost:5001',
  INTERNAL_SERVICE_TOKEN: 'a'.repeat(32),
};

const protectedPreA4Env: Record<string,string> = {
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

const fullApiEnv: Record<string,string> = {
  ...protectedPreA4Env,
  EVIDENCE_REGISTRY_ADDRESS: '0x' + '4'.repeat(40),
  INTERNAL_SERVICE_TOKEN: 'i'.repeat(32),
  WITNESS_URL: 'http://localhost:3002',
  LLM_COMPLETIONS_URL: 'http://localhost:8080',
  LLM_MODEL: 'test-model',
  LLM_API_KEY: 'test-llm-key',
  IPFS_API_URL: 'http://localhost:5001',
};

test('minimal Protected pre-A4 API config parses without later feature config', () => {
  const cfg=loadConfig(apiConfig, protectedPreA4Env);
  assert.equal(cfg.LLM_COMPLETIONS_URL, undefined);
  assert.equal(cfg.WITNESS_URL, undefined);
  assert.equal(cfg.INTERNAL_SERVICE_TOKEN, undefined);
  assert.equal(cfg.EVIDENCE_REGISTRY_ADDRESS, undefined);
  assert.equal(cfg.IPFS_API_URL, undefined);
  assert.equal(cfg.IPFS_PROVIDER, 'kubo');
});

test('genuine Protected pre-A4 fields remain required', () => {
  for (const field of ['DATABASE_URL','ARC_RPC_URL','GRAPH_URL','GRAPH_DEPLOYMENT_ID','CIRCLE_API_KEY','CIRCLE_ENTITY_SECRET','PRIVY_APP_ID','PRIVY_VERIFICATION_KEY','OPERATOR_PRIVY_DID']) {
    const env={...protectedPreA4Env}; delete env[field];
    assert.throws(()=>loadConfig(apiConfig,env),/CONFIGURATION_REQUIRED/,field);
  }
});

test('invalid buyer and evaluator addresses remain rejected', () => {
  assert.throws(()=>loadConfig(apiConfig,{...protectedPreA4Env,CIRCLE_AGENT_ADDRESS:'not-an-address'}),/CONFIGURATION_REQUIRED/);
  assert.throws(()=>loadConfig(apiConfig,{...protectedPreA4Env,XYX_EVALUATOR_ADDRESS:'0x'+'0'.repeat(40)}),/CONFIGURATION_REQUIRED/);
});

test('full API config remains compatible when all feature fields are present', () => {
  const cfg=loadConfig(apiConfig,fullApiEnv);
  assert.equal(cfg.WITNESS_URL,fullApiEnv.WITNESS_URL);
  assert.equal(cfg.LLM_MODEL,fullApiEnv.LLM_MODEL);
  assert.equal(cfg.IPFS_API_URL,fullApiEnv.IPFS_API_URL);
});

test('feature guards fail closed without later configuration', () => {
  const cfg=loadConfig(apiConfig,protectedPreA4Env);
  assert.throws(()=>requireOpenPurchaseRuntimeConfig(cfg),/EVIDENCE_REGISTRY_NOT_CONFIGURED/);
  assert.throws(()=>requireWitnessRuntimeConfig(cfg),/WITNESS_NOT_CONFIGURED/);
});

test('feature guards accept a complete later configuration', () => {
  const cfg=loadConfig(apiConfig,fullApiEnv);
  assert.equal(requireOpenPurchaseRuntimeConfig(cfg).LLM_MODEL,fullApiEnv.LLM_MODEL);
  assert.equal(requireWitnessRuntimeConfig(cfg).WITNESS_URL,fullApiEnv.WITNESS_URL);
});

test('ERC-8183 address defaults to Arc reference deployment from deployment.json', () => {
  const cfg = loadConfig(commonConfig, baseEnv);
  assert.equal(cfg.ERC8183_ADDRESS.toLowerCase(), commerceDeployment.address.toLowerCase());
});

test('ERC-8183 address can be overridden by explicit config', () => {
  const override = '0x' + 'f'.repeat(40);
  const cfg = loadConfig(commonConfig, { ...baseEnv, ERC8183_ADDRESS: override });
  assert.equal(cfg.ERC8183_ADDRESS.toLowerCase(), override.toLowerCase());
});

test('zero address is rejected for deployed addresses', () => {
  const env = { ...baseEnv, CIRCLE_AGENT_ADDRESS: '0x' + '0'.repeat(40) };
  assert.throws(() => loadConfig(commonConfig, env), /CONFIGURATION_REQUIRED/);
});

test('invalid address format is rejected', () => {
  const env = { ...baseEnv, CIRCLE_AGENT_ADDRESS: 'not-an-address' };
  assert.throws(() => loadConfig(commonConfig, env), /CONFIGURATION_REQUIRED/);
});

test('invalid URL format is rejected', () => {
  const env = { ...baseEnv, ARC_RPC_URL: 'not-a-url' };
  assert.throws(() => loadConfig(commonConfig, env), /CONFIGURATION_REQUIRED/);
});

test('missing required field causes CONFIGURATION_REQUIRED', () => {
  const { DATABASE_URL, ...env } = baseEnv;
  assert.throws(() => loadConfig(commonConfig, env), /CONFIGURATION_REQUIRED/);
});

test('MAX_JOB_USDC defaults to 5', () => {
  const cfg = loadConfig(commonConfig, baseEnv);
  assert.equal(cfg.MAX_JOB_USDC, '5');
});

test('MAX_GRAPH_LAG_BLOCKS defaults to 50', () => {
  const cfg = loadConfig(commonConfig, baseEnv);
  assert.equal(cfg.MAX_GRAPH_LAG_BLOCKS, 50);
});

test('Pinata storage requires JWT and a public gateway without requiring Kubo configuration', () => {
  const pinata={...baseEnv,IPFS_PROVIDER:'pinata',PINATA_JWT:'test-pinata-jwt',IPFS_GATEWAY_URL:'https://gateway.example'};
  delete (pinata as Record<string,string>).IPFS_API_URL;
  const witness={...pinata,WITNESS_PRIVATE_KEY:'0x'+'a'.repeat(64),RELAYER_PRIVATE_KEY:'0x'+'b'.repeat(64),EVALUATOR_PRIVATE_KEY:'0x'+'c'.repeat(64)};
  assert.equal(loadConfig(witnessConfig,witness).IPFS_PROVIDER,'pinata');
  delete (witness as Record<string,string>).PINATA_JWT;
  assert.throws(()=>loadConfig(witnessConfig,witness),/CONFIGURATION_REQUIRED: PINATA_JWT/);
});

test('API config rejects witness signing secrets', () => {
  const env = { ...baseEnv, PRIVY_APP_ID: 'test', PRIVY_VERIFICATION_KEY: 'test', OPERATOR_PRIVY_DID: 'did:privy:test', WITNESS_URL: 'http://localhost:3002', LLM_COMPLETIONS_URL: 'http://localhost:8080', LLM_MODEL: 'test', LLM_API_KEY: 'test', WITNESS_PRIVATE_KEY: '0x' + 'a'.repeat(64) };
  assert.throws(() => loadConfig(apiConfig, env), /API_SIGNING_SECRETS_FORBIDDEN/);
});

test('witness config validates private key format', () => {
  const env = { ...baseEnv, WITNESS_PRIVATE_KEY: 'invalid', RELAYER_PRIVATE_KEY: '0x' + 'b'.repeat(64), EVALUATOR_PRIVATE_KEY: '0x' + 'c'.repeat(64) };
  assert.throws(() => loadConfig(witnessConfig, env), /CONFIGURATION_REQUIRED/);
});

test('witness config does not require Circle execution credentials', () => {
  const env={...baseEnv,WITNESS_PRIVATE_KEY:'0x'+'a'.repeat(64),RELAYER_PRIVATE_KEY:'0x'+'b'.repeat(64),EVALUATOR_PRIVATE_KEY:'0x'+'c'.repeat(64)};
  delete (env as Record<string,string>).CIRCLE_API_KEY;
  delete (env as Record<string,string>).CIRCLE_ENTITY_SECRET;
  assert.doesNotThrow(()=>loadConfig(witnessConfig,env));
  assert.throws(()=>loadConfig(commonConfig,env),/CONFIGURATION_REQUIRED: CIRCLE_API_KEY, CIRCLE_ENTITY_SECRET/);
});

test('deployment.json has correct Arc chain ID', () => {
  assert.equal(commerceDeployment.chainId, 5042002);
});

test('deployment.json address matches Arc reference', () => {
  assert.equal(commerceDeployment.address, '0x0747EEf0706327138c69792bF28Cd525089e4583');
});

test('EVIDENCE_START_BLOCK defaults to 0 when not set', () => {
  const env = { ...baseEnv, WITNESS_PRIVATE_KEY: '0x' + 'a'.repeat(64), RELAYER_PRIVATE_KEY: '0x' + 'b'.repeat(64), EVALUATOR_PRIVATE_KEY: '0x' + 'c'.repeat(64) };
  const cfg = loadConfig(witnessConfig, env);
  assert.equal(cfg.EVIDENCE_START_BLOCK, 0);
});

test('EVIDENCE_START_BLOCK accepts valid positive integer', () => {
  const env = { ...baseEnv, WITNESS_PRIVATE_KEY: '0x' + 'a'.repeat(64), RELAYER_PRIVATE_KEY: '0x' + 'b'.repeat(64), EVALUATOR_PRIVATE_KEY: '0x' + 'c'.repeat(64), EVIDENCE_START_BLOCK: '12345' };
  const cfg = loadConfig(witnessConfig, env);
  assert.equal(cfg.EVIDENCE_START_BLOCK, 12345);
});

test('EVIDENCE_START_BLOCK rejects negative values', () => {
  const env = { ...baseEnv, WITNESS_PRIVATE_KEY: '0x' + 'a'.repeat(64), RELAYER_PRIVATE_KEY: '0x' + 'b'.repeat(64), EVALUATOR_PRIVATE_KEY: '0x' + 'c'.repeat(64), EVIDENCE_START_BLOCK: '-1' };
  assert.throws(() => loadConfig(witnessConfig, env), /CONFIGURATION_REQUIRED/);
});

test('EVIDENCE_START_BLOCK rejects non-numeric strings', () => {
  const env = { ...baseEnv, WITNESS_PRIVATE_KEY: '0x' + 'a'.repeat(64), RELAYER_PRIVATE_KEY: '0x' + 'b'.repeat(64), EVALUATOR_PRIVATE_KEY: '0x' + 'c'.repeat(64), EVIDENCE_START_BLOCK: 'abc' };
  assert.throws(() => loadConfig(witnessConfig, env), /CONFIGURATION_REQUIRED/);
});
