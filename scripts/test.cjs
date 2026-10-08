// Local fixtures only: no real account, browser profile, or model calls.
const { spawnSync } = require('node:child_process');
for (const file of [
  'guards.mjs',
  'conversations.mjs',
  'url-history.mjs',
  'selection-routing.mjs',
  'native-disconnect.mjs',
  'attachments.py',
  'install.py',
  'store-setup.cjs',
  'selection.cjs',
  'pdf.cjs',
  'setup-ui.cjs',
  'math.cjs',
]) {
  const python = file.endsWith('.py');
  const result = spawnSync(
    python ? process.env.PYTHON || 'python3' : process.execPath,
    [`extension/tests/${file}`],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
