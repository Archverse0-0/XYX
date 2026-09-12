import type { ReactNode } from 'react';
export function SectionHeader({ index, title, detail, action }: { index?: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="section-heading"><div>{index && <span className="eyebrow section-index">{index}</span>}<h2>{title}</h2>{detail && <p className="muted">{detail}</p>}</div>{action}</div>;
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`notice${error ? ' error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div>;
}
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty-state"><span className="empty-mark" aria-hidden="true">[ — ]</span><h3>{title}</h3><p>{children}</p></div>;
}
export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'error' }) {
  return <span className={`status-badge status-${tone}`}><span aria-hidden="true"/>{children}</span>;
}
export function PageHeading({ eyebrow, title, children, action }: { eyebrow: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{children && <p className="muted">{children}</p>}</div>{action}</div>;
}
