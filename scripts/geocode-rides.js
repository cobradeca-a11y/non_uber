/**
 * geocode-rides.js
 * 
 * Lê um arquivo JSON de corridas (exportado do app) ou tenta extrair
 * de index.html, e geocodifica `endOrigem` e `endDestino` usando a
 * Google Maps Geocoding API.
 * 
 * Exemplo de uso:
 *   PLACES_API_KEY=YOUR_KEY node scripts/geocode-rides.js [corridas.json]
 */

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.PLACES_API_KEY;
if (!API_KEY) {
  console.error('Error: PLACES_API_KEY environment variable is missing.');
  process.exit(1);
}

const cachePath = path.join(__dirname, '..', 'geocode-cache.json');
let cache = {};
if (fs.existsSync(cachePath)) {
  cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
}

async function geocode(address) {
  if (!address) return null;
  const key = address.trim();
  if (cache[key]) return cache[key];

  const query = encodeURIComponent(`${key}, Rio Grande, RS, Brasil`);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${API_KEY}`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'OK' && data.results.length > 0) {
      const loc = data.results[0].geometry.location;
      cache[key] = { lat: loc.lat, lng: loc.lng };
      return cache[key];
    } else {
      console.warn(`[WARN] Geocoding falhou para "${key}": ${data.status}`);
      cache[key] = null; // null significa falha permanente para não tentar de novo
    }
  } catch(e) {
    console.error(`[ERROR] Geocoding API error: ${e.message}`);
  }
  return null;
}

async function main() {
  let corridas = [];
  const args = process.argv.slice(2);
  
  if (args.length > 0) {
    console.log(`Lendo corridas de ${args[0]}...`);
    corridas = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  } else {
    console.log(`[ERRO] É necessário passar um arquivo .json contendo as corridas exportadas do app (localStorage).`);
    console.log(`Exemplo: PLACES_API_KEY=suachave node scripts/geocode-rides.js minhas_corridas.json`);
    process.exit(1);
  }

  let processadas = 0;
  let novas = 0;

  for (const corrida of corridas) {
    if (corrida.endOrigem) {
      if (!cache[corrida.endOrigem.trim()]) {
        const p = await geocode(corrida.endOrigem);
        if (p) novas++;
      }
    }
    if (corrida.endDestino) {
      if (!cache[corrida.endDestino.trim()]) {
        const p = await geocode(corrida.endDestino);
        if (p) novas++;
      }
    }
    processadas++;
    if (processadas % 10 === 0) {
       fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
    }
    await new Promise(r => setTimeout(r, 150)); // Rate limit
  }

  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
  console.log(`\nConcluído! ${novas} novos endereços geocodificados.`);
  console.log(`Cache salvo em ${cachePath}. Total de endereços cacheados: ${Object.keys(cache).length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
