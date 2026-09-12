'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { chapters, initialMotion, type MotionState } from './story';
import { StaticCore } from './StaticCore';
import type { ExperienceDriver } from './ScrollTimeline';

const Scene = dynamic(()=>import('./Scene'), { ssr:false, loading:()=>null });
class SceneBoundary extends Component<{children:ReactNode; onFailure:()=>void},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){this.props.onFailure();}
  render(){return this.state.failed?null:this.props.children;}
}

export default function Experience() {
  const root=useRef<HTMLDivElement>(null);
  const motion=useRef<MotionState>({...initialMotion});
  const driver=useRef<ExperienceDriver|null>(null);
  const [mode,setMode]=useState<'pending'|'cinematic'|'reading'>('pending');
  const [ready,setReady]=useState(false);
  const [active,setActive]=useState(0);
  const [mobile,setMobile]=useState(false);
  const [manualReading,setManualReading]=useState(false);
  const [failed,setFailed]=useState(false);
  const fail=useCallback(()=>{setFailed(true);setMode('reading');},[]);
  const onReady=useCallback(()=>setReady(true),[]);

  useEffect(()=>{
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    const small=window.matchMedia('(max-width: 760px)');
    const choose=()=>{
      setMobile(small.matches);
      const constrained=(navigator as Navigator & {deviceMemory?:number;connection?:{saveData?:boolean}});
      setMode(reduced.matches || manualReading || failed || constrained.connection?.saveData || (constrained.deviceMemory!==undefined&&constrained.deviceMemory<=2) ? 'reading':'cinematic');
    };
    choose();reduced.addEventListener('change',choose);small.addEventListener('change',choose);
    return ()=>{reduced.removeEventListener('change',choose);small.removeEventListener('change',choose);};
  },[manualReading,failed]);

  useEffect(()=>{
    if(mode!=='cinematic'||!root.current)return;
    let disposed=false;
    import('./ScrollTimeline').then(({createScrollTimeline})=>{
      if(disposed||!root.current)return;
      driver.current=createScrollTimeline(root.current,motion.current,mobile,setActive);
    }).catch(fail);
    return ()=>{disposed=true;driver.current?.dispose();driver.current=null;};
  },[mode,mobile,fail]);

  // A failed GPU/module load must not trap a visitor in an empty pinned stage.
  useEffect(()=>{
    if(mode!=='cinematic'||ready)return;
    const timeout=window.setTimeout(fail,15000);
    return ()=>window.clearTimeout(timeout);
  },[mode,ready,fail]);

  function go(index:number) {
    if(driver.current){driver.current.go(index);return;}
    document.getElementById(chapters[index].id)?.scrollIntoView({behavior:'auto'});
  }
  const cinematic=mode==='cinematic';
  return <div ref={root} className={`experience ${cinematic?'is-cinematic':'is-reading'}`} data-mode={mode} data-chapter={active}>
    <a href="#narrative" className="skip-link">Skip to narrative</a>
    <header className="marketing-header">
      <Link href="/" className="marketing-brand" aria-label="XYX home">XYX<span>THE EVIDENCE ENGINE</span></Link>
      <nav aria-label="Main navigation"><Link href="/settings">System boundaries</Link><Link href="/agent" className="enter-link">Enter XYX <span aria-hidden="true">↗</span></Link></nav>
    </header>
    <main id="narrative">
      <div className="cinematic-stage">
        <div className={`scene-layer ${ready&&cinematic?'scene-ready':''}`} aria-hidden="true">
          <StaticCore/>
          {cinematic&&<SceneBoundary onFailure={fail}><Scene motion={motion} mobile={mobile} onReady={onReady} onFailure={fail}/></SceneBoundary>}
        </div>
        <div className="scene-vignette" aria-hidden="true"/>
        <span className="scene-coordinate" aria-hidden="true">XYX / ENGINE 01<br/>EVIDENCE AS INFRASTRUCTURE</span>
        <div className="chapter-copy">
          {chapters.map((chapter,i)=><article key={chapter.id} id={chapter.id} className={`chapter chapter-${i}`} aria-hidden={cinematic&&active!==i?true:undefined} inert={cinematic&&active!==i?true:undefined}>
            <div className="chapter-eyebrow"><span>{String(i).padStart(2,'0')} /</span> {chapter.label}</div>
            {i===0?<h1 className="hero-wordmark">XYX</h1>:<h2>{chapter.title.split('\n').map((line,j)=><span key={j}>{line}</span>)}</h2>}
            <p className="chapter-lead">{chapter.text}</p>
            <p className="chapter-detail">{chapter.detail}</p>
            <div className="chapter-signal"><span aria-hidden="true">↳</span> {chapter.signal}</div>
            {i===0&&<button className="story-start" onClick={()=>go(1)}>Scroll to activate <span aria-hidden="true">↓</span></button>}
            {i===10&&<div className="closing-actions"><Link className="button" href="/agent">ENTER XYX <span aria-hidden="true">↗</span></Link><Link href="/settings" className="architecture-link">View system boundaries <span aria-hidden="true">↗</span></Link></div>}
          </article>)}
        </div>
        <div className="cinematic-caption"><span>CONCEPTUAL SYSTEM / NOT LIVE ACTIVITY</span><span>{ready&&cinematic?'SCROLL TO EXPLORE':mode==='pending'?'PREPARING EXPERIENCE':cinematic?'LOADING EVIDENCE CORE':'READING EXPERIENCE'}</span></div>
        {cinematic&&<nav className="chapter-nav" aria-label="Story chapters">{chapters.map((c,i)=><button key={c.id} onClick={()=>go(i)} aria-label={`${String(i).padStart(2,'0')} ${c.label}`} aria-current={active===i?'step':undefined}><span>{String(i).padStart(2,'0')}</span><i/></button>)}</nav>}
        <div className="story-progress" aria-hidden="true"><i/></div>
      </div>
    </main>
    <footer className="marketing-footer"><span>XYX — EXPOSE, YIELD, EXECUTE</span><span>P0 FOUNDATION / LIVE E2E UNVERIFIED</span><button className="reading-toggle" onClick={()=>setManualReading(v=>!v)}>{manualReading?'Enable cinematic view':'Read without motion'}</button></footer>
  </div>;
}
