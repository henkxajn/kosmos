// hardpoints — plik hardpointów modelu po normalizacji: pomiar, obrót, SCALANIE (ARC COMBAT VISUALS, krok CV-1b; plan
// §2.11, §4 CV-1b „From CV-1a"). Czyste funkcje na dokumentach schematu v1 (`src/data/ShipHardpointsSchema.js`).
//
// REGUŁA SCALANIA („punkty kliknięte albo zmierzone wcześniej przeżywają"): dokument przeniesiony z wcześniejszego etapu
// TEGO SAMEGO modelu wygrywa we wszystkim, co opisuje model — `frame`, `nozzles`, `weapons`, `lights`, `keyColour`,
// `damagePoints`; normalizator dopisuje tylko `source` (nowy plik, jego sha256, wersja normalizatora, plik wejściowy).
// Źródła przeniesienia, w tej kolejności:
//   1. `hardpoints/incoming/<slot>.json` — model właściciela zmierzony / klikany przed podmianą slotu (CV-1a, Workshop CV-1c),
//      jeśli opisuje TEN plik wejściowy (sha256 albo ta sama liczba wierzchołków i trójkątów — np. ponownie eksportowana
//      tekstura); jego współrzędne żyją w przestrzeni znormalizowanej SUROWEGO pliku ⇒ obrót R normalizatora;
//   2. `hardpoints/<slot>.json` — wcześniejszy przebieg normalizatora na TYM SAMYM modelu (`source.input`): ponowna
//      normalizacja nie kasuje kliknięć z Workshopu (współrzędne już w przestrzeni wyjściowej — bez obrotu);
//   3. żadne — model nowy: dokument z pomiaru. Dokument STAREGO modelu slotu (inny plik) NIE jest scalany — jego punkty
//      leżą na innym kadłubie; trafia do archiwum razem ze starym GLB.

import { HARDPOINTS_SCHEMA, HARDPOINTS_VERSION, KEY_COLOUR_DEFAULTS } from '../../../src/data/ShipHardpointsSchema.js';
import { mul3v } from './geometry.mjs';

/** Identyfikator normalizatora w `source.normalizer` (zmiana reguł normalizacji = nowa wersja). */
export const NORMALIZER_ID = 'normalize-ship@1';
/** Identyfikator jednorazowego przebiegu po starych modelach (tylko tekstury; geometria i ramka bez zmian). */
export const LEGACY_PASS_ID = 'legacy-textures@1';

const r3 = (x) => Math.round(x * 1000) / 1000 + 0;
const rv = (v) => v.map(r3);
const clone = (o) => JSON.parse(JSON.stringify(o));

/**
 * Obrót wszystkich punktów i kierunków dokumentu o R (permutacja ze znakami — normalizator obraca tylko o wielokrotność 90°,
 * więc środek i skala przestrzeni znormalizowanej się nie zmieniają: p' = R·p).
 */
export function rotateHardpoints(doc, R) {
  const d = clone(doc);
  const rot = (v) => rv(mul3v(R, v));
  if (d.frame) d.frame = { bow: rot(d.frame.bow), up: rot(d.frame.up) };
  if (Array.isArray(d.nozzles)) d.nozzles = d.nozzles.map((n) => ({ ...n, p: rot(n.p), d: rot(n.d) }));
  if (Array.isArray(d.weapons)) d.weapons = d.weapons.map((w) => ({ ...w, p: rot(w.p), d: w.d ? rot(w.d) : null }));
  if (Array.isArray(d.lights)) d.lights = d.lights.map((l) => ({ ...l, p: rot(l.p) }));
  if (Array.isArray(d.damagePoints)) d.damagePoints = d.damagePoints.map(rot);
  return d;
}

/**
 * Dokument z pomiaru dla modelu po normalizacji (przestrzeń wyjściowa: dziób −X, góra +Y).
 * @param {{ slot: string, nozzle: { p:number[], d:number[], r:number }, keyMode: 'mask'|'none', notes?: string }} o
 */
export function measuredHardpoints({ slot, nozzle, keyMode = 'mask', notes = '' }) {
  return {
    schema: HARDPOINTS_SCHEMA, version: HARDPOINTS_VERSION, slot,
    source: { file: slot + '.glb', sha256: null, normalizer: NORMALIZER_ID },
    frame: { bow: [-1, 0, 0], up: [0, 1, 0] },
    nozzles: [{ p: rv(nozzle.p), d: rv(nozzle.d), r: r3(nozzle.r) }],
    weapons: [], lights: [],
    keyColour: { ...KEY_COLOUR_DEFAULTS, mode: keyMode },
    damagePoints: 'auto',
    notes,
  };
}

/**
 * Czy dokument opisuje TEN plik wejściowy. `ref` = { sha256, verts?, tris? } zapisany przy dokumencie; `input` = bieżący.
 * Ta sama treść pliku ⇒ tak; ta sama geometria (liczba wierzchołków i trójkątów) ⇒ tak (ponownie eksportowana tekstura).
 */
export function sameModel(ref, input) {
  if (!ref || !input) return false;
  if (ref.sha256 && input.sha256 && ref.sha256 === input.sha256) return true;
  return Number.isInteger(ref.verts) && Number.isInteger(ref.tris) && ref.verts === input.verts && ref.tris === input.tris;
}

/**
 * Wybór dokumentu do przeniesienia (reguła w nagłówku).
 * @param {{ incomingDoc: object|null, slotDoc: object|null, input: { sha256:string, verts:number, tris:number } }} o
 * @returns {{ from: 'incoming'|'slot'|null, doc: object|null, why: string }}
 */
export function pickCarried({ incomingDoc, slotDoc, input }) {
  if (incomingDoc && sameModel({ sha256: incomingDoc.source?.sha256, verts: incomingDoc.source?.input?.verts, tris: incomingDoc.source?.input?.tris }, input)) {
    return { from: 'incoming', doc: incomingDoc, why: 'hardpointy z incoming/ opisują ten plik' };
  }
  if (slotDoc && slotDoc.source?.input && sameModel(slotDoc.source.input, input)) {
    return { from: 'slot', doc: slotDoc, why: 'wcześniejsza normalizacja tego samego modelu' };
  }
  if (incomingDoc) return { from: null, doc: null, why: 'hardpointy z incoming/ były dla innego pliku — pomiar od nowa' };
  return { from: null, doc: null, why: slotDoc ? 'nowy model w slocie — pomiar od nowa (stary dokument w archiwum)' : 'brak wcześniejszego dokumentu — pomiar' };
}

/** Pola dokumentu, które opisują MODEL (przechodzą przy scalaniu). */
export const CARRIED_FIELDS = Object.freeze(['frame', 'nozzles', 'weapons', 'lights', 'keyColour', 'damagePoints']);

/**
 * Scalenie: dokument przeniesiony (już w przestrzeni wyjściowej) wygrywa we wszystkich polach modelu; z pomiaru zostaje
 * reszta. Wynik ma świeże `source` (ustawia `withSource`) i opis pochodzenia w `notes`.
 * @returns {{ doc: object, kept: string[] }}
 */
export function mergeHardpoints(measured, carried) {
  const doc = clone(measured);
  const kept = [];
  if (carried) {
    for (const k of CARRIED_FIELDS) {
      if (carried[k] !== undefined) { doc[k] = clone(carried[k]); kept.push(k); }
    }
  }
  return { doc, kept };
}

/** `source` po zapisie slotu: plik, sha256 wyjścia, normalizator, plik wejściowy (do rozpoznania tego samego modelu). */
export function withSource(doc, { file, sha256, normalizer = NORMALIZER_ID, input = null }) {
  const d = clone(doc);
  d.source = { file, sha256, normalizer };
  if (input) d.source.input = { file: input.file, sha256: input.sha256, verts: input.verts, tris: input.tris };
  return d;
}

/** Indeks `incoming/index.json` bez slotu (podmiana slotu zdejmuje wpis). */
export function removeFromIndex(index, slot) {
  const d = clone(index ?? { slots: [] });
  d.slots = (Array.isArray(d.slots) ? d.slots : []).filter((s) => s !== slot);
  return d;
}

/** JSON dokumentu w formacie plików CV-1a (wcięcie 2, wektory w jednej linii, LF, znak nowej linii na końcu). */
export function formatHardpointsJson(doc) {
  const txt = JSON.stringify(doc, null, 2);
  // [\n  -1,\n  0,\n  0\n] → [-1, 0, 0] — tablice liczb w jednej linii (czytelność, mniejszy diff)
  const flat = txt.replace(/\[\s+(-?[\d.e+-]+(?:,\s+-?[\d.e+-]+)*)\s+\]/g, (_, inner) => '[' + inner.split(/,\s+/).join(', ') + ']');
  // [[1, 0, 0],\n [0, 1, 0], …] — macierz (tablica krótkich tablic liczb) też w jednej linii
  return flat.replace(/\[\s+(\[[^[\]\n]*\](?:,\s+\[[^[\]\n]*\])*)\s+\]/g, (_, inner) => '[' + inner.split(/,\s+(?=\[)/).join(', ') + ']') + '\n';
}
