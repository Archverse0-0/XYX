'use client';
import { useParams } from 'next/navigation';
import { useAPI } from '../../../../components/client';
import { useQuery } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { Login } from '../../../../components/client';
export default function Receipt(){const {receiptHash}=useParams<{receiptHash:string}>();const api=useAPI();const {authenticated}=usePrivy();const q=useQuery({queryKey:['receipt',receiptHash],queryFn:async()=> (await api(`/api/v1/receipts/${receiptHash}`)).json(),enabled:!!receiptHash&&authenticated});const receipt=(q.data?.receipt??q.data??{}) as Record<string,unknown>;return <><div className="page-heading"><div><div className="eyebrow">ARC RECEIPT</div><h1>Evidence receipt.</h1><p className="muted">Payment, execution, and cryptographic commitments returned by the live Graph.</p></div><Login /></div><section className="panel">{!authenticated?<p>Log in with Privy to view this receipt.</p>:q.isLoading?<p>Loading…</p>:q.error?<p className="error">Receipt not found in the live Graph.</p>:<dl className="data-fields">{Object.entries(receipt).map(([k,v])=><div className="data-row" key={k}><dt>{k}</dt><dd className="mono">{typeof v==='object'?JSON.stringify(v):String(v)}</dd></div>)}</dl>}</section></>}
