'use client';
import { useParams } from 'next/navigation';
import { useAPI } from '../../../components/client';
import { useQuery } from '@tanstack/react-query';
export default function Service(){const {endpointKey}=useParams<{endpointKey:string}>();const api=useAPI();const q=useQuery({queryKey:['service',endpointKey],queryFn:async()=> (await api(`/api/v1/services/${endpointKey}`)).json(),enabled:!!endpointKey});return <><div className="eyebrow">SERVICE EVIDENCE</div><h1>Endpoint history.</h1><section className="panel">{q.isLoading?<p>Loading…</p>:q.error?<p className="error">This endpoint is unavailable from the live Graph.</p>:<pre className="mono">{JSON.stringify(q.data,null,2)}</pre>}</section></>}
