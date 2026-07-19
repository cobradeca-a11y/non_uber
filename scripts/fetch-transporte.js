const axios = require('axios');
const fs = require('fs');
const pdf = require('pdf-parse');

async function fetchTransnorte() {
  console.log('Fetching Transnorte schedules...');
  const res = await axios.get('https://www.transnorters.com.br/horarios');
  
  const match = res.data.match(/window\.__NUXT__=(.*?)<\/script>/);
  if (!match) throw new Error('Nuxt data not found in HTML');
  
  const nuxtData = eval(match[1]);
  if (!nuxtData || !nuxtData.data || !nuxtData.data[0]) {
    throw new Error('Unexpected Nuxt data structure');
  }

  const { times_sjn, times_rg } = nuxtData.data[0];
  
  const processTimes = (timesData, direction) => {
    if (!timesData || !timesData.times) return null;
    
    const util = [];
    const sabado = [];
    const domingo = [];

    timesData.times.forEach(t => {
      const timeStr = typeof t.time === 'string' && t.time.includes(':') 
        ? t.time.substring(0, 5) 
        : t.time;
      const tStr = String(timeStr).substring(0, 5);
      
      if (t.days.monday) util.push(tStr);
      if (t.days.saturday) sabado.push(tStr);
      if (t.days.sunday) domingo.push(tStr);
    });

    return {
      sentido: direction,
      ponto: "Estação Hidroviária - Cais do Porto Velho",
      horarios: {
        util: [...new Set(util)].sort(),
        sabado: [...new Set(sabado)].sort(),
        domingo: [...new Set(domingo)].sort()
      }
    };
  };

  return [
    processTimes(times_sjn, "SJN->RG"),
    processTimes(times_rg, "RG->SJN")
  ].filter(Boolean);
}

function extractTimes(text, startRegex, endRegex) {
  const startMatch = text.match(startRegex);
  if (!startMatch) {
    console.warn('Start pattern not found: ' + startRegex);
    return [];
  }
  
  const startIndex = startMatch.index;
  let endIndex = text.length;
  
  if (endRegex) {
    const afterStart = text.substring(startIndex + startMatch[0].length);
    const endMatch = afterStart.match(endRegex);
    if (endMatch) {
      endIndex = startIndex + startMatch[0].length + endMatch.index;
    }
  }
  
  const chunk = text.substring(startIndex, endIndex);
  
  const times = chunk.match(/\b\d{2}:\d{2}\b/g) || [];
  return [...new Set(times)].sort();
}

async function fetchOnibus() {
  console.log('Fetching Onibus PDF...');
  const res = await axios.get('https://www.riogrande.rs.gov.br/consulta/arquivos/noticia_arquivo/horarios_onibus.pdf', {
    responseType: 'arraybuffer'
  });
  
  const data = await pdf(res.data);
  const text = data.text;
  
  // Extract FURG
  const furgDomingo = extractTimes(text, /FURG\s*.\s*DOMINGO E FERIADOS/, /FURG\s*.\s*SÁBADOS/);
  const furgSabado = extractTimes(text, /FURG\s*.\s*SÁBADOS/, /FURG\s*.\s*SEGUNDA A SEXTA/);
  const furgUtil = extractTimes(text, /FURG\s*.\s*SEGUNDA A SEXTA/, /JUNCÃO CASSINO/);

  // Extract CASSINO (Using a common substring to avoid encoding issues on SÁBADO vs SÁBADO)
  // "CASSINO - SEG. A SEX. - INVERNO"
  const cassinoUtil = extractTimes(text, /CASSINO\s*.\s*SEG\.\s*A\s*SEX\./, /CASSINO\s*.\s*SÁBADO/i);
  const cassinoSabado = extractTimes(text, /CASSINO\s*.\s*SÁBADO/i, /CASSINO\s*.\s*DOMINGO E FERIADOS/);
  const cassinoDomingo = extractTimes(text, /CASSINO\s*.\s*DOMINGO E FERIADOS/, /CASSINO VIA CIDADE NOVA/);
  
  return [
    {
      linha: "14",
      nome: "FURG",
      ponto: "FURG",
      horarios: {
        util: furgUtil,
        sabado: furgSabado,
        domingo: furgDomingo
      }
    },
    {
      linha: "06/10",
      nome: "Cassino",
      ponto: "Cassino",
      horarios: {
        util: cassinoUtil,
        sabado: cassinoSabado,
        domingo: cassinoDomingo
      }
    }
  ];
}

async function main() {
  try {
    const lancha = await fetchTransnorte();
    console.log('Lancha data fetched.');
    
    const onibus = await fetchOnibus();
    console.log('Onibus data fetched.');
    
    const output = { onibus, lancha };
    
    fs.writeFileSync('transporte-horarios.json', JSON.stringify(output, null, 2));
    console.log('Saved to transporte-horarios.json');
  } catch (err) {
    console.error(err);
  }
}

main();
