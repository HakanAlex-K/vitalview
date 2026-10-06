import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const base = 'http://127.0.0.1:18788';
let server;
before(async () => {
  server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env,
      PORT: '18788',
      HOST: '127.0.0.1',
      API_TOKEN: 'test-token',
      ESP32_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Startup timeout')), 5000);
    server.stdout.once('data', () => {
      clearTimeout(t);
      resolve();
    });
    server.once('error', reject);
  });
});
after(() => server.kill());
const req = (p, opts = {}) =>
  fetch(base + p, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-token',
      ...opts.headers,
    },
  });
test('API requires token', async () => {
  const r = await fetch(base + '/api/state');
  assert.equal(r.status, 401);
});
test('rejects unwanted origins', async () => {
  const r = await req('/api/state', { headers: { Origin: 'https://untrusted.example' } });
  assert.equal(r.status, 403);
});
test('fresh state has no fabricated data', async () => {
  const r = await req('/api/state');
  const d = await r.json();
  assert.equal(d.latest, null);
  assert.equal(d.vitals, null);
});
test('rejects numeric strings and malformed windows', async () => {
  const r = await req('/glucose', {
    method: 'POST',
    body: JSON.stringify({
      data: Array.from({ length: 300 }, () => ({ ir: '12000', red: 15000 })),
    }),
  });
  assert.equal(r.status, 400);
});
test('malformed JSON and non-object acquisition bodies return client errors', async () => {
  for (const body of ['{', 'null', '42', '[]', '{}']) {
    const r = await req('/glucose', { method: 'POST', body });
    assert.equal(r.status, 400);
  }
  assert.equal((await req('/api/state')).status, 200);
});
test('oversized request returns JSON 413 without resetting the connection', async () => {
  const r = await req('/glucose', {
    method: 'POST',
    body: JSON.stringify({ padding: 'x'.repeat(100001) }),
  });
  assert.equal(r.status, 413);
  assert.match((await r.json()).error, /100000/);
  assert.equal((await req('/api/state')).status, 200);
});
test('missing assets and malformed URL encoding do not become server errors', async () => {
  assert.equal((await req('/missing.js')).status, 404);
  assert.equal((await req('/%ZZ')).status, 400);
});
test('state identifies the backend process across repeated polls', async () => {
  const first = await (await req('/api/state')).json();
  const second = await (await req('/api/state')).json();
  assert.ok(first.sessionId);
  assert.equal(first.sessionId, second.sessionId);
});
test('low signal plus a spike cannot produce a glucose number', async () => {
  const data = Array.from({ length: 300 }, () => ({ ir: 760, red: 770 }));
  data[0] = { ir: 83384, red: 67227 };
  const r = await req('/glucose', { method: 'POST', body: JSON.stringify({ data }) });
  assert.equal(r.status, 422);
  const d = await r.json();
  assert.equal(d.status, 'rejected');
  assert.equal(d.estimate, null);
  const latest = await req('/glucose-result');
  assert.equal(latest.status, 404);
});
test('does not expose model weights through arbitrary paths', async () => {
  const r = await req('/artifacts/model.json');
  assert.notEqual(r.status, 200);
});
test('unicode bearer token cannot crash authentication', async () => {
  const r = await req('/api/state', { headers: { Authorization: 'Bearer tést-token' } });
  assert.equal(r.status, 401);
  assert.equal((await req('/api/state')).status, 200);
});
test('device vitals push is reflected in the dashboard state', async () => {
  const r = await req('/api/vitals', {
    method: 'POST',
    body: JSON.stringify({ heartRate: 73, oxygen: 98 }),
  });
  assert.equal(r.status, 200);
  const state = await (await req('/api/state')).json();
  assert.equal(state.vitals.heartRate, 73);
  assert.equal(state.vitals.oxygen, 98);
  assert.equal(state.vitals.stale, false);
});
test('invalid device validity flags hide the reading', async () => {
  await req('/api/vitals', {
    method: 'POST',
    body: JSON.stringify({ heartRate: 73, oxygen: 98, heartRateValid: false, oxygenValid: false }),
  });
  const { vitals } = await (await req('/api/state')).json();
  assert.equal(vitals.heartRate, null);
  assert.equal(vitals.oxygen, null);
});
test('current rejected capture and log retain the same identity and reason', async () => {
  const { latest, sessions, revision } = await (await req('/api/state')).json();
  assert.equal(latest.id, sessions[0].id);
  assert.equal(latest.revision, revision);
  assert.deepEqual(latest.quality, sessions[0].quality);
  assert.equal(latest.glucose_estimate_mg_dl, null);
});
test('model evidence endpoint returns the deployed report', async () => {
  const r = await req('/api/model');
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.ok(d.model_id);
  assert.equal(d.engineered_features, 23);
});
