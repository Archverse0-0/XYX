import { decodeFunctionResult, encodeFunctionData, parseAbi } from 'viem';

// ─── Configuration ───────────────────────────────────────────────
// Addresses from PRD v1.2 live deployment facts, overridable via env.

const envAddress = (key: string | undefined, fallback: string): string => {
  if (!key || !/^0x[0-9a-fA-F]{40}$/.test(key)) return fallback;
  return key;
};

export const COMMERCE = envAddress(process.env.ERC8183_ADDRESS, '0x0747EEf0706327138c69792bF28Cd525089e4583');
export const BUYER = envAddress(process.env.BUYER_ADDRESS, '0x55763d498fd057d17ffcc2fb540789ce76f4f085');
export const EVALUATOR = envAddress(process.env.EVALUATOR_ADDRESS, '0xCEBFedAc66B0fFfAD452D3f1B356D1A3120dB233');
export const PROVIDER_WALLET = envAddress(process.env.PROVIDER_WALLET_ADDRESS, '0x7ea90Ac2A2bA5fF6c71e7E9D23037D64AbD2b4da');

// The provider price is configured in USDC and must match the budget the buyer
// committed when creating the job. The current verified default is 0.01 USDC.
export function getBudgetUsdc(): bigint {
  const envValue = process.env.PROVIDER_BUDGET_USDC;
  if (!envValue) return 10_000n;
  if (!/^(?:0|[1-9]\d{0,3})(?:\.\d{1,6})?$/.test(envValue)) throw new Error('INVALID_BUDGET_USDC');
  const [whole, fraction = ''] = envValue.split('.');
  const padded = fraction.padEnd(6, '0').slice(0, 6);
  const amount = BigInt(whole) * 10n ** 6n + BigInt(padded);
  if (amount === 0n || amount > 10_000n * 10n ** 6n) throw new Error('INVALID_BUDGET_USDC');
  return amount;
}

export const BUDGET = getBudgetUsdc();

// ─── ABI ─────────────────────────────────────────────────────────
const commerceAbi = parseAbi([
  'function getJob(uint256) view returns (uint256 id,address client,address provider,address evaluator,string description,uint256 budget,uint256 expiredAt,uint8 status,address hook)',
  'function setBudget(uint256,uint256,bytes)',
  'function submit(uint256,bytes32,bytes)',
]);

export const commerceABI = commerceAbi;

export type ProviderAction = 'setBudget' | 'submit';
export type ChainJob = { id: bigint; client: string; provider: string; evaluator: string; description: string; budget: bigint; expiredAt: bigint; status: number; hook: string };

// ─── Validation Helpers ─────────────────────────────────────────
export function validJobId(value: string): boolean {
  return /^(0|[1-9]\d{0,77})$/.test(value);
}

export function readJobCalldata(jobId: bigint): `0x${string}` {
  return encodeFunctionData({abi:commerceAbi,functionName:'getJob',args:[jobId]});
}

export function decodeJob(data: `0x${string}`): ChainJob {
  const job=decodeFunctionResult({abi:commerceAbi,functionName:'getJob',data});
  return {id:job[0],client:job[1],provider:job[2],evaluator:job[3],description:job[4],budget:job[5],
    expiredAt:job[6],status:Number(job[7]),hook:job[8]};
}

export function assertProviderJob(job: ChainJob, jobId: bigint, action: ProviderAction) {
  if (job.id !== jobId || job.client.toLowerCase() !== BUYER.toLowerCase() || job.provider.toLowerCase() !== PROVIDER_WALLET.toLowerCase() || job.evaluator.toLowerCase() !== EVALUATOR.toLowerCase()) throw new Error('JOB_PARTICIPANTS_MISMATCH');
  if (action === 'setBudget' && (job.status !== 0 || job.budget !== 0n)) throw new Error('JOB_NOT_OPEN_FOR_BUDGET');
  if (action === 'submit' && (job.status !== 1 || job.budget !== BUDGET)) throw new Error('JOB_NOT_FUNDED_FOR_SUBMIT');
}

export function actionCalldata(action: ProviderAction, jobId: bigint, deliverableHash?: `0x${string}`): `0x${string}` {
  if (action === 'setBudget') {
    return encodeFunctionData({abi:commerceAbi,functionName:'setBudget',args:[jobId,BUDGET,'0x']});
  }
  if(!deliverableHash||!/^0x[0-9a-fA-F]{64}$/.test(deliverableHash))throw new Error('INVALID_DELIVERABLE_HASH');
  return encodeFunctionData({abi:commerceAbi,functionName:'submit',args:[jobId,deliverableHash,'0x']});
}

export function actionConfirmation(action: ProviderAction, jobId: string): string {
  return action === 'setBudget' ? `SET BUDGET ${jobId}` : `SUBMIT DELIVERABLE ${jobId}`;
}

// ─── Constants (must match erc8004-registration.ts) ──────────────
const ARC_TESTNET_CHAIN_ID_RAW = 5042002;
const ARC_TESTNET_CHAIN_ID_HEX_RAW = '0x4cef52' as `0x${string}`;
const ARC_TESTNET_RPC_URL_RAW = 'https://rpc.testnet.arc.io';

export const ARC_TESTNET_CHAIN_ID = ARC_TESTNET_CHAIN_ID_RAW;
export const ARC_TESTNET_CHAIN_ID_HEX = ARC_TESTNET_CHAIN_ID_HEX_RAW;
export const ARC_TESTNET_RPC_URL = ARC_TESTNET_RPC_URL_RAW;

// Note: PROVIDER_WALLET is defined in this module, not re-exported.

export const expectedProvider = (value: string | undefined): boolean => value?.toLowerCase() === PROVIDER_WALLET.toLowerCase();
export const expectedChain = (chainId: string | undefined): boolean => chainId?.toLowerCase() === ARC_TESTNET_CHAIN_ID_HEX.toLowerCase();

// The protected-job provider is an operational component, not a dev-only tool.
// Always available regardless of NODE_ENV.
export function protectedJobToolAvailable(_nodeEnv: string | undefined): boolean { return true; }
