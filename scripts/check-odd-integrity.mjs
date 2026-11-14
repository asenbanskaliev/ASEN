import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function checkOddIntegrity(documents, baseline) {
  const errors = [];
  for (const [path, expected] of Object.entries(baseline)) {
    const text = (documents[path] ?? '').replace(/\r\n/g, '\n');
    if (/Warning:\s*truncated output|\[output truncated\]|tokens truncated|truncated tool output/i.test(text)) errors.push(`${path}: embedded tool truncation`);
    const lines = new Set(text.split(/\r?\n/));
    for (const line of [...expected.headings, ...expected.logs]) if (!lines.has(line)) errors.push(`${path}: missing historical heading ${line}`);
    if (path.endsWith('ui-functional-completion-and-acceptance.md')) {
      for (const heading of expected.headings.filter(h => /^## UFC-/.test(h))) {
        const block = text.split(heading + '\n')[1]?.split('\n## ')[0] ?? '';
        for (let field = 1; field <= 25; field++) if (!new RegExp(`(?:^|[·\\n])\\s*${field}\\. `).test(block)) errors.push(`${heading}: missing field ${field}`);
      }
    }
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const baseline = JSON.parse(readFileSync(new URL('../tests/fixtures/odd-integrity-baseline.json', import.meta.url), 'utf8'));
  const documents = Object.fromEntries(Object.keys(baseline).map(path => [path, readFileSync(path, 'utf8')]));
  const errors = checkOddIntegrity(documents, baseline);
  const ref = process.argv[process.argv.indexOf('--baseline') + 1];
  if (process.argv.includes('--baseline')) {
    for (const [path, current] of Object.entries(documents)) {
      const original = execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
      // The sole permitted pre-existing-line change in M1-05 is its state/checklist.
      const normalize = value => value.replace(/\r\n/g, '\n').split('\n').map(line => line.startsWith('1. ID: UFC-M1-05 ') ? line.split(' · 24. Current state:')[0] : line).filter(Boolean);
      const after = normalize(current);
      let cursor = 0;
      for (const line of normalize(original)) {
        while (cursor < after.length && after[cursor] !== line) cursor++;
        if (cursor === after.length) { errors.push(`${path}: original content removed or reordered: ${line.slice(0,100)}`); break; }
        cursor++;
      }
    }
  }
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('ODD integrity PASS: historical headings, 32 UFC tasks and all mandatory fields retained' + (process.argv.includes('--baseline') ? '; original nonblank content preserved except authorized M1-05 state' : ''));
}
