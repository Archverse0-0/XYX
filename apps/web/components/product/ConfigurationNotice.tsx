'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Notice, StatusBadge } from '../ui';
const titles: Record<string,string> = {agent:'Buyer Agent',wallet:'Wallet authorization',services:'Service evidence',receipts:'Evidence receipt',jobs:'Protected jobs',settings:'Policy & trust boundaries'};
export function ConfigurationNotice() {
  const section=usePathname().split('/')[1];
  return <section className="configuration-block">
    <StatusBadge tone="warning">Configuration required</StatusBadge>
    <h1>{titles[section] ?? 'Product access'}.</h1>
    <p className="muted">This workspace needs a configured Privy application before authentication and live operations are available.</p>
    <Notice>Privy is not configured. Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> to enable login and real transactions.</Notice>
    <p className="muted">Balances, provider history, receipts, and job states remain unavailable until their live services can be reached.</p>
    <Link className="button secondary" href="/settings">Read system boundaries <span aria-hidden="true">↗</span></Link>
  </section>;
}
