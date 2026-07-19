// js/timeline-utils.js
// Utilitários para extrair e normalizar coordenadas do JSON exportado da Linha do Tempo do Google.

(function(exports){
  'use strict';

  function parseLatLngString(s) {
    if (typeof s !== 'string') return null;
    // Formato esperado: "-32.0329807°, -52.0839381°" (com símbolo de grau e vírgula)
    const parts = s.split(',');
    if (parts.length < 2) return null;
    const rawLat = parts[0].replace(/[^0-9+\-\.]/g, '').trim();
    const rawLng = parts[1].replace(/[^0-9+\-\.]/g, '').trim();
    if (rawLat.length === 0 || rawLng.length === 0) return null;
    const lat = Number.parseFloat(rawLat);
    const lng = Number.parseFloat(rawLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  }

  function parseLatLngFromObject(obj) {
    if (!obj || typeof obj !== 'object') return null;
    // Compatibilidade com latitudeE7 / longitudeE7 (algumas fontes antigas)
    if (typeof obj.latitudeE7 === 'number' && typeof obj.longitudeE7 === 'number') {
      return { lat: obj.latitudeE7 / 1e7, lng: obj.longitudeE7 / 1e7 };
    }
    // Compatibilidade com { lat: <num>, lng: <num> }
    if (typeof obj.lat === 'number' && typeof obj.lng === 'number') {
      return { lat: obj.lat, lng: obj.lng };
    }
    // Alguns caminhos podem ter { placeLocation: "-32..., -52..." } — caller should pass the string in that case
    return null;
  }

  // Aceita uma string com °, um objeto com latitudeE7, ou um objeto {lat,lng}
  function parsePossibleLatLng(value) {
    if (!value && value !== 0) return null;
    if (typeof value === 'string') return parseLatLngString(value);
    if (typeof value === 'object') return parseLatLngFromObject(value);
    return null;
  }

  // Extrai coordenada de um segmento de visit (seguindo o formato real do Google Timeline export)
  function extractVisitLatLng(seg) {
    if (!seg || !seg.visit) return null;
    const candidate = seg.visit.topCandidate || {};
    // Prefer explicit semanticType exclusion handled elsewhere
    // 1) candidate.placeLocation.latLng (string)
    if (candidate.placeLocation && typeof candidate.placeLocation === 'object') {
      if (typeof candidate.placeLocation.latLng === 'string') {
        const out = parseLatLngString(candidate.placeLocation.latLng);
        if (out) return out;
      }
      // Sometimes placeLocation itself could be a coordinate object
      const fromObj = parseLatLngFromObject(candidate.placeLocation);
      if (fromObj) return fromObj;
    }
    // 2) candidate.placeLocation could be a string directly
    if (typeof candidate.placeLocation === 'string') {
      const out = parseLatLngString(candidate.placeLocation);
      if (out) return out;
    }
    // 3) Older/alternate field names
    if (seg.visit.location) {
      const fromObj = parseLatLngFromObject(seg.visit.location);
      if (fromObj) return fromObj;
    }
    return null;
  }

  // Extrai coordenadas de atividade (start/end) quando o tipo indica veículo de passageiro
  function extractActivityLatLngs(seg) {
    if (!seg || !seg.activity) return { start: null, end: null };
    const candidate = seg.activity.topCandidate || {};
    const type = candidate.type || seg.activity.activityType;
    if (type !== 'IN_PASSENGER_VEHICLE') return { start: null, end: null };

    // Start: prefer seg.activity.start.latLng (string)
    let start = null;
    if (seg.activity.start) {
      if (typeof seg.activity.start.latLng === 'string') start = parseLatLngString(seg.activity.start.latLng);
      else {
        const sObj = parseLatLngFromObject(seg.activity.start);
        if (sObj) start = sObj;
      }
    }
    // Fallback for older shape
    if (!start && seg.activity.startLocation) {
      const sObj = parseLatLngFromObject(seg.activity.startLocation);
      if (sObj) start = sObj;
    }

    // End: prefer seg.activity.end.latLng (string)
    let end = null;
    if (seg.activity.end) {
      if (typeof seg.activity.end.latLng === 'string') end = parseLatLngString(seg.activity.end.latLng);
      else {
        const eObj = parseLatLngFromObject(seg.activity.end);
        if (eObj) end = eObj;
      }
    }
    if (!end && seg.activity.endLocation) {
      const eObj = parseLatLngFromObject(seg.activity.endLocation);
      if (eObj) end = eObj;
    }

    return { start, end };
  }

  function isVisitInferredHomeOrWork(seg) {
    if (!seg || !seg.visit) return false;
    const candidate = seg.visit.topCandidate || {};
    const semantic = candidate.semanticType || '';
    return semantic === 'INFERRED_HOME' || semantic === 'INFERRED_WORK';
  }

  exports.parseLatLngString = parseLatLngString;
  exports.parsePossibleLatLng = parsePossibleLatLng;
  exports.extractVisitLatLng = extractVisitLatLng;
  exports.extractActivityLatLngs = extractActivityLatLngs;
  exports.isVisitInferredHomeOrWork = isVisitInferredHomeOrWork;

})(typeof exports === 'undefined' ? (this.TimelineUtils = {}) : exports);
