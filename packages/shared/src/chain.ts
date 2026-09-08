import { createPublicClient, http, erc20Abi, type Address } from 'viem';
import { arcTestnet } from 'viem/chains';
export const ARC_CHAIN_ID=5042002;
export const ARC_USDC='0x3600000000000000000000000000000000000000' as Address;
export function arcClient(rpc:string) {return createPublicClient({chain:arcTestnet,transport:http(rpc,{timeout:15000,retryCount:1})});}
export async function usdcBalance(client:ReturnType<typeof arcClient>,wallet:Address) {
  if(await client.getChainId()!==ARC_CHAIN_ID) throw new Error('WRONG_CHAIN');
  const [decimals,balance]=await Promise.all([
    client.readContract({address:ARC_USDC,abi:erc20Abi,functionName:'decimals'}),
    client.readContract({address:ARC_USDC,abi:erc20Abi,functionName:'balanceOf',args:[wallet]}),
  ]);
  // Arc ERC-20 accounting must never silently use native 18-decimal gas units.
  if(decimals!==6) throw new Error('UNEXPECTED_USDC_DECIMALS');
  return {decimals,balance};
}
