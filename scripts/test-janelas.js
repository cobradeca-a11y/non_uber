// scripts/test-janelas.js

const WINDOWS = {
  'manha': { start: 6 * 60, end: 9 * 60 },
  'tarde': { start: 13 * 60, end: 15 * 60 },
  'rush':  { start: 17 * 60, end: 20 * 60 + 30 },
  'noite': { start: 21 * 60 + 30, end: 23 * 60 }
};

function getJanelaHoraria(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length !== 2) return null;
  const m = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);

  // 1. Checar se está exatamente dentro de uma janela
  for (const [name, bounds] of Object.entries(WINDOWS)) {
    if (m >= bounds.start && m <= bounds.end) {
      return name;
    }
  }

  // 2. Se não está dentro, achar a borda mais próxima (distância circular)
  let minDistance = Infinity;
  let closestWindow = null;

  for (const [name, bounds] of Object.entries(WINDOWS)) {
    const distStart = Math.min(Math.abs(m - bounds.start), 1440 - Math.abs(m - bounds.start));
    const distEnd = Math.min(Math.abs(m - bounds.end), 1440 - Math.abs(m - bounds.end));
    const dist = Math.min(distStart, distEnd);
    
    // Desempate: Se for igual, favorece a janela do dia seguinte/mais cedo no loop (menor distância estritamente)
    if (dist < minDistance) {
      minDistance = dist;
      closestWindow = name;
    }
  }

  return closestWindow;
}

// Test cases do Critério de Aceite (tabela atualizada com o caso da madrugada corrigido)
const testCases = [
  // Madrugada
  { time: '00:00', expected: 'noite' },
  { time: '02:29', expected: 'noite' },
  { time: '02:30', expected: 'manha' }, // Empate exato: 02:30 - 23:00 (3h30) vs 02:30 - 06:00 (3h30). Retorna manha pelo loop.
  { time: '02:31', expected: 'manha' },
  { time: '06:00', expected: 'manha' }, // dentro da manha
  // Entre manha e tarde (meio-dia é 11:00)
  { time: '09:01', expected: 'manha' },
  { time: '11:00', expected: 'manha' }, // Empate: 2h de 09:00, 2h de 13:00. Retorna manha
  { time: '11:01', expected: 'tarde' },
  { time: '13:00', expected: 'tarde' }, // dentro da tarde
  // Entre tarde e rush (meio é 16:00)
  { time: '15:01', expected: 'tarde' },
  { time: '16:00', expected: 'tarde' }, // Empate: 1h de 15:00, 1h de 17:00. Retorna tarde
  { time: '16:01', expected: 'rush' },
  // Entre rush e noite (meio é 21:00)
  { time: '20:31', expected: 'rush' },
  { time: '21:00', expected: 'rush' }, // Empate: 30m de 20:30, 30m de 21:30. Retorna rush
  { time: '21:01', expected: 'noite' },
  { time: '23:01', expected: 'noite' },
  { time: '23:59', expected: 'noite' }
];

let allPassed = true;

console.log("=== RODANDO TESTES DE JANELAS HORÁRIAS ===");
testCases.forEach(({time, expected}) => {
  const result = getJanelaHoraria(time);
  const status = result === expected ? "PASS" : "FAIL";
  if (status === "FAIL") allPassed = false;
  console.log(`[${status}] ${time} -> Retornou: ${result} | Esperado: ${expected}`);
});

console.log(`\nResultado Final: ${allPassed ? "SUCESSO (Todos passaram)" : "FALHA"}`);

module.exports = { getJanelaHoraria };
