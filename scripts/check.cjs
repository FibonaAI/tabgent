const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.name === '__pycache__'
        ? []
        : e.isDirectory()
          ? walk(path.join(dir, e.name))
          : [path.join(dir, e.name)],
    );
}
for (const file of [...walk('extension'), ...walk('scripts')]) {
  if (/\.(?:js|cjs|mjs)$/.test(file)) {
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
  if (file.endsWith('.json')) JSON.parse(fs.readFileSync(file, 'utf8'));
  if (file.endsWith('.py')) {
    const result = spawnSync(
      process.env.PYTHON || 'python3',
      ['-c', 'import ast,sys;ast.parse(open(sys.argv[1]).read())', file],
      { stdio: 'inherit' },
    );
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
const messages = JSON.parse(fs.readFileSync('extension/_locales/en/messages.json', 'utf8'));
for (const file of walk('extension').filter((f) => /\.(html|js)$/.test(f))) {
  const text = fs.readFileSync(file, 'utf8');
  const keys = [...text.matchAll(/\$i18n\{([A-Za-z0-9_]+)\}|\bi18n\('([^']+)'/g)];
  for (const match of keys)
    assert(messages[match[1] || match[2]], `Missing English string in ${file}: ${match[0]}`);
}
assert.equal(
  JSON.parse(fs.readFileSync('package.json')).version,
  JSON.parse(fs.readFileSync('extension/manifest.json')).version,
);
console.log('PASS syntax, JSON, localization references, and release version');
