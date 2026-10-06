import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
test('unavailable Python creates a visible error capture with no estimate', async () => {
  const server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env,
      PORT: '18790',
      HOST: '127.0.0.1',
      API_TOKEN: '',
      ESP32_URL: '',
      PYTHON: '/nonexistent/vitalview-test-python',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(Error('Startup timeout')), 5000);
      server.stdout.once('data', () => {
        clearTimeout(t);
        resolve();
      });
      server.once('error', reject);
    });
    const rebound = await fetch('http://127.0.0.1:18790/api/state', {
      headers: { Host: 'untrusted.example:18790', Origin: 'http://untrusted.example:18790' },
    });
    assert.equal(
      rebound.status,
      403,
      'A matching attacker-controlled Host and Origin must not bypass loopback protection',
    );
    const r = await fetch('http://127.0.0.1:18790/glucose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: Array.from({ length: 300 }, () => ({ ir: 12000, red: 11000 })),
      }),
    });
    assert.equal(r.status, 503);
    const body = await r.json();
    assert.equal(body.estimate, null);
    const state = await (await fetch('http://127.0.0.1:18790/api/state')).json();
    assert.equal(state.latest.status, 'error');
    assert.equal(state.latest.id, body.id);
    assert.equal(state.latest.estimate, null);
    assert.equal((await fetch('http://127.0.0.1:18790/glucose-result')).status, 404);
  } finally {
    server.kill();
  }
});
