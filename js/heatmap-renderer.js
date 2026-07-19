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

function normalizeAddress(addr) {
  if (!addr) return '';
  return addr.toLowerCase()
    .replace(/[.,-\/#!$%\^&\*;:{}=\-_`~()]/g," ")
    .replace(/\s{2,}/g," ")
    .trim();
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

async function yieldThread() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

async function processarTimeline(jsonText, statusEl) {
  const timeoutMs = 30000; // 30s max per stage
  let startStageTime;
  
  function checkTimeout(stageName) {
    if (Date.now() - startStageTime > timeoutMs) {
      throw new Error(`Timeout de segurança (30s) estourado na etapa: ${stageName}. O processamento foi abortado para não travar seu aparelho.`);
    }
  }

  // Dependência: TimelineUtils (global no browser). Se não existir, falha com mensagem útil.
  if (typeof TimelineUtils === 'undefined') {
    throw new Error('TimelineUtils não encontrado. Certifique-se de carregar js/timeline-utils.js antes de processar a linha do tempo.');
  }

  statusEl.textContent = "Fazendo parse do JSON (isso pode levar alguns segundos)...";
  await yieldThread();
  
  startStageTime = Date.now();
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch(e) {
    throw new Error("JSON inválido: " + e.message);
  }
  checkTimeout("Parse JSON");

  const grid = {}; 
  const forbiddenKeys = new Set();

  statusEl.textContent = "Calculando Zonas de Exclusão...";
  await yieldThread();
  
  startStageTime = Date.now();
  // frequentPlaces[] -> placeLocation (string ou object)
  if (data.userLocationProfile && data.userLocationProfile.frequentPlaces) {
    data.userLocationProfile.frequentPlaces.forEach(fp => {
      if (fp.label === 'HOME' || fp.label === 'WORK') {
        // placeLocation pode ser string "-32..., -52..." ou objeto compatível
        const parsed = TimelineUtils.parsePossibleLatLng(fp.placeLocation || fp.placeLocationString || fp.location);
        if (parsed) {
          forbiddenKeys.add(getCellKey(parsed.lat, parsed.lng));
        }
      }
    });
  }
  checkTimeout("Zonas de exclusão");

  const segments = data.semanticSegments || [];
  const totalSegs = segments.length;
  
  startStageTime = Date.now();
  let processados = 0;
  const CHUNK_SIZE = 500;
  
  for (let i = 0; i < totalSegs; i += CHUNK_SIZE) {
    statusEl.textContent = `Extraindo presenças: ${i} de ${totalSegs} segmentos...`;
    await yieldThread();
    checkTimeout("Extraindo presenças");
    
    const chunk = segments.slice(i, i + CHUNK_SIZE);
    for (const seg of chunk) {
      // Visits: use extractVisitLatLng (lida com topCandidate.placeLocation.latLng string)
      if (seg.visit) {
        // Se a visita tem semanticType INFERRED_HOME/WORK, adiciona diretamente à zona proibida
        if (TimelineUtils.isVisitInferredHomeOrWork(seg)) {
          const v = TimelineUtils.extractVisitLatLng(seg);
          if (v) forbiddenKeys.add(getCellKey(v.lat, v.lng));
          continue; // não contar essas visitas como presencaPropria
        }

        const v = TimelineUtils.extractVisitLatLng(seg);
        if (v) {
          const key = getCellKey(v.lat, v.lng);
          if (!grid[key]) grid[key] = { presencaPropria: 0, frequenciaCorrida: 0 };
          grid[key].presencaPropria++;
        }
      } else {
        // Atividades: extractActivityLatLngs já filtra por IN_PASSENGER_VEHICLE
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

  statusEl.textContent = "Cruzando com Histórico de Corridas...";
  await yieldThread();
  startStageTime = Date.now();

  const geocodeCache = await carregarGeocodeCache();
  if (window.corridas) {
    const totalCorridas = window.corridas.length;
    for (let i = 0; i < totalCorridas; i += CHUNK_SIZE) {
      statusEl.textContent = `Cruzando corridas: ${i} de ${totalCorridas}...`;
      await yieldThread();
      checkTimeout("Cruzando corridas");
      
      const chunk = window.corridas.slice(i, i + CHUNK_SIZE);
      for (const c of chunk) {
        if (c.endOrigem) {
          const origKey = normalizeAddress(c.endOrigem);
          if (geocodeCache[origKey]) {
            const loc = geocodeCache[origKey];
            const key = getCellKey(loc.lat, loc.lng);
            if (!grid[key]) grid[key] = { presencaPropria: 0, frequenciaCorrida: 0 };
            grid[key].frequenciaCorrida++;
          }
        }
        if (c.endDestino) {
          const destKey = normalizeAddress(c.endDestino);
          if (geocodeCache[destKey]) {
            const loc = geocodeCache[destKey];
            const key = getCellKey(loc.lat, loc.lng);
            if (!grid[key]) grid[key] = { presencaPropria: 0, frequenciaCorrida: 0 };
            grid[key].frequenciaCorrida++;
          }
        }
      }
    }
  }

  statusEl.textContent = "Aplicando Regras de Privacidade e Arredondamento...";
  await yieldThread();
  
  forbiddenKeys.forEach(k => {
    delete grid[k];
  });

  localStorage.setItem('heatmap_grid', JSON.stringify(grid));
  
  statusEl.textContent = "Renderizando Mapa...";
  await yieldThread();
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
