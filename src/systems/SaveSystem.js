// SaveSystem — zapis i odczyt stanu gry do localStorage
//
// Podejście: pełna serializacja encji (star + planets) do JSON
//   → klucz: 'kosmos_save_v1'
//   → autosave co AUTOSAVE_INTERVAL lat gry (przez time:tick)
//   → statyczne metody (hasSave/loadData/clearSave) dostępne BEZ instancji
//     (używane przez BootScene przed startem GameScene)
//
// Eventy:
//   Słucha: 'game:save' → save(); 'game:new' → window.location.reload()
//   Emituje: 'game:saved' → { gameTime } (UIScene pokazuje "Zapisano" flash)

import EventBus     from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';

const SAVE_KEY           = 'kosmos_save_v1';
const AUTOSAVE_INTERVAL  = 10000;  // lat gry między autosave'ami

export class SaveSystem {
  constructor(star, timeSystem) {
    this.star        = star;
    this.timeSystem  = timeSystem;
    this._accumYears = 0;

    // Autosave przez czas gry
    EventBus.on('time:tick', ({ deltaYears }) => {
      this._accumYears += deltaYears;
      if (this._accumYears >= AUTOSAVE_INTERVAL) {
        this._accumYears = 0;
        this.save();
      }
    });

    // Ręczny zapis z UI
    EventBus.on('game:save', () => this.save());

    // Nowa gra — wyczyść save i przeładuj stronę
    EventBus.on('game:new', () => {
      SaveSystem.clearSave();
      window.location.reload();
    });
  }

  // ── Zapis ────────────────────────────────────────────────────
  save() {
    const planets = EntityManager.getByType('planet');
    const moons   = EntityManager.getByType('moon');
    const data = {
      version:  5,              // v5: multi-kolonia (ColonyManager)
      savedAt:  Date.now(),
      gameTime: this.timeSystem.gameTime,
      star:     this._serializeStar(this.star),
      planets:  planets.map(p => this._serializePlanet(p)),
      moons:    moons.map(m => this._serializeMoon(m)),
      civ4x:    this._serializeCiv4x(),
    };

    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      EventBus.emit('game:saved', { gameTime: data.gameTime });
    } catch (e) {
      // localStorage pełny lub niedostępny — ignoruj cicho
      console.warn('[SaveSystem] Nie można zapisać:', e.message);
    }
  }

  // Serializuj stan 4X (zasoby, cywilizacja, budynki, tryb)
  _serializeCiv4x() {
    if (!window.KOSMOS?.civMode) return null;  // 4X nie aktywny

    const tSys   = window.KOSMOS.techSystem;
    const eSys   = window.KOSMOS.expeditionSystem;
    const colMgr = window.KOSMOS.colonyManager;

    // Serializuj kolonie z ColonyManager (budynki per-kolonia już w colonies[].buildings)
    const coloniesData = colMgr?.serialize() ?? { colonies: [], activePlanetId: null };

    // Zbadane ciała niebieskie
    const exploredBodies = [];
    const TYPES = ['planet', 'moon', 'planetoid', 'asteroid', 'comet'];
    for (const t of TYPES) {
      const bodies = EntityManager.getByType(t);
      for (const b of bodies) {
        if (b.explored) exploredBodies.push(b.id);
      }
    }

    return {
      civMode:        true,
      homePlanetId:   window.KOSMOS.homePlanet?.id ?? null,
      // v5: kolonie (per-kolonia zasoby, populacja i budynki)
      colonies:        coloniesData.colonies,
      activePlanetId:  coloniesData.activePlanetId,
      tradeRoutes:     coloniesData.tradeRoutes ?? [],
      lastTradeYear:   coloniesData.lastTradeYear ?? 0,
      lastMigrationYear: coloniesData.lastMigrationYear ?? 0,
      // Globalne
      techs:          tSys?.serialize()    ?? null,
      expeditions:    eSys?.serialize()    ?? null,
      exploredBodies,
    };
  }

  _serializeStar(star) {
    return {
      id:           star.id,
      name:         star.name,
      spectralType: star.spectralType,
      mass:         star.physics.mass,
      luminosity:   star.luminosity,
      x:            star.x,
      y:            star.y,
    };
  }

  _serializePlanet(p) {
    return {
      // Tożsamość
      id:         p.id,
      name:       p.name,
      planetType: p.planetType,
      // Wiek
      age: p.age || 0,
      // Orbita
      a:                 p.orbital.a,
      e:                 p.orbital.e,
      T:                 p.orbital.T,
      M:                 p.orbital.M,
      inclinationOffset: p.orbital.inclinationOffset,
      // Fizyka
      mass:         p.physics.mass,
      visualRadius: p.visual.radius,
      albedo:       p.albedo,
      atmosphere:   p.atmosphere,
      // Wizualizacja
      color:     p.visual.color,
      glowColor: p.visual.glowColor,
      // Temperatura
      temperatureK: p.temperatureK,
      // Skład chemiczny
      composition: { ...(p.composition || {}) },
      // Życie
      lifeScore: p.lifeScore || 0,
      // Stabilność
      orbitalStability: p.orbitalStability || 1.0,
      // Powierzchnia
      surface: { ...(p.surface || {}) },
      // Eksploracja (Etap 14)
      explored: p.explored || false,
    };
  }

  _serializeMoon(m) {
    return {
      id:                m.id,
      name:              m.name,
      parentPlanetId:    m.parentPlanetId,
      moonType:          m.moonType || 'rocky',
      a:                 m.orbital.a,
      e:                 m.orbital.e,
      T:                 m.orbital.T,
      M:                 m.orbital.M,
      inclinationOffset: m.orbital.inclinationOffset,
      mass:              m.physics.mass,
      visualRadius:      m.visual.radius,
      color:             m.visual.color,
      age:               m.age || 0,
      explored:          m.explored || false,
    };
  }

  // ── Statyczne metody (bez instancji) ──────────────────────────

  // Sprawdź czy istnieje save; zwraca gameTime (liczba) lub null
  static hasSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.version || data.version < 1) return null;
      return typeof data.gameTime === 'number' ? data.gameTime : null;
    } catch {
      return null;
    }
  }

  // Wczytaj pełny obiekt save lub null
  static loadData() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // Usuń save z localStorage
  static clearSave() {
    localStorage.removeItem(SAVE_KEY);
  }
}
