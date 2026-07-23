// scripts/mock-timeline-generator.js
//
// Gerador de mock ÚNICO, compartilhado entre profile-heatmap.js (Node, mede
// parsing/agregação) e profile-leaflet-render.js (puppeteer, mede renderGrid).
//
// Existe como módulo separado de propósito: ter duas cópias do mock em dois
// scripts diferentes foi exatamente o tipo de coisa que já causou divergência
// e bug mascarado antes (regra 5 do handover — mock precisa ser único e
// replicar a estrutura real, não reinventado por script).
//
// Formato: string "-32.0500000°, -52.1000000°" dentro de
// topCandidate.placeLocation.latLng (visitas) / topCandidate.{start,end}.latLng
// (atividades de veículo) — o formato REAL confirmado com o arquivo do usuário,
// não o `latitudeE7` que já foi confirmado como inexistente.

function toLatLngString(lat, lng) {
  return `${lat.toFixed(7)}°, ${lng.toFixed(7)}°`;
}

function generateLargeMockObject() {
  const data = {
    userLocationProfile: {
      frequentPlaces: [
        { label: "HOME", placeLocation: toLatLngString(-32.05, -52.10) }
      ]
    },
    semanticSegments: []
  };

  // ~2000 segmentos com timelinePath grande — proporção calibrada pra bater
  // com o tamanho real do arquivo do usuário (~31MB), não um número arbitrário.
  for (let i = 0; i < 2000; i++) {
    const isVisit = i % 2 === 0;
    const lat = -32.05 + i * 0.0001;
    const lng = -52.10 + i * 0.0001;

    if (isVisit) {
      data.semanticSegments.push({
        visit: {
          topCandidate: {
            placeLocation: { latLng: toLatLngString(lat, lng) },
            semanticType: 'INFERRED_VISIT' // != INFERRED_HOME/WORK de propósito
          }
        },
        timelinePath: Array(900).fill({ point: [1, 2, 3] })
      });
    } else {
      data.semanticSegments.push({
        activity: {
          topCandidate: { type: 'IN_PASSENGER_VEHICLE' },
          start: { latLng: toLatLngString(lat, lng) },
          end: { latLng: toLatLngString(lat + 0.001, lng + 0.001) }
        },
        timelinePath: Array(900).fill({ point: [1, 2, 3] })
      });
    }
  }
  return data;
}

function generateLargeMockText() {
  return JSON.stringify(generateLargeMockObject());
}

module.exports = { toLatLngString, generateLargeMockObject, generateLargeMockText };
