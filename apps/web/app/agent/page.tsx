'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { Login, useAPI } from '../../components/client';
type Score={endpointKey:string;priceUsdc:string;count:number;trust:number;confidence:number;addressDiversity:number;validation:number|null;protected:boolean;status:string;utility:number};
type Timeline={id:string;type:string;data:Record<string,unknown>};
export default function Agent(){
  const api=useAPI();const {authenticated}=usePrivy();
  const [objective,setObjective]=useState(''),[cap,setCap]=useState('0.02'),[minimum,setMinimum]=useState('0'),[protectedJob,setProtected]=useState(false);
  const [run,setRun]=useState(''),[events,setEvents]=useState<Timeline[]>([]),[scores,setScores]=useState<Score[]>([]),[selected,setSelected]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const abort=useRef<AbortController|null>(null);
  useEffect(()=>()=>abort.current?.abort(),[]);
  async function stream(runId:string){
    abort.current?.abort();const controller=new AbortController();abort.current=controller;let last='0';
    while(!controller.signal.aborted){
      const res=await api(`/api/v1/agent/runs/${runId}/events`,{headers:{'last-event-id':last},signal:controller.signal});
      const reader=res.body?.getReader();if(!reader)throw new Error('Event stream unavailable');let buffer='';const decoder=new TextDecoder();
      for(;;){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;
        while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);const lines=frame.split('\n');const type=lines.find(l=>l.startsWith('event: '))?.slice(7);if(!type)continue;
          const id=lines.find(l=>l.startsWith('id: '))?.slice(4)??last;const data=JSON.parse(lines.find(l=>l.startsWith('data: '))?.slice(6)??'{}');last=id;
          setEvents(e=>e.some(x=>x.id===id)?e:[...e,{id,type,data}]);
          if(type==='risk.completed'){setScores((data.scores??[]) as Score[]);setSelected(String(data.selectedCandidate??''));}
          if(type==='run.completed'||type==='run.failed'){setBusy(false);await reader.cancel();return;}
        }
      }
    }
  }
  async function start(){setError('');setBusy(true);setEvents([]);setScores([]);try{
    const result=await (await api('/api/v1/agent/runs',{method:'POST',headers:{'idempotency-key':crypto.randomUUID()},body:JSON.stringify({objective,policy:{maxPriceUsdc:Number(cap),minimumTrust:Number(minimum),requireProtection:protectedJob}})})).json();
    setRun(result.runId);await stream(result.runId);
  }catch(e){setError(e instanceof Error?e.message:'Operation stopped');setBusy(false);}}
  const receipt=events.find(e=>e.type==='receipt.anchored')?.data;
  return <><div className="row intro"><div><div className="eyebrow">REFERENCE BUYER AGENT</div><h1>Your objective.<br/>An evidence-based decision.</h1></div><Login/></div>
    <div className="grid"><section className="panel"><h2>Purchase authorization</h2><label htmlFor="objective">What should the agent do?</label><textarea id="objective" value={objective} onChange={e=>setObjective(e.target.value)} placeholder="Describe the service and outcome you need."/>
      <div className="grid"><div><label htmlFor="cap">Maximum per purchase (USDC)</label><input id="cap" value={cap} type="number" min="0.000001" step="0.000001" onChange={e=>setCap(e.target.value)}/></div><div><label htmlFor="trust">Minimum trust (0–1)</label><input id="trust" value={minimum} type="number" min="0" max="1" step="0.01" onChange={e=>setMinimum(e.target.value)}/></div></div>
      <label><input type="checkbox" checked={protectedJob} onChange={e=>setProtected(e.target.checked)}/>Require Protected Job</label><p className="muted">Default weights: reliability 70%, price 20%, validation 10%. Unavailable validation is excluded from the denominator.</p>
      <button onClick={start} disabled={!authenticated||busy||!objective||Number(cap)<=0}>Run agent</button>{busy&&run&&<button className="secondary" onClick={async()=>{try{await api(`/api/v1/agent/runs/${run}/stop`,{method:'POST'});}catch(e){setError(String(e));}}}>Stop next execution</button>}
      {protectedJob&&<p className="muted">Open Purchase endpoints do not satisfy this policy. Create a job with a participating provider through <Link href="/jobs">Protected Jobs</Link>.</p>}
    </section><section className="panel"><h2>Execution timeline</h2>{!events.length?<p className="muted">No execution yet. Timeline events come from the backend.</p>:<ol className="timeline">{events.map(e=><li key={e.id}><span>{e.type}</span>{typeof e.data.code==='string'&&<small>{e.data.code}</small>}</li>)}</ol>}{run&&<small className="mono">Run {run}</small>}</section></div>
    {error&&<div className="notice error" role="alert">{error}. Unavailable live services are never replaced with sample data.</div>}
    <section className="panel"><h2>Risk comparison</h2><p className="muted">XYX Observed Evidence · address diversity does not prove independent human actors.</p>{!scores.length?<p>No candidates have passed live discovery and payment compatibility yet.</p>:<div className="scroll"><table><thead><tr>{['Endpoint','USDC','Observed calls','Trust','Confidence','Address diversity','Validation','Protection','Decision'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{scores.map(s=><tr key={s.endpointKey}><td><Link href={`/services/${s.endpointKey}`}>{s.endpointKey.slice(0,12)}…</Link></td><td>{s.priceUsdc}</td><td>{s.count}</td><td>{s.status==='UNOBSERVED'?'UNOBSERVED':s.trust.toFixed(4)}</td><td>{(s.confidence*100).toFixed(1)}%</td><td>{s.addressDiversity.toFixed(2)}</td><td>{s.validation??'Unavailable'}</td><td>{s.protected?'ERC-8183':'Open Purchase'}</td><td>{s.endpointKey===selected?'Selected':'Candidate'}</td></tr>)}</tbody></table></div>}</section>
    {receipt&&<section className="panel"><h2>Evidence anchored</h2><Link className="button" href={`/receipts/${String(receipt.receiptHash)}`}>Inspect receipt ↗</Link><p className="mono">{String(receipt.arcTxHash)}</p></section>}
  </>;
}
