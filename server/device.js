import { parseVitals } from './validation.js';

const POLL_INTERVAL_MS = 2_000;
const REQUEST_TIMEOUT_MS = 2_000;

/** One polling connection, shared by concurrent dashboard requests. */
export function createDeviceConnection(config, onVitals) {
  const status = {
    configured: Boolean(config.deviceUrl),
    connected: false,
    lastAttemptAt: null,
    error: null,
  };
  let pendingRequest = null;

  async function fetchVitals() {
    try {
      const headers = config.deviceReadToken
        ? { Authorization: `Bearer ${config.deviceReadToken}` }
        : {};
      const response = await fetch(new URL('/data', config.deviceUrl), {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers,
      });

      if (!response.ok) {
        throw new Error(`Device returned HTTP ${response.status}`);
      }

      onVitals(parseVitals(await response.json()));
      status.connected = true;
      status.error = null;
    } catch {
      status.connected = false;
      status.error = 'ESP32 /data is unavailable or returned invalid JSON.';
    }
  }

  async function refresh() {
    if (!config.deviceUrl) return;
    if (pendingRequest) return pendingRequest;

    const elapsed = Date.now() - Date.parse(status.lastAttemptAt);
    if (status.lastAttemptAt && elapsed < POLL_INTERVAL_MS) return;

    status.lastAttemptAt = new Date().toISOString();
    pendingRequest = fetchVitals();

    try {
      await pendingRequest;
    } finally {
      pendingRequest = null;
    }
  }

  return { status, refresh };
}
