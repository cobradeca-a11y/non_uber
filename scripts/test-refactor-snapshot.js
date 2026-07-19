const puppeteer = require('puppeteer');
const fs = require('fs');

async function main() {
  const isBefore = process.argv[2] === 'before';
  const outName = isBefore ? 'snapshot-before.html' : 'snapshot-after.html';
  
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Set fixed time (Sunday, July 19 2026 18:00:00 GMT-0300)
  await page.evaluateOnNewDocument(() => {
    const fixedTime = new Date('2026-07-19T18:00:00-03:00').getTime();
    Date.now = () => fixedTime;
    const OriginalDate = Date;
    globalThis.Date = class extends OriginalDate {
      constructor(...args) {
        if (args.length === 0) {
          super(fixedTime);
        } else {
          super(...args);
        }
      }
    };
    globalThis.Date.now = () => fixedTime;
  });

  await page.goto('http://127.0.0.1:8086/index.html');
  await page.waitForSelector('#login-skip');
  await page.click('#login-skip');
  
  // Wait for flow points container to populate
  await page.waitForSelector('.flow-card');
  await new Promise(r => setTimeout(r, 2000));
  
  const html = await page.$eval('#flow-points', el => el.innerHTML);
  
  // Format HTML lightly for readable diff
  const formattedHtml = html.replace(/<\/div>/g, '</div>\n').trim();
  
  fs.writeFileSync(outName, formattedHtml);
  console.log('Saved', outName);
  
  await browser.close();
}

main().catch(console.error);
