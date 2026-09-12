import type { Metadata } from 'next';
import './style.css';
export const metadata:Metadata={title:'XYX — Expose, Yield, Execute',description:'Risk, verification, and settlement for autonomous agent commerce.'};
export default function Layout({children}:{children:React.ReactNode}){
  return <html lang="en"><body>{children}</body></html>;
}
