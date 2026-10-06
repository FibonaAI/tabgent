const fs = require('fs'),
  os = require('os'),
  path = require('path'),
  { spawn } = require('child_process');
const root = process.cwd(),
  { chromium } = require(root + '/node_modules/playwright');
(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tabgent-input-audit-'));
  let browser;
  try {
    const ext = path.join(temp, 'extension');
    fs.mkdirSync(ext);
    const source = JSON.parse(fs.readFileSync(root + '/extension/manifest.json'));
    fs.writeFileSync(
      ext + '/manifest.json',
      JSON.stringify({
        manifest_version: 3,
        name: 'Isolated browser tool test',
        version: '1.0',
        key: source.key,
        permissions: ['tabs', 'debugger', 'scripting', 'webNavigation'],
        host_permissions: ['http://*/*'],
      }),
    );
    fs.writeFileSync(ext + '/setup.html', '<!doctype html><title>Browser tool fixture</title>');
    for (const file of [
      'browser-tools.js',
      'browser-input.js',
      'agent-pointer.js',
      'pdf-routing.js',
    ])
      fs.copyFileSync(root + '/extension/' + file, ext + '/' + file);
    browser = await chromium.launchPersistentContext(temp + '/profile', {
      headless: true,
      channel: 'chromium',
      args: [
        '--remote-debugging-port=0',
        '--disable-extensions-except=' + ext,
        '--load-extension=' + ext,
      ],
    });
    const port = fs.readFileSync(temp + '/profile/DevToolsActivePort', 'utf8').split('\n')[0];
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [root + '/extension/tests/browser-input.cjs'], {
        env: { ...process.env, CHROME_CDP: 'http://127.0.0.1:' + port },
        stdio: 'inherit',
      });
      child.on('exit', (code) =>
        code === 0 ? resolve() : reject(Error('Input test exit ' + code)),
      );
    });
  } finally {
    await browser?.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
