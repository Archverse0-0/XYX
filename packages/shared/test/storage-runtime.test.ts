import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultResultOrder } from 'node:dns';
import '../src/storage.js';

test('database runtime prefers IPv4 first without disabling IPv6', () => {
  assert.equal(getDefaultResultOrder(), 'ipv4first');
});
