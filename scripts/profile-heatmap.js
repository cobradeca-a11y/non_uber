// scripts/profile-heatmap.js
//
// Mede o parsing + agregação em grid (etapas 1-5 de processarTimeline em
// heatmap-renderer.js) rodando em Node puro. NÃO mede renderGrid() (Leaflet) —
// isso precisa de DOM, ver scripts/profile-leaflet-render.js (puppeteer).
//
// Usa o mock compartilhado (scripts/mock-timeline-generator.js) e as funções
// de parsing REAIS de produção (js/timeline-utils.js) — não reimplementa
// nenhuma das duas, pra nunca mais divergir do código que roda no navegador.

const path = require('path');
const TimelineUtils = require(path.join(__dirname, '..', 'js', 'timeline-utils.js'));
const { generateLargeMockText } = require('./mock-timeline-generator');

const CELL_SIZE = 0.0025; // igual ao heatmap-renderer.js

function getCellKey(lat, lng) {
  const kLat = Math.floor(lat / CELL_SIZE);
  const kLng = Math.floor(lng / CELL_SIZE);
  return `${kLat}_${kLng}`;
}

function normalizeAddress(addr) {
  if (!addr) return '';
  return addr.toLowerCase()
    .replace(/[.,-\/#!$%\^&\*;:{}=\-_`~()]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const mockGeocodeCache = {
  "av presidente vargas 100": { lat: -32.1000, lng: -52.1000 }
};

const mockCorridas = [
  { endOrigem: "Av. Presidente Vargas, 100", endDestino: "Rua X" }
];

async function yieldThread() {
  return new Promise(resolve => setImmediate(resolve));
}

async function runProfile() {
  console.time("Generate Mock Data");
  const jsonText = generateLargeMockText();
  console.timeEnd("Generate Mock Data");
  console.log(`Generated mock size: ${(jsonText.length / 1024 / 1024).toFixed(2)} MB`);

  console.log("\n--- INICIO DO PROFILING ---");

  console.time("1. JSON.parse()");
  const data = JSON.parse(jsonText);
  console.timeEnd("1. JSON.parse()");

  const grid = {};
  const forbiddenKeys = new Set();

  console.time("2. Zonas de exclusao");
  if (data.userLocationProfile && data.userLocationProfile.frequentPlaces) {
    data.userLocationProfile.frequentPlaces.forEach(fp => {
      if (fp.label === 'HOME' || fp.label === 'WORK') {
        const parsed = TimelineUtils.parsePossibleLatLng(fp.placeLocation || fp.placeLocationString || fp.location);
        if (parsed) forbiddenKeys.add(getCellKey(parsed.lat, parsed.lng));
      }
    });
  }
  console.timeEnd("2. Zonas de exclusao");

  console.time("3. Extraindo Timeline (semanticSegments, chunked)");
  const segments = data.semanticSegments || [];
  const CHUNK_SIZE = 500;
  for (let i = 0; i < segments.length; i += CHUNK_SIZE) {
    await yieldThread(); // replica o yield real entre chunks
    const chunk = segments.slice(i, i + CHUNK_SIZE);
    for (const seg of chunk) {
      if (seg.visit) {
        if (TimelineUtils.isVisitInferredHomeOrWork(seg)) {
          const v = TimelineUtils.extractVisitLatLng(seg);
          if (v) forbiddenKeys.add(getCellKey(v.lat, v.lng));
          continue;
        }
        const v = TimelineUtils.extractVisitLatLng(seg);
        if (v) {
          const key = getCellKey(v.lat, v.lng);
          if (!grid[key]) grid[key] = { presencaPropria: 0, frequenciaCorrida: 0 };
          grid[key].presencaPropria++;
        }
      } else {
        const { start, end } = TimelineUtils.extractActivityLatLngs(seg);
        if (start) {
          const key = getCellKey(start.lat, start.lng);
          if (!grid[key]) grid[key] = { presencaPropria: 0, frequenciaCorrida: 0 };
          grid[key].presencaPropria++;
        }
        if (end) {
          const key = getCellKey(end.lat, end.lng);
          if (!grid[key]) grid[key] = { presencaPropria: 0, frequenciaCorrida: 0 };
          grid[key].presencaPropria++;
        }
      }
    }
  }
  console.timeEnd("3. Extraindo Timeline (semanticSegments, chunked)");

  console.time("4. Cruzando com Corridas");
  mockCorridas.forEach(c => {
    if (c.endOrigem) {
      const origKey = normalizeAddress(c.endOrigem);
      if (mockGeocodeCache[origKey]) {
        const loc = mockGeocodeCache[origKey];
        const key = getCellKey(loc.lat, loc.lng);
        if (!grid[key]) grid[key] = { presencaPropria: 0, frequenciaCorrida: 0 };
        grid[key].frequenciaCorrida++;
      }
    }
    if (c.endDestino) {
      const destKey = normalizeAddress(c.endDestino);
      if (mockGeocodeCache[destKey]) {
        const loc = mockGeocodeCache[destKey];
        const key = getCellKey(loc.lat, loc.lng);
        if (!grid[key]) grid[key] = { presencaPropria: 0, frequenciaCorrida: 0 };
        grid[key].frequenciaCorrida++;
      }
    }
  });
  console.timeEnd("4. Cruzando com Corridas");

  console.time("5. Aplicando regras de exclusao");
  forbiddenKeys.forEach(k => delete grid[k]);
  console.timeEnd("5. Aplicando regras de exclusao");

  console.log(`\nCelulas no grid final: ${Object.keys(grid).length}`);
  console.log("--- FIM DO PROFILING (parsing + agregacao) ---");
  console.log("\nAVISO: renderGrid() (Leaflet) NAO foi medido aqui — precisa de DOM.");
  console.log("Use scripts/profile-leaflet-render.js (puppeteer) pra medir a renderizacao real.");
}

runProfile();
