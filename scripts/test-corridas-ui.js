// scripts/test-corridas-ui.js
// Automated UI test for the Corridas table: sorting, filtering, arrow toggle.
// Run with: node scripts/test-corridas-ui.js

const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const url = 'http://127.0.0.1:8080/'; // Local server URL
  const browser = await puppeteer.launch({headless: true});
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
   page.on('response', res => {
     if (res.status() === 404) console.log('404 EM:', res.url());
   });
// Navigate to app and wait for full load
await page.goto(url, {waitUntil: 'networkidle0', timeout: 30000});
// Ensure navigation bar is present
await page.waitForSelector('nav#tabs', {timeout: 5000});
// Ensure Corridas button exists
   // Dismiss login overlay if present
   try {
     await page.waitForSelector('#login-skip', {visible: true, timeout: 5000});
     await page.click('#login-skip');
     // Ensure overlay is hidden before proceeding
     await page.waitForSelector('#login-overlay', {hidden: true, timeout: 5000});
   } catch (e) {
     // Overlay not present; continue
   }
// Diagnostics after navigation
const pageHTML = await page.content();
const storageMode = await page.evaluate(() => document.getElementById('storage-mode-label')?.textContent);
const loginOverlay = await page.evaluate(() => !!document.querySelector('#login-overlay')?.offsetParent);
const modalVisible = await page.evaluate(() => !!document.querySelector('.modal')?.offsetParent);
const magicLinkBtn = await page.evaluate(() => !!Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Enviar magic link'))?.offsetParent);
console.log(JSON.stringify({storageMode, loginOverlay, modalVisible, magicLinkBtn}));

  // Wait for table header row to be built
   // Debug button geometry before click
   const btnInfo = await page.evaluate(() => {
     const el = document.querySelector('button[data-view="corridas"]');
     if (!el) return {error: 'button not found'};
     const rect = el.getBoundingClientRect();
     const elementOnTop = document.elementFromPoint(rect.x + rect.width/2, rect.y + rect.height/2);
     return {
       rect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
       visible: rect.width > 0 && rect.height > 0,
       elementOnTopHTML: elementOnTop ? elementOnTop.outerHTML : null
     };
   });
   console.log('BUTTON INFO:', JSON.stringify(btnInfo));
   await page.click('button[data-view="corridas"]');
  await page.waitForSelector('#corridas-header-row th.sortable');

  const getArrow = async (key) => {
    return await page.$eval(`#corridas-header-row th[data-key="${key}"] .sort-arrow`, el => el.textContent.trim());
  };

  // 1. Click on 'Dia' header to sort ascending
  await page.click('#corridas-header-row th[data-key="data"]');
    await new Promise(r => setTimeout(r, 500));
  const arrow1 = await getArrow('data');

  // 2. Type filter text '2026-07-20' (example date that exists in demo data)
   await page.type('#corridas-filter-row input[data-key="data"]', '2026-07-20');
   await new Promise(r => setTimeout(r, 500));
   const rowsAfterFilter = await page.$$eval('#corridas-tbody tr', rows => rows.length);

  // 3. Click same header again to invert order
  await page.click('#corridas-header-row th[data-key="data"]');
   await new Promise(r => setTimeout(r, 500));
  const arrow2 = await getArrow('data');

  // Screenshot of final state
  const screenshotPath = path.join(__dirname, 'corridas-sort-filter-test.png');
  await page.screenshot({path: screenshotPath, fullPage: true});

  console.log(JSON.stringify({arrow1, arrow2, rowsAfterFilter, screenshotPath}));
  await browser.close();
})();
