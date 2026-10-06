import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectPublicationFile } from './publication-policy.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const stagedOnly = process.argv.includes('--staged');
const gitEnv = { ...process.env };
for (const name of [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
]) {
  delete gitEnv[name];
}

function git(args) {
  return execFileSync('git', ['-C', root, ...args], {
    env: gitEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 20 * 1024 * 1024,
  });
}

function isWithin(directory, target) {
  const path = relative(directory, target);
  return (
    path !== '' &&
    path !== '..' &&
    !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) &&
    !isAbsolute(path)
  );
}

async function checkPublication() {
  let temporaryGitDirectory;
  let gitPrefix = [];
  let hasProjectRepository = false;

  try {
    hasProjectRepository =
      resolve(git(['rev-parse', '--show-toplevel']).toString().trim()) === resolve(root);
  } catch {
    // An extracted review package has no Git repository yet.
  }

  if (!hasProjectRepository) {
    if (stagedOnly)
      throw new Error(
        'Initialize Git in the VitalView project folder before checking staged files.',
      );
    const reviewRoot = join(root, '.review');
    await mkdir(reviewRoot, { recursive: true });
    temporaryGitDirectory = await mkdtemp(join(reviewRoot, 'publication-check-'));
    git(['init', '--bare', temporaryGitDirectory]);
    gitPrefix = [`--git-dir=${temporaryGitDirectory}`, `--work-tree=${root}`];
  }

  try {
    const indexEntries = git([...gitPrefix, 'ls-files', '-z', '--stage'])
      .toString()
      .split('\0')
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf('\t');
        const [mode, , stage] = entry.slice(0, separator).split(' ');
        return { mode, stage, file: entry.slice(separator + 1) };
      });
    const indexByFile = new Map(indexEntries.map((entry) => [entry.file, entry]));
    const indexedFiles = [...indexByFile.keys()];
    const candidates = stagedOnly
      ? indexedFiles
      : git([...gitPrefix, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'])
          .toString()
          .split('\0')
          .filter(Boolean);
    const files = [...new Set(candidates)];
    const findings = [];

    for (const file of files) {
      const entry = indexByFile.get(file);
      if (entry && (entry.stage !== '0' || !['100644', '100755'].includes(entry.mode))) {
        findings.push({
          file,
          source: 'Git index',
          reason: 'symlink, submodule, or unresolved merge',
        });
        continue;
      }
      if (entry) {
        const bytes = git([...gitPrefix, 'show', `:${file}`]);
        for (const reason of inspectPublicationFile(file, bytes)) {
          findings.push({ file, source: 'Git index', reason });
        }
      }
      if (stagedOnly) continue;

      const filename = resolve(root, file);
      try {
        const info = await lstat(filename);
        if (info.isSymbolicLink() || !isWithin(await realpath(root), await realpath(filename))) {
          findings.push({
            file,
            source: 'working tree',
            reason: 'symlink or file outside the project',
          });
          continue;
        }
        const bytes = await readFile(filename);
        for (const reason of inspectPublicationFile(file, bytes)) {
          findings.push({ file, source: 'working tree', reason });
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }

    if (findings.length) {
      console.error('Publication check failed. Remove private files or secrets before committing.');
      for (const finding of findings) console.error(JSON.stringify(finding));
      process.exitCode = 1;
    } else {
      console.log(
        `Publication check passed: ${files.length} files; no blocked paths or matching private content.`,
      );
    }
  } finally {
    // Only remove the temporary directory created by this invocation.
    if (
      temporaryGitDirectory &&
      isWithin(resolve(root, '.review'), resolve(temporaryGitDirectory))
    ) {
      await rm(temporaryGitDirectory, { recursive: true, force: true });
    }
  }
}

checkPublication().catch(() => {
  console.error(
    'Publication check could not finish. Verify Git is installed and run from the VitalView project folder.',
  );
  process.exitCode = 1;
});
