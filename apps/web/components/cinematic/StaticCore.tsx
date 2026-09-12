/** A small DOM illustration also remains useful without JavaScript or WebGL. */
export function StaticCore() {
  return <div className="static-core" aria-hidden="true"><div className="static-core-stack">{Array.from({length:8},(_,i)=><i key={i} style={{transform:`translateY(${i*17}px) rotateX(58deg) rotateZ(-35deg)`}}/>)}</div></div>;
}
