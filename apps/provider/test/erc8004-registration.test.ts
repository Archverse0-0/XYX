import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeEventTopics, parseAbi } from 'viem';
import {
  AGENT_METADATA_URI,
  IDENTITY_REGISTRY,
  PROVIDER_WALLET,
  extractMintedAgentId,
  isArcTestnet,
  isExpectedProviderWallet,
  registrationCalldata,
  registrationToolAvailable,
} from '../lib/erc8004-registration';

const transferAbi = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)']);
const zero = '0x0000000000000000000000000000000000000000';

function mintLog(to: string, tokenId: bigint, address = IDENTITY_REGISTRY) {
  const topics = encodeEventTopics({
    abi: transferAbi,
    eventName: 'Transfer',
    args: { from: zero as `0x${string}`, to: to as `0x${string}`, tokenId },
  });
  return {
    address,
    data: '0x',
    topics: topics.filter((topic): topic is `0x${string}` => typeof topic === 'string'),
  };
}

test('registration calldata is generated from the frozen register(string) input', () => {
  assert.equal(registrationCalldata(), '0xf2c298be0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003368747470733a2f2f7879782d70726f76696465722e76657263656c2e6170702f6167656e742d6d657461646174612e6a736f6e00000000000000000000000000');
  assert.equal(AGENT_METADATA_URI, 'https://xyx-provider.vercel.app/agent-metadata.json');
});

test('expected provider wallet and Arc chain checks are exact', () => {
  assert.equal(isExpectedProviderWallet(PROVIDER_WALLET.toLowerCase()), true);
  assert.equal(isExpectedProviderWallet('0x0000000000000000000000000000000000000000'), false);
  assert.equal(isArcTestnet('0x4cef52'), true);
  assert.equal(isArcTestnet('0x1'), false);
});

test('extracts the ERC-721 mint Transfer emitted by the identity registry', () => {
  assert.equal(extractMintedAgentId([mintLog(PROVIDER_WALLET, 894_335n)], PROVIDER_WALLET), 894_335n);
});

test('refuses a registry mint to a wallet other than the provider wallet', () => {
  assert.throws(() => extractMintedAgentId([mintLog('0x1111111111111111111111111111111111111111', 1n)], PROVIDER_WALLET), /MINT_RECIPIENT_MISMATCH/);
});

test('does not accept unrelated Transfer events as a provider mint', () => {
  assert.throws(() => extractMintedAgentId([mintLog(PROVIDER_WALLET, 1n, '0x2222222222222222222222222222222222222222')], PROVIDER_WALLET), /MINT_TRANSFER_NOT_FOUND/);
});

test('registration page is unavailable under production NODE_ENV', () => {
  assert.equal(registrationToolAvailable('production'), false);
  assert.equal(registrationToolAvailable('development'), true);
});
