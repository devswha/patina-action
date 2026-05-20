#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const temp = mkdtempSync(resolve(tmpdir(), 'patina-action-smoke-'));
const output = resolve(temp, 'output.txt');
const summary = resolve(temp, 'summary.md');
writeFileSync(resolve(temp, 'ok.md'), 'plain prose');
writeFileSync(resolve(temp, 'hot.md'), 'hot prose');
writeFileSync(resolve(temp, 'skip.js'), 'const x = 1;');

const result = spawnSync(process.execPath, [resolve(root, 'scripts/score.mjs')], {
  cwd: temp,
  encoding: 'utf8',
  env: {
    ...process.env,
    INPUT_FILES: JSON.stringify(['ok.md', 'hot.md', 'skip.js']),
    INPUT_SCORE_THRESHOLD: '30',
    INPUT_PATINA_BIN: resolve(root, 'test/fake-patina-score.mjs'),
    GITHUB_OUTPUT: output,
    GITHUB_STEP_SUMMARY: summary,
  },
});

assert.equal(result.status, 0, result.stderr);
assert.match(result.stdout, /Patina pre-commit prose score/);
const outputs = await import('node:fs').then((fs) => fs.readFileSync(output, 'utf8'));
assert.match(outputs, /file-count=2/);
assert.match(outputs, /failed-count=1/);
assert.match(outputs, /max-score=45\.0/);
const badgeMatch = outputs.match(/^badge-json=(.+)$/m);
assert.ok(badgeMatch, outputs);
assert.deepEqual(JSON.parse(badgeMatch[1]), {
  schemaVersion: 1,
  label: 'patina',
  message: '45% · mixed',
  color: 'yellow',
});
assert.match(outputs, /threshold-failed=true/);
