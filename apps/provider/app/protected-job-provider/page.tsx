import { notFound } from 'next/navigation';
import { protectedJobToolAvailable } from '../../lib/protected-job-provider';
import ProtectedJobProviderClient from './protected-job-provider-client';

export const dynamic = 'force-dynamic';

export default function ProtectedJobProviderPage() {
  if (!protectedJobToolAvailable(process.env.NODE_ENV)) notFound();
  return <ProtectedJobProviderClient />;
}
