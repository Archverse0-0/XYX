import type { Metadata } from 'next';
import Link from 'next/link';
import { Providers } from './providers';
import './style.css';
export const metadata:Metadata={title:'XYX — Expose, Yield, Execute',description:'Risk, verification, and settlement for autonomous agent commerce.'};
export default function Layout({children}:{children:React.ReactNode}){
  return <html lang="en"><body><header><Link className="brand" href="/">XYX<span>EXPOSE · YIELD · EXECUTE</span></Link><nav>
    <Link href="/agent">Agent</Link><Link href="/services">Services</Link><Link href="/jobs">Protected Jobs</Link><Link href="/wallet">Wallet</Link><Link href="/settings">Settings</Link>
  </nav><span className="network">● Arc Testnet</span></header><main><Providers>{children}</Providers></main>
  <footer>XYX Observed Evidence · XYX-observed execution history, not global provider reputation. P0 uses a centralized Witness.</footer></body></html>;
}
