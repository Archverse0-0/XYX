'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
const links = [['/agent','Buyer Agent'],['/services','Services'],['/jobs','Protected Jobs'],['/wallet','Wallet'],['/settings','Settings']];
export function ProductShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <div className="product-shell">
    <a className="skip-link" href="#product-content">Skip to content</a>
    <header className="product-header">
      <Link className="brand" href="/" aria-label="XYX home">XYX<span>EXPOSE · YIELD · EXECUTE</span></Link>
      <nav className="product-nav" aria-label="Product navigation">{links.map(([href,label]) => <Link key={href} href={href} aria-current={pathname===href || pathname.startsWith(href+'/') ? 'page' : undefined}>{label}</Link>)}</nav>
      <span className="network">Arc Testnet</span>
    </header>
    <main className="product-main" id="product-content">
      <div className="workspace-bar"><span>XYX / Machine commerce control</span><span>P0 foundation · Live E2E unverified</span></div>
      {children}
    </main>
    <footer className="product-footer"><span>XYX Observed Evidence · Observed history, not global provider reputation.</span><span>Centralized Witness / P0</span></footer>
  </div>;
}
