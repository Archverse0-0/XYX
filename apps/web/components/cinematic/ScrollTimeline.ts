import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { initialMotion, poses, type MotionState } from './story';
gsap.registerPlugin(ScrollTrigger);
export type ExperienceDriver={go:(chapter:number)=>void;dispose:()=>void};

export function createScrollTimeline(root:HTMLElement,state:MotionState,mobile:boolean,onChapter:(index:number)=>void):ExperienceDriver {
  const stage=root.querySelector<HTMLElement>('.cinematic-stage')!;
  const articles=Array.from(root.querySelectorAll<HTMLElement>('.chapter'));
  const progress=root.querySelector('.story-progress i');
  const lenis=new Lenis({autoRaf:false,smoothWheel:!mobile,lerp:.085,anchors:true});
  lenis.on('scroll',ScrollTrigger.update);
  const tick=(time:number)=>lenis.raf(time*1000);
  gsap.ticker.add(tick);
  let previous=-1;
  let timeline:gsap.core.Timeline | null = null;
  Object.assign(state,initialMotion);
  const context=gsap.context(()=>{
    gsap.set(articles,{autoAlpha:0,y:26});gsap.set(articles[0],{autoAlpha:1,y:0});
    timeline=gsap.timeline({scrollTrigger:{trigger:root,start:'top top',end:()=>`+=${window.innerHeight*(mobile?6.8:10)}`,pin:stage,scrub:mobile?.35:.8,invalidateOnRefresh:true,anticipatePin:1,onUpdate:()=>{
      const index=Math.min(10,Math.max(0,Math.floor(state.chapter+.35)));
      if(index!==previous){previous=index;onChapter(index);}
    }}});
    for(let i=1;i<poses.length;i++){
      timeline.to(state,{...poses[i],chapter:i,duration:1,ease:'power1.inOut'},i-1);
      timeline.to(articles[i-1],{autoAlpha:0,y:-24,duration:.2,ease:'power1.in'},i-.42);
      timeline.fromTo(articles[i],{autoAlpha:0,y:28},{autoAlpha:1,y:0,duration:.25,ease:'power2.out'},i-.2);
    }
    if (progress) timeline.to(progress,{scaleX:1,duration:10,ease:'none'},0);
  },root);
  const refresh=()=>ScrollTrigger.refresh();
  document.fonts.ready.then(()=>{if(root.isConnected)refresh();});
  refresh();
  return {
    go:(index)=>{const trigger=timeline?.scrollTrigger;if(!trigger)return;lenis.scrollTo(trigger.start+(trigger.end-trigger.start)*(index/10),{duration:mobile?.7:1.3,force:true});},
    dispose:()=>{gsap.ticker.remove(tick);lenis.off('scroll',ScrollTrigger.update);lenis.destroy();context.revert();},
  };
}
