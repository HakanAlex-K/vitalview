import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const index = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const script = await readFile(
  new URL('../dist/' + index.match(/src="\.\/([^\"]+\.js)"/)[1], import.meta.url),
  'utf8',
);
const report = JSON.parse(
  await readFile(new URL('../artifacts/metrics.json', import.meta.url), 'utf8'),
);
const until = async (fn) => {
  for (let i = 0; i < 200; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail('UI state did not arrive');
};
test('React synchronizes readings, rejected captures, evidence, modes and imports', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost:8787',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const samples = Array.from({ length: 300 }, (_, i) => ({ ir: 21000 + i, red: 19000 + i }));
  const accepted = {
    id: 'capture-accepted',
    revision: 1,
    source: 'device',
    receivedAt: new Date().toISOString(),
    status: 'estimated',
    estimate: 85.5,
    quality: { accepted: true, reasons: [] },
    samples,
    stale: false,
  };
  let state = {
    latest: accepted,
    revision: 1,
    vitals: { heartRate: 73, oxygen: 98, stale: false },
    sessions: [{ ...accepted, samples: undefined }],
    deviceStatus: { configured: true, connected: true },
    busy: false,
  };
  let imported = false;
  const requests = [];
  w.AbortSignal = AbortSignal;
  w.AbortController = AbortController;
  w.fetch = async (url, opts = {}) => {
    requests.push(url);
    if (url === '/api/model')
      return Response.json({
        ...report,
        evaluation: { ...report.evaluation, neural_network: { mae: 12.34 } },
      });
    if (url === '/api/acquisitions') {
      const b = JSON.parse(opts.body);
      assert.equal(b.data.length, 300);
      imported = true;
      state = {
        ...state,
        latest: { ...accepted, id: 'imported', source: 'import', revision: 3 },
        revision: 3,
        sessions: [{ ...accepted, id: 'imported', source: 'import' }],
      };
      return Response.json(state.latest);
    }
    return Response.json(state);
  };
  const timeout = w.setTimeout.bind(w);
  w.setTimeout = (f, ms, ...a) => timeout(f, ms === 3000 ? 20 : ms, ...a);
  const interval = w.setInterval.bind(w);
  w.setInterval = (f, ms, ...a) => interval(f, ms === 500 ? 1 : ms, ...a);
  const click = (text) => {
    const el = [...w.document.querySelectorAll('button')].find(
      (e) => e.textContent.trim() === text,
    );
    assert.ok(el, `Button ${text}`);
    el.click();
  };
  const text = () => w.document.body.textContent;
  try {
    w.eval(script);
    await until(() => text().includes('85.5'));
    assert.match(text(), /73/);
    assert.match(text(), /ESP32 \/data connected/);
    click('Model & evidence');
    await until(() => text().includes('12.34'));
    assert.ok(requests.includes('/api/model'));
    assert.match(text(), /Petri dishes/);
    click('Overview');
    await until(() => text().includes('85.5'));
    const rejected = {
      ...accepted,
      id: 'rejected',
      revision: 2,
      status: 'rejected',
      estimate: null,
      quality: { accepted: false, reasons: ['Low optical signal'] },
    };
    state = {
      ...state,
      latest: rejected,
      revision: 2,
      sessions: [{ ...rejected, samples: undefined }],
    };
    await until(() => text().includes('Low optical signal'));
    assert.doesNotMatch(w.document.querySelector('.metrics').textContent, /85\.5/);
    click('View all');
    await until(() => text().includes('Capture log'));
    w.document.querySelector('[aria-label="Inspect capture 1"]').click();
    await until(() => !!w.document.querySelector('[role="dialog"]'));
    assert.match(w.document.querySelector('[role="dialog"]').textContent, /Low optical signal/);
    assert.match(w.document.querySelector('[role="dialog"]').textContent, /Export optical samples/);
    w.document.querySelector('[aria-label="Close capture"]').click();
    click('Overview');
    const file = w.document.querySelector('input[type=file]');
    Object.defineProperty(file, 'files', {
      configurable: true,
      value: [{ size: 3000, text: async () => samples.map((r) => r.ir + ',' + r.red).join('\n') }],
    });
    file.dispatchEvent(new w.Event('change', { bubbles: true }));
    await until(() => imported && text().includes('85.5'));
    click('Demo');
    await until(() => text().includes('Demo workspace.'));
    click('Run a capture demo10 sec');
    await until(() => text().includes('Capture complete'));
    assert.match(text(), /106\.4/);
    const select = w.document.querySelector('#scenario');
    select.value = 'poor';
    select.dispatchEvent(new w.Event('change', { bubbles: true }));
    await until(() => text().includes('Low signal'));
    click('Run a capture demo10 sec');
    await until(() => text().includes('Capture rejected'));
    assert.doesNotMatch(w.document.querySelector('.metrics').textContent, /106\.4/);
  } finally {
    dom.window.close();
  }
});

test('React recovers after backend restart and cancels work when leaving Device mode', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost:8787',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.AbortSignal = AbortSignal;
  w.AbortController = AbortController;
  const samples = Array.from({ length: 300 }, (_, i) => ({ ir: 21000 + i, red: 19000 + i }));
  const accepted = {
    id: 'old-capture',
    source: 'device',
    receivedAt: new Date().toISOString(),
    status: 'estimated',
    estimate: 85.5,
    quality: { accepted: true },
    samples,
    stale: false,
  };
  let state = {
    sessionId: 'first-process',
    revision: 20,
    latest: accepted,
    sessions: [accepted],
    vitals: null,
  };
  let stateRequests = 0,
    imports = 0;
  const signals = [];
  w.fetch = async (url, opts = {}) => {
    signals.push(opts.signal);
    if (url === '/api/model') return Response.json(report);
    if (url === '/api/acquisitions') {
      imports++;
      return Response.json(accepted);
    }
    stateRequests++;
    return Response.json(state);
  };
  const timeout = w.setTimeout.bind(w);
  w.setTimeout = (fn, ms, ...args) => timeout(fn, ms === 3000 ? 20 : ms, ...args);
  const text = () => w.document.body.textContent;
  const click = (label) => {
    const el = [...w.document.querySelectorAll('button')].find(
      (e) => e.textContent.trim() === label,
    );
    assert.ok(el, label);
    el.click();
  };
  try {
    w.eval(script);
    await until(() => text().includes('85.5'));
    state = { ...state, sessionId: 'second-process', revision: 0, latest: null, sessions: [] };
    await until(() => text().includes('Awaiting device'));
    assert.doesNotMatch(w.document.querySelector('.metrics').textContent, /85\.5/);
    state = {
      ...state,
      revision: 1,
      latest: { ...accepted, id: 'new-capture', estimate: 91.2 },
      sessions: [],
    };
    await until(() => text().includes('91.2'));
    click('Connection settings');
    await until(() => !!w.document.querySelector('[role=dialog]'));
    const count = stateRequests;
    click('Save & connect');
    await until(() => stateRequests > count && text().includes('91.2'));
    let finishReading;
    const file = w.document.querySelector('input[type=file]');
    Object.defineProperty(file, 'files', {
      value: [
        {
          size: 3000,
          text: () =>
            new Promise((resolve) => {
              finishReading = resolve;
            }),
        },
      ],
    });
    file.dispatchEvent(new w.Event('change', { bubbles: true }));
    await until(() => !!finishReading);
    const liveSignals = [...signals];
    click('Demo');
    await until(() => text().includes('Demo workspace.'));
    assert.ok(
      liveSignals.some((signal) => signal.aborted),
      'Live requests should be aborted on cleanup',
    );
    finishReading(samples.map((r) => r.ir + ',' + r.red).join('\n'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(imports, 0);
    assert.match(text(), /Demo workspace\./);
  } finally {
    w.close();
  }
});
