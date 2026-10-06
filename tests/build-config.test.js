import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { resolveConfig } from 'vite';

test('the resolved browser build does not expose local VITE environment values', async () => {
  const name = 'VITE_PUBLICATION_TEST_MARKER';
  const previous = process.env[name];
  process.env[name] = 'synthetic-local-only-value';
  try {
    const config = await resolveConfig(
      { configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)) },
      'build',
      'production',
      'production',
    );
    assert.equal(config.env[name], undefined);
    assert.equal(config.env.PROD, true);
    assert.equal(config.publicDir, '');
    assert.equal(config.build.sourcemap, false);
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
});
