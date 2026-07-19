const puppeteer = require('puppeteer');
const { exec } = require('child_process');

async function main() {
  const server = exec('python -m http.server 8086', { cwd: process.cwd() });
  await new Promise(r => setTimeout(r, 2000));
  
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.goto('http://127.0.0.1:8086/index.html');
  await page.setViewport({ width: 400, height: 1000 });
  
  // Override Geolocation
  const context = browser.defaultBrowserContext();
  await context.overridePermissions('http://127.0.0.1:8086', ['geolocation']);
  await page.setGeolocation({ latitude: -32.05, longitude: -52.14 });
  
  // Wait for login skip and click it
  await page.waitForSelector('#login-skip');
  await page.click('#login-skip');
  
  // Wait for flow points and new recommendation button
  await page.waitForSelector('#btn-recomendar');
  await new Promise(r => setTimeout(r, 1000));
  
  // Click recommendation button
  await page.click('#btn-recomendar');
  
  // Wait for recommendation result
  await page.waitForSelector('#recomendar-result', { visible: true });
  
  await new Promise(r => setTimeout(r, 500));
  
  await page.screenshot({ path: 'C:/Users/snake/.gemini/antigravity-ide/brain/2376b31c-e6e5-4fbf-b8ea-f4bc69dc3967/geoloc_preview.png', fullPage: true });
  
  await browser.close();
  server.kill();
  console.log('Screenshot saved');
}

main().catch(console.error);
