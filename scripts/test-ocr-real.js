const Tesseract = require('tesseract.js');

const MONTH_MAP = {
  'jan':1,'fev':2,'mar':3,'abr':4,'mai':5,'jun':6,
  'jul':7,'ago':8,'set':9,'out':10,'nov':11,'dez':12
};

function parseMonthPt(str) {
  const s = str.toLowerCase().replace(/\./g, '').slice(0,3);
  return MONTH_MAP[s] || null;
}

function parseOcrText(text){
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const results = [];
  let currentDate = null;
  const currentYear = new Date().getFullYear();

  const detectedCount = (text.match(/R\$\s?\d+[,.]\d{2}/g) || []).length;

  const dateRe = /(?:seg|ter|qua|qui|sex|s[aá]b|dom)[a-zç]*\.?,?\s*(\d{1,2})\s*de\s*([a-zç]+)/i;
  const valueTimeRe = /R\$\s?(\d+[,.]\d{2}).*?(\d{1,2}[:.]?\d{2})/;
  const nextCardRe = /R\$\s?\d+[,.]\d{2}/;
  const catDurDistRe = /((?:Uber\s*\w+|UberX|Comfort|Flash|Black|Moto|Priority|Green)[^·\-]*)\s*[·\-]\s*(\d+)\s*min\s*(?:(\d+)\s*segundo?s?)?\s*[·\-]\s*(\d+[.,]?\d+)\s*km/i;
  const durDistRe = /(\d+)\s*min\s*(?:(\d+)\s*segundo?s?)?\s*[·\-]\s*(\d+[.,]?\d+)\s*km/i;

  let i = 0;
  while(i < lines.length){
    const line = lines[i];

    const dm = line.match(dateRe);
    if(dm){
      const day = parseInt(dm[1], 10);
      const month = parseMonthPt(dm[2]);
      if(month){
        const pad = n => n.toString().padStart(2,'0');
        currentDate = `${currentYear}-${pad(month)}-${pad(day)}`;
      }
      i++; continue;
    }

    const vtm = line.match(valueTimeRe);
    if(vtm){
      const valor = parseFloat(vtm[1].replace(',','.'));
      let rawHora = vtm[2];
      let hora = rawHora.replace('.', ':');
      if (!hora.includes(':') && hora.length >= 3) {
        hora = hora.slice(0, -2) + ':' + hora.slice(-2);
      }

      let categoria = '', duracaoSeg = 0, km = 0;
      let endOrigem = '', endDestino = '';

      if(i+1 < lines.length){
        const nextLine = lines[i+1];
        const cdm = nextLine.match(catDurDistRe);
        if(cdm){
          categoria = cdm[1].trim();
          const mins = parseInt(cdm[2],10) || 0;
          const secs = parseInt(cdm[3],10) || 0;
          duracaoSeg = mins * 60 + secs;
          km = parseFloat(cdm[4].replace(',','.'));
          i++;
        } else {
          const ddm = nextLine.match(durDistRe);
          if(ddm){
            const mins = parseInt(ddm[1],10) || 0;
            const secs = parseInt(ddm[2],10) || 0;
            duracaoSeg = mins * 60 + secs;
            km = parseFloat(ddm[3].replace(',','.'));
            i++;
          }
        }
      }

      // Address scanning: skip noise lines, detect addresses broadly
      const addrLines = [];
      let j = i + 1;
      let scanned = 0;
      while(j < lines.length && addrLines.length < 2 && scanned < 8){
        const al = lines[j];
        scanned++;

        // Stop if next card or date header
        if(al.match(nextCardRe) || al.match(dateRe)){ break; }

        // CEP continuation (e.g. "96201-260, BR")
        if(al.match(/^\d{5}-?\d{3}/) && addrLines.length > 0){
          addrLines[addrLines.length - 1] += ', ' + al;
          j++; continue;
        }

        // Known address prefixes
        const hasAddrPrefix =
          al.match(/^[📍🔵⚫●]/) ||
          al.match(/^(?:Rua|Av\b|Avenida|Pra[cç]a|Rod|Estr|R\.|Trav\b)/i);

        // Address-like content
        const hasAddrContent = al.length > 15 && (
          al.match(/\d{5}-?\d{3}/) ||
          al.match(/,\s*(?:Rio Grande|RS|BR|[A-Z]{2})\b/i)
        );

        if(hasAddrPrefix || hasAddrContent){
          addrLines.push(al.replace(/^[📍🔵⚫●+=\-e\s]+/, '').trim());
          j++; continue;
        }

        // Short noise (< 8 chars) — skip
        if(al.length < 8){
          j++; continue;
        }

        // Unknown long line — stop
        break;
      }
      if(addrLines.length >= 1) endOrigem = addrLines[0];
      if(addrLines.length >= 2) endDestino = addrLines[1];
      i = j;

      results.push({
        data: currentDate || new Date().toISOString().slice(0,10),
        hora, valor, km, duracaoSeg,
        categoria, endOrigem, endDestino
      });
      continue;
    }
    i++;
  }
  return { results, detectedCount };
}

async function main() {
  const imgPath = process.argv[2] || 'uber_real_screenshot.png';
  console.log(`\n=== TESTANDO: ${imgPath} ===\n`);
  
  const worker = await Tesseract.createWorker('por');
  const { data: { text } } = await worker.recognize(imgPath);
  await worker.terminate();
  
  console.log('========== TEXTO BRUTO DO TESSERACT ==========');
  console.log(text);
  console.log('========== FIM DO TEXTO BRUTO ==========\n');
  
  const lines = text.split('\n');
  console.log('========== LINHAS NUMERADAS ==========');
  lines.forEach((l, idx) => {
    console.log(`[${String(idx).padStart(3)}] "${l.trim()}"`);
  });
  console.log('========== FIM DAS LINHAS ==========\n');
  
  const { results, detectedCount } = parseOcrText(text);
  console.log(`========== DETECÇÃO: ${detectedCount} padrões R$ encontrados ==========`);
  console.log(`========== RESULTADO DO PARSE: ${results.length} corrida(s) ==========`);
  console.log(JSON.stringify(results, null, 2));
  
  console.log('\n========== COMPARAÇÃO CAMPO A CAMPO ==========');
  const expected = [
    { card: 'Card 2', valor: 13.43, hora: '20:17', km: 8.79, dur: '16m34s', cat: 'Uber X', orig: 'R. Almirante Cerqueira e Souza...', dest: 'Olavo Bilac...' },
    { card: 'Card 3', valor: 6.55, hora: '17:00', km: 1.11, dur: '2m59s', cat: 'Uber X', orig: 'Rua dos Carijós...', dest: 'Estrada Roberto Socoowski...' },
  ];
  
  results.forEach((r, idx) => {
    const e = expected[idx];
    if(!e) return;
    console.log(`\n--- ${e.card} ---`);
    console.log(`  valor:     ${r.valor} (esperado: ${e.valor}) ${Math.abs(r.valor - e.valor) < 0.01 ? '✅' : '❌'}`);
    console.log(`  hora:      ${r.hora} (esperado: ${e.hora}) ${r.hora === e.hora ? '✅' : '⚠️ EDITÁVEL'}`);
    console.log(`  km:        ${r.km} (esperado: ${e.km}) ${Math.abs(r.km - e.km) < 0.05 ? '✅' : '⚠️ EDITÁVEL'}`);
    console.log(`  duração:   ${r.duracaoSeg}s (esperado: ${e.dur})`);
    console.log(`  categoria: ${r.categoria} (esperado: ${e.cat}) ${r.categoria === e.cat ? '✅' : '⚠️'}`);
    console.log(`  origem:    ${r.endOrigem || '(vazio)'}`);
    console.log(`  destino:   ${r.endDestino || '(vazio)'}`);
  });
  
  console.log(`\n========== RESUMO ==========`);
  console.log(`Padrões R$ detectados: ${detectedCount}`);
  console.log(`Corridas processadas:  ${results.length}`);
  if(detectedCount > results.length){
    console.log(`⚠️ ${detectedCount - results.length} padrão(ões) R$ no texto não viraram corrida (card parcial cortado no topo da screenshot?)`);
  }
  console.log('');
}

main().catch(console.error);
