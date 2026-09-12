import assert from 'node:assert/strict';
import test from 'node:test';
import { GET as metadata } from '../app/agent-metadata.json/route';
import { GET as registration } from '../app/.well-known/agent-registration.json/route';
import { GET as health } from '../app/api/health/route';
import { POST as task } from '../app/api/task/route';
import { agentMetadataDocument, agentRegistrationDocument, providerRegistration } from '../lib/erc8004';

const configured = {
  PROVIDER_PUBLIC_ORIGIN: 'https://provider.example',
  ERC8004_AGENT_ID: '42',
  PROVIDER_PAYEE_ADDRESS: '0x1111111111111111111111111111111111111111',
};

async function withoutRegistrationConfig<T>(fn: () => Promise<T>) {
  const names = Object.keys(configured) as Array<keyof typeof configured>;
  const prior = new Map(names.map(name => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  try {
    return await fn();
  } finally {
    for (const name of names) {
      const value = prior.get(name);
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}

test('health returns the deterministic public service status', async () => {
  const response = health();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', service: 'xyx-provider', network: 'arc-testnet' });
});

test('task normalizes valid text deterministically', async () => {
  const request = new Request('http://provider.test/api/task', { method: 'POST', body: JSON.stringify({ text: '  Hello   XYX ' }) });
  const first = await task(request);
  const second = await task(new Request('http://provider.test/api/task', { method: 'POST', body: JSON.stringify({ text: '  Hello   XYX ' }) }));
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { ok: true, result: { normalized: 'Hello XYX' } });
  assert.deepEqual(await second.json(), { ok: true, result: { normalized: 'Hello XYX' } });
});

test('task rejects malformed JSON and invalid input', async () => {
  const malformed = await task(new Request('http://provider.test/api/task', { method: 'POST', body: '{' }));
  const invalid = await task(new Request('http://provider.test/api/task', { method: 'POST', body: JSON.stringify({ text: '   ' }) }));
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { ok: false, error: 'TASK_JSON_INVALID' });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { ok: false, error: 'TASK_TEXT_REQUIRED' });
});

test('task rejects oversized text', async () => {
  const response = await task(new Request('http://provider.test/api/task', { method: 'POST', body: JSON.stringify({ text: 'x'.repeat(4_097) }) }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: 'TASK_TEXT_TOO_LARGE' });
});

test('task rejects secret-like input instead of reflecting it',async()=>{
  const response=await task(new Request('http://provider.test/api/task',{method:'POST',body:JSON.stringify({text:'password=secret123'})}));
  assert.equal(response.status,400);assert.equal((await response.json()).error,'TASK_SENSITIVE_INPUT_REJECTED');
});

test('well-known registration is unavailable until public identity configuration exists', async () => {
  const response = await withoutRegistrationConfig(async () => registration());
  assert.equal(response.status, 503);
  const body = await response.json() as Record<string, unknown>;
  assert.deepEqual(body, { error: 'ERC8004_REGISTRATION_NOT_CONFIGURED' });
  assert.equal('agentId' in body, false);
});

test('metadata is unavailable until public identity configuration exists', async () => {
  const response = await withoutRegistrationConfig(async () => metadata());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'ERC8004_METADATA_NOT_CONFIGURED' });
});

test('registration and metadata documents follow the production resolver schema', () => {
  const config = providerRegistration(configured);
  assert.deepEqual(config, { publicOrigin: 'https://provider.example', agentId: '42', payeeAddress: configured.PROVIDER_PAYEE_ADDRESS });
  assert.deepEqual(agentRegistrationDocument(config!), {
    registrations: [{ agentRegistry: 'eip155:5042002:0x8004A818BFB912233c491871b3d84c89A494BD9e', agentId: '42' }],
  });
  assert.deepEqual(agentMetadataDocument(config!), { services: [{ endpoint: 'https://provider.example/api/task' }] });
});

test('invalid public configuration remains unavailable', () => {
  assert.equal(providerRegistration({ ...configured, PROVIDER_PUBLIC_ORIGIN: 'http://provider.example' }), null);
  assert.equal(providerRegistration({ ...configured, ERC8004_AGENT_ID: 'not-an-id' }), null);
  assert.equal(providerRegistration({ ...configured, PROVIDER_PAYEE_ADDRESS: 'not-an-address' }), null);
});
