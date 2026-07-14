/**
 * fetch-place-ids.js — Run ONCE locally to populate places-config.json
 * with real Google Place IDs.
 *
 * Usage:
 *   PLACES_API_KEY=YOUR_KEY node scripts/fetch-place-ids.js
 *
 * Requires: Node 18+ (uses built-in fetch)
 */

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.PLACES_API_KEY;
if (!API_KEY) {
  console.error('Error: set PLACES_API_KEY environment variable.');
  process.exit(1);
}

const configPath = path.join(__dirname, '..', 'places-config.json');
const places = JSON.parse(fs.readFileSync(configPath, 'utf8'));

async function searchPlace(nome) {
  const query = `${nome} Rio Grande RS Brasil`;
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName'
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1 })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Search failed for "${nome}": ${res.status} ${text}`);
  }
  const data = await res.json();
  if (!data.places || data.places.length === 0) {
    console.warn(`⚠ No results for "${nome}"`);
    return null;
  }
  return data.places[0].id;
}

async function main() {
  console.log(`Fetching Place IDs for ${places.length} locations...\n`);
  let updated = 0;

  for (const place of places) {
    try {
      const placeId = await searchPlace(place.nome);
      if (placeId) {
        place.place_id = placeId;
        updated++;
        console.log(`✓ ${place.nome} → ${placeId}`);
      } else {
        console.log(`✕ ${place.nome} → not found (kept PLACEHOLDER)`);
      }
    } catch (err) {
      console.error(`✕ ${place.nome} → ${err.message}`);
    }
    // Rate limit: wait 200ms between requests
    await new Promise(r => setTimeout(r, 200));
  }

  fs.writeFileSync(configPath, JSON.stringify(places, null, 2) + '\n', 'utf8');
  console.log(`\nDone. Updated ${updated}/${places.length} Place IDs.`);
  console.log(`Saved to ${configPath}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
