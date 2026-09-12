'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useQuery } from '@tanstack/react-query';
import { Login, useAPI } from '../client';

type JobRun={id:string;job_id:string|null;state:string;amount_usdc:string;tx_hash:string|null;
  operations:Array<{operation:string;state:string}>|null;specification:{description:string;budgetUsdc:string}};
type Runs={source:'operational';configured:boolean;provider:string|null;maxJobUsdc:string;runs:JobRun[]};
export function JobControls({jobId}:{jobId?:string}) {
  const api=useAPI(),{authenticated}=usePrivy();
  const q=useQuery<Runs>({queryKey:['job-runs'],queryFn:async()=> (await api('/api/v1/job-runs')).json(),enabled:authenticated,refetchInterval:15000});
  const [description,setDescription]=useState(''),[budget,setBudget]=useState(''),[expected,setExpected]=useState('');
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
  const request=useRef<{key:string;body:string}|null>(null);
  async function create() {
    setBusy(true);setError('');setNotice('Preparing job request. No transaction is confirmed yet.');
    try {
      if(!request.current)request.current={key:crypto.randomUUID(),body:JSON.stringify({provider:q.data?.provider,budgetUsdc:budget,
        description,expiresAt:Math.floor(Date.now()/1000)+86400,evaluation:{kind:'exact-json-v1',expected:JSON.parse(expected)}})};
      const result=await (await api('/api/v1/jobs',{method:'POST',headers:{'idempotency-key':request.current.key},body:request.current.body})).json();
      setNotice(`Job ${result.jobId} creation confirmed. Escrow is not funded yet.`);
      request.current=null;setDescription('');setBudget('');setExpected('');
    }catch(e){setError(e instanceof Error?e.message:'Job request stopped');setNotice('Confirmation unavailable. Inspect operational state before retrying. A retry reuses the same request key.');}
    finally{setBusy(false);await q.refetch();}
  }
  return <section className="panel"><div className="section-heading"><div><h2>Protected job operations</h2><p className="muted">Operational state is not Graph trust history. ERC-8183 owns escrow; XYX evaluates committed work.</p></div><Login/></div>
    {!authenticated?<p>Log in to view your jobs and authorize operations.</p>:q.isLoading?<p>Checking backend configuration…</p>:q.error?<p role="alert" className="error">Job operations are unavailable: {q.error.message}</p>:<>
      {!q.data?.configured&&<p className="notice">Protected-job wallet configuration is incomplete. No simulated transactions are available.</p>}
      {!jobId&&<form onSubmit={e=>{e.preventDefault();void create();}}><fieldset disabled={busy||!q.data?.configured}>
        <label htmlFor="job-description">Objective / work description</label><textarea id="job-description" required maxLength={2000} value={description} readOnly={!!request.current} onChange={e=>setDescription(e.target.value)}/>
        <label htmlFor="job-budget">Agreed USDC budget (maximum {q.data?.maxJobUsdc})</label><input id="job-budget" inputMode="decimal" required value={budget} readOnly={!!request.current} onChange={e=>setBudget(e.target.value)}/>
        <label htmlFor="job-expected">Acceptance criterion: exact JSON result</label><textarea id="job-expected" required maxLength={16000} value={expected} readOnly={!!request.current} onChange={e=>setExpected(e.target.value)}/>
        <p className="muted">This verifier checks exact JSON content, not arbitrary natural-language quality. The criterion is committed before funding. Submitted deliverables and evidence are publicly stored on IPFS: do not include secrets or personal data. Expiry is 24 hours after the first request.</p>
        <p className="mono">Participating provider: {q.data?.provider??'Not configured'}</p>
        <button type="submit">{busy?'Preparing / awaiting confirmation…':request.current?'Retry same request':'Create unfunded job'}</button>
      </fieldset></form>}
      {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}
      {!q.data?.runs.length&&<p>No operational jobs have been recorded for this account.</p>}
      {q.data?.runs.filter(r=>!jobId||r.job_id===jobId).map(run=><JobActions key={run.id} run={run} configured={!!q.data?.configured} refresh={()=>q.refetch()}/>)}
    </>}
  </section>;
}
function JobActions({run,configured,refresh}:{run:JobRun;configured:boolean;refresh:()=>Promise<unknown>}) {
  const api=useAPI();const [deliverable,setDeliverable]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const uncertain=run.operations?.some(op=>op.state!=='CONFIRMED');
  async function act(action:'fund'|'submit'|'evaluate') {
    setBusy(true);setError('');setNotice('Request in progress. Awaiting confirmed chain result.');
    try {
      const body=action==='fund'?{budgetUsdc:run.specification.budgetUsdc}:action==='submit'?{deliverable:JSON.parse(deliverable)}:{};
      const result=await (await api(`/api/v1/jobs/${run.job_id}/${action}`,{method:'POST',body:JSON.stringify(body)})).json();
      setNotice(`Confirmed transaction: ${result.txHash}`);
    }catch(e){setNotice('No new confirmation received. Check operation status before any retry.');setError(e instanceof Error?e.message:'Operation unavailable');}
    finally{setBusy(false);await refresh();}
  }
  return <article className="panel"><h3>{run.job_id?<Link href={`/jobs/${run.job_id}`}>Job {run.job_id}</Link>:'Job creation pending'}</h3>
    <p>{run.specification.description}</p><p>Recorded state: <strong>{run.state}</strong> · Budget: {run.specification.budgetUsdc} USDC</p>
    <ul>{run.operations?.map(op=><li key={op.operation}>{op.operation}: {op.state}</li>)}</ul>
    {uncertain&&<p className="notice" role="alert">An operation is in flight or requires reconciliation. Automatic resubmission is blocked to prevent duplicate spending.</p>}
    <fieldset disabled={busy||uncertain||!configured||!run.job_id}>
      {run.state==='OPEN'&&<button onClick={()=>void act('fund')}>Set agreed budget, approve exact USDC, and fund escrow</button>}
      {run.state==='FUNDED'&&<>
        <p className="muted">Provider must submit the deliverable via their wallet. Once submitted on-chain, click below to verify and record.</p>
        <label htmlFor={`deliverable-${run.id}`}>Expected deliverable hash (JSON)</label>
        <textarea id={`deliverable-${run.id}`} value={deliverable} maxLength={16000} onChange={e=>setDeliverable(e.target.value)} placeholder="Paste the expected deliverable JSON to compute its hash for verification"/>
        <button disabled={!deliverable} onClick={()=>void act('submit')}>Verify on-chain provider submission</button>
      </>}
      {run.state==='SUBMITTED'&&<button onClick={()=>void act('evaluate')}>Verify deliverable and resolve through XYX evaluator</button>}
    </fieldset>
    {run.tx_hash&&<p className="mono">Last recorded transaction: {run.tx_hash}</p>}
    {notice&&<p role="status" className="mono">{notice}</p>}{error&&<p role="alert" className="error">{error}</p>}
  </article>;
}
