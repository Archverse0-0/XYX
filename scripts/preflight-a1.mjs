#!/usr/bin/env node
/**
 * PHASE A1 — PRE-FLIGHT CHECK
 * All checks are read-only. No state-changing operations.
 */

import { createPublicClient, http } from 'viem';
import { arcTestnet } from 'viem/chains';

const ARC_RPC = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.io';
const CIRCLE_AGENT = process.env.CIRCLE_AGENT_ADDRESS;
const ERC_8183 = '0x0747EEf0706327138c69792bF28Cd525089e4583';
const EVALUATOR = '0xCEBFedAc66B0fFfAD452D3f1B356D1A3120dB233';
const USDC = '0x3600000000000000000000000000000000000000';
const PROVIDER = '0x7ea90Ac2A2bA5fF6c71e7E9D23037D64AbD2b4da';
const ERC8004_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const WITNESS = '0x15cd0E9055BD775eF69000438e756E4476562E8F';
const EVALUATOR_ATTESTOR = '0x644C11572E3792bd1dE5959D09ECBc6f63304277';
const GRAPH_URL = process.env.GRAPH_URL || 'https://api.studio.thegraph.com/query/1759975/xyx-arc/v0.1.0';

if (!CIRCLE_AGENT) {
  console.error('Missing required env var: CIRCLE_AGENT_ADDRESS');
  process.exit(1);
}

let failures = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${name}: ${detail}`);
  } else {
    console.log(`  ✗ ${name}: ${detail}`);
    failures++;
  }
}

async function main() {
  console.log('=== PHASE A1 — PRE-FLIGHT ===\n');

  const client = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC) });

  // 1. Chain ID
  const chainId = await client.getChainId();
  check('Arc Testnet chainId', chainId === 5042002, `got ${chainId}`);

  // 2. ERC-8183 — readJob proves deployment
  try {
    const job = await client.readContract({
      address: ERC_8183,
      abi: [{ type: 'function', name: 'getJob', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'string' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint8' }, { type: 'address' }] }],
      functionName: 'getJob',
      args: [0n],
    });
    check('ERC-8183 contract (getJob)', true, `${ERC_8183} → id=${job[0]}`);
  } catch (e) {
    check('ERC-8183 contract (getJob)', false, `call failed: ${e.message}`);
  }

  // 3. XYXEvaluator
  try {
    await client.readContract({
      address: EVALUATOR,
      abi: [{ type: 'function', name: 'agenticCommerce', inputs: [], outputs: [{ type: 'address' }] }],
      functionName: 'agenticCommerce',
    });
    check('XYXEvaluator (agenticCommerce)', true, EVALUATOR);
  } catch (e) {
    check('XYXEvaluator (agenticCommerce)', false, `call failed: ${e.message}`);
  }

  // 4. USDC — verify decimals
  try {
    const decimals = await client.readContract({
      address: USDC,
      abi: [{ type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }] }],
      functionName: 'decimals',
    });
    check('USDC decimals', decimals === 6, `decimals=${decimals}`);
  } catch (e) {
    check('USDC decimals', false, `call failed: ${e.message}`);
  }

  // 5. Circle buyer
  check('Circle buyer address', !!CIRCLE_AGENT && CIRCLE_AGENT.startsWith('0x'), CIRCLE_AGENT);

  // 6. Provider
  check('Provider address', !!PROVIDER && PROVIDER.startsWith('0x'), PROVIDER);

  // 7. ERC-8004 Registry — canonical Identity Registry reads prove deployment
  try {
    const owner = await client.readContract({
      address: ERC8004_REGISTRY,
      abi: [{ type: 'function', name: 'ownerOf', inputs: [{ type: 'uint256', name: 'tokenId' }], outputs: [{ type: 'address' }] }],
      functionName: 'ownerOf',
      args: [894335n],
    });
    check('ERC-8004 Registry (ownerOf)', owner.toLowerCase() === PROVIDER.toLowerCase(), `${ERC8004_REGISTRY} → ${owner}`);
  } catch (e) {
    check('ERC-8004 Registry (ownerOf)', false, `call failed: ${e.message}`);
  }

  // 8. USDC balance of buyer
  try {
    const buyerBalance = await client.readContract({
      address: USDC,
      abi: [{ type: 'function', name: 'balanceOf', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }],
      functionName: 'balanceOf',
      args: [CIRCLE_AGENT],
    });
    const buyerBalanceUsdc = Number(buyerBalance) / 1e6;
    check('Buyer USDC balance', buyerBalanceUsdc >= 0.01, `${buyerBalanceUsdc} USDC (need 0.01)`);
  } catch (e) {
    check('Buyer USDC balance', false, `call failed: ${e.message}`);
  }

  // 9. Signer separation
  check('Witness != Evaluator', WITNESS !== EVALUATOR_ATTESTOR, 'distinct');
  check('Witness != Buyer', WITNESS.toLowerCase() !== CIRCLE_AGENT.toLowerCase(), 'distinct');
  check('Witness != Provider', WITNESS.toLowerCase() !== PROVIDER.toLowerCase(), 'distinct');
  check('Evaluator != Buyer', EVALUATOR_ATTESTOR.toLowerCase() !== CIRCLE_AGENT.toLowerCase(), 'distinct');
  check('Evaluator != Provider', EVALUATOR_ATTESTOR.toLowerCase() !== PROVIDER.toLowerCase(), 'distinct');

  // 10. Provider ERC-8004 identity
  try {
    const [owner, agentWallet] = await Promise.all([
      client.readContract({
        address: ERC8004_REGISTRY,
        abi: [{ type: 'function', name: 'ownerOf', inputs: [{ type: 'uint256', name: 'tokenId' }], outputs: [{ type: 'address' }] }],
        functionName: 'ownerOf',
        args: [894335n],
      }),
      client.readContract({
      address: ERC8004_REGISTRY,
      abi: [{ type: 'function', name: 'getAgentWallet', inputs: [{ type: 'uint256', name: 'agentId' }], outputs: [{ type: 'address' }] }],
      functionName: 'getAgentWallet',
      args: [894335n],
      }),
    ]);
    check('Provider ERC-8004 agent 894335', owner.toLowerCase() === PROVIDER.toLowerCase() && agentWallet.toLowerCase() === PROVIDER.toLowerCase(), `owner=${owner}, wallet=${agentWallet}`);
  } catch (e) {
    check('Provider ERC-8004 agent 894335', false, `failed: ${e.message}`);
  }

  // 11. Provider endpoint
  try {
    const resp = await fetch('https://xyx-provider.vercel.app/api/task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '  hello   protected   XYX  ' }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await resp.json();
    check('Provider endpoint /api/task', resp.ok && data?.ok === true && data?.result?.normalized === 'hello protected XYX', JSON.stringify(data));
  } catch (e) {
    check('Provider endpoint /api/task', false, `failed: ${e.message}`);
  }

  // 12. Graph reachability
  try {
    const graphResp = await fetch(GRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ _meta { block { number } } }' }),
      signal: AbortSignal.timeout(15000),
    });
    const graphData = await graphResp.json();
    const blockNum = graphData?.data?._meta?.block?.number;
    check('Graph reachable', !!blockNum, `block ${blockNum}`);
  } catch (e) {
    check('Graph reachable', false, `failed: ${e.message}`);
  }

  // 13. Database URL configured
  const dbUrl = process.env.DATABASE_URL;
  check('Database URL configured', !!dbUrl, dbUrl ? 'set' : 'NOT SET');

  console.log(`\n=== PRE-FLIGHT RESULT: ${failures === 0 ? 'PASS' : failures + ' FAILURES'} ===`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
