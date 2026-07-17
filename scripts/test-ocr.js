const Tesseract = require('tesseract.js');
const fs = require('fs');

const MONTH_MAP = {
  'jan':1,'fev':2,'mar':3,'abr':4,'mai':5,'jun':6,
  'jul':7,'ago':8,'set':9,'out':10,'nov':11,'dez':12
};

function parseMonthPt(str) {
  const s = str.toLowerCase().replace(/\./g, '').slice(0,3);
  return MONTH_MAP[s] || null;
}

function parseOcrText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const results = [];
  let currentDate = null;
  const currentYear = new Date().getFullYear();

  // Allow colon to be missing in time, allow comma/dot to be missing in distance
  const dateRe = /(?:seg|ter|qua|qui|sex|s[aá]b|dom)[a-zç]*\.?,?\s*(\d{1,2})\s*de\s*([a-zç]+)/i;
  // Match R$ <value> and then HH:MM or HHMM at the end
  const valueTimeRe = /R\$\s?(\d+[,.]\d{2}).*?(\d{1,2}[:.]?\d{2})/;
  const catDurDistRe = /((?:Uber\s*\w+|UberX|Comfort|Flash|Black|Moto|Priority|Green)[^·]*)\s*[·\-]\s*(\d+)\s*min\s*(?:(\d+)\s*segundo?s?)?\s*[·\-]\s*(\d+[.,]?\d+)\s*km/i;
  const durDistRe = /(\d+)\s*min\s*(?:(\d+)\s*segundo?s?)?\s*[·\-]\s*(\d+[.,]?\d+)\s*km/i;

  let i = 0;
  while(i < lines.length) {
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
      
      // Fix missing colon if length is 3 or 4 (e.g. 1628 or 923)
      let hora = rawHora.replace('.', ':');
      if (!hora.includes(':') && hora.length >= 3) {
        hora = hora.slice(0, -2) + ':' + hora.slice(-2);
      } else if (hora.length === 5 && !hora.includes(':')) {
        // Just in case it captured a space or something, but regex is \d{1,2}[:.]?\d{2} so it's max 4 digits
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
          
          let kmStr = cdm[4].replace(',','.');
          // Fix missing decimal point in KM.
          // Usually trips are < 100km. If it reads 136 km, it probably means 1.36.
          if (!kmStr.includes('.')) {
             // Let's just pass it raw so the preview table shows the exact number!
             km = parseFloat(kmStr); 
          } else {
             km = parseFloat(kmStr);
          }
          i++; 
        } else {
          const ddm = nextLine.match(durDistRe);
          if(ddm){
            const mins = parseInt(ddm[1],10) || 0;
            const secs = parseInt(ddm[2],10) || 0;
            duracaoSeg = mins * 60 + secs;
            let kmStr = ddm[3].replace(',','.');
            km = parseFloat(kmStr);
            i++;
          }
        }
      }

      const addrLines = [];
      let j = i + 1;
      while(j < lines.length && addrLines.length < 2){
        const al = lines[j];
        if(al.match(/^[📍🔵⚫●]/) || al.match(/^(?:Rua|Av|Avenida|Pra[cç]a|Rod|Estr|R\.)/i)){
          addrLines.push(al.replace(/^[📍🔵⚫●\s]+/, '').trim());
          j++;
        } else {
          break;
        }
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
  return results;
}

async function testOcr() {
  const images = ['uber_mock_1.png', 'uber_mock_2.png', 'uber_mock_3_error.png'];
  for (const img of images) {
    console.log(`\n--- Testando ${img} ---`);
    const worker = await Tesseract.createWorker('por');
    const { data: { text } } = await worker.recognize(img);
    await worker.terminate();
    
    console.log('TEXTO BRUTO DO TESSERACT:\n' + text);
    console.log('\nPARSE RESULT:');
    const parsed = parseOcrText(text);
    console.log(JSON.stringify(parsed, null, 2));
  }
}

testOcr().catch(console.error);
