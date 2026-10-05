// Rasterize the Browser Agent Connector brand mark for Chrome's toolbar and extension manager.
const fs = require('node:fs'),
  path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
  });
  const page = await browser.newPage();
  const svg = fs.readFileSync(path.join(__dirname, '../icons/app.svg'), 'utf8');
  for (const size of [16, 32, 48, 128, 512]) {
    const data = await page.evaluate(
      async ({ svg, size }) => {
        const image = new Image();
        image.src = 'data:image/svg+xml;base64,' + btoa(svg);
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        canvas.getContext('2d').drawImage(image, 0, 0, size, size);
        return canvas.toDataURL().split(',')[1];
      },
      { svg, size },
    );
    fs.writeFileSync(
      path.join(__dirname, '../icons', `app-${size}.png`),
      Buffer.from(data, 'base64'),
    );
  }
  await browser.close();
})();
