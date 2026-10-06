// Launch an isolated Chrome for Testing profile with the source extension.
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
if (process.platform !== 'darwin')
  throw new Error('The native connector currently supports macOS.');
const root = path.resolve(__dirname, '..');
const binary = process.env.CHROME_PATH || chromium.executablePath();
if (!fs.existsSync(binary))
  throw new Error('Run npx playwright install chromium, or set CHROME_PATH.');
const install = spawnSync(
  process.env.PYTHON || 'python3',
  ['extension/native/install.py', '--dev'],
  { cwd: root, stdio: 'inherit' },
);
if (install.status !== 0) process.exit(install.status || 1);
const profile =
  process.env.CHROME_PROFILE ||
  path.join(os.homedir(), 'Library/Application Support/Tabgent Development');
const args = [
  `--user-data-dir=${profile}`,
  `--load-extension=${path.join(root, 'extension')}`,
  '--no-first-run',
  '--no-default-browser-check',
];
if (process.env.CHROME_DEBUG_PORT)
  args.push(
    `--remote-debugging-port=${process.env.CHROME_DEBUG_PORT}`,
    '--remote-debugging-address=127.0.0.1',
  );
args.push('chrome://newtab/');
const log = path.join(os.tmpdir(), 'tabgent-dev.log');
const output = fs.openSync(log, 'a');
const browser = spawn(binary, args, { detached: true, stdio: ['ignore', output, output] });
browser.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
browser.unref();
fs.closeSync(output);
console.log(`Development browser launched. Profile: ${profile}\nLog: ${log}`);
