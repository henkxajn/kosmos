// ═══════════════════════════════════════════════════════════════
// BALANS 1.0 — Phase 2 — PopTelemetry (czujnik POP, READ-ONLY)
// ───────────────────────────────────────────────────────────────
// Zbiera migawkę ekonomii POP z ŻYWYCH systemów gry raz na GAME-YEAR
// (gameTime; 1 game-yr = 12 civ-yr). NIC nie mutuje — czyste odczyty.
//
// HARD-CONSTRAINT (Phase 2): instrument, nie regulator. Zero stałych
// gry. Progi klasyfikacji poniżej to KNOBY heurystyki pomiaru (nie
// balans) — jawnie wystawione w wyniku, przestrajalne bez dotykania gry.
//
// Sercem czujnika jest klasyfikacja bezrobotnych POP wg definicji Filipa
// „zdrowy vs zmarnowany". Reguła OUTLET-BASED (OR): nadwyżka POP jest
// problemem TYLKO gdy nie ma dokąd pójść. Ma dokąd pójść, gdy zachodzi
// choć JEDNO ujście:
//   • ekspansja aktywna    — nadwyżka = rezerwa na statki kolonizacyjne
//                            (jawne ujście, które Filip nazwał);
//   • macierzysta zabudowana — POP dostał pracę do granicy zabudowy;
//   • macierzysta ABSORBUJE — etaty (ludzkie) wciąż rosną rok-do-roku,
//                            czyli home jest W TRAKCIE zabudowy i wchłania
//                            nadwyżkę (bez tego wczesne lata rozbudowy home
//                            były błędnie liczone jako „zmarnowane" —
//                            rozjazd z odczuciem gracza; patrz raport slice'u).
//   zmarnowana = nadwyżka bez ŻADNEGO ujścia (home stanął I brak ekspansji)
//   → realny glut („rośnie za szybko, nie ma co z nimi robić").
// ═══════════════════════════════════════════════════════════════

import { TERRAIN_TYPES } from '../../map/HexTile.js';
import { canColonize } from '../../entities/Vessel.js';

// Wynik klasyfikacji roku (headline stan nadwyżki POP).
export const POP_CLASS = {
  TIGHT:  'tight',   // brak nadwyżki, wszystkie etaty obsadzone — POP wiąże (zdrowy tight)
  BOUND:  'bound',   // są NIEobsadzone etaty — POP-limited (deficyt; ODWROTNOŚĆ glutu)
  BUFFER: 'buffer',  // nadwyżka z ujściem (zabudowa / absorpcja / ekspansja) — zdrowa rezerwa
  WASTED: 'wasted',  // nadwyżka bez ujścia — realny glut
};

// KNOBY heurystyki pomiaru (NIE stałe gry). Przestrajalne; kopiowane do meta wyniku.
export const POP_TELEMETRY_DEFAULTS = {
  BUILT_OUT_FRAC: 0.80,  // ≥80% zabudowywalnych kafli zajętych = „macierzysta zabudowana"
  UNFILLED_EPS:   0.5,   // NIEobsadzone etaty ludzkie ≤ to ≈ „wszystkie etaty obsadzone"
  SURPLUS_EPS:    0.5,   // bezrobotni > to = „nadwyżka istnieje"
};

export class PopTelemetry {
  constructor(opts = {}) {
    this.cfg = { ...POP_TELEMETRY_DEFAULTS, ...opts };
    this._rows = [];
    this._prevHomeJobs = null;   // etaty ludzkie z poprzedniej próbki (sygnał absorpcji)
  }

  /** Migawka ŻYWEJ ekonomii POP w game-year `gy`. Dopisuje wiersz, nic nie mutuje. */
  sample(gy, ctx) {
    const row = PopTelemetry.snapshot(gy, ctx, this.cfg, this._prevHomeJobs);
    this._prevHomeJobs = row.jobs;   // do sygnału absorpcji w następnym roku
    this._rows.push(row);
    return row;
  }

  /** Zebrany szereg czasowy (kopia). */
  getSeries() { return this._rows.slice(); }

  // ── Czysta migawka (bez `this`, bez mutacji) ─────────────────────
  // prevHomeJobs = Σ etatów ludzkich z poprzedniej próbki (null = brak historii → absorpcja false).
  static snapshot(gy, { home, colonyManager, vesselManager } = {}, cfg = POP_TELEMETRY_DEFAULTS, prevHomeJobs = null) {
    const civ = home?.civSystem;

    // Populacja (Model B: population = Σ strata + bezrobotni)
    const pop        = civ?.population ?? 0;
    const employed   = civ?.employed ?? 0;
    const unemployed = civ?.unemployed ?? 0;

    // Etaty (ludzkie): jobs = etaty dla ludzi (bez droidów), workers = obsadzeni ludźmi.
    // NIEobsadzone etaty ludzkie = Σ max(0, jobs − workers) — sygnał POP-limited.
    let jobs = 0, workers = 0, synthetic = 0, unfilled = 0;
    for (const r of (civ?.getWorkforceBreakdown?.() ?? [])) {
      jobs += (r.jobs ?? 0);
      workers += (r.workers ?? 0);
      synthetic += (r.synthetic ?? 0);
      unfilled += Math.max(0, (r.jobs ?? 0) - (r.workers ?? 0));
    }

    // Absorpcja: home wciąż dodaje etaty ludzkie (rok-do-roku) → wchłania nadwyżkę.
    const homeJobsDelta = prevHomeJobs == null ? 0 : (jobs - prevHomeJobs);
    const homeAbsorbing = prevHomeJobs != null && jobs > prevHomeJobs;

    const bo  = PopTelemetry.buildOut(home);
    const exp = PopTelemetry.expansion(colonyManager, vesselManager);
    const cls = PopTelemetry.classify(
      { unemployed, unfilled, builtOutFrac: bo.frac, expansionActive: exp.active, homeAbsorbing }, cfg);

    return {
      gy: Math.round(gy),
      // POP
      pop, employed, unemployed,
      humans:       +(civ?.humans ?? pop).toFixed(2),
      growth:       +(civ?.getAnnualGrowth?.() ?? 0).toFixed(3),   // POP/civ-yr (float, przed promocją)
      satisfaction: Math.round(civ?.satisfaction ?? 0),
      housing:      Math.round(civ?.housing ?? 0),
      // Etaty
      jobs, workers, synthetic,
      unfilledJobs:  +unfilled.toFixed(2),
      homeJobsDelta,
      homeAbsorbing,
      // Zabudowa macierzystej
      buildOutFrac:   +bo.frac.toFixed(3),
      buildableTiles: bo.buildable,
      occupiedTiles:  bo.occupied,
      // Ekspansja (ujście nadwyżki)
      fullColonies:       exp.fullColonies,
      outposts:           exp.outposts,
      colonizersBuilt:    exp.colonizersBuilt,
      colonizersInFlight: exp.colonizersInFlight,
      expansionActive:    exp.active,
      // Klasyfikacja
      class: cls,
      // Głowa bezrobotnych rozbita wg klasy — do warstwowego wykresu.
      bufferPop: cls === POP_CLASS.BUFFER ? unemployed : 0,
      wastedPop: cls === POP_CLASS.WASTED ? unemployed : 0,
    };
  }

  /** Zabudowa macierzystej = zajęte kafle zabudowywalne / wszystkie zabudowywalne.
   *  Zajętość czytana z `tile.isOccupied` (obejmuje budynki gotowe I w budowie);
   *  `tile.buildingId` ustawiają TYLKO budynki startowe (restoreFromSave) — runtime
   *  builds rejestrują się w `_active` + ustawiają `isOccupied`, więc buildingId
   *  drastycznie zaniża (7 vs realne 35 → potwierdzone probe). */
  static buildOut(home) {
    const tiles = home?.grid?.toArray?.() ?? [];
    let buildable = 0, occupied = 0;
    for (const t of tiles) {
      const terr = TERRAIN_TYPES[t.type];
      if (!terr?.buildable || t.damaged) continue;
      buildable++;
      if (t.isOccupied) occupied++;
    }
    return { buildable, occupied, frac: buildable > 0 ? occupied / buildable : 0 };
  }

  /** Stan ekspansji GRACZA — pełne kolonie / placówki założone + kolonizatory zbudowane/w locie. */
  static expansion(colonyManager, vesselManager) {
    const playerCols = colonyManager?.getPlayerColonies?.() ?? [];   // zawiera macierzystą + placówki
    let fullColonies = 0, outposts = 0;
    for (const c of playerCols) {
      if (c.isOutpost) outposts++; else fullColonies++;
    }
    let colonizersBuilt = 0, colonizersInFlight = 0;
    for (const v of (vesselManager?.getAllVessels?.() ?? [])) {
      if (v.isEnemyVessel || v.ownerEmpireId) continue;   // solo → brak, ale strzeż i tak
      if (!canColonize(v)) continue;
      colonizersBuilt++;
      if (v.position?.state && v.position.state !== 'docked') colonizersInFlight++;
    }
    // „Ujście istnieje" — nadwyżka karmi / jest rezerwą na ekspansję.
    // fullColonies ≥ 2 = wtórna kolonia POP poza macierzystą.
    const active = colonizersBuilt > 0 || outposts > 0 || fullColonies >= 2;
    return { fullColonies, outposts, colonizersBuilt, colonizersInFlight, active };
  }

  /**
   * Klasyfikator OUTLET-BASED (definicja Filipa zdrowy/zmarnowany). Czysta funkcja.
   * Kolejność:
   *   nadwyżka>0 I etaty obsadzone → jest ujście (zabudowa/absorpcja/ekspansja) ? BUFFER : WASTED
   *   NIEobsadzone etaty>0          → BOUND (POP-limited)
   *   inaczej                       → TIGHT (brak luzu)
   */
  static classify({ unemployed, unfilled, builtOutFrac, expansionActive, homeAbsorbing }, cfg = POP_TELEMETRY_DEFAULTS) {
    const surplus    = (unemployed ?? 0) > cfg.SURPLUS_EPS;
    const jobsFilled = (unfilled ?? 0) <= cfg.UNFILLED_EPS;
    if (surplus && jobsFilled) {
      const builtOut = (builtOutFrac ?? 0) >= cfg.BUILT_OUT_FRAC;
      const hasOutlet = builtOut || !!expansionActive || !!homeAbsorbing;
      return hasOutlet ? POP_CLASS.BUFFER : POP_CLASS.WASTED;
    }
    if (!jobsFilled) return POP_CLASS.BOUND;
    return POP_CLASS.TIGHT;
  }
}

export default PopTelemetry;
