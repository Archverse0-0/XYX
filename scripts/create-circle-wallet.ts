import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

if (!apiKey || !entitySecret) {
  throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET are required');
}

const circleDir = '.circle';
const walletInfoPath = `${circleDir}/wallet-info.json`;
const statePath = `${circleDir}/create-wallet-state.json`;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

await mkdir(circleDir, { recursive: true });

if (await exists(walletInfoPath)) {
  throw new Error(
    'CIRCLE_WALLET_ALREADY_EXISTS: .circle/wallet-info.json already exists; refusing to create another wallet'
  );
}

type CreationState = {
  walletSetIdempotencyKey: string;
  walletIdempotencyKey: string;
  walletSetId?: string;
};

let state: CreationState;

if (await exists(statePath)) {
  state = JSON.parse(await readFile(statePath, 'utf8')) as CreationState;

  if (!state.walletSetIdempotencyKey || !state.walletIdempotencyKey) {
    throw new Error('INVALID_CIRCLE_WALLET_CREATION_STATE');
  }

  console.log('Resuming existing Circle wallet creation attempt');
} else {
  state = {
    walletSetIdempotencyKey: randomUUID(),
    walletIdempotencyKey: randomUUID(),
  };

  await writeFile(
    statePath,
    JSON.stringify(state, null, 2) + '\n',
    { mode: 0o600 }
  );

  console.log('Created local idempotent wallet creation state');
}

const client = initiateDeveloperControlledWalletsClient({
  apiKey,
  entitySecret,
});

const walletSetResponse = await client.createWalletSet({
  name: 'XYX Arc Testnet',
  idempotencyKey: state.walletSetIdempotencyKey,
});

const walletSet = walletSetResponse.data?.walletSet;

if (!walletSet?.id) {
  throw new Error('CIRCLE_WALLET_SET_CREATION_FAILED');
}

state.walletSetId = walletSet.id;

await writeFile(
  statePath,
  JSON.stringify(state, null, 2) + '\n',
  { mode: 0o600 }
);

const walletResponse = await client.createWallets({
  walletSetId: walletSet.id,
  blockchains: ['ARC-TESTNET'],
  count: 1,
  accountType: 'EOA',
  idempotencyKey: state.walletIdempotencyKey,
});

const wallet = walletResponse.data?.wallets?.[0];

if (!wallet?.id || !wallet.address) {
  throw new Error('CIRCLE_WALLET_CREATION_FAILED');
}

await writeFile(
  walletInfoPath,
  JSON.stringify(
    {
      walletSetId: walletSet.id,
      walletId: wallet.id,
      address: wallet.address,
      blockchain: wallet.blockchain,
    },
    null,
    2
  ) + '\n',
  { mode: 0o600 }
);

console.log(`Wallet created on ${wallet.blockchain}`);
console.log(`Wallet ID: ${wallet.id}`);
console.log(`Address: ${wallet.address}`);
console.log('Saved metadata to .circle/wallet-info.json');
