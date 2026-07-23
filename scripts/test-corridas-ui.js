// scripts/test-corridas-ui.js
// Automated UI test for the Corridas table: sorting, filtering, arrow toggle, and row menu.
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

  console.log('=== SORT/FILTER RESULTS ===');
  console.log(JSON.stringify({arrow1, arrow2, rowsAfterFilter}));

  // 4. Clear filter to show all rows for menu test
  await page.evaluate(() => {
    const input = document.querySelector('#corridas-filter-row input[data-key="data"]');
    if(input){ input.value = ''; input.dispatchEvent(new Event('input', {bubbles:true})); }
  });
  await new Promise(r => setTimeout(r, 500));

  // === ROW MENU TESTS ===
  console.log('=== ROW MENU TESTS ===');

  // 5. Check that ⋮ buttons exist
  const menuBtnCount = await page.$$eval('.row-actions-btn', btns => btns.length);
  console.log('MENU BUTTONS COUNT:', menuBtnCount);

  // 6. Click the first ⋮ button to open the menu
  await page.click('.row-actions-btn');
  await new Promise(r => setTimeout(r, 300));
  const menuOpen = await page.$eval('.row-menu', m => m.classList.contains('open'));
  console.log('MENU OPEN AFTER CLICK:', menuOpen);

  // 7. Verify menu items
  const menuItems = await page.$$eval('.row-menu.open .row-menu-item', items =>
    items.map(i => ({action: i.dataset.action, text: i.textContent.trim()}))
  );
  console.log('MENU ITEMS:', JSON.stringify(menuItems));

  // 8. Test Duplicar: count rows before, click Duplicar, count rows after
  // First close any open menus from previous tests
  await page.evaluate(() => {
    document.querySelectorAll('.row-menu.open').forEach(m => m.classList.remove('open'));
  });
  await new Promise(r => setTimeout(r, 200));
  const rowsBefore = await page.$$eval('#corridas-tbody tr', rows => rows.length);
  // Open menu and click Duplicar in a single evaluate
  const dupDebug = await page.evaluate(() => {
    const lenBefore = typeof corridas !== 'undefined' ? corridas.length : -1;
    const btn = document.querySelector('.row-actions-btn');
    // Directly open the menu (don't toggle via click — go straight)
    const menu = btn.nextElementSibling;
    menu.classList.add('open');
    const menuIsOpen = menu.classList.contains('open');
    const item = menu.querySelector('.row-menu-item[data-action="duplicar"]');
    const itemFound = !!item;
    if(item) item.click();
    const lenAfterClick = typeof corridas !== 'undefined' ? corridas.length : -1;
    return {lenBefore, menuIsOpen, itemFound, lenAfterClick};
  });
  console.log('DUP DEBUG:', JSON.stringify(dupDebug));
  await new Promise(r => setTimeout(r, 1000));
  const corridasLenAfterWait = await page.evaluate(() => typeof corridas !== 'undefined' ? corridas.length : -1);
  console.log('CORRIDAS LENGTH AFTER WAIT:', corridasLenAfterWait);
  const rowsAfterDuplicate = await page.$$eval('#corridas-tbody tr', rows => rows.length);
  console.log('ROWS BEFORE DUPLICATE:', rowsBefore, '-> AFTER:', rowsAfterDuplicate);

  // 9. Test Editar: open menu, click Editar, check modal appears with 'Editar corrida' title
  await page.evaluate(() => {
    const btn = document.querySelector('.row-actions-btn');
    btn.click();
  });
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => {
    const item = document.querySelector('.row-menu.open .row-menu-item[data-action="editar"]');
    if(item) item.click();
  });
  await new Promise(r => setTimeout(r, 500));
  const modalTitle = await page.$eval('#modal-corrida-backdrop h3', el => el.textContent.trim());
  const modalIsOpen = await page.$eval('#modal-corrida-backdrop', el => el.classList.contains('open'));
  console.log('EDIT MODAL TITLE:', modalTitle, '| OPEN:', modalIsOpen);
  // Close modal
  await page.click('#c-cancel');
  await new Promise(r => setTimeout(r, 300));

  // Screenshot of final state
  const screenshotPath = path.join(__dirname, 'corridas-sort-filter-test.png');
  await page.screenshot({path: screenshotPath, fullPage: true});

  console.log('=== FINAL RESULTS ===');
  console.log(JSON.stringify({
    arrow1, arrow2, rowsAfterFilter,
    menuBtnCount, menuOpen, menuItems,
    rowsBefore, rowsAfterDuplicate,
    modalTitle, modalIsOpen,
    screenshotPath
  }));

  // Assertions
  const failures = [];
  if(arrow1 !== '▲') failures.push(`arrow1 expected ▲ got ${arrow1}`);
  if(arrow2 !== '▼') failures.push(`arrow2 expected ▼ got ${arrow2}`);
  if(menuBtnCount < 1) failures.push(`expected at least 1 menu button, got ${menuBtnCount}`);
  if(!menuOpen) failures.push('menu did not open on click');
  if(menuItems.length !== 3) failures.push(`expected 3 menu items, got ${menuItems.length}`);
  const actions = menuItems.map(i => i.action);
  if(!actions.includes('editar')) failures.push('missing editar action');
  if(!actions.includes('duplicar')) failures.push('missing duplicar action');
  if(!actions.includes('excluir')) failures.push('missing excluir action');
  if(rowsAfterDuplicate !== rowsBefore + 1) failures.push(`duplicate should add 1 row: ${rowsBefore} -> ${rowsAfterDuplicate}`);
  if(modalTitle !== 'Editar corrida') failures.push(`modal title expected 'Editar corrida' got '${modalTitle}'`);
  if(!modalIsOpen) failures.push('edit modal did not open');

  if(failures.length > 0){
    console.log('FAILURES:', failures);
    process.exit(1);
  } else {
    console.log('ALL TESTS PASSED');
  }

  await browser.close();
})();
