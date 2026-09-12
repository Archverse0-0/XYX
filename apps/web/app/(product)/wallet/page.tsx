'use client';
import { useState } from 'react';
import { useWallets, usePrivy } from '@privy-io/react-auth';
import { usePublicClient } from 'wagmi';
import { createWalletClient, custom, erc20Abi, formatUnits } from 'viem';
import { arcTestnet } from 'viem/chains';
import { useQuery } from '@tanstack/react-query';
import { Login, useAPI } from '../../../components/client';
import { atomicAmount } from '../../../../../packages/shared/src/index';
const token='0x3600000000000000000000000000000000000000' as const;
export default function Wallet(){
  const {wallets}=useWallets(),{authenticated}=usePrivy();const publicClient=usePublicClient();const api=useAPI();
  const wallet=wallets.find(w=>w.walletClientType==='privy');
  const [amount,setAmount]=useState(''),[status,setStatus]=useState(''),[tx,setTx]=useState(''),[error,setError]=useState('');
  const agent=useQuery({queryKey:['agent-wallet'],queryFn:async()=> (await api('/api/v1/wallet')).json(),enabled:authenticated});
  const balance=useQuery({queryKey:['human-balance',wallet?.address],enabled:!!wallet&&!!publicClient,queryFn:async()=>{
    const client=publicClient as any;
    const decimals=await client.readContract({address:token,abi:erc20Abi,functionName:'decimals'});
    if(decimals!==6)throw new Error('USDC decimals do not match the Arc deployment');
    const value=await client.readContract({address:token,abi:erc20Abi,functionName:'balanceOf',args:[wallet!.address as `0x${string}`]});
    return {decimals,value:formatUnits(value,decimals)};
  }});
  async function fund(){setError('');setTx('');setStatus('Preparing');try{
    if(!wallet||!agent.data?.address||!balance.data||!publicClient)throw new Error('Wallet is not ready');
    const value=atomicAmount(amount,balance.data.decimals);if(value<=0n)throw new Error('Amount must be positive');
    await wallet.switchChain(5042002);const provider=await wallet.getEthereumProvider();
    const client=createWalletClient({account:wallet.address as `0x${string}`,chain:arcTestnet,transport:custom(provider)}) as any;
    setStatus('Awaiting wallet');const hash=await client.writeContract({address:token,abi:erc20Abi,functionName:'transfer',args:[agent.data.address,value]});
    setTx(hash);setStatus('Broadcasting');const receipt=await publicClient.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw new Error('Transaction reverted');
    setStatus('Confirmed');await Promise.all([agent.refetch(),balance.refetch()]);
  }catch(e){setStatus('Failed');setError(e instanceof Error?e.message:'Transaction failed');}}
  return <><div className="row intro"><div><div className="eyebrow">HUMAN AUTHORITY → AGENT</div><h1>Fund your agent.</h1></div><Login/></div><div className="grid"><section className="panel"><h2>Privy embedded wallet</h2><p className="mono">{wallet?.address??'Not available'}</p><p className="stat">{balance.data?`${balance.data.value} USDC`:'Balance unavailable'}</p><p className="muted">Funding requires your signature.</p></section><section className="panel"><h2>Circle Developer-Controlled Wallet</h2><p className="mono">{agent.data?.address??'Not available'}</p><p className="stat">{agent.data?`${agent.data.balance} USDC`:'Balance unavailable'}</p><p className="muted">Balance is read from the Arc Testnet USDC ERC-20 contract.</p></section></div>
    <section className="panel"><h2>Transfer real USDC</h2><label htmlFor="fund">USDC amount</label><input id="fund" value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal"/><button disabled={!wallet||!agent.data||!balance.data||['Preparing','Awaiting wallet','Broadcasting'].includes(status)} onClick={fund}>Fund Circle Developer-Controlled Wallet</button>{status&&<p>Status: {status}</p>}{tx&&<a className="mono" href={`https://testnet.arcscan.app/tx/${tx}`} target="_blank" rel="noreferrer">{tx} ↗</a>}{(error||agent.error||balance.error)&&<p role="alert" className="error">{error||agent.error?.message||balance.error?.message}</p>}</section></>;
}
