const puppeteer = require('puppeteer');
const fs = require('fs');

async function createUberReceipt(filename, dateStr, amount, time, cat, min, sec, km, addr1, addr2, injectError = false) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Create an HTML string that visually looks like the Uber receipt
  // The user mentioned issues with Tesseract dropping the decimal point or colon due to noise.
  // We can simulate a slightly noisy or low contrast image.
  const html = `
    <html>
      <body style="background: black; color: white; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; width: 400px; padding: 20px; margin: 0;">
        <div style="color: #bbb; font-size: 14px; font-weight: bold; margin-bottom: 20px;">${dateStr}</div>
        
        <div style="background: #111; border-radius: 10px; padding: 15px; margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; font-size: 22px; font-weight: bold; margin-bottom: 8px;">
            <div>R$ ${amount}</div>
            <div style="color: #aaa; font-weight: normal; font-size: 16px;">${time}</div>
          </div>
          <div style="color: #888; font-size: 14px; margin-bottom: 15px;">
            ${cat} &middot; ${min} min ${sec ? sec + ' segundos' : ''} &middot; <span style="${injectError ? 'letter-spacing: -1px; text-shadow: 0 0 2px #fff;' : ''}">${km} km</span>
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 10px; font-size: 14px;">
            <div style="display: flex; gap: 10px; color: #ccc;">
              <span style="color: #4a8deb;">&#9679;</span>
              <span>${addr1}</span>
            </div>
            <div style="display: flex; gap: 10px; color: #ccc;">
              <span style="color: #f15642;">&#9632;</span>
              <span>${addr2}</span>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
  
  await page.setContent(html);
  await page.setViewport({ width: 440, height: 300 });
  await page.screenshot({ path: filename });
  await browser.close();
}

async function run() {
  await createUberReceipt('uber_mock_1.png', 'ter., 14 de jul.', '6,00', '16:28', 'Uber X', '5', '45', '1.76', 'Praça Rio Grande R. Jockey Clube', 'Rua Saturnino de Brito');
  await createUberReceipt('uber_mock_2.png', 'qua., 15 de jul.', '13,70', '19:23', 'Comfort', '18', '17', '10.24', 'Partage Shopping Rio Grande', 'Rua das Flores 123');
  // Inject visual error (letter spacing / blur) to simulate Tesseract misreading the decimal point
  await createUberReceipt('uber_mock_3_error.png', 'qui., 16 de jul.', '25,22', '20:30', 'Uber X', '21', '', '17.90', 'HU-FURG', 'Cassino', true);
  console.log('Images generated');
}
run();
