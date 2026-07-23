// scripts/profile-leaflet-render.js
//
// v2 — agora testa o caminho REAL de upload (FileReader via <input type="file">)
// contra um arquivo local de verdade, e simula CPU mais fraca (aproximação de
// celular). A v1 injetava o JSON direto via page.evaluate(), pulando o
// FileReader inteiro — por isso não conseguia detectar se o gargalo estava aí.
//
// Uso:
//   node scripts/profile-leaflet-render.js --file "C:\caminho\para\Linha do Tempo.json" [URL_DO_APP]
//   node scripts/profile-leaflet-render.js                [usa o mock de 31MB, sem --file]
//
// O arquivo passado em --file NUNCA é lido pelo Node aqui — só o caminho é
// passado pro Chrome, que lê o arquivo do disco sozinho via input de upload,
// exatamente como um usuário faria. O conteúdo nunca aparece no console/log.

const puppeteer = require('puppeteer');
const path = require('path');
const { generateLargeMockText } = require('./mock-timeline-generator');

const DEFAULT_URL = 'https://cobradeca-a11y.github.io/non_uber/';

function parseArgs(argv) {
  let filePath = null;
  let url = DEFAULT_URL;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file') {
      filePath = argv[i + 1];
      i++;
    } else if (!argv[i].startsWith('--')) {
      url = argv[i];
    }
  }
  return { filePath, url };
}

async function main() {
  const { filePath, url } = parseArgs(process.argv.slice(2));

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  page.on('console', msg => console.log('[browser]', msg.text()));
  page.on('pageerror', err => console.error('[browser error]', err));
  page.on('requestfailed', req => {
    console.log('[falhou]', req.url(), '-', req.failure()?.errorText);
  });

  // Simula CPU mais fraca (aproximação grosseira de celular vs desktop/CI).
  // 4x = 4 vezes mais lento que o CPU real da máquina rodando o script.
  const client = await page.target().createCDPSession();
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  console.log(`Abrindo ${url} ...`);
  await page.goto(url, { waitUntil: 'networkidle0' });

  await page.waitForFunction(() => {
    return typeof window.processarTimeline === 'function'
        && typeof window.renderGrid === 'function'
        && typeof window.TimelineUtils !== 'undefined'
        && typeof window.L !== 'undefined';
  }, { timeout: 20000 });

  await page.click('button[data-view="mapa"]');
  await new Promise(r => setTimeout(r, 300));

  // Instrumenta renderGrid sem mudar seu comportamento.
  await page.evaluate(() => {
    const original = window.renderGrid;
    window.__renderGridMs = null;
    window.renderGrid = function (grid) {
      const t0 = performance.now();
      original(grid);
      window.__renderGridMs = performance.now() - t0;
    };
  });

  const t0 = Date.now();

  if (filePath) {
    // --- CAMINHO REAL: usa o <input type="file"> de verdade, exercitando o
    // FileReader.readAsText() completo, exatamente como um usuário faria. ---
    console.log(`Usando arquivo real (local): ${path.basename(filePath)}`);
    const inputHandle = await page.$('#timeline-upload');
    if (!inputHandle) throw new Error('Elemento #timeline-upload não encontrado na página.');
    await inputHandle.uploadFile(filePath);

    // O listener 'change' do heatmap-renderer.js dispara sozinho ao selecionar
    // o arquivo. Esperamos o status final aparecer (sucesso ou erro).
    await page.waitForFunction(() => {
      const el = document.getElementById('timeline-status');
      return el && /concluído|Erro/.test(el.textContent);
    }, { timeout: 15 * 60 * 1000 }); // até 15 min, pra não cortar antes da hora se travar mesmo
  } else {
    // --- CAMINHO MOCK: pula o FileReader, injeta o texto direto (mais rápido
    // de rodar, mas não testa o upload em si). ---
    const jsonText = generateLargeMockText();
    console.log(`Mock gerado: ${(jsonText.length / 1024 / 1024).toFixed(2)} MB (FileReader NÃO testado neste modo)`);
    await page.evaluate(async (text) => {
      const statusEl = document.getElementById('timeline-status');
      await window.processarTimeline(text, statusEl);
    }, jsonText);
  }

  const totalMs = Date.now() - t0;
  const renderGridMs = await page.evaluate(() => window.__renderGridMs);
  const statusFinal = await page.$eval('#timeline-status', el => el.textContent);

  console.log('\n--- RESULTADO ---');
  console.log(`CPU throttling aplicado: 4x mais lento que a máquina local`);
  console.log(`Tempo total (ponta a ponta, ${filePath ? 'upload real' : 'mock injetado'}): ${totalMs} ms`);
  console.log(`Tempo só de renderGrid() (Leaflet real): ${renderGridMs != null ? renderGridMs.toFixed(1) : 'N/A'} ms`);
  console.log(`Status final da UI: "${statusFinal}"`);

  await browser.close();
}

main().catch(err => {
  console.error('Erro no profiling:', err);
  process.exit(1);
});
