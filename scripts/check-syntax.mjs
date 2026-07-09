import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['server.js', 'public', 'scripts'];
const ignoredDirs = new Set(['.git', 'node_modules']);
const files = [];

function collect(path) {
  if (path.endsWith('.js') || path.endsWith('.mjs')) {
    files.push(path);
    return;
  }

  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const childPath = join(path, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) collect(childPath);
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
      files.push(childPath);
    }
  }
}

for (const root of roots) collect(root);

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Syntax check passed for ${files.length} files.`);
