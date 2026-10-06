import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
test('backend authenticates ESP32 polling and preserves experimental oxygen flag', async () => {
  let authorization;
  const mock = createServer((req, res) => {
    authorization = req.headers.authorization;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        heartRate: 72,
        oxygen: 97.5,
        heartRateValid: true,
        oxygenValid: true,
        oxygenExperimental: true,
      }),
    );
  });
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  const server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: '18791',
      API_TOKEN: '',
      ESP32_URL: `http://127.0.0.1:${mock.address().port}`,
      ESP32_READ_TOKEN: 'device-test-token',
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
    const state = await (await fetch('http://127.0.0.1:18791/api/state')).json();
    assert.equal(authorization, 'Bearer device-test-token');
    assert.equal(state.vitals.heartRate, 72);
    assert.equal(state.vitals.oxygen, 97.5);
    assert.equal(state.vitals.oxygenExperimental, true);
    assert.equal(state.deviceStatus.connected, true);
  } finally {
    server.kill();
    mock.closeAllConnections();
    mock.close();
  }
});
