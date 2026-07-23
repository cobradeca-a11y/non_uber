// scripts/test-calc-ui.js
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const url = 'http://127.0.0.1:8080/'; 
  const browser = await puppeteer.launch({headless: true});
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  
  await page.goto(url, {waitUntil: 'networkidle0', timeout: 30000});
  await page.waitForSelector('nav#tabs', {timeout: 5000});
  try {
    await page.waitForSelector('#login-skip', {visible: true, timeout: 5000});
    await page.click('#login-skip');
    await page.waitForSelector('#login-overlay', {hidden: true, timeout: 5000});
  } catch (e) {}

  await page.click('button[data-view="calc"]');
  await page.waitForSelector('#c-consumo');

  const getConsumo = async () => page.$eval('#c-consumo', el => el.value);
  const getReadonly = async () => page.$eval('#c-consumo', el => el.hasAttribute('readonly'));

  // 1. Initial State (Readonly)
  const initialConsumo = await getConsumo(); // 9.3
  const isInitialReadonly = await getReadonly();
  
  console.log(`Initial Consumo: ${initialConsumo}, Readonly: ${isInitialReadonly}`);

  // 2. Click Edit -> Change Value -> Click Cancel (Assert value returns to initial)
  await page.click('#calc-btn-edit');
  await new Promise(r => setTimeout(r, 200));
  const isEditingReadonly = await getReadonly();
  
  // Clear and type new value
  await page.evaluate(() => { document.querySelector('#c-consumo').value = ''; });
  await page.type('#c-consumo', '15.5');
  const changedConsumo = await getConsumo();
  
  await page.click('#calc-btn-cancel');
  await new Promise(r => setTimeout(r, 200));
  const canceledConsumo = await getConsumo();
  
  console.log(`Changed to ${changedConsumo}, Cancelled back to ${canceledConsumo}`);

  // 3. Click Edit -> Change Value -> Click Save (Assert value persists)
  await page.click('#calc-btn-edit');
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => { document.querySelector('#c-consumo').value = ''; });
  await page.type('#c-consumo', '12.0');
  
  // Take screenshot while editing
  const screenshotPathEdit = path.join(__dirname, 'calc-edit.png');
  await page.screenshot({path: screenshotPathEdit, fullPage: true});

  await page.click('#calc-btn-save');
  await new Promise(r => setTimeout(r, 200));
  const savedConsumo = await getConsumo();
  
  // Take screenshot after saving
  const screenshotPathView = path.join(__dirname, 'calc-view.png');
  await page.screenshot({path: screenshotPathView, fullPage: true});

  console.log(`Saved Consumo: ${savedConsumo}`);

  // 3.5. Click Edit -> Click Restore Default -> Click Save
  await page.click('#calc-btn-edit');
  await new Promise(r => setTimeout(r, 200));
  await page.click('#calc-btn-default');
  await new Promise(r => setTimeout(r, 200));
  const defaultConsumo = await getConsumo();
  
  await page.click('#calc-btn-save');
  await new Promise(r => setTimeout(r, 200));
  const savedDefaultConsumo = await getConsumo();
  
  console.log(`Restored Default Consumo: ${defaultConsumo}, Saved as: ${savedDefaultConsumo}`);

  // 4. Reload page and assert saved value persists
  await page.reload({waitUntil: 'networkidle0'});
  await page.click('button[data-view="calc"]');
  await new Promise(r => setTimeout(r, 500));
  const reloadedConsumo = await getConsumo();
  const isReloadedReadonly = await getReadonly();

  console.log(`Reloaded Consumo: ${reloadedConsumo}, Readonly: ${isReloadedReadonly}`);

  const failures = [];
  if (!isInitialReadonly) failures.push('Initial state is not readonly');
  if (isEditingReadonly) failures.push('Edit mode is still readonly');
  if (canceledConsumo !== initialConsumo) failures.push(`Cancel failed: expected ${initialConsumo}, got ${canceledConsumo}`);
  if (savedConsumo !== '12') failures.push(`Save failed: expected 12, got ${savedConsumo}`);
  if (defaultConsumo !== '9.3') failures.push(`Restore failed: expected 9.3, got ${defaultConsumo}`);
  if (savedDefaultConsumo !== '9.3') failures.push(`Save after restore failed: expected 9.3, got ${savedDefaultConsumo}`);
  if (reloadedConsumo !== '9.3') failures.push(`Persist failed: expected 9.3, got ${reloadedConsumo}`);
  if (!isReloadedReadonly) failures.push('Reloaded state is not readonly');

  if (failures.length > 0) {
    console.log('FAILURES:', failures);
    process.exit(1);
  } else {
    console.log('ALL TESTS PASSED');
  }

  await browser.close();
})();
