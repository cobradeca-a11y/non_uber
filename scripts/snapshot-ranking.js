/**
 * snapshot-ranking.js — Runs weekly via GitHub Actions.
 * For each place in places-config.json, fetches current userRatingCount
 * from Google Places API (New) and appends a snapshot to ranking-snapshots.json.
 *
 * Usage (in Actions):
 *   PLACES_API_KEY=${{ secrets.PLACES_API_KEY }} node scripts/snapshot-ranking.js
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
const snapshotsPath = path.join(__dirname, '..', 'ranking-snapshots.json');

const places = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Load existing snapshots (or start fresh)
let snapshots = [];
try {
  snapshots = JSON.parse(fs.readFileSync(snapshotsPath, 'utf8'));
} catch (e) {
  snapshots = [];
}

const today = new Date().toISOString().slice(0, 10);

async function getPlaceDetails(placeId) {
  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'userRatingCount'
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Place Details failed for ${placeId}: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.userRatingCount || 0;
}

async function main() {
  console.log(`Taking ranking snapshot for ${today}...\n`);
  let count = 0;
  let skipped = 0;

  for (const place of places) {
    if (!place.place_id || place.place_id === 'PLACEHOLDER') {
      console.log(`⏭ Skipping "${place.nome}" (no Place ID)`);
      skipped++;
      continue;
    }

    try {
      const contagem = await getPlaceDetails(place.place_id);
      const entry = {
        place_id: place.place_id,
        nome: place.nome,
        data: today,
        contagem
      };
      snapshots.push(entry);
      count++;
      console.log(`✓ ${place.nome}: ${contagem} avaliações`);
    } catch (err) {
      console.error(`✕ ${place.nome}: ${err.message}`);
    }

    // Rate limit: wait 200ms between requests
    await new Promise(r => setTimeout(r, 200));
  }

  fs.writeFileSync(snapshotsPath, JSON.stringify(snapshots, null, 2) + '\n', 'utf8');
  console.log(`\nDone. Added ${count} entries (skipped ${skipped}).`);
  console.log(`Total snapshots: ${snapshots.length}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
