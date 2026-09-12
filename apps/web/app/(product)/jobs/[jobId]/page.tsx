'use client';
import { useParams } from 'next/navigation';
import { useAPI } from '../../../../components/client';
import { JobControls } from '../../../../components/product/JobControls';
import { useQuery } from '@tanstack/react-query';
export default function Job(){const {jobId}=useParams<{jobId:string}>();const api=useAPI();const q=useQuery({queryKey:['job',jobId],queryFn:async()=> (await api(`/api/v1/jobs/${jobId}`)).json(),enabled:!!jobId});return <><JobControls jobId={jobId}/><div className="eyebrow">ERC-8183 JOB</div><h1>Settlement state.</h1><section className="panel">{q.isLoading?<p>Loading…</p>:q.error?<p className="error">Job not found in the live Graph.</p>:<pre className="mono">{JSON.stringify(q.data,null,2)}</pre>}</section></>}
