/**
 * snapshot-cinema.js — Runs daily via GitHub Actions.
 * Fetches today's showtimes for Rio Grande cinemas via Ingresso.com API
 * and generates sessoes-cinema.json containing end times for each session.
 */

const fs = require('fs');
const path = require('path');

const CITY_ID = '416'; // Rio Grande
const THEATERS = [
  { id: '1238', name: 'Cinesystem - Praça Rio Grande Shopping' },
  { id: '1674', name: 'Cineflix - Partage Rio Grande' }
];

const snapshotsPath = path.join(__dirname, '..', 'sessoes-cinema.json');
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

async function fetchSessions(theaterId) {
  const url = `https://api-content.ingresso.com/v0/sessions/city/${CITY_ID}/theater/${theaterId}?partnership=desktopweb`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36' }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch theater ${theaterId}: ${res.status} ${text}`);
  }
  return await res.json();
}

async function main() {
  console.log(`Buscando sessões de cinema para ${today}...\n`);
  let allSessions = [];
  let errorCount = 0;

  for (const theater of THEATERS) {
    try {
      console.log(`Buscando ${theater.name}...`);
      const data = await fetchSessions(theater.id);
      
      // Find today's date block
      // The API often puts today at index 0 and sets isToday: true, but let's be safe
      const todayData = data.find(d => d.isToday) || data.find(d => d.date && d.date.startsWith(today)) || data[0];
      
      if (!todayData || !todayData.movies) {
        console.log(`  - Nenhuma sessão encontrada para hoje.`);
        continue;
      }

      let count = 0;
      for (const movie of todayData.movies) {
        const title = movie.title || movie.originalTitle;
        const durationMin = parseInt(movie.duration, 10);
        
        if (!durationMin) continue; // Skip if no duration
        
        for (const room of (movie.rooms || [])) {
          for (const session of (room.sessions || [])) {
            if (!session.time) continue;
            
            // Expected format: HH:mm
            const [sh, sm] = session.time.split(':').map(Number);
            const startTime = new Date();
            startTime.setHours(sh, sm, 0, 0);
            
            // Calculate end time
            const endTime = new Date(startTime.getTime() + durationMin * 60000);
            
            // Format endTime to ISO string in local timezone (using offset)
            const endH = endTime.getHours().toString().padStart(2, '0');
            const endM = endTime.getMinutes().toString().padStart(2, '0');
            // Assuming the session is today (the script runs daily for today)
            // If endTime crossed midnight, we handle it:
            let resultDate = today;
            if (endTime.getDate() !== startTime.getDate()) {
               const nextDay = new Date(new Date(today).getTime() + 86400000);
               resultDate = nextDay.toISOString().slice(0, 10);
            }
            const terminoStr = `${resultDate}T${endH}:${endM}:00`;

            allSessions.push({
              cinema: theater.name,
              filme: title,
              termino: terminoStr
            });
            count++;
          }
        }
      }
      console.log(`  - ✓ ${count} sessões encontradas.`);
      
    } catch (err) {
      console.error(`  - ✕ Falha: ${err.message}`);
      errorCount++;
    }
    
    // Polite delay
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Sort by end time
  allSessions.sort((a, b) => a.termino.localeCompare(b.termino));

  // Write file
  fs.writeFileSync(snapshotsPath, JSON.stringify(allSessions, null, 2) + '\n', 'utf8');
  console.log(`\nSalvo em ${snapshotsPath}: ${allSessions.length} sessões registradas.`);
  
  if (errorCount === THEATERS.length) {
    console.error('Falhou para todos os cinemas. Verifique a API.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
