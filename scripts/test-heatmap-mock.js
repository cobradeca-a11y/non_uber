// test-heatmap-mock.js

const CELL_SIZE = 0.0025; // aprox 250m

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

// 1. DADO FAKE: Timeline export (Semantic Location History)
const mockTimeline = {
  userLocationProfile: {
    frequentPlaces: [
      {
        label: "HOME",
        // Coord: -32.5000, -52.5000
        location: { latitudeE7: -325000000, longitudeE7: -525000000 }
      }
    ]
  },
  semanticSegments: [
    // Uma visita na HOME (deve ser excluida)
    {
      visit: { location: { latitudeE7: -325000000, longitudeE7: -525000000 } }
    },
    // Uma visita no ponto de interesse (Av. Pres. Vargas)
    // Coord: -32.1000, -52.1000
    {
      visit: { location: { latitudeE7: -321000000, longitudeE7: -521000000 } }
    },
    // Outra visita no ponto de interesse (mesma celula)
    {
      visit: { location: { latitudeE7: -321001000, longitudeE7: -521001000 } }
    }
  ]
};

// 2. DADO FAKE: geocode-cache.json (normalizado)
// O OCR acertou perfeitamente e o cache normalizou:
const mockGeocodeCache = {
  "av presidente vargas 100": { lat: -32.1000, lng: -52.1000 }
};

// 3. DADO FAKE: Corridas extraídas via OCR
// Repare na formatação bagunçada que será resolvida pela normalização.
const mockCorridas = [
  { endOrigem: "  Av. Presidente Vargas, 100 ", endDestino: "Rua X" },
  { endOrigem: "Rua Y", endDestino: "AV Presidente vargas-100" }
];

// ======= INICIO DA LÓGICA DE CRUZAMENTO (Copiada do heatmap-renderer.js) =======
function processarMock() {
  const grid = {}; 
  const forbiddenKeys = new Set();

  // 1. Zonas de exclusão
  mockTimeline.userLocationProfile.frequentPlaces.forEach(fp => {
    if (fp.label === 'HOME' || fp.label === 'WORK') {
      const lat = fp.location.latitudeE7 / 1e7;
      const lng = fp.location.longitudeE7 / 1e7;
      forbiddenKeys.add(getCellKey(lat, lng));
    }
  });

  // 2. Extraindo Timeline
  mockTimeline.semanticSegments.forEach(seg => {
    if (seg.visit) {
      const loc = seg.visit.location;
      if (loc && loc.latitudeE7) {
        const key = getCellKey(loc.latitudeE7 / 1e7, loc.longitudeE7 / 1e7);
        if (!grid[key]) grid[key] = { presencaPropria: 0, frequenciaCorrida: 0 };
        grid[key].presencaPropria++;
      }
    }
  });

  // 3. Cruzando Corridas
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

  // 4. Remover zonas de exclusao
  forbiddenKeys.forEach(k => {
    delete grid[k];
  });

  console.log("=== CHAVES PROIBIDAS (HOME/WORK) ===");
  console.log(Array.from(forbiddenKeys));
  console.log("\n=== GRID AGREGADO FINAL ===");
  console.log(JSON.stringify(grid, null, 2));
}

processarMock();
