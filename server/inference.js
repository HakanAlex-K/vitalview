import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const INFERENCE_TIMEOUT_MS = 15_000;
const RESULT_STATUSES = new Set([
  'estimated',
  'rejected',
  'out_of_distribution',
  'out_of_range',
  'invalid',
]);

function parseWorkerResult(output, exitCode) {
  if (exitCode !== 0 && exitCode !== 2) {
    throw new Error('Inference worker failed');
  }

  const result = JSON.parse(output);
  if (!result || !RESULT_STATUSES.has(result.status)) {
    throw new Error('Inference worker returned an invalid result');
  }

  const hasEstimate = typeof result.estimate === 'number' && Number.isFinite(result.estimate);
  if (result.status === 'estimated' ? !hasEstimate : result.estimate !== null) {
    throw new Error('Inference worker returned an invalid estimate');
  }

  return result;
}

/** Each capture gets an isolated Python worker; samples are sent only via stdin. */
export function runInference(samples, config) {
  return new Promise((resolveResult, rejectResult) => {
    const worker = spawn(config.pythonExecutable, [resolve(config.root, 'ml/infer.py')], {
      cwd: config.root,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let output = '';
    let settled = false;

    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      if (error) rejectResult(error);
      else resolveResult(result);
    }

    const timeout = setTimeout(() => {
      worker.kill();
      finish(new Error('Inference timed out'));
    }, INFERENCE_TIMEOUT_MS);

    worker.stdout.setEncoding('utf8');
    worker.stdout.on('data', (chunk) => {
      output += chunk;
    });

    worker.on('error', (error) => finish(error));
    worker.on('close', (exitCode) => {
      if (settled) return;
      try {
        finish(null, parseWorkerResult(output, exitCode));
      } catch (error) {
        finish(error);
      }
    });

    // A worker that exits before reading stdin is reported through its exit
    // status, rather than allowing a pipe error to crash the Node process.
    worker.stdin.on('error', () => {});
    worker.stdin.end(JSON.stringify({ data: samples }));
  });
}
