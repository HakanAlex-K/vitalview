import { readFile, writeFile } from 'node:fs/promises';
const report = JSON.parse(
  await readFile(new URL('../artifacts/metrics.json', import.meta.url), 'utf8'),
);
delete report.training_loss;
delete report.per_label;
await writeFile(new URL('../web/benchmark.json', import.meta.url), JSON.stringify(report));
