#!/usr/bin/env node
const files = process.argv.filter((arg) => arg.endsWith('.md') || arg.endsWith('.mdx'));
const gateIndex = process.argv.indexOf('--gate');
const gate = gateIndex >= 0 ? Number(process.argv[gateIndex + 1]) : 30;
const rows = files.map((file, index) => ({ file, score: index === 0 ? 12.5 : 45.0 }));
console.log('# Patina pre-commit prose score');
console.log('');
console.log(`Gate: **${gate}%** hot prose paragraphs. This deterministic check flags editing hotspots; it is not an authorship verdict.`);
console.log('');
console.log('| status | file | lang | paragraphs | hot | score |');
console.log('|---|---|---:|---:|---:|---:|');
for (const row of rows) {
  const status = row.score > gate ? 'fail' : 'pass';
  console.log(`| ${status} | ${row.file} | en | 8 | 1 | ${row.score.toFixed(1)}% |`);
}
if (rows.some((row) => row.score > gate)) process.exitCode = 1;
