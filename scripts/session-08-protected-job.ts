import { erc20Abi, formatUnits, type Address } from 'viem';
import { ARC_CHAIN_ID, arcClient } from '../packages/shared/src/chain.js';
import { GraphClient } from '../packages/shared/src/graph.js';
import { ERC8004Client } from '../packages/erc8004/client.js';
import { chainJobSchema, commerceAbi } from '../packages/erc8183/service.js';
import {
  SESSION_08_BUYER, SESSION_08_CHAIN_ID, SESSION_08_COMMERCE, SESSION_08_EVALUATOR, SESSION_08_PROVIDER,
  SESSION_08_USDC, SESSION_08_TASK_INPUT, SESSION_08_DELIVERABLE, SESSION_08_DESCRIPTION, SESSION_08_BUDGET_ATOMIC, assertSession08Targets, createJobCalldata,
  fundCalldata, prepareSession08Job, setBudgetCalldata, submitCalldata,
} from '../packages/erc8183/session-08.js';
import { evaluatorAbi } from '../packages/shared/src/abi.js';

const RPC = 'https://rpc.testnet.arc.io';
const GRAPH = 'https://api.studio.thegraph.com/query/1759975/xyx-arc/v0.1.0';
const PROVIDER_ENDPOINT = 'https://xyx-provider.vercel.app/api/task';
const mode = process.argv[2] ?? '--inspect';
const requestedJobId = process.argv[3];

if (!['--inspect', '--simulate-create', '--simulate-set-budget', '--simulate-fund', '--simulate-submit'].includes(mode)) {
  throw new Error('USAGE: tsx scripts/session-08-protected-job.ts [--inspect|--simulate-create|--simulate-set-budget JOB_ID|--simulate-fund JOB_ID|--simulate-submit JOB_ID]');
}

const client = arcClient(RPC);
const job = prepareSession08Job();

async function publicChecks() {
  const chainId = await client.getChainId();
  const [commerceCode, usdcCode, evaluatorCode, paymentToken, evaluatorTarget, lifetime, paused, balance, allowance, health, task] = await Promise.all([
    client.getCode({ address: SESSION_08_COMMERCE }),
    client.getCode({ address: SESSION_08_USDC }),
    client.getCode({ address: SESSION_08_EVALUATOR }),
    client.readContract({ address: SESSION_08_COMMERCE, abi: commerceAbi, functionName: 'paymentToken' }),
    client.readContract({ address: SESSION_08_EVALUATOR, abi: evaluatorAbi, functionName: 'agenticCommerce' }),
    client.readContract({ address: SESSION_08_EVALUATOR, abi: evaluatorAbi, functionName: 'maxVerdictLifetime' }),
    client.readContract({ address: SESSION_08_EVALUATOR, abi: evaluatorAbi, functionName: 'paused' }),
    client.readContract({ address: SESSION_08_USDC, abi: erc20Abi, functionName: 'balanceOf', args: [SESSION_08_BUYER] }),
    client.readContract({ address: SESSION_08_USDC, abi: erc20Abi, functionName: 'allowance', args: [SESSION_08_BUYER, SESSION_08_COMMERCE] }),
    fetch('https://xyx-provider.vercel.app/api/health').then(async response => ({ status: response.status, body: await response.json() })),
    fetch(PROVIDER_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: SESSION_08_TASK_INPUT.text }) }).then(async response => ({ status: response.status, body: await response.json() })),
  ]);
  assertSession08Targets(chainId, SESSION_08_COMMERCE, paymentToken as Address, SESSION_08_EVALUATOR);
  if (String(evaluatorTarget).toLowerCase() !== SESSION_08_COMMERCE.toLowerCase()) throw new Error('EVALUATOR_COMMERCE_MISMATCH');
  if (!commerceCode || !usdcCode || !evaluatorCode) throw new Error('REQUIRED_CONTRACT_CODE_MISSING');
  if (paused) throw new Error('XYX_EVALUATOR_PAUSED');
  if (lifetime !== 300n) throw new Error('UNEXPECTED_VERDICT_LIFETIME');
  if (health.status !== 200 || task.status !== 200 || JSON.stringify(task.body) !== JSON.stringify(SESSION_08_DELIVERABLE)) throw new Error('PROVIDER_LIVE_CHECK_FAILED');
  const head = await client.getBlockNumber();
  const identity = await new ERC8004Client(RPC).resolve(PROVIDER_ENDPOINT, SESSION_08_PROVIDER, head);
  if (!identity || identity.agentId !== '894335') throw new Error('PROVIDER_IDENTITY_UNAVAILABLE');
  const graph = new GraphClient(GRAPH, 'QmaFDTDR41XFiatVmRnjoi3siZBXW9n4zAhCanU6T5CFrQ');
  const meta = await graph.meta();
  const validations = await graph.validations('894335', Number(meta.block.number));
  return {
    chainId, head: head.toString(), contracts: { commerce: Boolean(commerceCode), usdc: Boolean(usdcCode), evaluator: Boolean(evaluatorCode) },
    buyer: { address: SESSION_08_BUYER, balanceUsdc: formatUnits(balance, 6), allowanceUsdc: formatUnits(allowance, 6) },
    evaluator: { address: SESSION_08_EVALUATOR, maxVerdictLifetime: lifetime.toString(), paused },
    provider: { healthStatus: health.status, taskStatus: task.status, identity, graphValidationRecords: validations.length },
  };
}

const checks = await publicChecks();
const output: Record<string, unknown> = {
  mode,
  checks,
  job: {
    budgetUsdc: job.input.budgetUsdc,
    budgetAtomic: '10000',
    provider: SESSION_08_PROVIDER,
    evaluator: SESSION_08_EVALUATOR,
    expectedDeliverableHash: job.deliverableHash,
    expectedDecision: job.evaluation.decision === 1 ? 'COMPLETE' : 'REJECT',
    deterministicRejectDecision: job.rejection.decision === 2 ? 'REJECT' : 'INVALID',
    expiresAt: job.input.expiresAt,
  },
};

if (mode === '--simulate-create') {
  const createArgs = [SESSION_08_PROVIDER, SESSION_08_EVALUATOR, BigInt(job.input.expiresAt), job.chainDescription, '0x0000000000000000000000000000000000000000'] as const;
  const simulation = await client.simulateContract({
    account: SESSION_08_BUYER,
    address: SESSION_08_COMMERCE,
    abi: commerceAbi,
    functionName: 'createJob',
    args: createArgs,
  });
  const gasEstimate = await client.estimateContractGas({
    account: SESSION_08_BUYER,
    address: SESSION_08_COMMERCE,
    abi: commerceAbi,
    functionName: 'createJob',
    args: createArgs,
  });
  output.createJobSimulation = {
    status: 'PASS',
    calldata: createJobCalldata(job),
    gasEstimate: gasEstimate.toString(),
    note: 'Simulation return data is not a real job ID. The real jobId must be derived from a confirmed JobCreated event.',
  };
}

if (mode.startsWith('--simulate-') && mode !== '--simulate-create') {
  if (!requestedJobId || !/^(0|[1-9]\d{0,77})$/.test(requestedJobId)) throw new Error('CONFIRMED_JOB_ID_REQUIRED');
  const jobId = BigInt(requestedJobId);
  const onchain = chainJobSchema.parse(await client.readContract({ address: SESSION_08_COMMERCE, abi: commerceAbi, functionName: 'getJob', args: [jobId] }));
  if (onchain.id !== jobId || onchain.client.toLowerCase() !== SESSION_08_BUYER.toLowerCase() || onchain.provider.toLowerCase() !== SESSION_08_PROVIDER.toLowerCase() || onchain.evaluator.toLowerCase() !== SESSION_08_EVALUATOR.toLowerCase()) {
    throw new Error('CONFIRMED_JOB_PARTICIPANTS_REQUIRED');
  }
  if (!onchain.description.startsWith(`${SESSION_08_DESCRIPTION} | XYX specification: 0x`)) {
    throw new Error('CONFIRMED_JOB_DESCRIPTION_REQUIRED');
  }
  if (mode === '--simulate-set-budget') {
    if (onchain.status !== 0 || onchain.budget !== 0n) throw new Error('JOB_NOT_OPEN_FOR_BUDGET');
    const gasEstimate = await client.estimateContractGas({ account: SESSION_08_PROVIDER, address: SESSION_08_COMMERCE, abi: commerceAbi, functionName: 'setBudget', args: [jobId, SESSION_08_BUDGET_ATOMIC, '0x'] });
    output.setBudgetSimulation = { status: 'PASS', jobId: requestedJobId, calldata: setBudgetCalldata(jobId), gasEstimate: gasEstimate.toString() };
  }
  if (mode === '--simulate-fund') {
    if (onchain.status !== 0 || onchain.budget !== SESSION_08_BUDGET_ATOMIC) throw new Error('JOB_NOT_BUDGETED_FOR_FUND');
    const [approvalGas, fundGas] = await Promise.all([
      client.estimateContractGas({ account: SESSION_08_BUYER, address: SESSION_08_USDC, abi: erc20Abi, functionName: 'approve', args: [SESSION_08_COMMERCE, SESSION_08_BUDGET_ATOMIC] }),
      client.estimateContractGas({ account: SESSION_08_BUYER, address: SESSION_08_COMMERCE, abi: commerceAbi, functionName: 'fund', args: [jobId, '0x'] }),
    ]);
    output.fundSimulation = { status: 'PASS', jobId: requestedJobId, approveGasEstimate: approvalGas.toString(), fundCalldata: fundCalldata(jobId), fundGasEstimate: fundGas.toString() };
  }
  if (mode === '--simulate-submit') {
    if (onchain.status !== 1 || onchain.budget !== SESSION_08_BUDGET_ATOMIC) throw new Error('JOB_NOT_FUNDED_FOR_SUBMIT');
    const gasEstimate = await client.estimateContractGas({ account: SESSION_08_PROVIDER, address: SESSION_08_COMMERCE, abi: commerceAbi, functionName: 'submit', args: [jobId, job.deliverableHash, '0x'] });
    output.submitSimulation = { status: 'PASS', jobId: requestedJobId, calldata: submitCalldata(jobId, job.deliverableHash), gasEstimate: gasEstimate.toString() };
  }
}

console.log(JSON.stringify(output, null, 2));
