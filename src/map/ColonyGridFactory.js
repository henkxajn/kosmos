// ColonyGridFactory — który rodzaj siatki dostaje NOWA kolonia (ARC COLONY SPHERE, krok CS-5a; D-CS-4 podwójna siatka).
//
// Reguła przejściowa do CS-7 (decyzja konserwatywna, zapisana w arkuszu kontaktowym CS-5a):
//   • FEATURES.colonySphere OFF (default) → zawsze 'flat' (bit w bit jak dotąd).
//   • ON → 'geo' tylko gdy (a) środowisko pozwala na siatki geo — `setGeoGridsAllowed(true)` woła WYŁĄCZNIE headless
//     GameCore / narzędzia debug, bo żywy 2D ColonyOverlay nie umie narysować kuli przed CS-7 — oraz (b) ciało jest
//     uprawnione (planeta / księżyc / planetoida z archetypem i surfaceSeed; gaz zostaje płaski do CS-11).
//   • Stare kolonie (siatka już istnieje / wczytana z zapisu) nigdy nie zmieniają rodzaju.

import { GAME_CONFIG } from '../config/GameConfig.js';
import { geoGridSpecFor } from './GeoColonyGridGenerator.js';

let _geoAllowed = false;

/** Przełącznik środowiska: true tylko w headless / debug (żywa gra: false do CS-7). */
export function setGeoGridsAllowed(on) { _geoAllowed = on === true; }
export function geoGridsAllowed() { return _geoAllowed; }

/**
 * Rodzaj siatki nowej kolonii na ciele.
 * @returns {'flat'|'geo'}
 */
export function colonyGridKindFor(body, { flag = GAME_CONFIG.FEATURES.colonySphere === true, allowed = _geoAllowed } = {}) {
  if (!flag || !allowed) return 'flat';
  return geoGridSpecFor(body) ? 'geo' : 'flat';
}
