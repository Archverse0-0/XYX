import { notFound } from 'next/navigation';
import { registrationToolAvailable } from '../../lib/erc8004-registration';
import RegistrationClient from './registration-client';

export const dynamic = 'force-dynamic';

export default function ERC8004RegistrationPage() {
  if (!registrationToolAvailable(process.env.NODE_ENV)) notFound();
  return <RegistrationClient />;
}
