import { timingSafeEqual } from 'node:crypto';
import { LOOPBACK_HOSTS } from './config.js';
import { HttpError } from './http.js';

function hasValidToken(request, token) {
  if (!token) return true;

  const authorization = request.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) return false;

  const supplied = Buffer.from(authorization.slice('Bearer '.length));
  const expected = Buffer.from(token);

  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/** Check API access and handle preflight before reading any request body. */
export function authorizeApiRequest(request, response, config) {
  let ownUrl;
  try {
    ownUrl = new URL(`http://${request.headers.host}`);
  } catch {
    throw new HttpError(400, 'Invalid Host header');
  }

  // Matching Host and Origin headers alone cannot establish trust: an
  // attacker-controlled DNS name can resolve to the loopback interface.
  if (!config.apiToken && !LOOPBACK_HOSTS.has(ownUrl.hostname)) {
    throw new HttpError(403, 'Host not allowed');
  }

  const origin = request.headers.origin;
  if (origin && origin !== ownUrl.origin && !config.allowedOrigins.includes(origin)) {
    throw new HttpError(403, 'Origin not allowed');
  }

  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
    response.end();
    return false;
  }

  if (!hasValidToken(request, config.apiToken)) {
    throw new HttpError(401, 'Authentication required');
  }

  return true;
}
