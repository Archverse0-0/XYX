import { createPublicClient, http } from 'viem';
import { arcTestnet } from 'viem/chains';
import { encodeFunctionData } from 'viem';

const client = createPublicClient({
  chain: arcTestnet,
  transport: http('https://rpc.testnet.arc.io'),
});

const JOB_ID = 186075n;
const ERC_8183 = '0x0747EEf0706327138c69792bF28Cd525089e4583';
const PROVIDER = '0x7ea90Ac2A2bA5fF6c71e7E9D23037D64AbD2b4da';
const BUDGET = 10000n;

async function main() {
  // 1. Check current job state
  const abi = [{
    name: 'getJob',
    type: 'function',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [
      { name: 'id', type: 'uint256' },
      { name: 'client', type: 'address' },
      { name: 'provider', type: 'address' },
      { name: 'evaluator', type: 'address' },
      { name: 'description', type: 'string' },
      { name: 'budget', type: 'uint256' },
      { name: 'expiredAt', type: 'uint256' },
      { name: 'status', type: 'uint8' },
      { name: 'hook', type: 'address' }
    ],
    stateMutability: 'view'
  }] as const;

  const job = await client.readContract({
    address: ERC_8183,
    abi,
    functionName: 'getJob',
    args: [JOB_ID],
  });

  console.log('Job 186075 state:', {
    id: job[0].toString(),
    client: job[1],
    provider: job[2],
    evaluator: job[3],
    budget: job[5].toString(),
    status: job[7],
    expiredAt: job[6].toString(),
  });

  // 2. Verify preconditions
  const status = Number(job[7]);
  const budget = job[5];

  if (status !== 0) {
    console.error(`FAIL: Job status is ${status}, expected 0 (OPEN)`);
    process.exit(1);
  }

  if (budget !== 0n) {
    console.error(`FAIL: Job budget is ${budget}, expected 0`);
    process.exit(1);
  }

  if (job[2].toLowerCase() !== PROVIDER.toLowerCase()) {
    console.error('FAIL: Provider mismatch');
    process.exit(1);
  }

  console.log('✓ Job state valid for setBudget');

  // 3. Encode setBudget calldata
  const setBudgetAbi = [{
    name: 'setBudget',
    type: 'function',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'budget', type: 'uint256' },
      { name: 'data', type: 'bytes' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  }] as const;

  const calldata = encodeFunctionData({
    abi: setBudgetAbi,
    functionName: 'setBudget',
    args: [JOB_ID, BUDGET, '0x'],
  });

  console.log('✓ setBudget calldata:', calldata);

  // 4. Simulate transaction
  try {
    const simulation = await client.simulateContract({
      account: PROVIDER,
      address: ERC_8183,
      abi: setBudgetAbi,
      functionName: 'setBudget',
      args: [JOB_ID, BUDGET, '0x'],
    });

    console.log('✓ Simulation passed');
    console.log('  Gas estimate:', simulation.gas?.toString());
    console.log('  Return data:', simulation.returnData);
  } catch (error) {
    console.error('FAIL: Simulation failed:', error);
    process.exit(1);
  }

  console.log('\n✓ TX2 PREFLIGHT COMPLETE');
  console.log('Ready to create operator page for manual execution via Rabby');
}

main().catch((error) => {
  console.error('Fatal:', error);
  process.exit(1);
});
