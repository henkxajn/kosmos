// CollisionForecast — prognoza kolizji ciał niebieskich
//
// Obserwatorium symuluje orbity w przód (KeplerMath) i wykrywa
// potencjalne kolizje. Obliczenia rozkładane na wiele klatek.
//
// Komunikacja:
//   Nasłuchuje: 'time:tick' { civDeltaYears }
//   Emituje:    'observatory:collisionAlert' { bodyA, bodyB, yearsUntil, margin, isPlayerColony }
//               'observatory:alertCleared'   { alertId }

import EventBus      from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { KeplerMath }  from '../utils/KeplerMath.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { t }           from '../i18n/i18n.js';
import { playerBodyIds } from '../utils/ColonyOwnership.js';

// Horyzont prognozy per level obserwatorium (lata gry) — idx = poziom (Lv6 dodany)
const HORIZON_BY_LEVEL = [0, 50, 100, 200, 350, 500, 700];
// Przeliczanie co N civYears per level (Lv6 dodany)
const RECALC_BY_LEVEL  = [0, 10, 8, 5, 3, 2, 1];
// Krok symulacji (lata gry)
const SIM_STEP = 0.1;
// Ile kroków obliczyć per tick (rozkład na klatki)
const STEPS_PER_TICK = 200;
// Próg kolizji: suma promieni w AU × mnożnik
const COLLISION_THRESHOLD_MULT = 0.65;
// Margines błędu prognozy (±%)
const MARGIN_PERCENT = 10;

// Próg auto-slow: zagrożenie bliższe niż tyle lat gry dodatkowo ZWALNIA czas (poza dzwonkiem).
// ⚠ NIE jest to nowa magiczna liczba — to `HORIZON_BY_LEVEL[1]`, czyli zasięg NAJPROSTSZEGO
//   obserwatorium (Lv1): „zagrożenie jest tak blisko, że widziałoby je nawet pierwsze
//   obserwatorium, jakie gracz kiedykolwiek zbudował". Druga, niezależna derywacja trafia w tę
//   samą wartość: przy 50 latach własny margines prognozy (`MARGIN_PERCENT`) schodzi do ±5 lat,
//   więc „kiedy" zaczyna być informacją, a nie przedziałem.
// ⚠ Progu NIE da się uzasadnić wiarygodnością detekcji — ZMIERZONE: powtarzalność wykrycia jest
//   PŁASKA (100 % przy 23, 155, 434, 452, 465, 585 i 601 latach, 40 przeliczeń), bo
//   `updateMeanAnomaly` to analityczna propagacja Keplera, bez błędu narastającego z liczbą
//   kroków. Podstawą jest budżet przerwań: przy 50 latach auto-slow dotyka ~7 % zagrożeń.
export const COLLISION_AUTOSLOW_YEARS = 50;   // === HORIZON_BY_LEVEL[1]

// Typy ciał uwzględniane w prognozie
const FORECAST_TYPES = ['planet', 'moon', 'planetoid'];

export class CollisionForecast {
  constructor() {
    // Aktywne alerty: Map<alertId, { bodyA, bodyB, yearsUntil, margin, detectedYear }>
    this._alerts = new Map();

    // Stan symulacji inkrementalnej
    this._simState = null;  // { bodies, step, maxSteps, starMass }
    this._recalcAccum = 0;
    this._nextAlertId = 1;

    // Rok gry
    this._gameYear = 0;

    EventBus.on('time:tick', ({ civDeltaYears }) => {
      if (!window.KOSMOS?.civMode) return;
      this._tick(civDeltaYears);
    });
    EventBus.on('time:display', ({ gameTime }) => { this._gameYear = gameTime; });
  }

  // ── API publiczne ─────────────────────────────────────────────────────

  getAlerts() {
    return [...this._alerts.values()];
  }

  // Czy jest alert dotyczący planety gracza
  hasHomePlanetAlert() {
    const homeId = window.KOSMOS?.homePlanet?.id;
    if (!homeId) return false;
    for (const a of this._alerts.values()) {
      if (a.bodyAId === homeId || a.bodyBId === homeId) return true;
    }
    return false;
  }

  // ── Tick ───────────────────────────────────────────────────────────────

  _tick(civDeltaYears) {
    const obsLevel = window.KOSMOS?.observatorySystem?.getMaxObservatoryLevel() ?? 0;
    if (obsLevel <= 0) return;

    const recalcInterval = RECALC_BY_LEVEL[Math.min(obsLevel, RECALC_BY_LEVEL.length - 1)];
    this._recalcAccum += civDeltaYears;

    // Kontynuuj inkrementalną symulację jeśli trwa
    if (this._simState) {
      this._continueSimulation();
      return;
    }

    // Rozpocznij nową symulację co recalcInterval
    if (this._recalcAccum >= recalcInterval) {
      this._recalcAccum -= recalcInterval;
      this._startSimulation(obsLevel);
    }
  }

  // ── Symulacja inkrementalna ───────────────────────────────────────────

  _startSimulation(obsLevel) {
    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    const star = EntityManager.getByTypeInSystem('star', sysId)?.[0];
    this._scanSystemId = sysId;   // Finding 190 — czyszczenie musi znać ZAKRES skanu
    if (!star) return;

    const horizon = HORIZON_BY_LEVEL[Math.min(obsLevel, HORIZON_BY_LEVEL.length - 1)];
    const maxSteps = Math.floor(horizon / SIM_STEP);

    // Zbierz ciała z bieżącymi danymi orbitalnymi (snapshot)
    // Księżyce: ich orbital.a to odległość od planety-rodzica, nie od gwiazdy.
    // Nie da się ich porównać z planetami/planetoidami bez konwersji,
    // a kolizje księżyc–księżyc różnych planet nie mają fizycznego sensu
    // → pomijamy typ 'moon' w prognozie kolizji.
    const bodies = [];
    for (const type of FORECAST_TYPES) {
      if (type === 'moon') continue;  // orbita wokół planety, nie gwiazdy
      for (const body of EntityManager.getByTypeInSystem(type, sysId)) {
        if (!body.orbital) continue;
        bodies.push({
          id:     body.id,
          name:   body.name ?? body.id,
          type:   body.type,
          a:      body.orbital.a,
          e:      body.orbital.e,
          T:      body.orbital.T,
          M:      body.orbital.M,     // bieżąca anomalia średnia
          omega:  body.orbital.inclinationOffset ?? 0,
          radius: (body.visual?.radius ?? 3) / GAME_CONFIG.AU_TO_PX,  // px → AU
        });
      }
    }

    if (bodies.length < 2) return;

    // Filtr: pary z potencjalnie krzyżującymi się orbitami
    // (peryhelium jednego < aphelium drugiego i odwrotnie)
    const pairs = [];
    for (let i = 0; i < bodies.length; i++) {
      const bi = bodies[i];
      const periI = bi.a * (1 - bi.e);
      const apoI  = bi.a * (1 + bi.e);
      for (let j = i + 1; j < bodies.length; j++) {
        const bj = bodies[j];
        const periJ = bj.a * (1 - bj.e);
        const apoJ  = bj.a * (1 + bj.e);
        // Orbity mogą się krzyżować?
        if (periI <= apoJ + 0.5 && periJ <= apoI + 0.5) {
          pairs.push([i, j]);
        }
      }
    }

    if (pairs.length === 0) return;

    this._simState = {
      systemId: sysId,
      bodies,
      pairs,
      step: 0,
      maxSteps,
      starMass: star.physics?.mass ?? 1.0,
      foundCollisions: [],
    };
  }

  _continueSimulation() {
    const s = this._simState;
    if (!s) return;

    const endStep = Math.min(s.step + STEPS_PER_TICK, s.maxSteps);

    for (let step = s.step; step < endStep; step++) {
      const dt = step * SIM_STEP;

      // Oblicz pozycje wszystkich ciał w czasie t + dt
      for (const b of s.bodies) {
        const futureM = KeplerMath.updateMeanAnomaly(b.M, dt, b.T);
        const E = KeplerMath.solveKepler(futureM, b.e);
        const theta = KeplerMath.eccentricToTrueAnomaly(E, b.e);
        const r = KeplerMath.orbitalRadius(b.a, b.e, theta);
        const angle = theta + b.omega;
        b._x = r * Math.cos(angle);  // AU
        b._y = r * Math.sin(angle);  // AU
      }

      // Sprawdź pary
      for (const [i, j] of s.pairs) {
        const bi = s.bodies[i];
        const bj = s.bodies[j];
        const dx = bi._x - bj._x;
        const dy = bi._y - bj._y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const threshold = (bi.radius + bj.radius) * COLLISION_THRESHOLD_MULT;

        if (dist < threshold) {
          // Znaleziono kolizję — dodaj jeśli nie ma już alertu dla tej pary
          const pairKey = bi.id < bj.id ? `${bi.id}_${bj.id}` : `${bj.id}_${bi.id}`;
          if (!s.foundCollisions.some(c => c.pairKey === pairKey)) {
            s.foundCollisions.push({
              pairKey,
              bodyA: bi,
              bodyB: bj,
              yearsUntil: dt,
            });
          }
        }
      }
    }

    s.step = endStep;

    // Symulacja zakończona
    if (s.step >= s.maxSteps) {
      this._finalizeSimulation();
    }
  }

  _finalizeSimulation() {
    const s = this._simState;
    if (!s) return;

    // ⚠ Finding 190 (druga połowa) — CZYŚCIMY TYLKO ALERTY Z PRZESKANOWANEGO UKŁADU.
    //   Skan jest kluczowany na `activeSystemId` (Finding 191, który jest tu WARUNKIEM
    //   KONIECZNYM, nie tematem obok), a mapa `_alerts` jest wspólna dla całej gry — więc
    //   `new Set(this._alerts.keys())` kasowało alerty WSZYSTKICH układów przy każdym skanie.
    //   Powrót do poprzedniego układu tworzył je od nowa z NOWYM id, więc `existingId` był null,
    //   dedup nie trafiał i gracz dostawał kolejny alarm.
    //   ZMIERZONE sondą: trzy skany pod rząd w jednym układzie = 0 skasowanych; jedno
    //   przełączenie widoku tam i z powrotem = +15 skasowanych i +15 alarmów.
    const scanSysId = s.systemId ?? this._scanSystemId ?? null;
    const oldAlertIds = new Set(
      [...this._alerts.entries()]
        .filter(([, a]) => a.systemId === scanSysId)
        .map(([id]) => id)
    );

    for (const col of s.foundCollisions) {
      // Sprawdź czy alert już istnieje dla tej pary
      let existingId = null;
      for (const [id, a] of this._alerts) {
        const aKey = a.bodyAId < a.bodyBId ? `${a.bodyAId}_${a.bodyBId}` : `${a.bodyBId}_${a.bodyAId}`;
        if (aKey === col.pairKey) { existingId = id; break; }
      }

      const margin = Math.ceil(col.yearsUntil * MARGIN_PERCENT / 100);
      const alert = {
        id:           existingId ?? this._nextAlertId++,
        bodyAId:      col.bodyA.id,
        bodyAName:    col.bodyA.name,
        bodyBId:      col.bodyB.id,
        bodyBName:    col.bodyB.name,
        yearsUntil:   col.yearsUntil,
        margin,
        systemId:     scanSysId,   // Finding 190 — zakres czyszczenia
        detectedYear: this._gameYear,
      };

      this._alerts.set(alert.id, alert);
      if (existingId) oldAlertIds.delete(existingId);

      // Czy kolizja dotyczy KTÓREJKOLWIEK kolonii gracza (Finding 87).
      // ⚠ Poprzednia wersja bramkowała się na `colMgr.colonies`, którego ColonyManager NIE MA,
      //   więc pętla nie wykonała się ani razu i do zbioru trafiał wyłącznie `homePlanet.id`
      //   ⇒ kolizja grożąca koloni innej niż macierzysta NIE pauzowała gry.
      const playerPlanetIds = playerBodyIds();
      const hitsPlayerColony = playerPlanetIds.has(col.bodyA.id) || playerPlanetIds.has(col.bodyB.id);

      // ⚠ Finding 190 — EMIT TYLKO DLA NOWEGO ALERTU. Poprzednio emitowaliśmy „nowy LUB
      //   ZAKTUALIZOWANY", a jedyny konsument (`GameScene:2638`) na każdym emicie z
      //   `isPlayerColony` robi `timeSystem.pause()`. Przeliczenie wraca co
      //   `RECALC_BY_LEVEL` = 10/8/5/3/2/1 civYears wg poziomu obserwatorium, a 1 civYear to
      //   JEDEN wyświetlany miesiąc ⇒ trwałe zagrożenie pauzowało grę co miesiąc-dwa, bez końca.
      // ⚠ Defekt jest PRE-EXISTING, ale widoczny stał się dopiero z naprawą 87: wcześniej zbiór
      //   zawierał wyłącznie `homePlanet.id`, więc powtarzalna pauza wymagała kolizji z samą
      //   stolicą. Naprawa 87 bez tej linii dowoziłaby regresję rozgrywki razem z funkcją —
      //   dokładnie ten sam układ co bramka przylotu w W3-5b.
      // ⚠ Rekord w `_alerts` jest NADAL odświeżany wyżej, więc lista w ObservatoryOverlay
      //   (`getAlerts()`) pokazuje aktualne `yearsUntil` — nie gubimy informacji, gasimy pauzę.
      //   Świadomie NIE alertujemy ponownie przy skróceniu prognozy (np. 200 → 20 lat): to byłby
      //   nowy PRÓG do zaprojektowania, a nie usunięcie pętli pauzy.
      if (existingId) continue;

      EventBus.emit('observatory:collisionAlert', {
        bodyA:      col.bodyA,
        bodyB:      col.bodyB,
        yearsUntil: col.yearsUntil,
        margin,
        // Nazwa mówi teraz prawdę: zbiór ZAWSZE obejmował wszystkie kolonie gracza, nie samą
        // macierzystą — komentarz u jedynego konsumenta (`GameScene`) pisał to wprost.
        isPlayerColony: hitsPlayerColony,
      });
    }

    // Usuń alerty których prognoza się nie potwierdziła
    for (const id of oldAlertIds) {
      this._alerts.delete(id);
      EventBus.emit('observatory:alertCleared', { alertId: id });
    }

    this._simState = null;
  }

  // ── Serializacja ──────────────────────────────────────────────────────

  serialize() {
    const alerts = [];
    this._alerts.forEach(a => alerts.push({ ...a }));
    return {
      alerts,
      recalcAccum: this._recalcAccum,
      nextAlertId: this._nextAlertId,
    };
  }

  restore(data) {
    if (!data) return;
    this._recalcAccum = data.recalcAccum ?? 0;
    this._nextAlertId = data.nextAlertId ?? 1;
    // Zbuduj zbiór ID księżyców, aby odfiltrować stare fałszywe alerty
    const moonIds = new Set();
    for (const m of EntityManager.getByType('moon')) moonIds.add(m.id);
    if (Array.isArray(data.alerts)) {
      for (const a of data.alerts) {
        // Filtruj stare alerty dotyczące księżyców (fałszywe — orbita wokół planety, nie gwiazdy)
        if (moonIds.has(a.bodyAId) || moonIds.has(a.bodyBId)) continue;
        // Finding 190 — backfill układu dla zapisów sprzed tej poprawki. Bez stempla alert nie
        // pasowałby do ŻADNEGO skanu i wisiałby wiecznie; alert o ciele, którego już nie ma,
        // jest bezwartościowy, więc go odrzucamy. Zapis v101 BEZ migracji (pole dochodzi
        // w serialize samo, a restore je uzupełnia).
        if (!a.systemId) {
          a.systemId = EntityManager.get(a.bodyAId)?.systemId
                    ?? EntityManager.get(a.bodyBId)?.systemId ?? null;
        }
        if (!a.systemId) continue;
        this._alerts.set(a.id, a);
      }
    }
  }
}
