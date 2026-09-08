'use client';
import { useState } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { createConfig, WagmiProvider } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http } from 'wagmi';
import { arcTestnet } from 'viem/chains';
const config=createConfig({chains:[arcTestnet],transports:{[arcTestnet.id]:http(process.env.NEXT_PUBLIC_ARC_RPC_URL??'https://rpc.testnet.arc.io')}});
export function Providers({children}:{children:React.ReactNode}){
  const [query]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:1,staleTime:10000}}}));
  const appId=process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if(!appId)return <div className="notice">Privy is not configured. Set NEXT_PUBLIC_PRIVY_APP_ID to enable login and real transactions.</div>;
  return <PrivyProvider appId={appId} config={{supportedChains:[arcTestnet],defaultChain:arcTestnet,loginMethods:['email','wallet'],embeddedWallets:{ethereum:{createOnLogin:'users-without-wallets'}}}}>
    <QueryClientProvider client={query}><WagmiProvider config={config}>{children}</WagmiProvider></QueryClientProvider>
  </PrivyProvider>;
}
