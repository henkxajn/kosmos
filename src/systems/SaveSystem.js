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
import { CURRENT_VERSION, MIN_SUPPORTED_VERSION, pruneMigrationBackups } from './SaveMigration.js';

const SAVE_KEY           = 'kosmos_save_v1';
const PREIMPORT_BACKUP_KEY = 'kosmos_save_backup_preimport';
const DEFAULT_AUTOSAVE   = 1;  // lat gry między autosave'ami (domyślnie co rok)
const AUTOSAVE_INTERVALS = { off: 0, month: 1 / 12, year: 1, '10y': 10 };

// Zapis do localStorage bez rzucania — zwraca czy się udał (quota / prywatny tryb).
function _trySetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

export class SaveSystem {
  constructor(star, timeSystem) {
    this.star        = star;
    this.timeSystem  = timeSystem;
    this._accumYears = 0;

    // Wczytaj interwał autozapisu z localStorage (BottomBar emituje event za wcześnie)
    let savedInterval = DEFAULT_AUTOSAVE;
    try {
      const stored = localStorage.getItem('kosmos_autosave_interval');
      if (stored && stored in AUTOSAVE_INTERVALS) savedInterval = AUTOSAVE_INTERVALS[stored];
    } catch (e) { /* cicho */ }
    this._autosaveInterval = savedInterval; // 0 = wyłączony

    // Autosave przez czas gry (interwał konfigurowalny z menu)
    EventBus.on('time:tick', ({ deltaYears }) => {
      if (this._autosaveInterval <= 0) return; // wyłączony
      this._accumYears += deltaYears;
      if (this._accumYears >= this._autosaveInterval) {
        this._accumYears = 0;
        this.save();
      }
    });

    // Zmiana interwału autozapisu z menu
    EventBus.on('autosave:intervalChanged', ({ interval }) => {
      this._autosaveInterval = interval;
      this._accumYears = 0; // reset akumulatora
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
    // Cały blok w try/catch — wczesniej tylko stringify+setItem byly chronione,
    // wiec jakikolwiek wyjatek w serializatorze (null deref, nowe pole bez ?.)
    // zabijal save() po cichu bez toastu. Teraz kazdy blad konczy sie eventem.
    try {
      const allStars   = EntityManager.getByType('star');
      const planets    = EntityManager.getByType('planet');
      const moons      = EntityManager.getByType('moon');
      const planetoids = EntityManager.getByType('planetoid');
      const data = {
        version:    CURRENT_VERSION,
        savedAt:    Date.now(),
        gameTime:   this.timeSystem.gameTime,
        scenario:   window.KOSMOS?.scenario ?? 'civilization',
        star:       this._serializeStar(this.star),
        // Dodatkowe gwiazdy (inne układy) — serializowane osobno
        stars:      allStars.length > 1
          ? allStars.filter(s => s.id !== this.star.id).map(s => this._serializeStar(s))
          : [],
        planets:    planets.map(p => this._serializePlanet(p)),
        moons:      moons.map(m => this._serializeMoon(m)),
        planetoids: planetoids.map(p => this._serializePlanetoid(p)),
        civ4x:      this._serializeCiv4x(),
        // M4 P2 — uiPrefs persistowane w save (np. radar overlay, minimap)
        uiPrefs:    window.KOSMOS?.uiPrefs ? { ...window.KOSMOS.uiPrefs } : {},
      };

      const json = JSON.stringify(data);

      // Self-healing przy quocie: backupy migracji to zero czytelników w grze, a każdy waży
      // tyle co cały zapis — poświęcamy je, zanim ogłosimy graczowi porażkę. Bardzo często
      // to wystarcza i gracz nawet nie zauważy problemu.
      if (!_trySetItem(SAVE_KEY, json)) {
        const removed = pruneMigrationBackups();
        if (removed > 0) console.warn(`[SaveSystem] Brak miejsca — zwolniono ${removed} backup(ów) migracji, ponawiam zapis`);
        if (!_trySetItem(SAVE_KEY, json)) {
          console.error('[SaveSystem] Save padl: brak miejsca w localStorage (po sprzataniu backupow)');
          EventBus.emit('game:saveFailed', {
            reason:  'quota',
            message: `Zapis ${(json.length / 1024 / 1024).toFixed(2)} MB nie miesci sie w pamieci przegladarki`,
            stack:   null,
          });
          return;
        }
      }

      // Proaktywne ostrzezenie gdy rozmiar zbliza sie do quota.
      // UWAGA: json.length to ZNAKI, nie bajty — localStorage liczy quote w UTF-16 (2 B/znak),
      // wiec realny sufit to ~5.2 mln znakow (10 MiB). Prog 3.5 = ~67% sufitu.
      const sizeMB = json.length / 1024 / 1024;
      if (sizeMB > 3.5) {
        EventBus.emit('game:saveLargeWarning', { sizeMB });
      }
      EventBus.emit('game:saved', { gameTime: data.gameTime, sizeBytes: json.length });
    } catch (e) {
      // Zapis slotu idzie przez _trySetItem (nie rzuca), wiec tu trafiaja przede wszystkim
      // bledy serializacji (null deref, circular ref). Klasyfikacja quota zostaje jako
      // zabezpieczenie, gdyby rzucila inna operacja storage.
      const isQuota = e?.name === 'QuotaExceededError' || /quota|storage/i.test(e?.message ?? '');
      const isSerialization = !isQuota; // wszystko inne to wewnetrzny blad serializatora
      console.error('[SaveSystem] Save padl:', e);
      if (e?.stack) console.error(e.stack);
      EventBus.emit('game:saveFailed', {
        reason: isQuota ? 'quota' : (isSerialization ? 'serialization' : 'unknown'),
        message: e?.message ?? 'Nieznany blad zapisu',
        stack: e?.stack ?? null,
      });
    }
  }

  // Serializuj stan 4X (zasoby, cywilizacja, budynki, tryb)
  _serializeCiv4x() {
    if (!window.KOSMOS?.civMode) return null;  // 4X nie aktywny

    const tSys   = window.KOSMOS.techSystem;
    const eSys   = window.KOSMOS.expeditionSystem;
    const vMgr   = window.KOSMOS.vesselManager;
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
      civName:        window.KOSMOS.civName ?? null,
      // v5: kolonie (per-kolonia zasoby, populacja i budynki)
      colonies:        coloniesData.colonies,
      activePlanetId:  coloniesData.activePlanetId,
      tradeRoutes:     coloniesData.tradeRoutes ?? [],
      lastTradeYear:   coloniesData.lastTradeYear ?? 0,
      lastMigrationYear: coloniesData.lastMigrationYear ?? 0,
      // Globalne
      techs:          tSys?.serialize()    ?? null,
      researchSystem: window.KOSMOS?.researchSystem?.serialize() ?? null,
      expeditions:    eSys?.serialize()    ?? null,
      vesselManager:  vMgr?.serialize()    ?? null,
      deepSpaceEngagements: window.KOSMOS?.deepSpaceCombatSystem?.serialize() ?? {},
      tradeLog:       window.KOSMOS?.tradeLog?.serialize() ?? null,
      economyHistory: window.KOSMOS?.economyHistoryLog?.serialize() ?? null,
      discoverySystem: window.KOSMOS?.discoverySystem?.serialize() ?? null,
      randomEventSystem: window.KOSMOS?.randomEventSystem?.serialize() ?? null,
      observatorySystem: window.KOSMOS?.observatorySystem?.serialize() ?? null,
      orbitalSpace:      window.KOSMOS?.orbitalSpaceSystem?.serialize() ?? null,
      stationSystem:     window.KOSMOS?.stationSystem?.serialize() ?? null,
      eventLog:          window.KOSMOS?.eventLogSystem?.serialize() ?? null,
      collisionForecast: window.KOSMOS?.collisionForecast?.serialize() ?? null,
      groundUnitManager: window.KOSMOS?.groundUnitManager?.serialize() ?? null,
      armySystem:        window.KOSMOS?.armySystem?.serialize() ?? null,
      anomalyEffectSystem: window.KOSMOS?.anomalyEffectSystem?.serialize() ?? null,
      leaderSystem: window.KOSMOS?.leaderSystem?.serialize() ?? null,
      factionSystem: window.KOSMOS?.factionSystem?.serialize() ?? null,
      dysonSystem: window.KOSMOS?.dysonSystem?.serialize() ?? null,
      autoPause: window.KOSMOS?.autoPauseSystem?.serialize() ?? null,
      scheduledEventSystem: window.KOSMOS?.scheduledEventSystem?.serialize() ?? null,
      exploredBodies,
      unitDesigns: window.KOSMOS?.unitDesigns ?? [],
      galaxyData: window.KOSMOS.galaxyData ?? null,
      activeSystemId: window.KOSMOS.activeSystemId ?? 'sys_home',
      starSystemManager: window.KOSMOS.starSystemManager?.serialize() ?? null,
      // Faza 0: reactive store dla NOWYCH domen (empires/intel/diplomacy/wars/battles/invasions)
      gameState: window.KOSMOS.gameState?.serialize() ?? null,
      // #2 (Slice 2 save/restore AI): per-empire aiTech researched (map empireId→[techId])
      //   + EmpireStrategySystem blacklist. Re-link ownerEmpireId/aiTech robi GameScene po
      //   restore (z emp.colonies). ColonyManager.serialize BEZ zmian (oba derived).
      empireTech:     this._serializeEmpireTech(),
      empireStrategy: window.KOSMOS?.empireStrategySystem?.serialize() ?? null,
      productionRequestBoard: window.KOSMOS.productionRequestBoard?.serialize() ?? null,
      notificationCenter: window.KOSMOS.notificationCenter?.serialize() ?? null,
      // Player Fleet Groups (save v73) — { fleets[], nextId }. FleetSystem
      // zawsze instancjowany, więc serialize() bezwarunkowo.
      playerFleets: window.KOSMOS.fleetSystem?.serialize() ?? null,
    };
  }

  // #2: snapshot per-empire aiTech (researched[]). Anchor stolicy przez
  //   EmpireColonyBootstrap._findEmpireTechSystem (pomija outposty). Pomija imperia
  //   bez researched (re-link i tak fallbackuje na archetype.startingTechs).
  _serializeEmpireTech() {
    const reg = window.KOSMOS?.empireRegistry;
    const ecb = window.KOSMOS?.empireColonyBootstrap;
    const out = {};
    if (!reg?.listAll || !ecb?._findEmpireTechSystem) return out;
    for (const emp of reg.listAll()) {
      const ts = ecb._findEmpireTechSystem(emp.id);
      const researched = ts?.serialize?.().researched;
      if (Array.isArray(researched) && researched.length > 0) out[emp.id] = researched;
    }
    return out;
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
      systemId:     star.systemId ?? 'sys_home',
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
      // Temperatura + fizyka powierzchniowa
      temperatureK: p.temperatureK,
      temperatureC: p.temperatureC,
      surfaceRadius:  p.surfaceRadius,
      surfaceGravity: p.surfaceGravity,
      // Skład chemiczny
      composition: { ...(p.composition || {}) },
      // Życie
      lifeScore: p.lifeScore || 0,
      // Stabilność
      orbitalStability: p.orbitalStability || 1.0,
      // Powierzchnia
      surface: { ...(p.surface || {}) },
      // Eksploracja (Etap 14) — explored=zgrubny (obserwatorium/statek), analyzed=szczegółowy (statek)
      explored: p.explored || false,
      analyzed: p.analyzed || false,
      // Układ gwiezdny (Etap 40)
      systemId: p.systemId ?? 'sys_home',
      // Złoża (Etap 26 — gospodarka)
      deposits: p.deposits ? p.deposits.map(d => ({
        resourceId: d.resourceId, richness: d.richness,
        totalAmount: d.totalAmount, remaining: d.remaining,
      })) : [],
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
      analyzed:          m.analyzed || false,
      composition:       m.composition || null,
      temperatureK:      m.temperatureK || null,
      temperatureC:      m.temperatureC ?? null,
      surfaceRadius:     m.surfaceRadius ?? null,
      surfaceGravity:    m.surfaceGravity ?? null,
      atmosphere:        m.atmosphere || 'none',
      systemId:          m.systemId ?? 'sys_home',
      deposits: m.deposits ? m.deposits.map(d => ({
        resourceId: d.resourceId, richness: d.richness,
        totalAmount: d.totalAmount, remaining: d.remaining,
      })) : [],
    };
  }

  _serializePlanetoid(p) {
    return {
      id:                p.id,
      name:              p.name,
      planetoidType:     p.planetoidType || 'silicate',
      a:                 p.orbital.a,
      e:                 p.orbital.e,
      T:                 p.orbital.T,
      M:                 p.orbital.M,
      inclinationOffset: p.orbital.inclinationOffset,
      mass:              p.physics.mass,
      visualRadius:      p.visual.radius,
      color:             p.visual.color,
      temperatureK:      p.temperatureK ?? null,
      temperatureC:      p.temperatureC ?? null,
      surfaceRadius:     p.surfaceRadius ?? null,
      surfaceGravity:    p.surfaceGravity ?? null,
      composition:       { ...(p.composition || {}) },
      explored:          p.explored || false,
      analyzed:          p.analyzed || false,
      systemId:          p.systemId ?? 'sys_home',
      deposits: p.deposits ? p.deposits.map(d => ({
        resourceId: d.resourceId, richness: d.richness,
        totalAmount: d.totalAmount, remaining: d.remaining,
      })) : [],
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

  /**
   * Eksport surowego save'a (backup przed bumpem wersji). Zwraca string JSON z localStorage
   * lub null gdy brak zapisu. Enkapsuluje SAVE_KEY (prywatny w module).
   * @returns {string|null}
   */
  static exportSave() {
    return localStorage.getItem(SAVE_KEY);
  }

  /**
   * Import save'a z backupu/pliku (string JSON lub obiekt). Waliduje parsowalność, pole version
   * ORAZ jego zakres, potem nadpisuje slot. NIE przeładowuje gry — wywołujący decyduje
   * (reload → migracja+restore).
   *
   * Bramka zakresu jest tu, a nie w migracji, celowo: migrate() odrzuca future_version/too_old
   * ZANIM zdąży zrobić backup, a wywołujący na ścieżce błędu robi clearSave() — czyli plik spoza
   * zakresu wpuszczony do slotu kasowałby i import, i poprzedni zapis gracza, bez śladu.
   * Odrzucenie przed setItem() sprawia, że slot pozostaje nietknięty.
   * Nazwy reason lustrzane do kodów błędu migrate().
   *
   * @param {string|object} json
   * @returns {{ok:boolean, version?:number, reason?:string}}
   */
  static importSave(json) {
    let obj;
    try {
      obj = typeof json === 'string' ? JSON.parse(json) : json;
    } catch {
      return { ok: false, reason: 'parse_error' };
    }
    if (!obj || typeof obj !== 'object') return { ok: false, reason: 'not_object' };
    if (typeof obj.version !== 'number' || obj.version < 1) return { ok: false, reason: 'no_version' };
    if (obj.version > CURRENT_VERSION)       return { ok: false, reason: 'future_version' };
    if (obj.version < MIN_SUPPORTED_VERSION) return { ok: false, reason: 'too_old' };

    // Poprzedni stan trzymamy w PAMIĘCI, nie w localStorage — kopia zapisana przed importem
    // kradłaby miejsce potrzebne na sam import. Chromium sprawdza quotę tylko gdy element
    // ROŚNIE, więc podmiana slotu na porównywalny save przechodzi — o ile nikt nie zjadł
    // headroomu tuż przed nią.
    const prev    = localStorage.getItem(SAVE_KEY);
    const payload = JSON.stringify(obj);

    // Backupy migracji: zero czytelników, a każdy waży tyle co cały save. Import i tak kasuje
    // oś czasu, do której należą.
    pruneMigrationBackups();

    if (!_trySetItem(SAVE_KEY, payload)) {
      // Quota — zwolnij wszystko, co da się poświęcić, i spróbuj ostatni raz.
      try { localStorage.removeItem(PREIMPORT_BACKUP_KEY); } catch { /* nieistotne */ }
      if (!_trySetItem(SAVE_KEY, payload)) {
        // setItem jest atomowy — nieudany zapis nie rusza slotu, poprzedni save żyje.
        return { ok: false, reason: 'write_error' };
      }
    }

    // Import się udał → kopia poprzedniego stanu to LUKSUS. Zapisywana po fakcie, więc nigdy
    // nie może zablokować importu; przy dużych save'ach po prostu się nie zmieści (dwie kopie
    // przekraczają quotę fizycznie). Nieudany zapis czyści nieaktualny klucz z poprzedniej sesji,
    // żeby nie udawał kopii tego importu.
    if (prev && !_trySetItem(PREIMPORT_BACKUP_KEY, prev)) {
      try { localStorage.removeItem(PREIMPORT_BACKUP_KEY); } catch { /* nieistotne */ }
      console.warn('[SaveSystem] kopia przedimportowa się nie zmieściła — import wykonany bez niej');
    }
    return { ok: true, version: obj.version };
  }
}
