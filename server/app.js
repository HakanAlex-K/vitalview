import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createDeviceConnection } from './device.js';
import { HttpError, readJsonBody, sendJson, sendRequestError, serveStaticFile } from './http.js';
import { runInference } from './inference.js';
import { authorizeApiRequest } from './security.js';
import { hasNumericVitals, isValidCapture, parseVitals } from './validation.js';

const MAX_CAPTURE_HISTORY = 100;
const INFERENCE_UNAVAILABLE =
  'Inference unavailable. Check Python dependencies and model artifact.';

function isApiPath(pathname) {
  return pathname.startsWith('/api/') || pathname === '/glucose' || pathname === '/glucose-result';
}

function withFreshness(reading, ttlMs, now) {
  if (!reading) return null;

  return {
    ...reading,
    stale: now - Date.parse(reading.receivedAt) > ttlMs,
  };
}

function captureSource(input, pathname) {
  if (input.simulated === true) return 'simulator';
  return pathname === '/glucose' ? 'device' : 'import';
}

/** Build the HTTP application without opening a port or sharing session state. */
export function createVitalViewServer(config, { infer = runInference } = {}) {
  const state = {
    sessionId: randomUUID(),
    revision: 0,
    latest: null,
    vitals: null,
    busy: false,
    sessions: [],
  };
  const device = createDeviceConnection(config, (vitals) => {
    state.vitals = vitals;
  });

  function recordCapture(result, samples, source) {
    state.revision += 1;
    state.latest = {
      ...result,
      glucose_estimate_mg_dl: result.estimate ?? null,
      revision: state.revision,
      id: randomUUID(),
      receivedAt: new Date().toISOString(),
      source,
      samples,
    };

    const { id, receivedAt, status, estimate, quality, reason, model_id } = state.latest;
    state.sessions.unshift({ id, receivedAt, source, status, estimate, quality, reason, model_id });
    state.sessions.splice(MAX_CAPTURE_HISTORY);

    return state.latest;
  }

  async function handleState(request, response) {
    await device.refresh();
    const now = Date.now();

    sendJson(response, 200, {
      sessionId: state.sessionId,
      latest: withFreshness(state.latest, config.captureTtlMs, now),
      vitals: withFreshness(state.vitals, config.vitalsTtlMs, now),
      busy: state.busy,
      sessions: state.sessions,
      revision: state.revision,
      deviceConfigured: Boolean(config.deviceUrl),
      deviceStatus: device.status,
      retention: {
        captureTTL: config.captureTtlMs,
        vitalsTTL: config.vitalsTtlMs,
      },
    });
  }

  async function handleVitals(request, response) {
    const input = await readJsonBody(request);
    if (!hasNumericVitals(input)) {
      throw new HttpError(400, 'Send numeric heartRate and/or oxygen.');
    }

    state.vitals = { ...parseVitals(input), source: 'device_push' };
    sendJson(response, 200, state.vitals);
  }

  async function handleModel(request, response) {
    const reportPath = resolve(config.root, 'artifacts/metrics.json');
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    sendJson(response, 200, report);
  }

  function handleLegacyResult(request, response) {
    const latest = state.latest;
    const expired = latest && Date.now() - Date.parse(latest.receivedAt) > config.captureTtlMs;

    if (!latest || latest.status !== 'estimated' || expired) {
      throw new HttpError(404, 'No fresh accepted result');
    }

    sendJson(response, 200, {
      glucose_estimate_mg_dl: latest.estimate,
      receivedAt: latest.receivedAt,
      research_only: true,
    });
  }

  async function handleAcquisition(request, response, pathname) {
    if (state.busy) {
      throw new HttpError(429, 'Acquisition already being processed. Retry after it completes.');
    }

    const input = await readJsonBody(request);
    if (!isValidCapture(input?.data)) {
      throw new HttpError(400, 'Expected 300 numeric {ir, red} pairs with 18-bit ADC values.');
    }

    // Another request can start inference while this request is reading its
    // body. Check again before acquiring the single-worker slot.
    if (state.busy) {
      throw new HttpError(429, 'Acquisition already being processed.');
    }

    state.busy = true;
    try {
      let result;
      try {
        result = await infer(input.data, config);
      } catch {
        result = {
          status: 'error',
          estimate: null,
          reason: INFERENCE_UNAVAILABLE,
          research_only: true,
        };
      }

      const capture = recordCapture(result, input.data, captureSource(input, pathname));
      const statusCode =
        result.status === 'estimated' ? 200 : result.status === 'error' ? 503 : 422;
      sendJson(response, statusCode, capture);
    } finally {
      state.busy = false;
    }
  }

  const routes = new Map([
    ['GET /api/state', handleState],
    ['POST /api/vitals', handleVitals],
    ['GET /api/model', handleModel],
    ['GET /glucose-result', handleLegacyResult],
    ['POST /glucose', handleAcquisition],
    ['POST /api/acquisitions', handleAcquisition],
  ]);

  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');

    try {
      let pathname;
      try {
        pathname = new URL(request.url, 'http://localhost').pathname;
      } catch {
        throw new HttpError(400, 'Invalid request URL');
      }

      const apiRequest = isApiPath(pathname);
      if (apiRequest && !authorizeApiRequest(request, response, config)) return;

      const handler = routes.get(`${request.method} ${pathname}`);
      if (handler) {
        await handler(request, response, pathname);
        return;
      }

      if (apiRequest) {
        throw new HttpError(404, 'Endpoint not found');
      }
      if (request.method !== 'GET') {
        throw new HttpError(405, 'Method not allowed');
      }

      await serveStaticFile(response, pathname, config.root);
    } catch (error) {
      sendRequestError(response, error);
    }
  });
}
