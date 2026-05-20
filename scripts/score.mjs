#!/usr/bin/env node
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const COMMENT_MARKER = '<!-- patina-pr-score -->';
const MARKDOWN_EXTENSIONS = ['.md', '.mdx'];

function main() {
  const lang = stringInput('INPUT_LANG', 'auto');
  const maxFiles = numberInput('INPUT_MAX_FILES', 50, { min: 1, max: 1000, integer: true });
  const reportThreshold = numberInput('INPUT_REPORT_THRESHOLD', 30, { min: 0, max: 100 });
  const rawScoreThreshold = process.env.INPUT_SCORE_THRESHOLD || '';
  const thresholdSet = rawScoreThreshold.trim() !== '';
  const activeThreshold = thresholdSet
    ? numberInput('INPUT_SCORE_THRESHOLD', reportThreshold, { min: 0, max: 100 })
    : reportThreshold;
  const packageSpec = stringInput('INPUT_PATINA_PACKAGE', 'patina-cli@latest');
  const patinaBin = process.env.INPUT_PATINA_BIN || process.env.PATINA_SCORE_BIN || '';
  const files = normalizeMarkdownFiles(resolveFiles(), maxFiles);

  if (files.length === 0) {
    const report = [
      '# Patina PR prose hotspot report',
      '',
      'No changed Markdown prose files were found.',
    ].join('\n');
    finish({ report, rows: [], thresholdSet, activeThreshold, commandStatus: 0 });
    return;
  }

  const run = runPatinaScore({ files, lang, gate: activeThreshold, packageSpec, patinaBin, maxFiles });
  const report = run.stdout.trim() || fallbackReport({ files, activeThreshold });
  const rows = parseRows(report);

  if (run.status !== 0 && rows.length === 0) {
    if (run.stderr) process.stderr.write(run.stderr);
    throw new Error(`patina-score failed before producing a report (exit ${run.status}).`);
  }

  if (run.stderr) process.stderr.write(run.stderr);
  finish({ report, rows, thresholdSet, activeThreshold, commandStatus: run.status });
}

function resolveFiles() {
  const explicit = parseFileInput(process.env.INPUT_FILES || '');
  if (explicit.length) return explicit;
  return parseFileInput(process.env.PATINA_CHANGED_FILES_JSON || '');
}

function parseFileInput(raw) {
  const value = String(raw || '').trim();
  if (!value) return [];
  if (value.startsWith('[')) {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error('file JSON input must be an array');
    return parsed.map(String);
  }
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeMarkdownFiles(files, maxFiles) {
  const seen = new Set();
  const out = [];
  for (const file of files) {
    const normalized = String(file || '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    if (!MARKDOWN_EXTENSIONS.some((ext) => normalized.toLowerCase().endsWith(ext))) continue;
    out.push(normalized);
    if (out.length >= maxFiles) break;
  }
  return out;
}

function runPatinaScore({ files, lang, gate, packageSpec, patinaBin, maxFiles }) {
  const args = ['--gate', String(gate), '--lang', lang, '--max-files', String(maxFiles), ...files];
  const command = patinaBin || 'npx';
  const finalArgs = patinaBin ? args : ['-y', '-p', packageSpec, 'patina-score', ...args];
  return spawnSync(command, finalArgs, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
}

function parseRows(report) {
  const rows = [];
  for (const line of String(report || '').split('\n')) {
    const match = line.match(/^\|\s*(pass|fail|skip)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*([0-9.]+)%\s*\|/);
    if (!match) continue;
    rows.push({
      status: match[1],
      file: match[2].replace(/\\\|/g, '|').trim(),
      lang: match[3].trim(),
      paragraphs: Number(match[4]),
      hot: Number(match[5]),
      score: Number(match[6]),
    });
  }
  return rows;
}

function finish({ report, rows, thresholdSet, activeThreshold, commandStatus }) {
  const failedRows = rows.filter((row) => row.score > activeThreshold);
  const maxScore = rows.reduce((max, row) => Math.max(max, row.score), 0);
  const thresholdFailed = thresholdSet && failedRows.length > 0;
  const tempDir = mkdtempSync(resolve(tmpdir(), 'patina-action-'));
  const bodyPath = resolve(tempDir, 'comment.md');
  const body = buildCommentBody({ report, thresholdSet, activeThreshold, commandStatus });
  writeFileSync(bodyPath, body);

  console.log(report);
  writeStepSummary(body);
  writeOutput('comment-body-path', bodyPath);
  writeOutput('file-count', String(rows.length));
  writeOutput('failed-count', String(failedRows.length));
  writeOutput('max-score', maxScore.toFixed(1));
  writeOutput('threshold-failed', thresholdFailed ? 'true' : 'false');
}

function buildCommentBody({ report, thresholdSet, activeThreshold, commandStatus }) {
  const lines = [COMMENT_MARKER, report.trim(), ''];
  if (thresholdSet) {
    lines.push(`Score threshold: **${activeThreshold}%**. Files above this value fail the check.`);
  } else {
    lines.push('No `score-threshold` was set, so this comment is advisory.');
  }
  lines.push(`patina-score exit code: \`${commandStatus}\`.`);
  return `${lines.join('\n')}\n`;
}

function fallbackReport({ files, activeThreshold }) {
  return [
    '# Patina PR prose hotspot report',
    '',
    `Gate: **${Number(activeThreshold).toFixed(0)}%** hot prose paragraphs.`,
    '',
    `patina-score produced no stdout for ${files.length} file(s).`,
  ].join('\n');
}

function numberInput(name, defaultValue, { min = 0, max = 100, integer = false } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    throw new Error(`${name} must be ${integer ? 'an integer' : 'a number'} from ${min} to ${max}, got ${raw}`);
  }
  return n;
}

function stringInput(name, defaultValue) {
  const value = process.env[name];
  return value === undefined || value === '' ? defaultValue : value;
}

function writeOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  appendFileSync(outputPath, `${name}=${value}\n`);
}

function writeStepSummary(body) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  appendFileSync(summaryPath, `${body}\n`);
}

try {
  main();
} catch (error) {
  console.error(`patina-action: ${error.message}`);
  process.exit(2);
}
