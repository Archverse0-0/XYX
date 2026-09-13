/**
 * Minimal browser EIP-1193 surface used by the provider/operator tools.
 *
 * The transaction layer intentionally knows only about standard provider
 * requests and events. Wallet brands are implementation details of the wallet.
 */
export type Eip1193Request = {
  method: string;
  params?: unknown[];
};

export type Eip1193Provider = {
  request: (request: Eip1193Request) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

type InjectedProvider = Eip1193Provider & {
  providers?: Eip1193Provider[];
};

declare global {
  interface Window {
    ethereum?: InjectedProvider;
  }
}

/**
 * Return all providers exposed through the standard injected-wallet surface.
 * `ethereum.providers` is the multi-provider convention used by browsers;
 * it is not a dependency on any particular wallet brand.
 */
export function injectedEvmProviders(): Eip1193Provider[] {
  if (typeof window === 'undefined') return [];
  const injected = window.ethereum;
  if (!injected) return [];
  if (Array.isArray(injected.providers) && injected.providers.length > 0) {
    return [...injected.providers];
  }
  return [injected];
}

/**
 * Select the browser's standard injected EVM provider. The returned provider
 * is still subject to account, chain, simulation, and receipt verification by
 * each caller before a transaction request is sent.
 */
export function discoverEvmProvider(): Eip1193Provider | null {
  return injectedEvmProviders()[0] ?? null;
}
