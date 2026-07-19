// tests/test-timeline-parsing.js
// Teste simples que valida parsing de strings com ° e a lógica de exclusão HOME/WORK.

const assert = require('assert');
const TU = require('../js/timeline-utils.js');

function makeMockTimeline() {
  return {
    userLocationProfile: {
      frequentPlaces: [
        // formato real: placeLocation é string com graus
        { label: 'HOME', placeLocation: "-32.033200°, -52.098600°" },
        { label: 'WORK', placeLocation: "-32.050000°, -52.100000°" }
      ]
    },
    semanticSegments: [
      // visita normal (não inferida) -> deve contar
      {
        visit: {
          topCandidate: {
            placeLocation: {
              latLng: "-32.033300°, -52.098700°"
            }
          }
        }
      },
      // visita inferida home -> deve ser identificada e ser usada para exclusão
      {
        visit: {
          topCandidate: {
            placeLocation: {
              latLng: "-32.033200°, -52.098600°"
            },
            semanticType: "INFERRED_HOME"
          }
        }
      },
      // atividade dentro de veículo de passageiro com start/end strings
      {
        activity: {
          topCandidate: { type: "IN_PASSENGER_VEHICLE" },
          start: { latLng: "-32.033400°, -52.098800°" },
          end: { latLng: "-32.033500°, -52.098900°" }
        }
      }
    ]
  };
}

function run() {
  const data = makeMockTimeline();

  // frequentPlaces parsing
  const fp0 = data.userLocationProfile.frequentPlaces[0];
  const p0 = TU.parsePossibleLatLng(fp0.placeLocation);
  assert(p0 && Math.abs(p0.lat + 32.0332) < 1e-6, 'frequentPlaces HOME lat parsing falhou');
  assert(p0 && Math.abs(p0.lng + 52.0986) < 1e-6, 'frequentPlaces HOME lng parsing falhou');

  // visit parsing (normal)
  const visit0 = data.semanticSegments[0];
  const v0 = TU.extractVisitLatLng(visit0);
  assert(v0 && Math.abs(v0.lat + 32.0333) < 1e-6, 'visit lat parsing falhou');
  assert(v0 && Math.abs(v0.lng + 52.0987) < 1e-6, 'visit lng parsing falhou');

  // visit inferido deve ser detectado
  const visitInfer = data.semanticSegments[1];
  assert(TU.isVisitInferredHomeOrWork(visitInfer), 'visit inferido HOME não detectado');

  // activity start/end parsing
  const activitySeg = data.semanticSegments[2];
  const act = TU.extractActivityLatLngs(activitySeg);
  assert(act.start && act.end, 'atividade start/end não extraída');
  assert(Math.abs(act.start.lat + 32.0334) < 1e-6, 'activity start lat incorreto');
  assert(Math.abs(act.end.lng + 52.0989) < 1e-6, 'activity end lng incorreto');

  console.log('OK: todos os testes de parsing passaram.');
}

run();
