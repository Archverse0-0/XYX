import { agentMetadataDocument, providerRegistration } from '../../lib/erc8004';

export const dynamic = 'force-dynamic';

export function GET() {
  const config = providerRegistration();
  if (!config) return Response.json({ error: 'ERC8004_METADATA_NOT_CONFIGURED' }, { status: 503 });
  return Response.json(agentMetadataDocument(config));
}
