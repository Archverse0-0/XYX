import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFunctionData, type Address } from 'viem';
import { CircleAdapter } from '../../circle-adapter/src/index.js';
import { commerceAbi } from '../../erc8183/service.js';
import {
  SESSION_08_COMMERCE, SESSION_08_EVALUATOR, SESSION_08_PROVIDER, SESSION_08_USDC,
  assertSession08Targets, createJobCalldata, prepareSession08Job, verdictExpiry,
} from '../../erc8183/session-08.js';

test('Session 8 protected-job probe is deterministic and produces COMPLETE only for the exact provider response', () => {
  const job = prepareSession08Job(1_800_000_000);
  assert.equal(job.input.budgetUsdc, '0.01');
  assert.equal(job.evaluation.decision, 1);
  assert.equal(job.rejection.decision, 2);
  assert.equal(job.input.expiresAt, 1_800_086_400);
});

test('Session 8 target checks fail closed for wrong Arc deployment references', () => {
  assert.doesNotThrow(() => assertSession08Targets(5_042_002, SESSION_08_COMMERCE, SESSION_08_USDC, SESSION_08_EVALUATOR));
  assert.throws(() => assertSession08Targets(1, SESSION_08_COMMERCE, SESSION_08_USDC, SESSION_08_EVALUATOR), /WRONG_CHAIN/);
  assert.throws(() => assertSession08Targets(5_042_002, '0x0000000000000000000000000000000000000000' as Address, SESSION_08_USDC, SESSION_08_EVALUATOR), /ERC8183_TARGET_MISMATCH/);
  assert.throws(() => assertSession08Targets(5_042_002, SESSION_08_COMMERCE, '0x0000000000000000000000000000000000000000' as Address, SESSION_08_EVALUATOR), /USDC_TARGET_MISMATCH/);
  assert.throws(() => assertSession08Targets(5_042_002, SESSION_08_COMMERCE, SESSION_08_USDC, '0x0000000000000000000000000000000000000000' as Address), /EVALUATOR_TARGET_MISMATCH/);
});

test('Session 8 create calldata binds the registered provider and frozen XYX evaluator', () => {
  const data = createJobCalldata(prepareSession08Job(1_800_000_000));
  const decoded = decodeFunctionData({ abi: commerceAbi, data });
  assert.equal(decoded.functionName, 'createJob');
  assert.equal((decoded.args?.[0] as string).toLowerCase(), SESSION_08_PROVIDER.toLowerCase());
  assert.equal((decoded.args?.[1] as string).toLowerCase(), SESSION_08_EVALUATOR.toLowerCase());
  assert.equal(decoded.args?.[2], 1_800_086_400n);
});

test('Session 8 verdict expiry is bounded by the live evaluator lifetime', () => {
  assert.equal(verdictExpiry(100n, 300n), 400n);
  assert.throws(() => verdictExpiry(100n, 301n), /UNEXPECTED_VERDICT_LIFETIME/);
  assert.throws(() => verdictExpiry(100n, 0n), /UNEXPECTED_VERDICT_LIFETIME/);
});

test('Circle execution fails closed without Circle credentials while witness configuration remains independent', async () => {
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  delete process.env.CIRCLE_API_KEY;
  delete process.env.CIRCLE_ENTITY_SECRET;
  try {
    const adapter = new CircleAdapter('0x55763d498fd057d17ffcc2fb540789ce76f4f085');
    await assert.rejects(
      adapter.execute('approve(address,uint256)', ['0x0747EEf0706327138c69792bF28Cd525089e4583', '10000'], SESSION_08_USDC, '00000000-0000-4000-8000-000000000008'),
      /CIRCLE_DEVELOPER_WALLET_CONFIG_REQUIRED/,
    );
  } finally {
    if (apiKey === undefined) delete process.env.CIRCLE_API_KEY; else process.env.CIRCLE_API_KEY = apiKey;
    if (entitySecret === undefined) delete process.env.CIRCLE_ENTITY_SECRET; else process.env.CIRCLE_ENTITY_SECRET = entitySecret;
  }
});
