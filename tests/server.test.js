import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createVitalViewServer } from '../server/app.js';
import { loadConfig } from '../server/config.js';

test('configuration rejects invalid ports, retention times, and device URLs', () => {
  for (const settings of [
    { PORT: 'abc' },
    { PORT: '65536' },
    { CAPTURE_TTL_MS: '-1' },
    { VITALS_TTL_MS: 'NaN' },
    { ESP32_URL: 'not-a-url' },
    { ESP32_URL: 'file:///data' },
    { HOST: '0.0.0.0' },
  ]) {
    assert.throws(() => loadConfig(settings));
  }

  const config = loadConfig({ ALLOWED_ORIGINS: ' http://localhost:5173, ,http://localhost:4000 ' });
  assert.deepEqual(config.allowedOrigins, ['http://localhost:5173', 'http://localhost:4000']);
  assert.equal(config.port, 8787);
});

test('overlapping captures cannot share the worker slot or another server session', async (t) => {
  const config = loadConfig({});
  let completeInference;
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  const pending = new Promise((resolve) => {
    completeInference = resolve;
  });
  const server = createVitalViewServer(config, {
    infer: () => {
      markStarted();
      return pending;
    },
  });
  const otherServer = createVitalViewServer(config);
  const servers = [server, otherServer];

  t.after(async () => {
    completeInference({ status: 'estimated', estimate: 85.5, research_only: true });
    for (const instance of servers) {
      instance.closeAllConnections();
      await new Promise((resolve) => instance.close(resolve));
    }
  });

  for (const instance of servers) {
    instance.listen(0, '127.0.0.1');
    await once(instance, 'listening');
  }

  const base = `http://127.0.0.1:${server.address().port}`;
  const otherBase = `http://127.0.0.1:${otherServer.address().port}`;
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: Array.from({ length: 300 }, () => ({ ir: 12000, red: 11000 })) }),
  };

  const firstRequest = fetch(`${base}/glucose`, options);
  await started;
  assert.equal((await (await fetch(`${base}/api/state`)).json()).busy, true);
  assert.equal((await fetch(`${base}/api/acquisitions`, options)).status, 429);

  completeInference({ status: 'estimated', estimate: 85.5, research_only: true });
  const response = await firstRequest;
  assert.equal(response.status, 200);
  const capture = await response.json();
  assert.equal(capture.glucose_estimate_mg_dl, 85.5);

  const state = await (await fetch(`${base}/api/state`)).json();
  const otherState = await (await fetch(`${otherBase}/api/state`)).json();
  assert.equal(state.busy, false);
  assert.equal(state.latest.id, capture.id);
  assert.equal(state.sessions.length, 1);
  assert.notEqual(state.sessionId, otherState.sessionId);
  assert.equal(otherState.latest, null);
  assert.equal(otherState.sessions.length, 0);

  assert.equal((await fetch(`${base}/glucose`, options)).status, 200);
});
