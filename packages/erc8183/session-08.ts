import { encodeFunctionData, type Address, type Hex } from 'viem';
import { z } from 'zod';
import { evaluatorAbi } from '../shared/src/abi.js';
import { atomicAmount, hashJSON } from '../shared/src/index.js';
import { canonicalJobSpec, createJobSchema, evaluateDeliverable } from '../shared/src/jobs.js';
import { commerceAbi } from './service.js';

export const SESSION_08_CHAIN_ID = 5_042_002;
export const SESSION_08_COMMERCE = '0x0747EEf0706327138c69792bF28Cd525089e4583' as Address;
export const SESSION_08_USDC = '0x3600000000000000000000000000000000000000' as Address;
export const SESSION_08_EVALUATOR = '0xCEBFedAc66B0fFfAD452D3f1B356D1A3120dB233' as Address;
export const SESSION_08_BUYER = '0x55763d498fd057d17ffcc2fb540789ce76f4f085' as Address;
export const SESSION_08_PROVIDER = '0x7ea90Ac2A2bA5fF6c71e7E9D23037D64AbD2b4da' as Address;
export const SESSION_08_BUDGET_USDC = '0.01';
export const SESSION_08_BUDGET_ATOMIC = atomicAmount(SESSION_08_BUDGET_USDC, 6);
export const SESSION_08_TASK_INPUT = { text: '  hello   protected   XYX  ' };
export const SESSION_08_DELIVERABLE = { ok: true, result: { normalized: 'hello protected XYX' } };
export const SESSION_08_DESCRIPTION = 'Normalize this text:   hello   protected   XYX';

export interface Session08Job {
  input: z.infer<typeof createJobSchema>;
  specification: unknown;
  specificationHash: Hex;
  chainDescription: string;
  deliverableHash: Hex;
  evaluation: { decision: 1 | 2; reason: { version: string; verifier: string; specificationHash: Hex; deliverableHash: Hex; result: string }; reasonHash: Hex };
  rejection: { decision: 1 | 2; reason: { version: string; verifier: string; specificationHash: Hex; deliverableHash: Hex; result: string }; reasonHash: Hex };
}

export function prepareSession08Job(now = Math.floor(Date.now() / 1_000)): Session08Job {
  const input = createJobSchema.parse({
    provider: SESSION_08_PROVIDER,
    budgetUsdc: SESSION_08_BUDGET_USDC,
    expiresAt: now + 86_400,
    description: SESSION_08_DESCRIPTION,
    evaluation: { kind: 'exact-json-v1', expected: SESSION_08_DELIVERABLE },
  });
  const specification = canonicalJobSpec(input);
  const specificationHash = hashJSON(specification);
  const chainDescription = `${input.description} | XYX specification: ${specificationHash}`;
  const evaluation = evaluateDeliverable(input.evaluation, SESSION_08_DELIVERABLE);
  const rejection = evaluateDeliverable(input.evaluation, { ok: true, result: { normalized: 'wrong result' } });
  return { input, specification, specificationHash, chainDescription, deliverableHash: hashJSON(SESSION_08_DELIVERABLE), evaluation, rejection };
}

export function assertSession08Targets(chainId: number, commerce: Address, token: Address, evaluator: Address) {
  if (chainId !== SESSION_08_CHAIN_ID) throw new Error('WRONG_CHAIN');
  if (commerce.toLowerCase() !== SESSION_08_COMMERCE.toLowerCase()) throw new Error('ERC8183_TARGET_MISMATCH');
  if (token.toLowerCase() !== SESSION_08_USDC.toLowerCase()) throw new Error('USDC_TARGET_MISMATCH');
  if (evaluator.toLowerCase() !== SESSION_08_EVALUATOR.toLowerCase()) throw new Error('EVALUATOR_TARGET_MISMATCH');
}

export function createJobCalldata(job: Session08Job): Hex {
  return encodeFunctionData({
    abi: commerceAbi,
    functionName: 'createJob',
    args: [SESSION_08_PROVIDER, SESSION_08_EVALUATOR, BigInt(job.input.expiresAt), job.chainDescription, '0x0000000000000000000000000000000000000000'],
  } as never);
}

export function setBudgetCalldata(jobId: bigint): Hex {
  return encodeFunctionData({ abi: commerceAbi, functionName: 'setBudget', args: [jobId, SESSION_08_BUDGET_ATOMIC, '0x'] } as never);
}

export function fundCalldata(jobId: bigint): Hex {
  return encodeFunctionData({ abi: commerceAbi, functionName: 'fund', args: [jobId, '0x'] } as never);
}

export function submitCalldata(jobId: bigint, deliverableHash: Hex): Hex {
  return encodeFunctionData({ abi: commerceAbi, functionName: 'submit', args: [jobId, deliverableHash, '0x'] } as never);
}

export function resolveVerdictCalldata(verdict: { jobId: bigint; evidenceHash: Hex; reasonHash: Hex; decision: 1 | 2; issuedAt: bigint; expiresAt: bigint; nonce: bigint }, signature: Hex): Hex {
  return encodeFunctionData({ abi: evaluatorAbi, functionName: 'resolveJob', args: [verdict, signature] } as never);
}

export function verdictExpiry(issuedAt: bigint, maxVerdictLifetime: bigint): bigint {
  if (maxVerdictLifetime <= 0n || maxVerdictLifetime > 300n) throw new Error('UNEXPECTED_VERDICT_LIFETIME');
  return issuedAt + maxVerdictLifetime;
}
