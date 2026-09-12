import { decodeFunctionResult, encodeFunctionData, parseAbi, type Hex } from 'viem';
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_CHAIN_ID_HEX, ARC_TESTNET_RPC_URL, isArcTestnet, isExpectedProviderWallet, PROVIDER_WALLET, registrationToolAvailable } from './erc8004-registration';

export const COMMERCE = '0x0747EEf0706327138c69792bF28Cd525089e4583';
export const BUYER = '0x55763d498fd057d17ffcc2fb540789ce76f4f085';
export const EVALUATOR = '0xCEBFedAc66B0fFfAD452D3f1B356D1A3120dB233';
export const BUDGET = 10_000n;
export const DELIVERABLE_HASH = '0xee019961f0e9210659bcfc6968b2f4fb97337e459468548ea821e815f83586f5' as Hex;

const commerceAbi = parseAbi([
  'function getJob(uint256) view returns (uint256 id,address client,address provider,address evaluator,string description,uint256 budget,uint256 expiredAt,uint8 status,address hook)',
  'function setBudget(uint256,uint256,bytes)',
  'function submit(uint256,bytes32,bytes)',
]);

export type ProviderAction = 'setBudget' | 'submit';
export type ChainJob = { id: bigint; client: string; provider: string; evaluator: string; description: string; budget: bigint; expiredAt: bigint; status: number; hook: string };

export function protectedJobToolAvailable(nodeEnv: string | undefined): boolean { return registrationToolAvailable(nodeEnv); }
export function validJobId(value: string): boolean { return /^(0|[1-9]\d{0,77})$/.test(value); }
export function readJobCalldata(jobId: bigint): Hex { return encodeFunctionData({ abi: commerceAbi, functionName: 'getJob', args: [jobId] }); }
export function decodeJob(data: Hex): ChainJob {
  const value = decodeFunctionResult({ abi: commerceAbi, functionName: 'getJob', data }) as readonly [bigint, string, string, string, string, bigint, bigint, number, string];
  return { id: value[0], client: value[1], provider: value[2], evaluator: value[3], description: value[4], budget: value[5], expiredAt: value[6], status: value[7], hook: value[8] };
}
export function assertProviderJob(job: ChainJob, jobId: bigint, action: ProviderAction) {
  if (job.id !== jobId || job.client.toLowerCase() !== BUYER.toLowerCase() || job.provider.toLowerCase() !== PROVIDER_WALLET.toLowerCase() || job.evaluator.toLowerCase() !== EVALUATOR.toLowerCase()) throw new Error('JOB_PARTICIPANTS_MISMATCH');
  if (action === 'setBudget' && (job.status !== 0 || job.budget !== 0n)) throw new Error('JOB_NOT_OPEN_FOR_BUDGET');
  if (action === 'submit' && (job.status !== 1 || job.budget !== BUDGET)) throw new Error('JOB_NOT_FUNDED_FOR_SUBMIT');
}
export function actionCalldata(action: ProviderAction, jobId: bigint): Hex {
  return action === 'setBudget'
    ? encodeFunctionData({ abi: commerceAbi, functionName: 'setBudget', args: [jobId, BUDGET, '0x'] })
    : encodeFunctionData({ abi: commerceAbi, functionName: 'submit', args: [jobId, DELIVERABLE_HASH, '0x'] });
}
export function actionConfirmation(action: ProviderAction, jobId: string): string { return action === 'setBudget' ? `SET BUDGET ${jobId}` : `SUBMIT DELIVERABLE ${jobId}`; }
export const expectedProvider = isExpectedProviderWallet;
export const expectedChain = isArcTestnet;
export { ARC_TESTNET_CHAIN_ID_HEX, ARC_TESTNET_CHAIN_ID, ARC_TESTNET_RPC_URL };
export { PROVIDER_WALLET };
