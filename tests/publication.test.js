import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inspectPublicationFile, privatePathReason } from '../scripts/publication-policy.js';

const inspect = (file, content) => inspectPublicationFile(file, Buffer.from(content));

test('publication policy blocks raw data, model files, credentials, and local tooling', () => {
  for (const filename of [
    '.env',
    '.env.local',
    'firmware/VitalViewEsp32/secrets.h',
    'captures/window.json',
    'artifacts/model.json',
    'experiment.csv',
    'database.sqlite3',
    'device.key',
    'review.zip',
    '.review/check.txt',
    '.aws/credentials',
  ])
    assert.ok(privatePathReason(filename), filename);
  for (const filename of [
    '.env.example',
    'firmware/VitalViewEsp32/secrets.example.h',
    'server/app.js',
    'artifacts/metrics.json',
  ]) {
    assert.equal(privatePathReason(filename), null, filename);
  }
});

test('publication policy detects renamed model/capture JSON and provider tokens without printing values', () => {
  assert.ok(inspect('notes.json', JSON.stringify({ nested: { weights: [[1]] } })).length);
  assert.ok(inspect('notes.json', JSON.stringify({ data: [{ ir: 12000, red: 11000 }] })).length);
  const syntheticToken = ['gh', 'p_', 'A'.repeat(36)].join('');
  const findings = inspect('notes.txt', syntheticToken);
  assert.ok(findings.includes('GitHub token'));
  assert.ok(findings.every((reason) => !reason.includes(syntheticToken)));
  assert.deepEqual(inspect('notes.json', '{"rows":5469,"evaluation":{"mae":13.17}}'), []);
});

test('configuration examples cannot quietly become real credential files', () => {
  const macro = ['#define', 'WIFI_PASSWORD'].join(' ');
  assert.ok(inspect('firmware/secrets.example.h', `${macro} "configured-network-value"`).length);
  assert.deepEqual(inspect('firmware/secrets.example.h', `${macro} "YOUR_WIFI_PASSWORD"`), []);
  const setting = ['API', '_TOKEN'].join('');
  assert.ok(inspect('.env.example', `${setting}=configured-local-value`).length);
  assert.deepEqual(inspect('.env.example', `${setting}=YOUR_RANDOM_SECRET`), []);
});

test('staged publication check catches a forced private file even after its working copy is cleaned', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const reviewRoot = join(root, '.review');
  await mkdir(reviewRoot, { recursive: true });
  const fixture = await mkdtemp(join(reviewRoot, 'publication-test-'));
  await mkdir(join(fixture, 'scripts'));
  for (const name of ['check-publication.js', 'publication-policy.js']) {
    await copyFile(join(root, 'scripts', name), join(fixture, 'scripts', name));
  }
  await writeFile(join(fixture, 'package.json'), '{"type":"module"}');
  await writeFile(join(fixture, '.gitignore'), '.env\n');
  const env = { ...process.env };
  for (const name of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  ])
    delete env[name];
  const git = (args) => execFileSync('git', args, { cwd: fixture, env, stdio: 'pipe' });
  git(['init']);
  await writeFile(join(fixture, '.env'), 'LOCAL_TEST_MARKER=synthetic\n');
  git(['add', '-f', '.env']);
  await writeFile(join(fixture, '.env'), '');
  assert.throws(
    () =>
      execFileSync(process.execPath, ['scripts/check-publication.js', '--staged'], {
        cwd: fixture,
        env,
        stdio: 'pipe',
      }),
    (error) => {
      assert.equal(error.status, 1);
      const log = error.stderr.toString();
      assert.match(log, /Git index/);
      assert.match(log, /local credentials/);
      assert.doesNotMatch(log, /LOCAL_TEST_MARKER/);
      return true;
    },
  );
  git(['rm', '-f', '--cached', '.env']);
  git(['add', 'scripts', 'package.json', '.gitignore']);
  const result = execFileSync(process.execPath, ['scripts/check-publication.js', '--staged'], {
    cwd: fixture,
    env,
    stdio: 'pipe',
  });
  assert.match(result.toString(), /Publication check passed/);
  // An index symlink must be rejected even on Windows without symlink privileges.
  const blob = git(['hash-object', '-w', '--stdin']);
  git(['update-index', '--add', '--cacheinfo', `120000,${blob.toString().trim()},linked-file`]);
  assert.throws(
    () =>
      execFileSync(process.execPath, ['scripts/check-publication.js', '--staged'], {
        cwd: fixture,
        env,
        stdio: 'pipe',
      }),
    (error) => {
      assert.equal(error.status, 1);
      assert.match(error.stderr.toString(), /symlink, submodule, or unresolved merge/);
      return true;
    },
  );
});
