import { basename, extname } from 'node:path';

const PRIVATE_DIRECTORIES = new Set([
  '.review',
  '.venv',
  '.aws',
  '.ssh',
  '.credentials',
  'node_modules',
  'dist',
  '.pio',
  '__pycache__',
  'data',
  'captures',
  'recordings',
  'uploads',
  'models',
  'glucose_logs',
  'glucose_rejected',
]);
const PRIVATE_EXTENSIONS = new Set([
  '.csv',
  '.tsv',
  '.parquet',
  '.npy',
  '.npz',
  '.pkl',
  '.h5',
  '.keras',
  '.joblib',
  '.onnx',
  '.pt',
  '.pth',
  '.db',
  '.sqlite',
  '.sqlite3',
  '.pem',
  '.key',
  '.p12',
  '.pfx',
  '.zip',
  '.7z',
  '.tar',
  '.tgz',
  '.gz',
  '.pyc',
  '.log',
]);
const PRIVATE_JSON_KEYS = new Set([
  'weights',
  'biases',
  'x_mean',
  'x_scale',
  'feature_low',
  'feature_high',
  'patient_name',
  'patient_id',
  'phone',
  'wifi_password',
]);
const SECRET_PATTERNS = [
  ['private key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{60,255})\b/],
  ['API key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['Google API key', /\bAIza[A-Za-z0-9_-]{35}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['URL containing a password', /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i],
  ['personal workspace path', /\b[A-Z]:[\\/]Users[\\/](?!YOUR_)[^\s"'<>]+/i],
];

export function privatePathReason(relativePath) {
  const parts = relativePath.replaceAll('\\', '/').toLowerCase().split('/');
  const name = parts.at(-1);

  if (parts.some((part) => PRIVATE_DIRECTORIES.has(part))) return 'private or generated directory';
  if (name === '.env.example' || name === 'secrets.example.h') return null;
  if (name === '.env' || name.startsWith('.env.') || name === 'secrets.h')
    return 'local credentials';
  if (['id_rsa', 'id_ed25519'].includes(name)) return 'SSH private key';
  if (PRIVATE_EXTENSIONS.has(extname(name))) return 'raw data, credentials, model, or archive';
  if (/^model(?:[._-].*)?\.json$/.test(name)) return 'model artifact';
  if (name === 'split.json' || name === 'holdout_predictions.json')
    return 'private experiment output';
  return null;
}

function containsPrivateJson(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsPrivateJson);

  // A raw optical capture is private even if someone saves it under a new name.
  if (typeof value.ir === 'number' && typeof value.red === 'number') return true;
  return Object.entries(value).some(
    ([key, child]) => PRIVATE_JSON_KEYS.has(key.toLowerCase()) || containsPrivateJson(child),
  );
}

function hasConfiguredFirmwareSecret(text) {
  const definitions = text.matchAll(
    /^\s*#define\s+(?:WIFI_SSID|WIFI_PASSWORD|API_TOKEN|DEVICE_READ_TOKEN)\s+"([^"\r\n]*)"/gm,
  );

  for (const [, value] of definitions) {
    if (value && !value.startsWith('YOUR_') && value !== 'SAME_TOKEN_AS_BACKEND_ENV') return true;
  }
  return false;
}

function hasConfiguredExampleSecret(text) {
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const match = line.match(
      /^\s*(?:API_TOKEN|ESP32_READ_TOKEN|WIFI_SSID|WIFI_PASSWORD|[A-Z_]*PASSWORD|[A-Z_]*SECRET|[A-Z_]*API_KEY)\s*=\s*(.*)$/,
    );
    if (!match) continue;
    const value = match[1].trim().replace(/^['"]|['"]$/g, '');
    if (value && !value.startsWith('YOUR_') && value !== 'SAME_TOKEN_AS_BACKEND_ENV') return true;
  }
  return false;
}

/** Findings contain reasons only: never copy the matching secret into logs. */
export function inspectPublicationFile(relativePath, bytes) {
  const reasons = [];
  const privateReason = privatePathReason(relativePath);
  if (privateReason) reasons.push(privateReason);

  const text = bytes.toString('utf8');
  for (const [label, pattern] of SECRET_PATTERNS) {
    if (pattern.test(text)) reasons.push(label);
  }
  if (extname(relativePath) === '.h' && hasConfiguredFirmwareSecret(text)) {
    reasons.push('configured firmware credentials or Wi-Fi name');
  }
  if (relativePath === '.env.example' && hasConfiguredExampleSecret(text)) {
    reasons.push('configured credential in the environment example');
  }

  if (extname(relativePath) === '.json') {
    try {
      if (containsPrivateJson(JSON.parse(text)))
        reasons.push('private JSON data or model parameters');
    } catch {
      reasons.push('invalid JSON cannot be reviewed');
    }
  }

  if (basename(relativePath).startsWith('.env') && relativePath !== '.env.example') {
    reasons.push('environment configuration');
  }
  return [...new Set(reasons)];
}
