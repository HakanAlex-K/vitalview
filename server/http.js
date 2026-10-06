import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const MAX_BODY_BYTES = 100_000;
const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/** An expected request failure that can be safely explained to the client. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function sendJson(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(data));
}

export function readJsonBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;

    request.on('data', (chunk) => {
      size += chunk.length;

      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) {
        chunks.push(chunk);
      }
    });

    request.on('end', () => {
      // Drain the request before responding so oversized input gets a JSON 413,
      // rather than an abruptly reset connection. Retained memory stays bounded.
      if (tooLarge) {
        rejectBody(new HttpError(413, `Request body exceeds ${MAX_BODY_BYTES} bytes`));
        return;
      }

      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolveBody(JSON.parse(text));
      } catch {
        rejectBody(new HttpError(400, 'Invalid JSON'));
      }
    });

    request.on('aborted', () => rejectBody(new HttpError(400, 'Request aborted')));
    request.on('error', rejectBody);
  });
}

export async function serveStaticFile(response, pathname, projectRoot) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  } catch {
    throw new HttpError(400, 'Invalid URL encoding');
  }

  const directory = resolve(projectRoot, 'dist');
  const file = resolve(directory, `.${decodedPath}`);

  if (!file.startsWith(directory + sep)) {
    throw new HttpError(403, 'Invalid path');
  }

  const bytes = await readFile(file);
  response.writeHead(200, {
    'Content-Type': CONTENT_TYPES[extname(file)] || 'application/octet-stream',
  });
  response.end(bytes);
}

export function sendRequestError(response, error) {
  if (response.destroyed || response.writableEnded) return;

  if (error instanceof HttpError) {
    sendJson(response, error.status, { error: error.message });
    return;
  }

  if (error.code === 'ENOENT' || error.code === 'EISDIR') {
    sendJson(response, 404, { error: 'Resource not found' });
    return;
  }

  sendJson(response, 500, {
    error: 'Service unavailable. Check the local server configuration.',
  });
}
