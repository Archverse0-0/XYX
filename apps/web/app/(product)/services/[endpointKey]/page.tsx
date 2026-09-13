'use client';
import { useParams } from 'next/navigation';
import { useAPI } from '../../../../components/client';
import { useQuery } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { Login } from '../../../../components/client';
export default function Service(){const {endpointKey}=useParams<{endpointKey:string}>();const api=useAPI();const {authenticated}=usePrivy();const q=useQuery({queryKey:['service',endpointKey],queryFn:async()=> (await api(`/api/v1/services/${endpointKey}`)).json(),enabled:!!endpointKey&&authenticated});return <><div className="page-heading"><div><div className="eyebrow">SERVICE EVIDENCE</div><h1>Endpoint history.</h1><p className="muted">A forensic view of the indexed endpoint and its observed execution history.</p></div><Login /></div><section className="panel">{!authenticated?<p>Log in with Privy to view this endpoint&apos;s history.</p>:q.isLoading?<p>Loading…</p>:q.error?<p className="error">This endpoint is unavailable from the live Graph.</p>:<pre className="mono raw-data">{JSON.stringify(q.data,null,2)}</pre>}</section></>}
