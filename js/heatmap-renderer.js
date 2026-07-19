// heatmap-renderer.js
// Lida com o processamento do JSON da Linha do Tempo, cache de corridas e Leaflet.

const CELL_SIZE = 0.0025; // aprox 250m
let map = null;
let rectangles = [];

function getCellKey(lat, lng) {
  const kLat = Math.floor(lat / CELL_SIZE);
  const kLng = Math.floor(lng / CELL_SIZE);
  return `${kLat}_${kLng}`;
}

function getBoundsFromKey(key) {
  const [kLat, kLng] = key.split('_').map(Number);
  return [
    [kLat * CELL_SIZE, kLng * CELL_SIZE],
    [(kLat + 1) * CELL_SIZE, (kLng + 1) * CELL_SIZE]
  ];
}

async function carregarGeocodeCache() {
  try {
    const res = await fetch('./geocode-cache.json');
    if (!res.ok) return {};
    return await res.json();
  } catch (e) {
    return {};
  }
}

function calcularMediana(valores) {
  if (valores.length === 0) return 0;
  const sorted = [...valores].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[half];
  return (sorted[half - 1] + sorted[half]) / 2.0;
}

document.getElementById('timeline-upload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const statusEl = document.getElementById('timeline-status');
  statusEl.textContent = "Lendo arquivo...";

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      statusEl.textContent = "Processando JSON (pode demorar alguns segundos)...";
      // Usar setTimeout para permitir que a UI atualize antes de travar no parse
      setTimeout(async () => {
        await processarTimeline(event.target.result, statusEl);
      }, 50);
    } catch (err) {
      statusEl.textContent = "Erro ao processar arquivo: " + err.message;
    }
  };
  reader.readAsText(file);
});

async function processarTimeline(jsonText, statusEl) {
  const data = JSON.parse(jsonText);
  const grid = {}; // key -> { presencaPropria: 0, frequenciaCorrida: 0 }
  const forbiddenKeys = new Set();

  statusEl.textContent = "Calculando Zonas de Exclusão...";
  
  // 1. Zonas de exclusão (HOME / WORK)
  if (data.userLocationProfile && data.userLocationProfile.frequentPlaces) {
    data.userLocationProfile.frequentPlaces.forEach(fp => {
      if (fp.label === 'HOME' || fp.label === 'WORK') {
        const lat = fp.location.latitudeE7 / 1e7;
        const lng = fp.location.longitudeE7 / 1e7;
        forbiddenKeys.add(getCellKey(lat, lng));
      }
    });
  }

  statusEl.textContent = "Extraindo presenças da Linha do Tempo...";
  
  // 2. Processar Timeline Segments
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

  statusEl.textContent = "Cruzando com Histórico de Corridas...";

  // 3. Processar Corridas (global 'corridas' do index.html)
  const geocodeCache = await carregarGeocodeCache();
  if (window.corridas) {
    window.corridas.forEach(c => {
      // Origem
      if (c.endOrigem && geocodeCache[c.endOrigem.trim()]) {
        const loc = geocodeCache[c.endOrigem.trim()];
        const key = getCellKey(loc.lat, loc.lng);
        if (!grid[key]) grid[key] = { presencaPropria: 0, frequenciaCorrida: 0 };
        grid[key].frequenciaCorrida++;
      }
      // Destino
      if (c.endDestino && geocodeCache[c.endDestino.trim()]) {
        const loc = geocodeCache[c.endDestino.trim()];
        const key = getCellKey(loc.lat, loc.lng);
        if (!grid[key]) grid[key] = { presencaPropria: 0, frequenciaCorrida: 0 };
        grid[key].frequenciaCorrida++;
      }
    });
  }

  statusEl.textContent = "Aplicando Regras de Privacidade e Arredondamento...";

  // 4. Remover chaves proibidas (HOME/WORK) para anonimização total do grid
  forbiddenKeys.forEach(k => {
    delete grid[k];
  });

  // 5. Salvar Grid Anonimizado
  localStorage.setItem('heatmap_grid', JSON.stringify(grid));
  
  statusEl.textContent = "Renderizando Mapa...";
  renderGrid(grid);
  statusEl.textContent = "Processamento concluído. Mapa atualizado!";
}

function renderGrid(grid) {
  // Inicializar o mapa se não existir
  if (!map) {
    map = L.map('heatmap-container').setView([-32.0332, -52.0986], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(map);
  }

  // Limpar retângulos antigos
  rectangles.forEach(r => map.removeLayer(r));
  rectangles = [];

  // Calcular medianas
  const valoresPresenca = Object.values(grid).map(c => c.presencaPropria).filter(v => v > 0);
  const valoresFreq = Object.values(grid).map(c => c.frequenciaCorrida).filter(v => v > 0);
  
  const medPresenca = calcularMediana(valoresPresenca) || 1;
  const medFreq = calcularMediana(valoresFreq) || 1;

  for (const [key, counts] of Object.entries(grid)) {
    const { presencaPropria, frequenciaCorrida } = counts;
    
    // Filtro para não poluir o mapa com células quase vazias
    if (presencaPropria === 0 && frequenciaCorrida === 0) continue;

    let color = null;
    let label = '';

    // Regras de negócio
    if (presencaPropria >= medPresenca && frequenciaCorrida >= medFreq) {
      color = '#1fd9a8'; // Confirmada (Teal)
      label = 'Confirmada';
    } else if (presencaPropria >= medPresenca && frequenciaCorrida < medFreq) {
      color = '#ef4444'; // Sem Retorno (Red)
      label = 'Sem Retorno';
    } else if (presencaPropria < medPresenca && frequenciaCorrida >= medFreq) {
      color = '#3b82f6'; // Oportunidade (Blue)
      label = 'Oportunidade';
    } else {
      continue; // Ignora baixa presença e baixa corrida (ruído)
    }

    const bounds = getBoundsFromKey(key);
    const rect = L.rectangle(bounds, {
      color: color,
      weight: 1,
      fillColor: color,
      fillOpacity: 0.4
    });
    
    rect.bindTooltip(`${label}<br>Sua Presença: ${presencaPropria}<br>Corridas: ${frequenciaCorrida}`);
    rect.addTo(map);
    rectangles.push(rect);
  }
}

// Quando abrir a aba, carregar e renderizar o mapa com dados cacheados (se houver)
const observer = new MutationObserver(() => {
  const mapaView = document.getElementById('view-mapa');
  if (mapaView && mapaView.classList.contains('active')) {
    if (map) {
        // leafLet bug de tiles não carregarem ao estarem num container com display:none
        setTimeout(() => map.invalidateSize(), 200);
    }
    else {
      const cachedGrid = localStorage.getItem('heatmap_grid');
      if (cachedGrid) {
        renderGrid(JSON.parse(cachedGrid));
      } else {
        // Inicializa vazio
        renderGrid({});
      }
    }
  }
});
observer.observe(document.getElementById('tabs'), { subtree: true, attributes: true, attributeFilter: ['class'] });
// Também observar as sections
document.querySelectorAll('.view').forEach(el => observer.observe(el, { attributes: true, attributeFilter: ['class'] }));
