import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { makeOwnerGate } from '../owner-gate.js';

test('private server gate authenticates owner sessions and rejects forged cookies and cross-origin writes', async () => {
  const app = express();
  app.use(makeOwnerGate('test-owner-password'));
  app.get(['/health', '/api/health'], (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/private', (_req, res) => res.json({ private: true }));
  app.post('/api/private', (_req, res) => res.json({ private: true }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/private`)).status, 401);
    assert.match(await (await fetch(`${base}/welcome`)).text(), /Signals Agents/);
    const login = await fetch(`${base}/owner-login`, { method: 'POST', redirect: 'manual', headers: { Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=test-owner-password' });
    assert.equal(login.status, 303);
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    assert.equal((await fetch(`${base}/api/private`, { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(`${base}/api/private`, { headers: { Cookie: `${cookie}x` } })).status, 401);
    assert.equal((await fetch(`${base}/api/private`, { method: 'POST', headers: { Cookie: cookie, Origin: 'https://other.test' } })).status, 403);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
