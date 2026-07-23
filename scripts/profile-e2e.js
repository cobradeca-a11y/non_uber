// profile-e2e.js
// Profiling end-to-end com dados no formato real do Google Takeout
// Inclui: parse, extração, grid, e contagem de células

const CELL_SIZE = 0.0025;

function getCellKey(lat, lng) {
  const kLat = Math.floor(lat / CELL_SIZE);
  const kLng = Math.floor(lng / CELL_SIZE);
  return `${kLat}_${kLng}`;
}

function normalizeAddress(addr) {
  if (!addr) return '';
  return addr.toLowerCase()
    .replace(/[.,-\/#!$%\^&\*;:{}=\-_`~()]/g," ")
    .replace(/\s{2,}/g," ")
    .trim();
}

function calcularMediana(valores) {
  if (valores.length === 0) return 0;
  const sorted = [...valores].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[half];
  return (sorted[half - 1] + sorted[half]) / 2.0;
}

// O formato real do Google Takeout usa strings como "-32.0382865°, -52.0890761°"
// para latLng em activity.start/end, e latitudeE7 para visits.
// Precisamos parsear ambos os formatos.
function parseLatLngString(s) {
  if (!s) return null;
  // Remove degree symbols and split
  const parts = s.replace(/°/g, '').split(',').map(p => parseFloat(p.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { lat: parts[0], lng: parts[1] };
  }
  return null;
}

function processarTimelineReal(data) {
  const grid = {};
  const forbiddenKeys = new Set();

  console.time("2. Zonas de exclusão");
  if (data.userLocationProfile && data.userLocationProfile.frequentPlaces) {
    data.userLocationProfile.frequentPlaces.forEach(fp => {
      if (fp.label === 'HOME' || fp.label === 'WORK') {
        if (fp.location && fp.location.latitudeE7) {
          const lat = fp.location.latitudeE7 / 1e7;
          const lng = fp.location.longitudeE7 / 1e7;
          forbiddenKeys.add(getCellKey(lat, lng));
        }
      }
    });
  }
  console.timeEnd("2. Zonas de exclusão");

  const segments = data.semanticSegments || [];
  console.log(`   Segmentos totais: ${segments.length}`);

  let visitCount = 0, activityCount = 0, timelinePathCount = 0;

  console.time("3. Extrair segmentos");
  for (const seg of segments) {
    if (seg.visit) {
      visitCount++;
      // Formato real: topCandidate.placeLocation.latLng é uma string
      const tc = seg.visit.topCandidate;
      if (tc && tc.placeLocation && tc.placeLocation.latLng) {
        const coords = parseLatLngString(tc.placeLocation.latLng);
        if (coords) {
          const key = getCellKey(coords.lat, coords.lng);
          if (!grid[key]) grid[key] = { presencaPropria: 0, frequenciaCorrida: 0 };
          grid[key].presencaPropria++;
        }
      }
      // Fallback: latitudeE7 format
      if (seg.visit.location && seg.visit.location.latitudeE7) {
        const lat = seg.visit.location.latitudeE7 / 1e7;
        const lng = seg.visit.location.longitudeE7 / 1e7;
        const key = getCellKey(lat, lng);
        if (!grid[key]) grid[key] = { presencaPropria: 0, frequenciaCorrida: 0 };
        grid[key].presencaPropria++;
      }
    } else if (seg.activity) {
      activityCount++;
      const tc = seg.activity.topCandidate;
      if (tc && tc.type === 'IN_PASSENGER_VEHICLE') {
        // start
        if (seg.activity.start && seg.activity.start.latLng) {
          const coords = parseLatLngString(seg.activity.start.latLng);
          if (coords) {
            const key = getCellKey(coords.lat, coords.lng);
            if (!grid[key]) grid[key] = { presencaPropria: 0, frequenciaCorrida: 0 };
            grid[key].presencaPropria++;
          }
        }
        // end
        if (seg.activity.end && seg.activity.end.latLng) {
          const coords = parseLatLngString(seg.activity.end.latLng);
          if (coords) {
            const key = getCellKey(coords.lat, coords.lng);
            if (!grid[key]) grid[key] = { presencaPropria: 0, frequenciaCorrida: 0 };
            grid[key].presencaPropria++;
          }
        }
      }
    } else if (seg.timelinePath) {
      timelinePathCount++;
      // timelinePath segments don't have visit/activity — they're raw GPS breadcrumbs
      // The current heatmap-renderer ignores these (no visit/activity key)
    }
  }
  console.timeEnd("3. Extrair segmentos");
  console.log(`   Visits: ${visitCount}, Activities: ${activityCount}, TimelinePaths: ${timelinePathCount}`);

  console.time("4. Aplicar exclusões");
  forbiddenKeys.forEach(k => {
    delete grid[k];
  });
  console.timeEnd("4. Aplicar exclusões");

  return grid;
}

function profileRenderGrid(grid) {
  console.time("5. Calcular medianas");
  const valoresPresenca = Object.values(grid).map(c => c.presencaPropria).filter(v => v > 0);
  const valoresFreq = Object.values(grid).map(c => c.frequenciaCorrida).filter(v => v > 0);
  
  const medPresenca = calcularMediana(valoresPresenca) || 1;
  const medFreq = calcularMediana(valoresFreq) || 1;
  console.timeEnd("5. Calcular medianas");
  console.log(`   Mediana presença: ${medPresenca}, Mediana corrida: ${medFreq}`);

  console.time("6. Classificar e instanciar retângulos (mock)");
  let confirmada = 0, semRetorno = 0, oportunidade = 0, descartada = 0;
  for (const [key, counts] of Object.entries(grid)) {
    const { presencaPropria, frequenciaCorrida } = counts;
    if (presencaPropria === 0 && frequenciaCorrida === 0) { descartada++; continue; }
    if (presencaPropria >= medPresenca && frequenciaCorrida >= medFreq) { confirmada++; }
    else if (presencaPropria >= medPresenca && frequenciaCorrida < medFreq) { semRetorno++; }
    else if (presencaPropria < medPresenca && frequenciaCorrida >= medFreq) { oportunidade++; }
    else { descartada++; }
  }
  console.timeEnd("6. Classificar e instanciar retângulos (mock)");
  console.log(`   Confirmada: ${confirmada}, Sem Retorno: ${semRetorno}, Oportunidade: ${oportunidade}, Descartada: ${descartada}`);
}

// --- MAIN ---
const fs = require('fs');
const filePath = process.argv[2];
if (!filePath) {
  console.log("Uso: node profile-e2e.js <caminho-para-timeline.json>");
  console.log("Gerando mock de ~1700 segmentos...");
  
  // Generate a realistic mock with the same structure as the real file
  const mock = { semanticSegments: [] };
  for (let i = 0; i < 1723; i++) {
    const baseLat = -32.03 - (Math.random() * 0.15);
    const baseLng = -52.08 - (Math.random() * 0.12);
    
    if (i % 3 === 0) {
      // visit
      mock.semanticSegments.push({
        visit: { 
          topCandidate: { 
            placeLocation: { latLng: `${baseLat.toFixed(7)}°, ${baseLng.toFixed(7)}°` }
          }
        }
      });
    } else if (i % 3 === 1) {
      // activity IN_PASSENGER_VEHICLE
      mock.semanticSegments.push({
        activity: {
          start: { latLng: `${baseLat.toFixed(7)}°, ${baseLng.toFixed(7)}°` },
          end: { latLng: `${(baseLat + 0.01).toFixed(7)}°, ${(baseLng + 0.01).toFixed(7)}°` },
          topCandidate: { type: 'IN_PASSENGER_VEHICLE', probability: 0.95 }
        }
      });
    } else {
      // timelinePath (raw GPS, ignored by processor)
      mock.semanticSegments.push({
        timelinePath: Array(30).fill({ point: `${baseLat}°, ${baseLng}°`, time: "2026-07-10T12:00:00Z" })
      });
    }
  }
  
  const jsonText = JSON.stringify(mock);
  console.log(`Mock gerado: ${(jsonText.length / 1024).toFixed(0)} KB, ${mock.semanticSegments.length} segmentos`);
  
  console.log("\n=== PROFILING ===");
  console.time("1. JSON.parse()");
  const data = JSON.parse(jsonText);
  console.timeEnd("1. JSON.parse()");
  
  const grid = processarTimelineReal(data);
  const totalCells = Object.keys(grid).length;
  console.log(`\n   TOTAL DE CELULAS NO GRID: ${totalCells}`);
  
  profileRenderGrid(grid);
  console.log("\n=== FIM ===");
  
} else {
  console.log(`Lendo arquivo: ${filePath}`);
  console.time("0. Ler arquivo do disco");
  const raw = fs.readFileSync(filePath, 'utf8');
  console.timeEnd("0. Ler arquivo do disco");
  console.log(`   Tamanho: ${(raw.length / 1024 / 1024).toFixed(2)} MB`);
  
  console.log("\n=== PROFILING ===");
  console.time("1. JSON.parse()");
  const data = JSON.parse(raw);
  console.timeEnd("1. JSON.parse()");
  
  const grid = processarTimelineReal(data);
  const totalCells = Object.keys(grid).length;
  console.log(`\n   TOTAL DE CELULAS NO GRID: ${totalCells}`);
  
  profileRenderGrid(grid);
  console.log("\n=== FIM ===");
}
