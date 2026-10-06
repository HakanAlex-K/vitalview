import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_ALLOWED_ORIGINS = ['http://127.0.0.1:5173', 'http://localhost:5173'];

export const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function positiveInteger(value, fallback, name, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value || fallback);

  if (!Number.isSafeInteger(number) || number <= 0 || number > maximum) {
    throw new Error(`${name} must be a positive integer no greater than ${maximum}.`);
  }

  return number;
}

/** Read environment settings once and fail early on invalid configuration. */
export function loadConfig(env = process.env) {
  const host = env.HOST || '127.0.0.1';
  const apiToken = env.API_TOKEN || '';
  const deviceUrl = env.ESP32_URL || '';

  if (!LOOPBACK_HOSTS.has(host) && !apiToken) {
    throw new Error('Set API_TOKEN before enabling network access.');
  }

  if (deviceUrl) {
    let url;
    try {
      url = new URL(deviceUrl);
    } catch {
      throw new Error('ESP32_URL must be an absolute HTTP or HTTPS URL.');
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('ESP32_URL must use HTTP or HTTPS.');
    }
  }

  const allowedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;

  return Object.freeze({
    root: PROJECT_ROOT,
    host,
    port: positiveInteger(env.PORT, 8787, 'PORT', 65535),
    apiToken,
    pythonExecutable: env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
    deviceUrl,
    deviceReadToken: env.ESP32_READ_TOKEN || '',
    allowedOrigins: Object.freeze([...allowedOrigins]),
    captureTtlMs: positiveInteger(env.CAPTURE_TTL_MS, 90_000, 'CAPTURE_TTL_MS'),
    vitalsTtlMs: positiveInteger(env.VITALS_TTL_MS, 15_000, 'VITALS_TTL_MS'),
  });
}
