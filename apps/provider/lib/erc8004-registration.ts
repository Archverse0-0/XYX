import {
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  parseAbi,
  type Hex,
} from 'viem';

export const ARC_TESTNET_CHAIN_ID = 5_042_002;
export const ARC_TESTNET_CHAIN_ID_HEX = '0x4cef52';
export const ARC_TESTNET_RPC_URL = 'https://rpc.testnet.arc.io';
export const ARC_TESTNET_EXPLORER_URL = 'https://testnet.arcscan.app';
export const IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
export const PROVIDER_WALLET = '0x7ea90Ac2A2bA5fF6c71e7E9D23037D64AbD2b4da';
export const AGENT_METADATA_URI = 'https://xyx-provider.vercel.app/agent-metadata.json';
export const REQUIRED_CONFIRMATION = 'REGISTER XYX PROVIDER';

const registryAbi = parseAbi([
  'function register(string agentURI) returns (uint256 agentId)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function getAgentWallet(uint256 agentId) view returns (address)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
]);

const zeroAddress = '0x0000000000000000000000000000000000000000';

export type ReceiptLog = { address: string; data: string; topics: readonly string[] };

export function isExpectedProviderWallet(value: string | undefined): boolean {
  return value?.toLowerCase() === PROVIDER_WALLET.toLowerCase();
}

export function isArcTestnet(chainId: string | undefined): boolean {
  return chainId?.toLowerCase() === ARC_TESTNET_CHAIN_ID_HEX;
}

export function registrationCalldata(): Hex {
  return encodeFunctionData({
    abi: registryAbi,
    functionName: 'register',
    args: [AGENT_METADATA_URI],
  });
}

export function registrationTransaction(from: string, gas?: string) {
  return {
    from,
    to: IDENTITY_REGISTRY,
    value: '0x0',
    data: registrationCalldata(),
    ...(gas ? { gas } : {}),
  };
}

export function extractMintedAgentId(logs: readonly ReceiptLog[], expectedWallet: string): bigint {
  const minted: bigint[] = [];
  for (const log of logs) {
    if (log.address.toLowerCase() !== IDENTITY_REGISTRY.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: registryAbi,
        data: log.data as Hex,
        topics: [...log.topics] as [Hex, ...Hex[]],
      });
      if (decoded.eventName !== 'Transfer') continue;
      const { from, to, tokenId } = decoded.args;
      if (from.toLowerCase() !== zeroAddress) continue;
      if (to.toLowerCase() !== expectedWallet.toLowerCase()) {
        throw new Error('MINT_RECIPIENT_MISMATCH');
      }
      minted.push(tokenId);
    } catch (error) {
      if (error instanceof Error && error.message === 'MINT_RECIPIENT_MISMATCH') throw error;
    }
  }
  if (minted.length !== 1) throw new Error('MINT_TRANSFER_NOT_FOUND');
  return minted[0];
}

export function ownerOfCalldata(agentId: bigint): Hex {
  return encodeFunctionData({ abi: registryAbi, functionName: 'ownerOf', args: [agentId] });
}

export function tokenUriCalldata(agentId: bigint): Hex {
  return encodeFunctionData({ abi: registryAbi, functionName: 'tokenURI', args: [agentId] });
}

export function agentWalletCalldata(agentId: bigint): Hex {
  return encodeFunctionData({ abi: registryAbi, functionName: 'getAgentWallet', args: [agentId] });
}

export function decodeOwnerOf(result: Hex): string {
  return decodeFunctionResult({ abi: registryAbi, functionName: 'ownerOf', data: result });
}

export function decodeTokenUri(result: Hex): string {
  return decodeFunctionResult({ abi: registryAbi, functionName: 'tokenURI', data: result });
}

export function decodeAgentWallet(result: Hex): string {
  return decodeFunctionResult({ abi: registryAbi, functionName: 'getAgentWallet', data: result });
}

export function registrationToolAvailable(nodeEnv: string | undefined): boolean {
  return nodeEnv !== 'production';
}
