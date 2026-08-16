// ThreatAssessment — JEDEN wspólny odczyt siły militarnej (W1-2, WOJNA I POKÓJ 1.0, workstream B).
//
// Moduł, który `WAR_BACKBONE §5.4` nazywa „one shared module read by both war and diplomacy".
// Czyta go akceptacja dyplomatyczna (`relative_power`), FSM obcych, intel i doktryny — zamiast
// czterech osobnych, rozjeżdżających się estymatorów.
//
// ── CZYSTY READ-MODEL (decyzja 1, zawężenie P2 podpisane po refutacji K-2) ──────────────────
// Siła jest LICZONA z prawdziwych kadłubów przy każdym odczycie, nigdy nie przechowywana.
// Pierwotny plan (P2) mówił o „dwukierunkowym uzgadnianiu, dopóki oba istnieją" — audyt wykazał,
// że okres przejściowy jest PUSTY: `empire.fleets` nigdy nie ma wpisów w normalnej grze
// (dwaj producenci to nieosiągalna gałąź `MilitaryAI.build_fleet` i cheat debugowy). Zmierzone
// wykonaniem: `war_seams_smoke` T5. Read-model bez drugiego magazynu jest MOCNIEJSZY niż to,
// co podpisano — nie ma czego desynchronizować, więc R10 ginie jako KLASA, nie po przejściu.
// Konsekwencja: ZERO nowego stanu, ZERO zmian modelu zapisu (save v100 nietknięty).
//
// ── Pamięć podręczna z unieważnianiem (decyzja 4) ───────────────────────────────────────────
// Naiwny koszt NIE jest pomijalny: `AlienCivSystem` robi do 8 kroków na klatkę
// (MAX_STEPS_PER_TICK), a w każdym kroku pyta o siłę raz globalnie PLUS raz na imperium wewnątrz
// `MilitaryAI.attack_player.score` — przy sześciu imperiach to ~56 odczytów na klatkę, każdy
// O(wszystkie statki) z przeglądaniem modułów. Dlatego: `Map<ownerId, wartość>` przeliczana
// LENIWIE za flagą `_dirty`. Wzór wzięty z dwóch działających precedensów w tym repo —
// `TerritoryService` (`_dirty` + `_ensure()`) i `SystemPoolService` (`_ensureFresh`).
// Koszt spada do O(V) raz na tik, niezależnie od liczby pytających.
//
// Komunikacja: EventBus + `window.KOSMOS` (bez importów systemów — CLAUDE.md).

import EventBus from '../core/EventBus.js';
import { HULLS } from '../data/HullsData.js';
import { SHIP_MODULES } from '../data/ShipModulesData.js';
import { COMBAT_VALUE_WEIGHTS } from '../data/CombatValueData.js';
import { aggregateCombatValue, vesselCombatValue, relativePowerRaw } from '../utils/ThreatMath.js';
import { isEnemyVessel, isInService } from '../entities/Vessel.js';

/** Klucz gracza w indeksie. Statki gracza NIE mają stempla właściciela (`ownerEmpireId`
 *  undefined) — `isEnemyVessel` jest testem STEMPLA, więc brak stempla = gracz. */
export const PLAYER_OWNER_ID = 'player';

export class ThreatAssessment {
  constructor() {
    /** @type {Map<string, number>} ownerId → SIŁA: wartość bojowa kadłubów W SŁUŻBIE (jednostka HP) */
    this._values = new Map();
    /** @type {Map<string, number>} ownerId → POTENCJAŁ: wszystkie kadłuby, także rezerwa */
    this._potential = new Map();
    this._dirty = true;

    this._onInvalidate = () => { this._dirty = true; };
    // Zdarzenia zmieniające zbiór kadłubów + tik jako siatka bezpieczeństwa dla WSZYSTKIEGO,
    // czego te dwa nie łapią (dokowanie modułów, przejęcia, restore save'a).
    // ⚠ W2-7: `vessel:mobilization*` MUSZĄ tu być. To jedyne zdarzenia, które przenoszą kadłub
    //   między SIŁĄ a POTENCJAŁEM bez tworzenia ani niszczenia statku — czyli zmieniają obie
    //   liczby, nie ruszając zbioru. Bez nich mobilizacja byłaby widoczna dopiero przy
    //   następnym `time:tick`, a guard `empireOutgunnedByPlayer` czytałby w tym samym tiku
    //   stan sprzed własnej decyzji i mobilizował drugi raz na nieaktualnych danych.
    this._events = ['vessel:created', 'vessel:wrecked',
                    'vessel:mobilizationStarted', 'vessel:mobilizationComplete', 'time:tick'];
    for (const ev of this._events) EventBus.on(ev, this._onInvalidate);
  }

  /** Wymuś przeliczenie przy następnym odczycie (np. po restore). */
  invalidate() { this._dirty = true; }

  dispose() {
    for (const ev of this._events) EventBus.off(ev, this._onInvalidate);
    this._values.clear();
    this._potential.clear();
  }

  // ── Odczyt ────────────────────────────────────────────────────────────────────────────────

  /**
   * Wartość bojowa właściciela w jednostkach HP. Nieznany właściciel ⇒ 0 (nie null, nie wyjątek):
   * „nie mam o nim nic" i „nie ma nic" znaczą tu to samo dla każdego konsumenta.
   */
  getStrength(ownerId) {
    this._ensure();
    return this._values.get(ownerId) ?? 0;
  }

  /**
   * POTENCJAŁ — wartość bojowa WSZYSTKICH kadłubów właściciela, także tych w rezerwie (W2).
   *
   * Rozdział `siła` / `potencjał` jest mechaniczną formą zdania projektowego: **magazyn to
   * potencjał, nie siła**. `getStrength` (tylko służba) karmi DECYZJE — milRatio obcych,
   * `relative_power` w akceptacji dyplomatycznej, doktryny. `getPotentialStrength` karmi
   * OBRAZ — wywiad i UI, gdzie „mają sześć fregat, załogę na trzy" jest właśnie tą różnicą.
   *
   * ⚠ Zmiana `getStrength` na „tylko służba" NIE jest neutralną księgowością: mianownik
   *   milRatio ma podłogę (`PLAYER_DEFENSE_BASELINE_HP`), a licznik nie, więc wykluczenie
   *   rezerwy działa ASYMETRYCZNIE — studzi agresję AI (audyt W2 §S11). Ciągłość na wczytaniu
   *   zapewnia domyślne `serviceState:'active'`: stary save nie ma rezerwy, więc obie liczby
   *   startują RÓWNE i rozjeżdżają się dopiero, gdy nowe kadłuby trafiają do magazynu.
   */
  getPotentialStrength(ownerId) {
    this._ensure();
    return this._potential.get(ownerId) ?? 0;
  }

  /** Sama REZERWA (potencjał − siła) — czytelne wprost dla wywiadu/UI. */
  getReserveStrength(ownerId) {
    return Math.max(0, this.getPotentialStrength(ownerId) - this.getStrength(ownerId));
  }

  /** Skrót — siła gracza. */
  getPlayerStrength() { return this.getStrength(PLAYER_OWNER_ID); }

  /** Kopia całego indeksu (debug/UI). Kopia, bo oddawanie żywej mapy zaprasza do mutacji. */
  getAllStrengths() {
    this._ensure();
    return new Map(this._values);
  }

  /**
   * Znormalizowana przewaga `selfId` nad `otherId` ∈ ⟨−1, +1⟩.
   * JEDNA formuła (`ThreatMath.relativePowerRaw`) dla dyplomacji i doktryn — dwa warianty
   * tej samej liczby to gwarantowany rozjazd.
   */
  getRelativePower(selfId, otherId) {
    return relativePowerRaw(this.getStrength(selfId), this.getStrength(otherId));
  }

  /** Wartość pojedynczego statku (debug/UI/testy) — bez pamięci podręcznej, zawsze świeża. */
  valueOfVessel(vessel) {
    return vesselCombatValue(vessel, HULLS, SHIP_MODULES, COMBAT_VALUE_WEIGHTS);
  }

  // ── Przeliczanie ──────────────────────────────────────────────────────────────────────────

  _ensure() {
    if (!this._dirty) return;
    this._recompute();
    this._dirty = false;
  }

  _recompute() {
    this._values.clear();
    this._potential.clear();
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr?._vessels) return;      // brak rejestru = brak floty; 0 dla każdego pytającego

    /** @type {Map<string, object[]>} kadłuby W SŁUŻBIE */
    const inService = new Map();
    /** @type {Map<string, object[]>} WSZYSTKIE kadłuby (służba + rezerwa) */
    const allHulls  = new Map();
    for (const v of vMgr._vessels.values()) {
      if (!v || v.isWreck) continue;                 // wrak nie jest siłą bojową
      const owner = this._ownerOf(v);
      if (!owner) continue;
      if (!allHulls.has(owner)) allHulls.set(owner, []);
      allHulls.get(owner).push(v);
      if (!isInService(v)) continue;                 // W2 — rezerwa liczy się tylko do POTENCJAŁU
      if (!inService.has(owner)) inService.set(owner, []);
      inService.get(owner).push(v);
    }

    for (const [owner, vessels] of inService) {
      this._values.set(owner, aggregateCombatValue(vessels, HULLS, SHIP_MODULES, COMBAT_VALUE_WEIGHTS));
    }
    for (const [owner, vessels] of allHulls) {
      this._potential.set(owner, aggregateCombatValue(vessels, HULLS, SHIP_MODULES, COMBAT_VALUE_WEIGHTS));
    }
  }

  /**
   * Właściciel kadłuba. ⚠ Kolejność ma znaczenie: NAJPIERW pytamy `isEnemyVessel`, dopiero
   * potem czytamy stempel. Kadłub BEZ stempla czyta się jako kadłub GRACZA (znalezisko 1
   * z Director Slice 1 — „statek bez stempla jest statkiem gracza"), więc gdyby kolejność była
   * odwrotna, statek AI, któremu ktoś zapomniał nadać `ownerEmpireId`, wpadłby do siły gracza.
   */
  _ownerOf(v) {
    if (!isEnemyVessel(v)) return PLAYER_OWNER_ID;
    return v.ownerEmpireId ?? v.owner ?? null;
  }
}
