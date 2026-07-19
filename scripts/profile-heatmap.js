const fs = require('fs');

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

function generateLargeMock() {
  const data = {
    userLocationProfile: { frequentPlaces: [{ label: "HOME", location: { latitudeE7: -325000000, longitudeE7: -525000000 } }] },
    semanticSegments: []
  };

  // Generate ~35MB of JSON by embedding large timelinePaths
  for (let i = 0; i < 2000; i++) {
    const isVisit = i % 2 === 0;
    if (isVisit) {
      data.semanticSegments.push({
        visit: { location: { latitudeE7: -325000000 + i, longitudeE7: -525000000 + i } },
        timelinePath: Array(4000).fill({ point: [1,2,3] }) 
      });
    } else {
      data.semanticSegments.push({
        activity: { 
          activityType: 'IN_PASSENGER_VEHICLE',
          startLocation: { latitudeE7: -325000000 + i, longitudeE7: -525000000 + i },
          endLocation: { latitudeE7: -325000000 + i + 100, longitudeE7: -525000000 + i + 100 },
        },
        timelinePath: Array(4000).fill({ point: [1,2,3] }) 
      });
    }
  }

  const jsonString = JSON.stringify(data);
  console.log(`Generated mock size: ${(jsonString.length / 1024 / 1024).toFixed(2)} MB`);
  return jsonString;
}

const mockGeocodeCache = {
  "av presidente vargas 100": { lat: -32.1000, lng: -52.1000 }
};

const mockCorridas = [
  { endOrigem: "Av. Presidente Vargas, 100", endDestino: "Rua X" }
];

async function runProfile() {
  console.time("Generate Mock Data");
  const jsonText = generateLargeMock();
  console.timeEnd("Generate Mock Data");

  console.log("\n--- INICIO DO PROFILING ---");
  console.time("1. JSON.parse()");
  const data = JSON.parse(jsonText);
  console.timeEnd("1. JSON.parse()");

  console.time("2. Zonas de exclusão");
  const grid = {}; 
  const forbiddenKeys = new Set();
  if (data.userLocationProfile && data.userLocationProfile.frequentPlaces) {
    data.userLocationProfile.frequentPlaces.forEach(fp => {
      if (fp.label === 'HOME' || fp.label === 'WORK') {
        const lat = fp.location.latitudeE7 / 1e7;
        const lng = fp.location.longitudeE7 / 1e7;
        forbiddenKeys.add(getCellKey(lat, lng));
      }
    });
  }
  console.timeEnd("2. Zonas de exclusão");

  console.time("3. Extraindo Timeline (semanticSegments)");
  if (data.semanticSegments) {
    data.semanticSegments.forEach(seg => {
      if (seg.visit) {
        const loc = seg.visit.location;
        if (loc && loc.latitudeE7) {
          const key = getCellKey(loc.latitudeE7 / 1e7, loc.longitudeE7 / 1e7);
          if (!grid[key]) grid[key] = { presencaPropria: 0, frequenciaCorrida: 0 };
          grid[key].presencaPropria++;
        }
      } else if (seg.activity && seg.activity.activityType === 'IN_PASSENGER_VEHICLE') {
        const start = seg.activity.startLocation;
        const end = seg.activity.endLocation;
        if (start && start.latitudeE7) {
          const key = getCellKey(start.latitudeE7 / 1e7, start.longitudeE7 / 1e7);
          if (!grid[key]) grid[key] = { presencaPropria: 0, frequenciaCorrida: 0 };
          grid[key].presencaPropria++;
        }
        if (end && end.latitudeE7) {
          const key = getCellKey(end.latitudeE7 / 1e7, end.longitudeE7 / 1e7);
          if (!grid[key]) grid[key] = { presencaPropria: 0, frequenciaCorrida: 0 };
          grid[key].presencaPropria++;
        }
      }
    });
  }
  console.timeEnd("3. Extraindo Timeline (semanticSegments)");

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
    // and destino...
  });
  console.timeEnd("4. Cruzando com Corridas");

  console.time("5. Aplicando regras de exclusão");
  forbiddenKeys.forEach(k => {
    delete grid[k];
  });
  console.timeEnd("5. Aplicando regras de exclusão");
  console.log("--- FIM DO PROFILING ---");
}

runProfile();
