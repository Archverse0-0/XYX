'use client';
import { usePrivy } from '@privy-io/react-auth';
import { useCallback } from 'react';
export function useAPI(){
  const {getAccessToken}=usePrivy();
  return useCallback(async(path:string,init:RequestInit={})=>{
    const token=await getAccessToken();if(!token)throw new Error('Please log in first.');
    const response=await fetch('/backend'+path,{...init,headers:{'content-type':'application/json',...init.headers,authorization:`Bearer ${token}`}});
    if(!response.ok){let code='Service unavailable';try{code=(await response.json()).error??code;}catch{}throw new Error(code);}
    return response;
  },[getAccessToken]);
}
export function Login(){const {ready,authenticated,login,logout}=usePrivy();return <button className="secondary" disabled={!ready} onClick={()=>authenticated?logout():login()}>{authenticated?'Log out':'Log in with Privy'}</button>;}
