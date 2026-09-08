'use client';
import { useParams } from 'next/navigation';
import { useAPI } from '../../../components/client';
import { useQuery } from '@tanstack/react-query';
export default function Receipt(){const {receiptHash}=useParams<{receiptHash:string}>();const api=useAPI();const q=useQuery({queryKey:['receipt',receiptHash],queryFn:async()=> (await api(`/api/v1/receipts/${receiptHash}`)).json(),enabled:!!receiptHash});return <><div className="eyebrow">ARC RECEIPT</div><h1>Evidence receipt.</h1><section className="panel">{q.isLoading?<p>Loading…</p>:q.error?<p className="error">Receipt not found in the live Graph.</p>:<dl>{Object.entries((q.data?.receipt??q.data??{}) as Record<string,unknown>).map(([k,v])=><><dt key={`${k}-k`}>{k}</dt><dd key={`${k}-v`} className="mono">{typeof v==='object'?JSON.stringify(v):String(v)}</dd></>)}</dl>}</section></>}
