const ARC_TESTNET_CHAIN_ID = 5042002;
const IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const MAX_AGENT_ID = 2n ** 256n;

export type ProviderRegistration = {
  publicOrigin: string;
  agentId: string;
  payeeAddress: string;
};

function publicOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function providerRegistration(env: Readonly<Record<string, string | undefined>> = process.env): ProviderRegistration | null {
  const origin = publicOrigin(env.PROVIDER_PUBLIC_ORIGIN);
  const agentId = env.ERC8004_AGENT_ID;
  const payeeAddress = env.PROVIDER_PAYEE_ADDRESS;
  if (!origin || !agentId || !/^\d+$/u.test(agentId) || BigInt(agentId) >= MAX_AGENT_ID) return null;
  if (!payeeAddress || !/^0x[0-9a-fA-F]{40}$/u.test(payeeAddress)) return null;
  return { publicOrigin: origin, agentId, payeeAddress };
}

export function agentRegistrationDocument(config: ProviderRegistration) {
  return {
    registrations: [{
      agentRegistry: `eip155:${ARC_TESTNET_CHAIN_ID}:${IDENTITY_REGISTRY}`,
      agentId: config.agentId,
    }],
  };
}

export function agentMetadataDocument(config: ProviderRegistration) {
  return { services: [{ endpoint: `${config.publicOrigin}/api/task` }] };
}
