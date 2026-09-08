import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

const apiKey=process.env.CIRCLE_API_KEY;
const entitySecret=process.env.CIRCLE_ENTITY_SECRET;
if(!apiKey||!entitySecret)throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET are required');

const client=initiateDeveloperControlledWalletsClient({apiKey,entitySecret});
const walletSet=(await client.createWalletSet({name:'XYX Arc Testnet',idempotencyKey:randomUUID()})).data?.walletSet;
if(!walletSet?.id)throw new Error('CIRCLE_WALLET_SET_CREATION_FAILED');
const wallet=(await client.createWallets({walletSetId:walletSet.id,blockchains:['ARC-TESTNET'],count:1,accountType:'EOA',idempotencyKey:randomUUID()})).data?.wallets?.[0];
if(!wallet?.id||!wallet.address)throw new Error('CIRCLE_WALLET_CREATION_FAILED');

await mkdir('.circle',{recursive:true});
await writeFile('.circle/wallet-info.json',JSON.stringify({walletSetId:walletSet.id,walletId:wallet.id,address:wallet.address,blockchain:wallet.blockchain},null,2)+'\n',{mode:0o600});
console.log(`Wallet created on ${wallet.blockchain}`);
console.log(`Wallet ID: ${wallet.id}`);
console.log(`Address: ${wallet.address}`);
console.log('Saved metadata to .circle/wallet-info.json');
console.log('Fund it at https://faucet.circle.com by selecting Arc Testnet and sending USDC to this address.');
