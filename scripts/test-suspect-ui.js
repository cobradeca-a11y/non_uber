const puppeteer = require('puppeteer');
const { exec } = require('child_process');

async function main() {
  const server = exec('npx -y http-server . -p 8082 --cors -c-1', { cwd: process.cwd() });
  await new Promise(r => setTimeout(r, 3000));
  
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900 });
  await page.goto('http://localhost:8082/index.html', { waitUntil: 'networkidle2', timeout: 30000 });
  
  // Dismiss login overlay
  await page.evaluate(() => {
    const overlay = document.getElementById('login-overlay');
    if(overlay) overlay.classList.add('hidden');
  });
  await new Promise(r => setTimeout(r, 300));
  
  // Navigate to Corridas tab
  await page.evaluate(() => {
    document.querySelectorAll('.tab-btn').forEach(b => {
      if(b.textContent.includes('Corridas')) b.click();
    });
  });
  await new Promise(r => setTimeout(r, 300));
  
  // Open OCR modal
  await page.evaluate(() => {
    const btn = document.getElementById('btn-ocr-import');
    if(btn) btn.click();
    // Also try opening it directly
    const modal = document.getElementById('modal-ocr-backdrop');
    if(modal) modal.classList.add('open');
  });
  await new Promise(r => setTimeout(r, 300));
  
  // Inject fake OCR data matching the real screenshot
  const jsResult = await page.evaluate(() => {
    const fakeOcrResults = [
      { data: '2026-07-14', hora: '20:17', valor: 13.43, km: 8.79, duracaoSeg: 994, categoria: 'Uber X', endOrigem: 'R. Almirante Cerqueira e Souza, Vila Militar', endDestino: 'Olavo Bilac, Junção' },
      { data: '2026-07-14', hora: '1:05', valor: 6.55, km: 111, duracaoSeg: 179, categoria: 'Uber X', endOrigem: 'Rua dos Carijós', endDestino: 'Estrada Roberto Socoowski' }
    ];
    ocrParsedResults = checkDuplicates(fakeOcrResults);
    document.getElementById('ocr-preview-wrap').style.display = 'block';
    document.getElementById('ocr-status').textContent = '✅ 2 padrão(ões) R$ detectado(s), 2 corrida(s) processada(s). Confira e edite se necessário antes de importar.';
    renderOcrPreview();
    
    return JSON.stringify(ocrParsedResults.map(r => ({
      hora: r.hora, km: r.km, status: r.status, suspectFields: r.suspectFields
    })), null, 2);
  });
  
  console.log('\n========== RESULTADO DA DETECÇÃO DE ANOMALIA ==========');
  console.log(jsResult);
  
  await new Promise(r => setTimeout(r, 500));
  
  const screenshotPath = 'C:/Users/snake/.gemini/antigravity-ide/brain/2376b31c-e6e5-4fbf-b8ea-f4bc69dc3967/ocr_suspect_preview.png';
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`\nScreenshot salva em: ${screenshotPath}`);
  
  await browser.close();
  server.kill();
}

main().catch(e => { console.error(e); process.exit(1); });
