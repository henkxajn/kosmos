// ColonyGridFactory — który rodzaj siatki dostaje NOWA kolonia (ARC COLONY SPHERE, krok CS-5a; D-CS-4 podwójna siatka).
//
// Reguła (CS-5a; od CS-7 żywa gra też pozwala na siatki geo — GameScene woła `setGeoGridsAllowed(true)`, bo okno
// kolonii rysuje kulę; o rodzaju siatki NOWEJ kolonii decyduje więc sama flaga i uprawnienie ciała):
//   • FEATURES.colonySphere OFF (default) → zawsze 'flat' (bit w bit jak dotąd).
//   • ON → 'geo' tylko gdy (a) środowisko pozwala na siatki geo — `setGeoGridsAllowed(true)` wołają headless GameCore,
//     narzędzia debug i (od CS-7) GameScene — oraz (b) ciało jest
//     uprawnione (planeta / księżyc / planetoida z archetypem i surfaceSeed; gaz zostaje płaski do CS-11).
//   • Stare kolonie (siatka już istnieje / wczytana z zapisu) nigdy nie zmieniają rodzaju.

import { GAME_CONFIG } from '../config/GameConfig.js';
import { geoGridSpecFor, generateGeoGrid } from './GeoColonyGridGenerator.js';
import { PlanetMapGenerator } from './PlanetMapGenerator.js';

let _geoAllowed = false;

/** Przełącznik środowiska: true w headless / debug i — od CS-7 — w żywej grze (GameScene). */
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

/**
 * Siatka NOWEJ kolonii / placówki (CS-5b): flaga OFF albo żywa gra → dokładnie dzisiejsze
 * `PlanetMapGenerator.generate(planet, isHome)`; ON + headless / debug + ciało uprawnione → siatka geodezyjna.
 * Ścieżki ODCZYTU zapisu i regeneracji starych kolonii NIE używają tej funkcji (podwójna siatka, D-CS-4).
 */
export function createColonyGrid(planet, isHome = false, opts = {}) {
  if (colonyGridKindFor(planet, opts) === 'geo') {
    const g = generateGeoGrid(planet, isHome);
    if (g) return g;
  }
  return PlanetMapGenerator.generate(planet, isHome);
}
