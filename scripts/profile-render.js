const fs = require('fs');

const CELL_SIZE = 0.0025;

function getCellKey(lat, lng) {
  const kLat = Math.floor(lat / CELL_SIZE);
  const kLng = Math.floor(lng / CELL_SIZE);
  return `${kLat}_${kLng}`;
}

function calcularMediana(valores) {
  if (valores.length === 0) return 0;
  const sorted = [...valores].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[half];
  return (sorted[half - 1] + sorted[half]) / 2.0;
}

// Mock Leaflet
global.L = {
  rectangle: () => ({
    bindTooltip: () => {},
    addTo: () => {}
  })
};

const mapMock = {
  removeLayer: () => {}
};

function profileRenderGrid(grid) {
  console.time("6. Calcular medianas");
  const valoresPresenca = Object.values(grid).map(c => c.presencaPropria).filter(v => v > 0);
  const valoresFreq = Object.values(grid).map(c => c.frequenciaCorrida).filter(v => v > 0);
  
  const medPresenca = calcularMediana(valoresPresenca) || 1;
  const medFreq = calcularMediana(valoresFreq) || 1;
  console.timeEnd("6. Calcular medianas");

  console.time("7. Instanciar Leaflet Rectangles");
  const entries = Object.entries(grid);
  for (const [key, counts] of entries) {
    const { presencaPropria, frequenciaCorrida } = counts;
    
    if (presencaPropria === 0 && frequenciaCorrida === 0) continue;

    let color = null;
    if (presencaPropria >= medPresenca && frequenciaCorrida >= medFreq) {
      color = '#1fd9a8'; 
    } else if (presencaPropria >= medPresenca && frequenciaCorrida < medFreq) {
      color = '#ef4444'; 
    } else if (presencaPropria < medPresenca && frequenciaCorrida >= medFreq) {
      color = '#3b82f6'; 
    } else {
      continue;
    }

    const rect = L.rectangle([[0,0], [1,1]], { color });
    rect.bindTooltip(`Fake`);
    rect.addTo(mapMock);
  }
  console.timeEnd("7. Instanciar Leaflet Rectangles");
}

function runProfile() {
  console.log("\n--- INICIO DO PROFILING (RENDER GRID) ---");
  
  // Create a massive fake grid
  const fakeGrid = {};
  for(let i=0; i < 5000; i++) {
    fakeGrid[`-1000_${-2000 - i}`] = { 
      presencaPropria: Math.floor(Math.random() * 10), 
      frequenciaCorrida: Math.floor(Math.random() * 5)
    };
  }
  console.log(`Tamanho do Grid Sintético: ${Object.keys(fakeGrid).length} células`);

  profileRenderGrid(fakeGrid);
  console.log("--- FIM DO PROFILING ---");
}

runProfile();
