import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionResult, encodeFunctionResult, type Abi } from 'viem';
import commerce from '../../erc8183/AgenticCommerce.abi.json' with { type: 'json' };
import { verifyErc8183Job, verifyErc8004Provider } from '../../../scripts/verify-live.js';
const provider = '0x7ea90Ac2A2bA5fF6c71e7E9D23037D64AbD2b4da';
const evaluator = '0xCEBFedAc66B0fFfAD452D3f1B356D1A3120dB233';
const buyer = '0x55763d498fd057d17ffcc2fb540789ce76f4f085';
const contract = '0x0747EEf0706327138c69792bF28Cd525089e4583';

test('live verifier decodes actual tuple ABI without converting evaluator into a number', async () => {
  const data = encodeFunctionResult({ abi: commerce as Abi, functionName: 'getJob', result: {
    id: 1n, client: buyer, provider, evaluator, description: 'canonical test specification', budget: 10000n,
    expiredAt: BigInt(Math.floor(Date.now()/1000)+21600), status: 0, hook: '0x0000000000000000000000000000000000000000',
  } });
  const client = { readContract: async ({ abi }: { abi: Abi }) => decodeFunctionResult({ abi, functionName: 'getJob', data }) };
  const checks = await verifyErc8183Job(client, contract, 1n, provider, evaluator);
  assert.ok(checks.length > 5);
  assert.ok(checks.every(check => check.status === 'PASS'), JSON.stringify(checks));
});

test('live identity verifier calls canonical getAgentWallet and requires expected wallet', async () => {
  const calls: string[] = [];
  const client = { readContract: async ({ functionName, abi }: { functionName: string; abi: Abi }) => {
    calls.push(functionName);
    assert.ok(abi.some(item => item.type === 'function' && item.name === functionName));
    return provider;
  } };
  const checks = await verifyErc8004Provider(client, contract, 894335n, provider);
  assert.deepEqual(calls, ['ownerOf', 'getAgentWallet']);
  assert.ok(checks.every(check => check.status === 'PASS'));
  const mismatch = await verifyErc8004Provider({ readContract: async ({ functionName }) => functionName === 'ownerOf' ? provider : buyer }, contract, 894335n, provider);
  assert.equal(mismatch.find(check => check.id === 'erc8004.signer')?.status, 'FAIL');
});
