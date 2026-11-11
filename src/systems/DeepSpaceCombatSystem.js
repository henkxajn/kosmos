// DeepSpaceCombatSystem (DSCS) — per-tick deep-space combat (M4 P3).
//
// Zastępuje instant resolve VesselCombatSystem._resolveEngagement (BattleSystem)
// dla starć w przestrzeni między vessel'ami. BattleSystem zostaje używany dla:
//   - orbital combat (EnemyAttackHandler.planet defense)
//   - abstract empire fleet combat (WarSystem._fleetArrived — od W3-8 tylko ze STARYCH
//     zapisów; w normalnej grze nikt już nie tworzy floty abstrakcyjnej)
//
// Wpięcie:
//   VesselCombatSystem._handleCombatRangeEnter → gdy FEATURES.m4DeepSpaceCombat
//     → window.KOSMOS.deepSpaceCombatSystem.handleCombatRangeEnter(...)
//   VesselManager._tick → po _tickEndurance, przed MovementOrderSystem._tick
//     → window.KOSMOS.deepSpaceCombatSystem._tick(civDy)
//
// Encounter state:
//   _activeEncounters: Map<encounterId, EncounterState>
//   EncounterState:
//     { id, sideA: {vesselIds[], ownerEmpireId, label, joinedVesselIds[]},
//       sideB: {...},
//       vesselStates: Map<vesselId, {hp, hpStart, shieldHP, shieldHPStart,
//                                    armor, evasion, weapons[], joinedAtRound}>,
//       location: {systemId, planetId:null, point:{x,y}},
//       startYear, currentRound, timeline[], isActive }
//
// P3-2 SKOPE (skeleton):
//   - handleCombatRangeEnter dispatch (startEngagement | _joinEncounter)
//   - startEngagement: team-up gather (kopia VCS), build EncounterState,
//     stationary AI dla enemy vesseli
//   - _joinEncounter: mid-combat reinforcement (Opcja B)
//   - _tickEncounter: STUB — increment currentRound, brak fire exchange
//   - _finalizeBattle: pełna semantyka — per-vessel wreck always +
//     side-level wreck żywych przegranych + emit battle:resolved
//
// P3-3 doda:  per-tick fire exchange, weapon cooldowns, damage application,
//             engage target priority (Opcja D), shield regen, _checkEndConditions
// P3-4 doda:  end-condition retreat threshold, combatRangeExit draw
// P3-8 doda:  serialize/restore (deepSpaceEngagements persist)

import EventBus from '../core/EventBus.js';
import { t } from '../i18n/i18n.js';
import gameState from '../core/GameState.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { COMBAT_ENGAGEMENT_AU } from './ProximitySystem.js';
import { HULLS } from '../data/HullsData.js';
import { SHIP_MODULES } from '../data/ShipModulesData.js';
// ⚠ Wariant FAIL-CLOSED, wyłącznie dla warstwy walki. `isSameSystem` (fail-open) zostaje
// nietknięty dla bramek wydawania rozkazów — uzasadnienie w SystemScope.
import { isSameSystemStrict, systemIdOf } from '../utils/SystemScope.js';
// POLISH P1 (CP1) — reguła rund i zegar starcia (siatka `TimeSystem`).
import { COMBAT_ROUND_RULE_MS, COMBAT_SAFETY_ROUND_CAP } from '../data/CombatPaceData.js';
import { combatClockMs, orbitClockSec } from '../utils/SimClock.js';

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;

// Bufor team-up gather wokół midpoint spotkania (kopia z VCS).
const TEAMUP_BUFFER_FACTOR = 1.5;

// M1 „bitwy do końca” (decyzja 33, decyzje właściciela 1–5 z 2026-11-11) — STARCIE NIE MA LIMITU RUND. Dawniej `MAX_ROUNDS`
// = 20: po 20. rundzie wygrywała strona z większą BEZWZGLĘDNĄ sumą HP kadłubów, a ŻYWE okręty przegranej szły na wrak
// (Finding 688; 10 na 10 stagera — średnio 3,8 żywych okrętów na wrak w KAŻDEJ bitwie). Teraz okręt ginie wyłącznie przy
// 0 HP, a starcie kończy się, gdy jedna strona zostanie zniszczona albo ucieknie (prawdziwy lot poza `COMBAT_DISENGAGE_AU`,
// `_advanceFleeing`), albo jednym z dwóch strażników technicznych, niewidocznych w zwykłej walce: żadna strona nie może już
// zadać obrażeń drugiej (`_deadlocked`) albo ukryty bezpiecznik `SAFETY_ROUND_CAP` rund. Oba kończą REMISEM BEZ wraków żywych.
export const SAFETY_ROUND_CAP = COMBAT_SAFETY_ROUND_CAP;

// Próg retreat: gdy aggregate HP strony spadnie ≤ tej frakcji startowej
// (z reinforcement) → strona retreat. P3-4 logika.
export const RETREAT_THRESHOLD = 0.2;

// ── Tempo walki — rundy na ZEGARZE STARCIA (POLISH P1, CP1; wcześniej: czas realny, 2026-07-26) ──
// Historia: rundy bramkowane akumulatorem civDeltaYears dawały przy 1 d/s ~9 s realnych na rundę;
// fix 2026-07-26 przeniósł rundy na czas REALNY (`performance.now`, co 110 ms) — a wtedy wynik zależał
// od prędkości gracza, FPS i pauzy (Findingi 438, 449). Od P1 runda pada co ROUND_INTERVAL_MS ms
// ZEGARA STARCIA: siatki `TimeSystem` (klatka 16 ms przy 1 d/s, niezależnie od prędkości i FPS;
// pauza ją zatrzymuje). Czas realny rundy (`combatRoundMs`) to wyłącznie tempo odtwarzania siatki
// — wynik od niego nie zależy. CIV_PER_ROUND zostaje krokiem symulacji na rundę (cooldowny broni
// w rundach: laser co 2 rundy, kinetyk co 3, rakieta co 5).
export const CIV_PER_ROUND = 0.3;
export const ROUND_INTERVAL_MS = COMBAT_ROUND_RULE_MS;   // 110 ms zegara starcia na rundę (reguła — dzisiejsza)
export const MAX_ROUNDS_PER_TICK = 4;    // bezpiecznik — przy siatce 16 ms zegara starcia najwyżej 1 runda na tik

// ── AI STRIKES BACK S3 (SB49, Finding 421) — ZBLIŻENIE PRZED RUNDĄ ──
// Krok zbliżenia na rundę w LATACH GRY liczony z ZEGARA STARCIA: runda = CIV_PER_ROUND lat cywilizacyjnych (ta sama baza,
// na której stoją cooldowny broni), a nie z prędkości gry — przy auto-slow do 1 d/s krok z czasu gry wynosił ~0,0003 AU na
// rundę i laser (0,05 AU) nigdy nie dosięgał strażnika strzelającego z 0,23–0,30 AU (pomiar części E S2b).
export const CLOSE_STEP_YEARS = CIV_PER_ROUND / (GAME_CONFIG.CIV_TIME_SCALE ?? 12);   // lata gry na rundę (0,025)
// Zbliżenie kończy się na tym ułamku najdłuższego zasięgu własnej broni — środek pasma kitingu `engage`
// (`MovementOrderSystem._tickEngageOrder`: 0,9025–0,98 × zasięg), więc oba mechanizmy się nie przepychają.
export const CLOSE_RANGE_FACTOR = 0.95;

// Celność (fix „strzały przeważnie niecelne", 2026-07-26): mnożnik do tracking. Bazowo kinetyk
// 0.6 / rakieta 0.5 × (1−evasion) dawało ~40-55% trafień → większość pudeł. ×1.5 podnosi typowe
// trafienia do ~70-90% (laser clampuje do 0.95); evasion kadłuba dalej różnicuje cele.
export const HIT_CHANCE_MULT = 1.5;

// Śmiertelność (druga przyczyna „walka trwa cholernie długo"): bazowe obrażenia (5/8/12) vs HP
// kadłubów (120-350) sprawiały, że bitwa NIGDY nie kończyła się zabiciem — zawsze time-out po
// limicie rund (dawny `MAX_ROUNDS`, zdjęty w M1). ×3 → starcia rozstrzygają się przez zniszczenie.
// DSCS-local (nie dotyka orbital BattleSystem, który czyta surowe mod.stats.damage).
export const DAMAGE_MULT = 3.0;

// Deterministyczny PRNG (kopia z BattleSystem — nie eksportowane).
function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class DeepSpaceCombatSystem {
  /**
   * @param {import('./VesselManager.js').VesselManager} vesselManager
   */
  constructor(vesselManager) {
    this._vm = vesselManager;
    /** @type {Map<string, EncounterState>} */
    this._activeEncounters = new Map();

    // combatRangeExit subskrypcja — P3-4 implementuje draw na rozejście stron.
    this._onCombatRangeExit = (e) => this._handleCombatRangeExit(e);
    EventBus.on('vessel:combatRangeExit', this._onCombatRangeExit);
  }

  destroy() {
    EventBus.off('vessel:combatRangeExit', this._onCombatRangeExit);
    this._activeEncounters.clear();
  }

  // ── Public API (wołane z VesselCombatSystem) ─────────────────────────

  /**
   * Wejście do DSCS — dispatch między startEngagement (nowy encounter)
   * a _joinEncounter (reinforcement do istniejącego).
   *
   * @param {string} v1Id
   * @param {string} v2Id
   * @param {boolean} sameFaction — gdy true, ignorujemy (M2a semantics)
   */
  handleCombatRangeEnter(v1Id, v2Id, sameFaction) {
    const trace = window.KOSMOS?.debug?.combatTrace;
    if (sameFaction) { if (trace) console.log('[DSCS] reject handleCRE: sameFaction', { v1Id, v2Id }); return false; }
    const vm = this._vm;
    if (!vm) { if (trace) console.log('[DSCS] reject handleCRE: no vesselManager'); return false; }
    const v1 = vm._vessels?.get(v1Id);
    const v2 = vm._vessels?.get(v2Id);
    if (!v1 || !v2 || v1.isWreck || v2.isWreck) {
      if (trace) console.log('[DSCS] reject handleCRE: vessel missing/wreck', { v1: !!v1, v2: !!v2, w1: v1?.isWreck, w2: v2?.isWreck });
      return false;
    }
    // ⚠ BRAMKA UKŁADU — JEDYNY PUNKT POKRYWAJĄCY WSZYSTKICH PRODUCENTÓW ZDARZENIA.
    // `vessel:combatRangeEnter` emitują TRZY miejsca, a tylko jedno ma własny guard:
    //   • `ProximitySystem._checkPair` — MA guard międzyukładowy;
    //   • `MovementOrderSystem:1163` (force-engage w `_tickEngageOrder`) — BEZ guardu;
    //   • `MovementOrderSystem:1505` (po ukończeniu pursue/intercept) — BEZ guardu, a dystans
    //     w payloadzie jest wręcz WPISANY NA SZTYWNO (`THREAT_RADIUS_AU`).
    // Oba force-emity dodatkowo majstrują przy `ps._activeCombatPairs`, więc strażnik proximity
    // ich nie łapie nawet pośrednio. Bramka stoi TUTAJ, bo to jedyne publiczne wejście do DSCS
    // (`startEngagement` i `_joinEncounter` nie mają innych wołających poza tym plikiem).
    // Predykat jest FAIL-CLOSED — uzasadnienie w `SystemScope.isSameSystemStrict`.
    if (!isSameSystemStrict(v1, v2)) {
      if (trace) console.log('[DSCS] reject handleCRE: other system', {
        v1Id, v2Id, v1Sys: systemIdOf(v1), v2Sys: systemIdOf(v2),
      });
      return false;
    }
    if (trace) console.log('[DSCS] handleCRE OK — dispatching', { v1Id, v2Id, v1State: v1.position?.state, v2State: v2.position?.state });

    const existing1 = this._findActiveEncounterContaining(v1Id);
    const existing2 = this._findActiveEncounterContaining(v2Id);

    // Oba w tym samym encounter — nic do roboty (już walczą). Engagement aktywny.
    if (existing1 && existing1 === existing2) return true;

    // M1 (decyzja 3, Finding 657) — STATEK, KTÓRY ODSZEDŁ Z BITWY, NIE WRACA DO NIEJ OD RAZU. Uciekający (znacznik odwrotu
    // na rozkazie — „Wycofaj się z bitwy” gracza, doktryna `retreat_at_50`, odwrót AI) nie zaczyna nowego starcia i nie
    // dołącza do cudzego, dopóki leci do schronienia (znacznik żyje do końca rozkazu odwrotu). Dawniej starcie zakończone
    // odwrotem AI w zasięgu broni zaczynało się od nowa w tej samej klatce: `battle:resolved` czyścił parę w
    // `ProximitySystem` i cooldown VCS, a samoleczenie pary emitowało `combatRangeEnter` od razu (split 2 × 2 — 3 bitwy,
    // 2 banery). Bramka stoi TU, bo to jedyne wejście, które widzi wszystkich trzech producentów zdarzenia (jak bramka układu
    // wyżej); członek TRWAJĄCEGO starcia uciekając zostaje jego członkiem (gałąź wyżej — w nim go widać i trafiają go).
    const fleeing1 = _isRetreatingFromCombat(v1);
    const fleeing2 = _isRetreatingFromCombat(v2);

    // Jeden w encounter, drugi nie — drugi dołącza jako reinforcement.
    if (existing1 && !existing2) {
      if (fleeing2) { if (trace) console.log('[DSCS] reject handleCRE: joiner is fleeing', { v2Id }); return false; }
      this._joinEncounter(existing1, v2Id);
      // _joinEncounter może odrzucić (docked/etc) — sprawdź czy v2 faktycznie dołączył.
      return existing1.vesselStates.has(v2Id);
    }
    if (existing2 && !existing1) {
      if (fleeing1) { if (trace) console.log('[DSCS] reject handleCRE: joiner is fleeing', { v1Id }); return false; }
      this._joinEncounter(existing2, v1Id);
      return existing2.vesselStates.has(v1Id);
    }

    // Oba w różnych encounterach — w P3 nie łączymy encounter'ów (edge case).
    // Pierwszy wygrywa: drugi vessel nie dołącza. P5 może to rozwiązać.
    if (existing1 && existing2) return false;

    if (fleeing1 || fleeing2) {
      if (trace) console.log('[DSCS] reject handleCRE: fleeing vessel — no new engagement', { v1Id, v2Id, fleeing1, fleeing2 });
      return false;
    }

    // Żaden w combat — startuj nowy encounter.
    const enc = this.startEngagement(v1Id, v2Id);
    return enc !== null;
  }

  // ── Encounter lifecycle ──────────────────────────────────────────────

  /**
   * Stwórz nowy encounter. Team-up gather wokół midpoint (kopia VCS), build
   * EncounterState z per-vessel stanami, stationary AI dla enemy vesseli.
   *
   * @returns {EncounterState|null}
   */
  startEngagement(v1Id, v2Id) {
    const trace = window.KOSMOS?.debug?.combatTrace;
    const vm = this._vm;
    if (!vm) { if (trace) console.log('[DSCS] reject startEng: no vesselManager'); return null; }
    const v1 = vm._vessels?.get(v1Id);
    const v2 = vm._vessels?.get(v2Id);
    if (!v1 || !v2 || v1.isWreck || v2.isWreck) {
      if (trace) console.log('[DSCS] reject startEng: vessel missing/wreck', { v1Id, v2Id, v1: !!v1, v2: !!v2 });
      return null;
    }
    if (!_inCombatState(v1) || !_inCombatState(v2)) {
      if (trace) console.log('[DSCS] reject startEng: NOT in combat state', { v1State: v1.position?.state, v2State: v2.position?.state });
      return null;
    }

    // Midpoint spotkania — używany do wreck placement + cinematic location.
    const mid = {
      x: (v1.position.x + v2.position.x) / 2,
      y: (v1.position.y + v2.position.y) / 2,
    };

    // Player intent bypass — gdy któryś z pair ma engage order targetujący drugiego,
    // pomiń team-up gather (ten ma buffer 0.225 AU, za mały dla kite weapons z
    // rangeAU > 0.15). Player explicit'ie chce walki tej pary — startuj nią
    // bezpośrednio, team-up zostanie dolaczane przez _joinEncounter gdy inne
    // vessele wejdą w combat range.
    const isPlayerIntent = (
      (v1.movementOrder?.type === 'engage' && v1.movementOrder.targetEntityId === v2Id) ||
      (v2.movementOrder?.type === 'engage' && v2.movementOrder.targetEntityId === v1Id)
    );

    let nearby;
    if (isPlayerIntent) {
      nearby = [v1, v2];
      if (trace) console.log('[DSCS] startEng: player intent bypass team-up gather', { v1Id, v2Id });
    } else {
      // Team-up gather: vessele w buforze COMBAT_ENGAGEMENT_AU × 1.5 od mid.
      nearby = [];
      const bufferPx = COMBAT_ENGAGEMENT_AU * TEAMUP_BUFFER_FACTOR * AU_TO_PX;
      for (const v of vm._vessels.values()) {
        if (v.isWreck) continue;
        if (!_inCombatState(v)) continue;
        // ⚠ TERMIN UKŁADU — bez niego ta pętla zbierała skład bitwy z CAŁEJ GALAKTYKI.
        // `vm._vessels` jest PŁASKI, a gwiazda każdego układu stoi w (0,0), więc statek 0,2 AU
        // od SWOJEJ gwiazdy ma niemal te same surowe `x/y` co statek 0,2 AU od INNEJ. Warunek
        // niżej porównuje właśnie surowe `x/y`, więc kwalifikował obcych z pełną pewnością siebie.
        // Odniesieniem jest `v1` — statek WYZWALAJĄCY, ten sam, którego układ stempluje starcie.
        if (!isSameSystemStrict(v, v1)) continue;
        // M1 (decyzja 3) — uciekający nie jest zbierany do nowego starcia (ta sama reguła co bramka w dyspozytorze).
        if (_isRetreatingFromCombat(v)) continue;
        const dx = v.position.x - mid.x;
        const dy = v.position.y - mid.y;
        if (Math.hypot(dx, dy) <= bufferPx) nearby.push(v);
      }
      if (nearby.length < 2) {
        if (trace) console.log('[DSCS] reject startEng: nearby.length < 2', {
          nearbyCount: nearby.length,
          bufferAU: COMBAT_ENGAGEMENT_AU * TEAMUP_BUFFER_FACTOR,
          distV1V2AU: Math.hypot(v1.position.x - v2.position.x, v1.position.y - v2.position.y) / AU_TO_PX,
        });
        return null;
      }
    }

    // Grupuj wg ownerEmpireId.
    const groups = new Map();
    for (const v of nearby) {
      const owner = _resolveOwner(v);
      if (!groups.has(owner)) groups.set(owner, []);
      groups.get(owner).push(v);
    }
    if (groups.size < 2) {
      if (trace) console.log('[DSCS] reject startEng: groups.size < 2', {
        groupOwners: [...groups.keys()],
        nearby: nearby.map(v => ({ id: v.id, owner: _resolveOwner(v), isEnemy: v.isEnemy, ownerEmpireId: v.ownerEmpireId })),
      });
      return null;
    }

    // M2a/P3: tylko player ↔ empire. Empire↔empire = M5.
    const playerGroup = groups.get('player');
    if (!playerGroup || playerGroup.length === 0) {
      if (trace) console.log('[DSCS] reject startEng: no playerGroup', { groupOwners: [...groups.keys()] });
      return null;
    }

    let bestEmpireId = null;
    let bestHostility = -1;
    let bestGroup = null;
    const dipl = window.KOSMOS?.diplomacySystem;
    // ⚠ D1: wywołanie BEZ `?.` na metodzie. Dawne `dipl?.getHostility?.(id) ?? 50`
    // przy przeoczonym rewire dawało wszystkim równe 50 → remis i dobór celu wg
    // kolejności iteracji mapy, bez żadnego błędu. Brak systemu wychwytujemy wyżej.
    for (const [ownerId, group] of groups) {
      if (ownerId === 'player') continue;
      if (!group || group.length === 0) continue;
      const hostility = dipl ? dipl.getTension(ownerId) : 50;
      if (hostility > bestHostility) {
        bestHostility = hostility;
        bestEmpireId = ownerId;
        bestGroup = group;
      }
    }
    if (!bestEmpireId || !bestGroup) {
      if (trace) console.log('[DSCS] reject startEng: no bestEmpire', { groupOwners: [...groups.keys()] });
      return null;
    }

    // ── Bezbronni się nie biją ──────────────────────────────────────────
    // Gdy ŻADNA strona nie ma uzbrojonego statku, nie startuj walki — byłby
    // bezsensowny remis (0 dmg) z modalem i auto-slow. Wykrycie idzie
    // osobno przez proximity → IntelSystem (kontakt), więc statki i tak się
    // "widzą" na mapie; po prostu nie ma walki. (Uzbrojony vs bezbronny = walka
    // rusza normalnie — uzbrojony może strzelać do bezbronnego.)
    const anyArmed =
      playerGroup.some(v => this._vesselHasWeapons(v)) ||
      bestGroup.some(v => this._vesselHasWeapons(v));
    if (!anyArmed) {
      if (trace) console.log('[DSCS] reject startEng: both sides unarmed', {
        playerGroup: playerGroup.map(v => v.id),
        bestGroup:   bestGroup.map(v => v.id),
      });
      return null;
    }

    // M1 (decyzja 5) — strażnik „nikt nie może zadać obrażeń” także NA STARCIE (uogólnienie bramki „bezbronni się nie biją”
    // wyżej). Starcie, w którym po zamrożeniu stron żaden uzbrojony nie ma celu w zasięgu i nie może podejść (np. strażnik
    // przypięty do orbity ciała wobec bezbronnego poza zasięgiem), skończyłoby się remisem w pierwszej rundzie — a potem
    // `ProximitySystem` (samoleczenie pary) zacząłby je od nowa: pętla jednorundowych starć z banerami. Odmowa jest cicha
    // (jak bramka wyżej); para wraca, gdy geometria się zmieni.
    {
      const pin = this._findDominantDockedAt(playerGroup);
      const frozenA = !!GAME_CONFIG.FEATURES?.m4PlayerCombatMissionPause;
      if (this._deadlocked(this._prospectiveCombatants(playerGroup, pin, frozenA),
        this._prospectiveCombatants(bestGroup, pin, true), 'player', bestEmpireId)) {
        if (trace) console.log('[DSCS] reject startEng: no damage possible after freeze', {
          playerGroup: playerGroup.map(v => v.id), bestGroup: bestGroup.map(v => v.id), pin,
        });
        return null;
      }
    }

    if (trace) console.log('[DSCS] startEng OK — creating encounter', {
      playerGroup: playerGroup.map(v => v.id),
      bestGroup: bestGroup.map(v => v.id),
      bestEmpireId, bestHostility,
    });
    // Układ starcia bierzemy z pary WYZWALAJĄCEJ, nie z rostera — patrz `_createEncounter`.
    return this._createEncounter(playerGroup, bestGroup, mid, 'player', bestEmpireId, systemIdOf(v1));
  }

  /**
   * Buduj EncounterState i dodaj do _activeEncounters.
   * @private
   */
  _createEncounter(sideAVessels, sideBVessels, mid, ownerA, ownerB, triggerSystemId = null) {
    const year = this._year();
    const id = this._makeEncounterId(year, ownerA, ownerB);

    // Per-vessel state (nie aggregate jak BattleSystem) — P3-3 wymienia damage
    // per pair (vessel attacker → vessel target).
    const vesselStates = new Map();
    for (const v of sideAVessels) vesselStates.set(v.id, this._buildVesselState(v));
    for (const v of sideBVessels) vesselStates.set(v.id, this._buildVesselState(v));

    const empireB = window.KOSMOS?.empireRegistry?.get?.(ownerB);
    const labelA = sideAVessels.length > 1
      ? `Gracz (${sideAVessels.length})`
      : `Gracz — ${sideAVessels[0].name ?? sideAVessels[0].shipId}`;
    const labelB = sideBVessels.length > 1
      ? `${empireB?.name ?? 'Wróg'} (${sideBVessels.length})`
      : `${empireB?.name ?? 'Wróg'} — ${sideBVessels[0].name ?? sideBVessels[0].shipId}`;

    // ⚠ UKŁAD STARCIA POCHODZI Z PARY WYZWALAJĄCEJ, NIE Z ROSTERA. Dawniej stało tu
    // „weź `systemId` pierwszego elementu strony A" — a ta tablica powstaje z kolejności
    // iteracji płaskiego rejestru statków, więc układ był ZGADYWANY. To był CICHY STEMPEL:
    // rekord bitwy o mieszanym składzie dostawał jedną, wiarygodnie wyglądającą etykietę,
    // przez co żaden konsument `battle:resolved` nie miał jak wykryć anomalii — a etykieta
    // idzie dalej do `WarSystem._updateOrbitalDominance`, czyli do TRWAŁEGO stanu zapisu.
    // Fallback zachowany dla wywołań bez parametru (żadne produkcyjne dziś nie istnieje).
    const systemId = triggerSystemId ?? systemIdOf(sideAVessels[0]) ?? 'sys_home';

    /** @type {EncounterState} */
    const encounter = {
      id,
      sideA: {
        vesselIds:        sideAVessels.map(v => v.id),
        joinedVesselIds:  [],
        ownerEmpireId:    ownerA,
        label:            labelA,
      },
      sideB: {
        vesselIds:        sideBVessels.map(v => v.id),
        joinedVesselIds:  [],
        ownerEmpireId:    ownerB,
        label:            labelB,
      },
      vesselStates,
      location:           { systemId, planetId: null, point: { x: mid.x, y: mid.y } },
      startYear:          year,
      currentRound:       0,
      currentYear:        year,
      timeline:           [],
      isActive:           true,
      seedBase:           (Math.floor(year * 10000) * 7919) & 0x7FFFFFFF,
      // Zegar starcia (ms, siatka `TimeSystem`) ostatniej rundy — null → pierwszy _tick odpala rundę od razu.
      _lastRoundMs:       null,
    };

    this._activeEncounters.set(id, encounter);

    // Stationary AI: enemy vessele zatrzymane na pozycji wejścia w combat.
    // Combat slow fix 2026-05-21: jeśli sideA ma dominującą `dockedAt`
    // (orbita planety), pin enemy do tej samej planety. Inaczej enemy stoi
    // w absolute space, planeta z player vesselami orbituje słońce, dystans
    // rośnie poza weapon range, walka cienie się.
    const dominantDocked = this._findDominantDockedAt(sideAVessels);
    // Finding 130 (D-130-1) — OBIE strony przez JEDNĄ ścieżkę. Wcześniej strona B dostawała
    // `_freezeAsStationary` (czyli `mission = null`) BEZ migawki i bez wznowienia, podczas gdy
    // gracz miał pełny mechanizm od `046976d`. To nie był brak mechanizmu, tylko ASYMETRIA.
    this._pauseSideForCombat(sideBVessels, dominantDocked, { isPlayer: false });

    // Player side (gated m4PlayerCombatMissionPause): freeze + pauza misji. Bez flagi player
    // zachowuje movement orders (obecne zachowanie — dryf/porażka). Pin = dominantDocked (orbita
    // gracza) lub null (deep-space in_transit → free-float hold w bieżącej pozycji).
    if (ownerA === 'player') this._pauseSideForCombat(sideAVessels, dominantDocked, { isPlayer: true });

    EventBus.emit('vessel:engaged', {
      encounterId:   id,
      sideA:         sideAVessels.map(v => v.id),
      sideB:         sideBVessels.map(v => v.id),
      location:      encounter.location,
    });

    return encounter;
  }

  /**
   * Reinforcement — vessel dołącza do istniejącego encounter mid-combat.
   * Opcja B: aggregate hpStart strony się powiększa → próg retreat raised
   * proporcjonalnie (więcej siły = więcej buffera).
   *
   * @private
   */
  _joinEncounter(encounter, newVesselId) {
    const vm = this._vm;
    const v = vm?._vessels?.get(newVesselId);
    if (!v || v.isWreck) return;

    // Bugfix 2026-05-21 — _joinEncounter filtruje stan jak startEngagement.
    // Bez tego dokowane vessele dołączały do encountera (handleCRE dispatch
    // do _joinEncounter pomijał _inCombatState check obecny w startEngagement),
    // a potem _allOutsideOf liczył docked vessels jako "out of combat range"
    // → fałszywy retreated=A.
    if (!_inCombatState(v)) {
      if (window.KOSMOS?.debug?.combatTrace) {
        console.log('[DSCS] _joinEncounter reject: NOT in combat state', { vesselId: newVesselId, state: v.position?.state });
      }
      return;
    }

    // ⚠ DEFENSE-IN-DEPTH (termin układu). Po bramce w `handleCombatRangeEnter` ta ścieżka jest
    // nieosiągalna dla obcego statku — `_joinEncounter` wołają WYŁĄCZNIE `:145` i `:150`,
    // oba wewnątrz tamtego dyspozytora. Guard stoi tu mimo to, bo „członkostwo w starciu" ma
    // być prawdą LOKALNĄ dla tej funkcji: gdyby kiedyś pojawił się drugi wołający (posiłki
    // z doktryny, multi-empire z P5), mieszanina wróciłaby bez ani jednego czerwonego testu.
    if (systemIdOf(v) !== encounter.location?.systemId) {
      if (window.KOSMOS?.debug?.combatTrace) {
        console.log('[DSCS] _joinEncounter reject: other system',
          { vesselId: newVesselId, vSys: systemIdOf(v), encSys: encounter.location?.systemId });
      }
      return;
    }

    // Skip jeśli już w encounter.
    if (encounter.vesselStates.has(newVesselId)) return;

    const owner = _resolveOwner(v);
    let side;
    if (owner === 'player' && encounter.sideA.ownerEmpireId === 'player') {
      side = encounter.sideA;
    } else if (owner === encounter.sideB.ownerEmpireId) {
      side = encounter.sideB;
    } else {
      // Inny empire niż istniejące strony — P3 ignore (P5 multi-empire battles).
      return;
    }

    // Build vessel state z markerem joinedAtRound (>0 = reinforcement).
    const state = this._buildVesselState(v);
    state.joinedAtRound = encounter.currentRound;
    encounter.vesselStates.set(newVesselId, state);
    side.joinedVesselIds.push(newVesselId);

    // Stationary AI dla wroga.
    // Dołączający też przechodzi przez wspólną ścieżkę (inaczej wzmocnienie AI gubiłoby misję
    // mimo naprawy 130 — nieutwardzony bliźniak tego samego szwu).
    if (side === encounter.sideB) this._pauseSideForCombat([v], null, { isPlayer: false });
    // Player reinforcement (gated) — freeze + pauza misji jak przy starcie encountera.
    else if (side === encounter.sideA && encounter.sideA.ownerEmpireId === 'player') {
      this._pauseSideForCombat([v], this._findDominantDockedAt(
        [...encounter.sideA.vesselIds, ...encounter.sideA.joinedVesselIds]
          .map(id => this._vm?._vessels?.get?.(id)).filter(Boolean)), { isPlayer: true });
    }

    // Append join event do timeline (na bieżącej rundzie).
    const round = this._ensureTimelineRound(encounter);
    round.joinEvents.push({
      vesselId:       newVesselId,
      side:           side === encounter.sideA ? 'A' : 'B',
      ownerEmpireId:  owner,
    });

    EventBus.emit('vessel:joinedCombat', {
      vesselId:     newVesselId,
      encounterId:  encounter.id,
      side:         side === encounter.sideA ? 'A' : 'B',
    });
  }

  // ── Tick loop ─────────────────────────────────────────────────────────

  /**
   * Per-frame tick wszystkich active encounters. Wołane z VesselManager._tick.
   * @param {number} civDy — civDeltaYears
   */
  _tick(civDy) {
    if (civDy <= 0) return;   // pauza / 0× → brak postępu (respektuje pauzę gry)
    // POLISH P1 (CP1, CP3) — zegar STARCIA: siatka `TimeSystem` (16 ms przy 1 d/s na tik, pauza go
    // zatrzymuje). Bez prawdziwego `TimeSystem` (keepery z surowym `time:tick`) zegar stoi — tylko
    // pierwsza runda (Finding 454). Wynik zależy od liczby rund, seeda i ruchu między rundami na
    // siatce — nie od czasu realnego; zapis i wczytanie w trakcie: pierwsza runda od razu (jak dotąd).
    const now = combatClockMs();
    for (const encounter of this._activeEncounters.values()) {
      if (!encounter.isActive) continue;
      if (encounter._lastRoundMs == null) encounter._lastRoundMs = now - ROUND_INTERVAL_MS;
      let roundsThisTick = 0;
      while (
        encounter.isActive &&
        now - encounter._lastRoundMs >= ROUND_INTERVAL_MS &&
        roundsThisTick < MAX_ROUNDS_PER_TICK
      ) {
        encounter._lastRoundMs += ROUND_INTERVAL_MS;
        this._closeToWeaponRange(encounter);   // SB49 (Finding 421) — przed KAŻDĄ rundą, na zegarze starcia
        this._advanceFleeing(encounter);       // M1 (decyzja 3) — ucieczka na tym samym zegarze (pozycja po interpolacji VM)
        this._tickEncounter(encounter, CIV_PER_ROUND);
        roundsThisTick++;
      }
    }
    // Cleanup zakończonych encounter'ów po zakończeniu pętli.
    for (const [id, enc] of this._activeEncounters) {
      if (!enc.isActive) this._activeEncounters.delete(id);
    }
  }

  /**
   * AI STRIKES BACK S3 (SB49, Finding 421) — ZBLIŻENIE PRZED RUNDĄ. Uzbrojony statek starcia, który nie ma ŻADNEGO
   * żywego wroga w zasięgu własnej najdłuższej broni, zbliża się do celu — celu `engage`, dopóki ten żyje jako wróg tego
   * starcia, inaczej najbliższego żywego wroga — na `CLOSE_RANGE_FACTOR` × ten zasięg, krokiem
   * `speedAU × CLOSE_STEP_YEARS` na rundę (zegar starcia, nie prędkość gry). Obie strony.
   * Dotąd statek z misją wstrzymaną na walkę stał tam, gdzie walka się zaczęła, a broń krótsza niż odległość startu nie
   * strzelała nigdy (S2b, pomiar części E: 0 strzałów fregat z laserem na strażnika, 30/30 strat).
   * Stoi: statek trzymający orbitę ciała (`dockedAt` — strażnik dalej trzyma orbitę), uciekający (znacznik odwrotu — ten
   * sam test co `_allOutsideOf`), statek w locie pod własną misją (`in_transit` — rozkaz ruchu wydany w trakcie walki
   * albo strona gracza bez pauzy misji), wrak, bezbronny.
   * @returns {number} ile statków przesunięto
   * @private
   */
  _closeToWeaponRange(encounter) {
    const vids = (side) => [...side.vesselIds, ...side.joinedVesselIds];
    const sides = [
      [vids(encounter.sideA), vids(encounter.sideB), encounter.sideA.ownerEmpireId],
      [vids(encounter.sideB), vids(encounter.sideA), encounter.sideB.ownerEmpireId],
    ];
    let moved = 0;
    for (const [mine, foes, owner] of sides) {
      for (const id of mine) {
        const st = encounter.vesselStates.get(id);
        if (!st || st.hp <= 0 || !(st.weapons?.length > 0)) continue;
        const v = this._vm?._vessels?.get(id);
        if (!v?.position || v.isWreck || _isRetreatingFromCombat(v)) continue;
        if (v.position.state !== 'orbiting' || v.position.dockedAt != null) continue;
        const range = Math.max(...st.weapons.map(w => this._resolveWeaponRange(w, owner)));
        const engageId = v.movementOrder?.type === 'engage' ? v.movementOrder.targetEntityId : null;
        let nearest = null, nearestAU = Infinity, engaged = null, engagedAU = Infinity;
        for (const fid of foes) {
          const fs = encounter.vesselStates.get(fid);
          if (!fs || fs.hp <= 0) continue;
          const f = this._vm?._vessels?.get(fid);
          if (!f?.position || f.isWreck) continue;
          const d = Math.hypot(f.position.x - v.position.x, f.position.y - v.position.y) / AU_TO_PX;
          if (d < nearestAU) { nearestAU = d; nearest = f; }
          if (fid === engageId) { engaged = f; engagedAU = d; }
        }
        if (!nearest || nearestAU <= range) continue;          // wróg w zasięgu — strzela, nie zbliża się
        const target = engaged ?? nearest;
        const distAU = engaged ? engagedAU : nearestAU;
        const stepAU = Math.min((v.speedAU ?? 1.0) * CLOSE_STEP_YEARS, distAU - range * CLOSE_RANGE_FACTOR);
        if (!(stepAU > 0)) continue;
        const k = stepAU / distAU;
        v.position.x += (target.position.x - v.position.x) * k;
        v.position.y += (target.position.y - v.position.y) * k;
        moved++;
      }
    }
    return moved;
  }

  /**
   * Tick pojedynczego encounter (P3-3 pełna logika).
   *
   * Sekwencja:
   *   1. currentRound++, currentYear += civDy
   *   2. Per side, per vessel (alive only), per weapon:
   *      a. Decrement weapon.cooldownYearsRemaining (skip fire jeśli > 0)
   *      b. Resolve effectiveRangeAU (rangeAU × tech mult)
   *      c. Find target — Opcja D engage priority:
   *         - Player z movementOrder.type='engage' i engageTargetId żywy,
   *           w przeciwnej stronie, w zasięgu → target = engageTarget
   *         - Else: closest live enemy
   *      d. Skip jeśli dist > effectiveRangeAU
   *      e. Roll hit (tracking × (1 - evasion)) — rng < hitChance
   *      f. Apply damage (shield absorb → armor reduce → hp)
   *      g. Reset weapon cooldown
   *      h. Append timeline event
   *   3. Shield regen per alive vessel (shieldRegen × civDy)
   *   4. _checkEndConditions → _finalizeBattle (P3-4 doda retreat threshold)
   *
   * Damage roll PRNG seed: encounter.seedBase + currentRound (deterministyczne).
   *
   * @private
   */
  _tickEncounter(encounter, civDy) {
    encounter.currentRound++;
    encounter.currentYear = encounter.startYear + encounter.currentRound * civDy;

    const round = this._ensureTimelineRound(encounter);
    const rng = mulberry32(encounter.seedBase + encounter.currentRound);

    // Średnia odległość między stronami (dla timeline distanceAU).
    const distSamples = [];

    // Strony i ich ownerEmpireId — używane do tech-mult lookup i target picking.
    const sideAVids = [...encounter.sideA.vesselIds, ...encounter.sideA.joinedVesselIds];
    const sideBVids = [...encounter.sideB.vesselIds, ...encounter.sideB.joinedVesselIds];

    // M1 (decyzja 4, Finding 689) — OGIEŃ JEDNOCZESNY. Strzelają WSZYSCY żywi z POCZĄTKU rundy (migawka niżej), także okręt
    // zniszczony w tej samej rundzie salwą drugiej strony. Dawniej strona A (zawsze gracz — `_createEncounter(playerGroup, …)`)
    // strzelała pierwsza, a okręt B zestrzelony w jej salwie nie odpowiadał: w bitwie właściciela niszczyciel gracza z 2,4 %
    // HP zabił niszczyciel AI z 8,4 %, zanim ten wystrzelił (2v2 ziarno 16, runda 16). Lustro poprawki walki naziemnej
    // (Finding 309, `CombatSystem._runBattleRound`): kolejność losowań bez zmian (salwa A, potem B), cel wybierany z bieżącego
    // stanu — kolejny strzelec TEJ SAMEJ strony widzi trafienia poprzedników i nie strzela w trupa, po obu stronach tak samo.
    const aliveAtStart = new Set();
    for (const [vid, s] of encounter.vesselStates) if (s && s.hp > 0) aliveAtStart.add(vid);

    const fireFromSide = (attackerVids, defenderVids, attackerOwner) => {
      for (const aid of attackerVids) {
        const aState = encounter.vesselStates.get(aid);
        if (!aState || !aliveAtStart.has(aid)) continue;
        const aVessel = this._vm?._vessels?.get(aid);
        if (!aVessel) continue;

        for (const weapon of aState.weapons) {
          // Cooldown decrement (per-tick — civDy * 1 = jeden "tick year unit").
          if (weapon.cooldownYearsRemaining > 0) {
            weapon.cooldownYearsRemaining = Math.max(0, weapon.cooldownYearsRemaining - civDy);
            continue;
          }

          const effectiveRangeAU = this._resolveWeaponRange(weapon, attackerOwner);

          // Find target — Opcja D engage priority dla player, closest fallback.
          const target = this._pickTarget(aVessel, aState, defenderVids, encounter, effectiveRangeAU);
          if (!target) continue;
          const { vesselId: tid, distanceAU } = target;
          const tState = encounter.vesselStates.get(tid);
          if (!tState) continue;

          distSamples.push(distanceAU);

          // Range gating.
          if (distanceAU > effectiveRangeAU) continue;

          // Roll hit.
          // tracking mult (kategoria) tylko dla player; empire bez tech P3.
          let effectiveTracking = weapon.tracking;
          if (attackerOwner === 'player') {
            const techSys = window.KOSMOS?.techSystem;
            if (techSys?.getMultiplier) {
              effectiveTracking *= techSys.getMultiplier(`weapon_tracking_${weapon.category}`);
            }
          }
          // Celność (fix „strzały przeważnie niecelne"): ×HIT_CHANCE_MULT + wyższy floor.
          const hitChance = Math.max(0.10, Math.min(0.95, effectiveTracking * HIT_CHANCE_MULT * (1 - tState.evasion)));
          const hit = rng() < hitChance;

          if (!hit) {
            round.events.push({
              attacker: aid, target: tid, weapon: weapon.moduleId,
              hit: false, damage: 0, blockedByShield: 0,
              distanceAU,
            });
            // Cooldown reset też przy miss — broń strzeliła, czas naładowania reszta.
            weapon.cooldownYearsRemaining = weapon.fireCooldownYears;
            continue;
          }

          // Apply damage: shield absorb → armor reduce → hp.
          // ×DAMAGE_MULT (fix „walka trwa cholernie długo") — starcia rozstrzygają się
          // przez zniszczenie, nie przez time-out (limit rund zdjęty w M1).
          let damage = weapon.damage * DAMAGE_MULT;
          let blockedByShield = 0;
          if (tState.shieldHP > 0) {
            blockedByShield = Math.min(tState.shieldHP, damage);
            tState.shieldHP -= blockedByShield;
            damage -= blockedByShield;
          }
          if (damage > 0) {
            // Armor reduction (− armor × 0.4 z minimum 1 — BattleSystem-like).
            // armorPierce redukuje effective armor.
            const effectiveArmor = Math.max(0, tState.armor - (weapon.armorPierce ?? 0));
            const armorReduction = effectiveArmor * 0.4;
            const netDamage = Math.max(1, damage - armorReduction);
            tState.hp -= netDamage;
            damage = netDamage;
          } else {
            damage = 0;
          }

          round.events.push({
            attacker: aid, target: tid, weapon: weapon.moduleId,
            hit: true, damage, blockedByShield, distanceAU,
          });

          weapon.cooldownYearsRemaining = weapon.fireCooldownYears;
        }
      }
    };

    // Fire from sideA → sideB i odwrotnie.
    fireFromSide(sideAVids, sideBVids, encounter.sideA.ownerEmpireId);
    fireFromSide(sideBVids, sideAVids, encounter.sideB.ownerEmpireId);

    // ── Fleet Command Console (Slice 1) — FX-only emit dla smug na ŻYWEJ mapie ──
    // Snapshot pozycji AT EMIT (vessele ruszają się/giną do czasu odtworzenia FX).
    // CZYSTO WIZUALNE — nie dotyka matematyki walki ani round.events (kontrakt kino/save).
    // ThreeRenderer subskrybuje i bramkuje endpointy przez _resolveFxEndpoint (fog-of-war).
    if (GAME_CONFIG.FEATURES?.fcCombatFx && round.events.length > 0) {
      const vm = this._vm;
      const snap = (id) => {
        const p = vm?._vessels?.get(id)?.position;
        return (p && Number.isFinite(p.x) && Number.isFinite(p.y)) ? { x: p.x, y: p.y } : null;
      };
      EventBus.emit('combat:roundFx', {
        encounterId: encounter.id,
        // POLISH P2a (CP7, Finding 453) — układ starcia: renderer rysuje salwę WYŁĄCZNIE w oglądanym układzie
        // (`isEngagementInView`); pozycje niżej są lokalne dla układu, więc bez tego pola nie da się ich przypisać.
        systemId:    encounter.location.systemId,
        midpoint:    { x: encounter.location.point.x, y: encounter.location.point.y },
        events: round.events.map(ev => ({
          attacker: ev.attacker, target: ev.target,
          category: SHIP_MODULES[ev.weapon]?.stats?.category ?? null,
          hit: ev.hit, blockedByShield: ev.blockedByShield,
          aPos: snap(ev.attacker), tPos: snap(ev.target),
        })),
      });
    }

    // Shield regen (alive vessels).
    for (const state of encounter.vesselStates.values()) {
      if (state.hp <= 0) continue;
      if (state.shieldRegen > 0 && state.shieldHP < state.shieldHPStart) {
        state.shieldHP = Math.min(state.shieldHPStart, state.shieldHP + state.shieldRegen * civDy);
      }
    }

    // Średnia distance dla timeline.
    if (distSamples.length > 0) {
      round.distanceAU = distSamples.reduce((s, d) => s + d, 0) / distSamples.length;
    }

    // M4 P3 polish 2026-05-18 (drugi playtest) — periodic disengage check.
    // combatRangeExit event fires TYLKO raz przy przekroczeniu 0.20 AU. Player
    // dalej oddalający się do 0.8 AU nie dostaje kolejnego eventu, więc retreat
    // bazujący wyłącznie na evencie nie działa. Per-tick check w _tickEncounter
    // gwarantuje że gdy strona faktycznie wyjdzie poza COMBAT_DISENGAGE_AU,
    // encounter natychmiast się kończy z odpowiednim retreated/winner.
    const mid = encounter.location.point;
    const aOut = this._allOutsideOf(encounter, sideAVids, mid);
    const bOut = this._allOutsideOf(encounter, sideBVids, mid);
    if (aOut || bOut) {
      if (window.KOSMOS?.debug?.combatTrace) {
        const disengageAU = GAME_CONFIG.COMBAT_DISENGAGE_AU;
        console.log(`[DSCS] disengage check fail — aOut=${aOut} bOut=${bOut} disengage_thresh=${disengageAU}AU mid=(${mid.x.toFixed(1)},${mid.y.toFixed(1)}) round=${encounter.currentRound}`);
        const dumpSide = (label, vids) => {
          for (const vid of vids) {
            const state = encounter.vesselStates.get(vid);
            const v = this._vm?._vessels?.get(vid);
            if (!state || !v) continue;
            const dAU = Math.hypot(v.position.x - mid.x, v.position.y - mid.y) / AU_TO_PX;
            console.log(`  ${label} ${vid}: state=${v.position?.state} hp=${state.hp.toFixed(0)} pos=(${v.position.x.toFixed(1)},${v.position.y.toFixed(1)}) distFromMid=${dAU.toFixed(3)}AU ${dAU > disengageAU ? 'OUT' : 'IN'}`);
          }
        };
        dumpSide('A', sideAVids);
        dumpSide('B', sideBVids);
      }
    }
    if (aOut && bOut) {
      this._finalizeBattle(encounter, null, null, 'disengage');
      return;
    } else if (aOut) {
      this._finalizeBattle(encounter, 'B', 'A', 'disengage');
      return;
    } else if (bOut) {
      this._finalizeBattle(encounter, 'A', 'B', 'disengage');
      return;
    }

    const endResult = this._checkEndConditions(encounter);
    if (endResult) { this._finalizeBattle(encounter, endResult.winner, endResult.retreated, 'destroyed'); return; }

    // M1 (decyzja 3) — odwrót AI przy niskim HP to PRAWDZIWY LOT: strona dostaje rozkazy odwrotu, starcie trwa, a kończy się
    // dopiero, gdy jej żywi wyjdą poza `COMBAT_DISENGAGE_AU` (gałąź `_allOutsideOf` wyżej). Po drodze można do nich strzelać.
    const fleeKey = this._aiRetreatSide(encounter);
    if (fleeKey) this._orderSideRetreat(encounter, fleeKey);

    // M1 (decyzja 5) — strażnik „nikt nie może zadać obrażeń”: remis BEZ wraków żywych.
    const combA = this._combatantsOf(encounter, sideAVids);
    const combB = this._combatantsOf(encounter, sideBVids);
    if (this._deadlocked(combA, combB, encounter.sideA.ownerEmpireId, encounter.sideB.ownerEmpireId)) {
      EventBus.emit('combat:noDamagePossible', {
        encounterId: encounter.id, round: encounter.currentRound, systemId: encounter.location.systemId,
        aliveA: combA.length, aliveB: combB.length,
      });
      this._finalizeBattle(encounter, null, null, 'no_damage_possible');
      return;
    }

    // M1 (decyzja 5) — ukryty bezpiecznik długości: remis BEZ wraków żywych.
    if (encounter.currentRound >= SAFETY_ROUND_CAP) {
      EventBus.emit('combat:safetyCap', {
        encounterId: encounter.id, round: encounter.currentRound, systemId: encounter.location.systemId,
        aliveA: combA.length, aliveB: combB.length,
      });
      this._finalizeBattle(encounter, null, null, 'safety_cap');
    }
  }

  /**
   * M1 (decyzja 3) — strona AI, która przekroczyła próg odwrotu w tej rundzie, albo `null`. Reguła bez zmian od M4 P3 polish
   * (2026-05-18): HP strony ≤ `RETREAT_THRESHOLD` × HP startowe (z posiłkami) ORAZ < połowy procentu przeciwnika. Gracz nie ma
   * auto-odwrotu (decyduje sam: „Wycofaj się z bitwy”, doktryna `retreat_at_50`). Strona już uciekająca — pomijana (rozkazy raz).
   * @private
   * @returns {'A'|'B'|null}
   */
  _aiRetreatSide(encounter) {
    const hpStartA = this._sideAggregateHpStart(encounter, 'A');
    const hpStartB = this._sideAggregateHpStart(encounter, 'B');
    const pctA = hpStartA > 0 ? this._sumHP(encounter, 'A') / hpStartA : 1.0;
    const pctB = hpStartB > 0 ? this._sumHP(encounter, 'B') / hpStartB : 1.0;
    const aiA = encounter.sideA.ownerEmpireId !== 'player' && !encounter.sideA.retreating;
    const aiB = encounter.sideB.ownerEmpireId !== 'player' && !encounter.sideB.retreating;
    if (aiA && pctA <= RETREAT_THRESHOLD && pctA < pctB * 0.5) return 'A';
    if (aiB && pctB <= RETREAT_THRESHOLD && pctB < pctA * 0.5) return 'B';
    return null;
  }

  /**
   * M1 (decyzja 3) — rozkazy odwrotu dla żywych okrętów strony (raz na stronę: znacznik `side.retreating`, w zapisie razem ze
   * stroną). Rozkaz wydaje `AutoRetreatSystem._issueRetreatOrder` — ta sama droga co dawny odwrót PO bitwie (cel z
   * `resolveShelterOrderSpec`, znacznik `retreatFromBattleId` = id przyszłego rekordu bitwy, Dziennik „wycofuje się do …”);
   * zmienia się wyłącznie chwila: w trakcie starcia, nie po nim. Bez `AutoRetreatSystem` (keepery headless) — rozkaz wprost
   * przez MOS, bez linii Dziennika. Okręt, któremu nie znaleziono schronienia, zostaje i walczy dalej.
   * @private
   * @returns {number} ile okrętów dostało rozkaz
   */
  _orderSideRetreat(encounter, key) {
    const side = key === 'A' ? encounter.sideA : encounter.sideB;
    side.retreating = true;
    const battleId = encounter.id.replace(/^encounter_/, 'battle_ds_');
    const point = encounter.location.point;
    const ar = window.KOSMOS?.autoRetreatSystem;
    const mos = window.KOSMOS?.movementOrderSystem;
    let alive = 0, ordered = 0;
    for (const vid of [...side.vesselIds, ...side.joinedVesselIds]) {
      const st = encounter.vesselStates.get(vid);
      if (!st || st.hp <= 0) continue;
      const v = this._vm?._vessels?.get(vid);
      if (!v || v.isWreck) continue;
      alive++;
      if (_isRetreatingFromCombat(v)) { ordered++; continue; }
      let ok = false;
      if (ar?._issueRetreatOrder) {
        ok = ar._issueRetreatOrder(v, battleId, point) != null;
      } else if (mos?.resolveShelterOrderSpec && mos.issueOrder) {
        const plan = mos.resolveShelterOrderSpec(v, { avoidPoint: point, issuedBy: 'auto_retreat' });
        const res = plan?.ok ? mos.issueOrder(v.id, plan.spec) : null;
        if (res?.ok) { mos.markAsRetreat?.(v, battleId); ok = true; }
      }
      if (ok) ordered++;
    }
    EventBus.emit('combat:retreatStarted', {
      encounterId: encounter.id, battleId, side: key, ownerEmpireId: side.ownerEmpireId,
      round: encounter.currentRound, alive, ordered,
    });
    return ordered;
  }

  /**
   * M1 (decyzja 3) — PRAWDZIWA UCIECZKA NA ZEGARZE STARCIA. Uciekający członek starcia (znacznik odwrotu na rozkazie — wszyscy
   * trzej producenci: „Wycofaj się z bitwy” gracza, doktryna `retreat_at_50`, odwrót AI) leci SWOIM rozkazem ruchu, ale
   * w trakcie starcia jego lot biegnie na ZEGARZE STARCIA: co rundę `speedAU × CLOSE_STEP_YEARS` wzdłuż własnej trasy — ta
   * sama baza co zbliżanie (SB49), więc uciekający i ścigający mają jedno tempo. Bez tego lot szedł czasem GRY, a świat
   * w starciu tyka 1 d/s: ~0,0006 AU na rundę (zmierzone sondą M1), czyli wyjście poza `COMBAT_DISENGAGE_AU` trwałoby ponad
   * 800 rund — ucieczki nie było, a dawny limit 20 rund kończył bitwę przed nią.
   * Mechanizm: przesunięcie osi czasu misji `move_to_point` (`departYear` i `arrivalYear` o krok) — interpolacja
   * `VesselManager._updatePositions` niesie statek dalej po JEGO trasie (omija gwiazdę jak zwykle); DSCS nie pisze `x/y`.
   * Poza `COMBAT_DISENGAGE_AU` od punktu starcia statek uciekł: przyspieszanie stop i lot przeplanowany od bieżącej pozycji
   * (`VesselManager.rebaseTransitFromHere` — przechwycenie ciała-schronienia od nowa; inaczej przylot przeskoczyłby o drogę,
   * którą ciało przebywa w przesuniętym czasie). Uciekający strzela i można do niego strzelać.
   * @private
   * @returns {number} ile lotów przyspieszono w tej rundzie
   */
  _advanceFleeing(encounter) {
    const vm = this._vm;
    const gy = this._year();
    const mid = encounter.location.point;
    const disengagePx = GAME_CONFIG.COMBAT_DISENGAGE_AU * AU_TO_PX;
    let n = 0;
    for (const [id, st] of encounter.vesselStates) {
      if (!st || st.hp <= 0) continue;
      const v = vm?._vessels?.get(id);
      if (!v?.position || v.isWreck || !_isRetreatingFromCombat(v)) continue;
      const m = v.mission;
      if (v.position.state !== 'in_transit' || m?.type !== 'move_to_point') continue;
      if (!Number.isFinite(m.departYear) || !Number.isFinite(m.arrivalYear)) continue;
      const out = Math.hypot(v.position.x - mid.x, v.position.y - mid.y) > disengagePx;
      // Poza zasięgiem starcia albo krok doprowadziłby go do celu teraz — koniec przyspieszania, lot przeplanowany od tu.
      if (out || m.arrivalYear - CLOSE_STEP_YEARS <= gy) {
        if (st.fleeCompressedYears > 0) { vm.rebaseTransitFromHere?.(v); st.fleeCompressedYears = 0; }
        continue;
      }
      m.departYear -= CLOSE_STEP_YEARS;
      m.arrivalYear -= CLOSE_STEP_YEARS;
      st.fleeCompressedYears = (st.fleeCompressedYears ?? 0) + CLOSE_STEP_YEARS;
      n++;
    }
    return n;
  }

  /**
   * M1 (decyzja 5) — uczestnicy strony do strażnika: żywi, z pozycją, z odpowiedzią „może podejść” (lustro wykluczeń
   * `_closeToWeaponRange`: wolny w przestrzeni, nie uciekający) i „porusza się” (lot w toku albo ruch prowadzony rozkazem —
   * lista `VesselManager._updatePositions`, `isOrderControlled`).
   * @private
   */
  _combatantsOf(encounter, vids) {
    const out = [];
    for (const id of vids) {
      const st = encounter.vesselStates.get(id);
      if (!st || st.hp <= 0) continue;
      const v = this._vm?._vessels?.get(id);
      if (!v?.position || v.isWreck) continue;
      const p = v.position;
      const xy = (p.dockedAt != null && p.state !== 'in_transit') ? this._pinnedXY(v, p.dockedAt) : { x: p.x, y: p.y };
      out.push({
        id, st, x: xy.x, y: xy.y,
        approach: !_isRetreatingFromCombat(v) && p.state === 'orbiting' && p.dockedAt == null,
        moving: p.state === 'in_transit' || _isOrderMoved(v),
      });
    }
    return out;
  }

  /**
   * M1 — pozycja statku przypiętego do ciała TAK, JAK USTAWI GO `VesselManager._updatePositions` (gałąź „orbitujące bez misji”):
   * slot orbity, gdy statek ma orbitę w `OrbitalSpaceSystem`, inaczej środek ciała (tak stoi wróg przypięty do kolonii gracza).
   * Strażnik czyta ją zamiast surowego `x/y`, bo przypięcie w chwili startu starcia przestawia statek dopiero w `_updatePositions`
   * — PO pierwszej rundzie; bez tego 1. runda widziałaby wroga w starym miejscu (do 0,315 AU) i strażnik dawałby fałszywy pat,
   * a samoleczenie pary w `ProximitySystem` — pętlę jednorundowych starć. `× 10` / `÷ 10` — skala świata (jak w VM).
   * @private
   */
  _pinnedXY(v, bodyId) {
    const body = this._vm?._findEntity?.(bodyId);
    if (!Number.isFinite(body?.x) || !Number.isFinite(body?.y)) return { x: v.position.x, y: v.position.y };
    const oss = window.KOSMOS?.orbitalSpaceSystem;
    if (oss?.getOrbit?.(v.id)) {
      const pos = oss.getPosition?.(v.id, { x: body.x / 10, z: body.y / 10 }, orbitClockSec());
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.z)) return { x: pos.x * 10, y: pos.z * 10 };
    }
    return { x: body.x, y: body.y };
  }

  /**
   * M1 (decyzja 5) — uczestnicy PRZYSZŁEGO starcia do strażnika na starcie (`startEngagement`), w stanie PO zamrożeniu, które
   * zrobi `_createEncounter`: wróg zawsze (`orbiting`, przypięty do dominującego ciała gracza w tym samym układzie, inaczej
   * dotychczasowe `dockedAt`), gracz — przy `m4PlayerCombatMissionPause` tak samo, bez flagi zostaje w swoim stanie.
   * @private
   */
  _prospectiveCombatants(vessels, pin, frozen) {
    const out = [];
    for (const v of vessels) {
      if (!v?.position || v.isWreck) continue;
      const p = v.position;
      const state = frozen ? 'orbiting' : p.state;
      const docked = frozen ? this._postFreezeDockedAt(v, pin) : (p.dockedAt ?? null);
      // Przypięty do ciała stanie tam, gdzie postawi go `VesselManager` (`_pinnedXY`: slot orbity albo środek ciała — tak stoi wróg
      // przypięty do kolonii gracza). Bez tego atak na broniony orbitujący szyk liczyłby odległość sprzed zamrożenia (do 0,315 AU)
      // i strażnik odmawiałby starcia, które po zamrożeniu jest w zasięgu.
      const { x, y } = (docked != null && state !== 'in_transit') ? this._pinnedXY(v, docked) : { x: p.x, y: p.y };
      out.push({
        id: v.id, st: this._buildVesselState(v), x, y,
        approach: !_isRetreatingFromCombat(v) && state === 'orbiting' && docked == null,
        moving: state === 'in_transit' || _isOrderMoved(v),
      });
    }
    return out;
  }

  /** `dockedAt` statku po `_freezeAsStationary(v, pin)` — ta sama reguła (przypięcie tylko do ciała z tego samego układu). @private */
  _postFreezeDockedAt(v, pin) {
    if (pin) {
      const body = this._vm?._findEntity?.(pin);
      if (body && isSameSystemStrict(body, v)) return pin;
    }
    return v.position?.dockedAt ?? null;
  }

  /**
   * M1 (decyzja 5) — STRAŻNIK „NIKT NIE MOŻE ZADAĆ OBRAŻEŃ”. Prawda, gdy ŻADNA strona nie może już (teraz ani później)
   * zadać obrażeń drugiej, a nikt się nie porusza (lot w toku i ruch rozkazem mogą zmienić geometrię — wtedy czekamy).
   * Strona może zadać obrażenia, gdy ma żywy uzbrojony okręt, który ma żywy cel w zasięgu swojej broni albo może podejść,
   * a cel nie siedzi za tarczą nie do przebicia (regeneracja na rundę ≥ największe obrażenia strony na rundę i tarcza teraz
   * ≥ te obrażenia — wtedy tarcza nigdy nie opada). Jedna strona zdolna — walka trwa (bezbronna ginie albo ucieka).
   * W zwykłej walce niewidoczny (420 bitew stagera: 0 razy); łapie starcia, których dawniej kończył dopiero limit 20 rund:
   * obie strony na orbitach ciał poza zasięgiem, uzbrojony przypięty do ciała wobec bezbronnego poza zasięgiem, tarcze.
   * @param {object[]} A, B — uczestnicy (`_combatantsOf` / `_prospectiveCombatants`)
   * @private
   */
  _deadlocked(A, B, ownerA, ownerB) {
    if (A.some((c) => c.moving) || B.some((c) => c.moving)) return false;
    return !this._sideCanDamage(A, B, ownerA) && !this._sideCanDamage(B, A, ownerB);
  }

  /** @private */
  _sideCanDamage(mine, foes, owner) {
    const armed = mine.filter((c) => c.st?.weapons?.length > 0);
    if (!armed.length || !foes.length) return false;
    let maxDmg = 0;   // największe obrażenia strony na rundę (każda broń trafia)
    for (const c of armed) for (const w of c.st.weapons) maxDmg += (w.damage ?? 0) * DAMAGE_MULT;
    for (const f of foes) {
      const regen = (f.st?.shieldRegen ?? 0) * CIV_PER_ROUND;
      if ((f.st?.shieldHP ?? 0) >= maxDmg && regen >= maxDmg) continue;   // tarcza nie do przebicia
      for (const c of armed) {
        if (c.approach) return true;
        const range = Math.max(...c.st.weapons.map((w) => this._resolveWeaponRange(w, owner)));
        if (Math.hypot(f.x - c.x, f.y - c.y) / AU_TO_PX <= range) return true;
      }
    }
    return false;
  }

  /**
   * Sprawdź czy encounter się kończy ZNISZCZENIEM strony (M1 — jedyny warunek rozstrzygający poza ucieczką):
   *   - obie strony bez żywych → remis (`winner` null, wzajemne zniszczenie)
   *   - sideA all hp ≤ 0 → winner='B', retreated=null (kill)
   *   - sideB all hp ≤ 0 → winner='A', retreated=null (kill)
   *
   * ⚠ M1 (decyzje 1 i 3) — ZDJĘTE dwie gałęzie: (1) TIME-OUT po 20 rundach z wygraną większej bezwzględnej sumy HP (i wrakiem
   * żywych przegranych w `_finalizeBattle`, Finding 688); (2) natychmiastowy koniec przy odwrocie AI — odwrót jest teraz
   * prawdziwym lotem (`_aiRetreatSide` → `_orderSideRetreat` → `_advanceFleeing`), a starcie kończy gałąź `_allOutsideOf`
   * w `_tickEncounter`, gdy uciekający są poza `COMBAT_DISENGAGE_AU`.
   *
   * @private
   * @returns {{winner: 'A'|'B'|null, retreated: null}|null}
   */
  _checkEndConditions(encounter) {
    const sideAVids = [...encounter.sideA.vesselIds, ...encounter.sideA.joinedVesselIds];
    const sideBVids = [...encounter.sideB.vesselIds, ...encounter.sideB.joinedVesselIds];

    const aliveA = sideAVids.filter(vid => (encounter.vesselStates.get(vid)?.hp ?? 0) > 0).length;
    const aliveB = sideBVids.filter(vid => (encounter.vesselStates.get(vid)?.hp ?? 0) > 0).length;

    if (aliveA === 0 && aliveB === 0) return { winner: null, retreated: null };
    if (aliveA === 0)                  return { winner: 'B',  retreated: null };
    if (aliveB === 0)                  return { winner: 'A',  retreated: null };
    return null;
  }

  /**
   * Suma hpStart vesseli strony (initial + joined reinforcement).
   * Używane do dynamicznego retreat threshold (Opcja B).
   *
   * @private
   */
  _sideAggregateHpStart(encounter, sideKey) {
    const side = sideKey === 'A' ? encounter.sideA : encounter.sideB;
    let sum = 0;
    for (const vid of [...side.vesselIds, ...side.joinedVesselIds]) {
      const state = encounter.vesselStates.get(vid);
      if (state) sum += state.hpStart;
    }
    return sum;
  }

  /**
   * Target selection — Opcja D engage priority dla player + closest fallback.
   *
   * @private
   * @returns {{vesselId: string, distanceAU: number}|null}
   */
  _pickTarget(attackerVessel, attackerState, defenderVids, encounter, effectiveRangeAU) {
    const ax = attackerVessel.position.x;
    const ay = attackerVessel.position.y;

    // Player engage priority — jeśli vessel ma movementOrder.type='engage'
    // z engageTargetId, target jest w przeciwnej stronie i w zasięgu, prioritize.
    const order = attackerVessel.movementOrder;
    if (order?.type === 'engage' && order.targetEntityId) {
      const eid = order.targetEntityId;
      if (defenderVids.includes(eid)) {
        const tState = encounter.vesselStates.get(eid);
        const tVessel = this._vm?._vessels?.get(eid);
        if (tState && tState.hp > 0 && tVessel) {
          const dx = (tVessel.position.x - ax) / AU_TO_PX;
          const dy = (tVessel.position.y - ay) / AU_TO_PX;
          const distAU = Math.hypot(dx, dy);
          if (distAU <= effectiveRangeAU) {
            return { vesselId: eid, distanceAU: distAU };
          }
          // engage target poza zasięgiem — fallback closest.
        }
      }
    }

    // Closest live enemy fallback.
    let bestId = null;
    let bestDistAU = Infinity;
    for (const did of defenderVids) {
      const dState = encounter.vesselStates.get(did);
      if (!dState || dState.hp <= 0) continue;
      const dVessel = this._vm?._vessels?.get(did);
      if (!dVessel) continue;
      const dx = (dVessel.position.x - ax) / AU_TO_PX;
      const dy = (dVessel.position.y - ay) / AU_TO_PX;
      const distAU = Math.hypot(dx, dy);
      if (distAU < bestDistAU) {
        bestDistAU = distAU;
        bestId = did;
      }
    }
    if (bestId == null) return null;
    return { vesselId: bestId, distanceAU: bestDistAU };
  }

  /**
   * Combat range exit handler (P3-4).
   *
   * M4 P3 polish 2026-05-18 (drugi playtest) — identyfikacja retreating side:
   *   - Jeśli WSZYSCY żywi vessele strony są poza COMBAT_DISENGAGE_AU od midpoint
   *     → strona "uciekła" → retreated dla tej strony (LOSS).
   *   - Jeśli OBA sides poza disengage → mutual disengagement → draw.
   *   - Jeśli tylko jedna strona poza → retreated=tamta_strona, winner=druga.
   *   - Else: encounter trwa (jakieś vessele dalej w combat range).
   *
   * Player implicit retreat: po cancel engage + moveToPoint poza COMBAT_DISENGAGE_AU
   *   → trafia w gałąź "tylko sideA poza" → retreated='A' (player loss).
   *   ⚠ M1: zwykły rozkaz ruchu w trakcie starcia leci czasem GRY (~0,0006 AU na rundę), więc ta droga praktycznie nie
   *   wychodzi poza 0,5 AU; na zegarze starcia leci wyłącznie rozkaz ODWROTU (`_advanceFleeing`).
   * Enemy stationary AI nigdy nie wychodzi z midpoint (mission=null); M1 — przy niskim HP dostaje rozkazy odwrotu
   *   (`_orderSideRetreat`) i ucieka prawdziwym lotem, a starcie kończy się, gdy wyjdzie poza COMBAT_DISENGAGE_AU.
   *
   * @private
   */
  _handleCombatRangeExit({ vesselAId, vesselBId }) {
    if (!vesselAId || !vesselBId) return;
    const encA = this._findActiveEncounterContaining(vesselAId);
    const encB = this._findActiveEncounterContaining(vesselBId);
    const enc = encA ?? encB;
    if (!enc || !enc.isActive) return;
    if (encA && encB && encA !== encB) return;

    const mid = enc.location.point;

    const sideAVids = [...enc.sideA.vesselIds, ...enc.sideA.joinedVesselIds];
    const sideBVids = [...enc.sideB.vesselIds, ...enc.sideB.joinedVesselIds];

    const aOut = this._allOutsideOf(enc, sideAVids, mid);
    const bOut = this._allOutsideOf(enc, sideBVids, mid);

    if (aOut && bOut) {
      // Mutual disengagement → draw
      this._finalizeBattle(enc, null, null, 'disengage');
    } else if (aOut) {
      // sideA uciekło → retreated='A', winner='B'
      this._finalizeBattle(enc, 'B', 'A', 'disengage');
    } else if (bOut) {
      // sideB uciekło → retreated='B', winner='A'
      this._finalizeBattle(enc, 'A', 'B', 'disengage');
    }
    // Else: jakieś vessele dalej w combat range → encounter trwa
  }

  /**
   * Debug helper: lista żywych vesseli z ich pozycjami i dystansami od mid.
   * @private
   */
  _aliveVids(encounter, vids) {
    const mid = encounter.location.point;
    const out = [];
    for (const vid of vids) {
      const state = encounter.vesselStates.get(vid);
      if (!state || state.hp <= 0) continue;
      const v = this._vm?._vessels?.get(vid);
      if (!v) continue;
      const dAU = Math.hypot(v.position.x - mid.x, v.position.y - mid.y) / AU_TO_PX;
      out.push({ id: vid, hp: state.hp, distAU: +dAU.toFixed(3), state: v.position?.state });
    }
    return out;
  }

  /**
   * Czy wszyscy żywi vessele strony są poza COMBAT_DISENGAGE_AU od midpoint.
   * Używane przez _handleCombatRangeExit do identyfikacji retreating side.
   * @private
   */
  _allOutsideOf(encounter, vids, mid) {
    // Bugfix 2026-05-21 — vessele z dockedAt != null (zaorbiowane na
    // planecie/księżycu) NIE klasyfikujemy jako retreated. Są w bazie,
    // nie uciekają. Orbita ciała niebieskiego wokół słońca może je oddalić
    // od statycznego midpointu / frozen enemy, ale to mechanika orbitalna,
    // nie ruch wycofania. Walka kończy się normalnie przez kill (HP=0) lub
    // strażnika (M1: dawny time-out zdjęty). Symetrycznie wykluczamy state='docked' (vessel
    // siedzi w hangarze).
    // ⚠ D-FDd (slice RETREAT_TARGET) — WYJĄTEK OD GUARDU WYŻEJ. Guard z 2026-05-21 mówi
    // „zadokowany ≠ uciekający" i to zostaje prawdą dla OBROŃCY. Ale po naprawie F-D udany odwrót
    // KOŃCZY SIĘ orbitą ciała (`dockedAt = bodyId`), więc bez tego wyjątku uciekinier wypadałby
    // z liczenia: `aliveCount` schodziłoby do zera, `_allOutsideOf` zwracałoby `false`, bitwa
    // dojeżdżała do dawnego limitu rund z `retreated = null` — i robiła side-level wrak ŻYWYCH
    // przegranych. Czyli udany odwrót byłby groźniejszy od nieudanego. (M1 zdjął limit i ten wrak —
    // wyjątek zostaje: bez niego udany odwrót zostawiałby starcie bez końca.)
    // Wyjątek NIE zakłada, że uciekinier jest daleko — dopuszcza go tylko do TESTU ODLEGŁOŚCI
    // niżej. Ciało bliżej niż clearance dalej policzy się jako „w środku".
    // ⚠ Wyścig jest realny i zmierzony: przy 1 r/s statek pokonuje ~1,85 AU na jedną rundę
    //   (110 ms), więc potrafi przejść z „wewnątrz" wprost w „zadokowany" między dwoma
    //   sprawdzeniami. Sam bufor odległości w selektorze tego NIE zamyka — dlatego marker.
    const isRetreating = _isRetreatingFromCombat;

    const disengagePx = GAME_CONFIG.COMBAT_DISENGAGE_AU * AU_TO_PX;
    let aliveCount = 0;
    let outsideCount = 0;
    for (const vid of vids) {
      const state = encounter.vesselStates.get(vid);
      if (!state || state.hp <= 0) continue;
      const v = this._vm?._vessels?.get(vid);
      if (!v) continue;
      const retreating = isRetreating(v);
      if (!retreating && v.position?.state === 'docked') continue;
      if (!retreating && v.position?.dockedAt != null) continue;  // orbituje ciało → nie ucieka
      aliveCount++;
      const dx = v.position.x - mid.x;
      const dy = v.position.y - mid.y;
      if (Math.hypot(dx, dy) > disengagePx) outsideCount++;
    }
    return aliveCount > 0 && aliveCount === outsideCount;
  }

  // ── Finalize battle ──────────────────────────────────────────────────

  /**
   * Zakończ encounter z winner/retreated. Pełna semantyka P3-2:
   *   - Build BattleRecord (id, year, location, winner, retreated,
   *     participantA/B, timeline, lossesA/B, finalHPA/B, seed, endReason)
   *   - Per-vessel wreck pass (always): wszystkie vesselStates z hp ≤ 0 → wreck
   *     przez EnemyAttackHandler._turnIntoWreck(v, midpoint, year)
   *   - ⚠ M1 (decyzja 1) — side-level wreck żywych przegranych USUNIĘTY: okręt ginie wyłącznie przy 0 HP. Dawniej po
   *     time-oucie żywe okręty strony z mniejszą bezwzględną sumą HP szły na wrak (Finding 688).
   *   - Retreat outcome (retreated == 'A'|'B'): żywi pozostają i lecą dalej swoimi rozkazami odwrotu (M1: wydanymi w trakcie
   *     starcia); AutoRetreatSystem na battle:resolved dokłada rozkaz tylko statkom bez znacznika ucieczki
   *   - Loty uciekających przyspieszone na zegarze starcia (`_advanceFleeing`) — przeplanowane od bieżącej pozycji
   *   - gameState.set('battles.<id>', battleRec) + emit battle:resolved
   *   - encounter.isActive = false (cleanup w next _tick)
   *
   * @param {EncounterState} encounter
   * @param {'A'|'B'|null} winner — null = draw
   * @param {'A'|'B'|null} retreated — który ucieka (żywi pozostają)
   * @param {'destroyed'|'disengage'|'no_damage_possible'|'safety_cap'|'forced'|null} [endReason] — M1: dlaczego starcie się
   *   skończyło (w rekordzie bitwy; strażnik i bezpiecznik to remis bez wraków żywych)
   */
  _finalizeBattle(encounter, winner, retreated, endReason = null) {
    if (!encounter.isActive) return;

    const year = this._year();
    const mid = encounter.location.point;

    // Build BattleRecord (kompatybilny z VCS._applyOutcome payload).
    const lossesA = this._countLosses(encounter, 'A');
    const lossesB = this._countLosses(encounter, 'B');
    const finalHPA = this._sumHP(encounter, 'A');
    const finalHPB = this._sumHP(encounter, 'B');

    const battleId = encounter.id.replace(/^encounter_/, 'battle_ds_');
    const battleRec = {
      id:            battleId,
      warId:         null,
      year,
      location:      encounter.location,
      winner,
      retreated,
      seed:          encounter.seedBase,
      timeline:      encounter.timeline,
      lossesA,
      lossesB,
      // POLISH P2b (D5, Finding 450) — liczba rund starcia: jedno pole czytane przez okno wyniku (`BattleIntroModal` —
      // „Tur: N”), Dziennik (`GameScene` — „N tur”) i listę bitew wojny (`WarSystem.recordBattle` → `WarOverlay`);
      // dawniej brak pola ⇒ wszędzie „0”. Stare rekordy bez pola — czytelnicy `?? 0` (zapis v101 bez migracji).
      turns:         encounter.currentRound,
      // M1 — dlaczego starcie się skończyło: zniszczenie strony, wyjście poza zasięg (ucieczka), strażnik „nikt nie może
      // zadać obrażeń”, ukryty bezpiecznik rund albo wymuszenie (narzędzia). Stare rekordy bez pola — czytelnicy `?? null`.
      endReason,
      finalHPA,
      finalHPB,
      participantA: {
        type:      'vessel_group',
        empireId:  encounter.sideA.ownerEmpireId,
        vesselIds: [...encounter.sideA.vesselIds, ...encounter.sideA.joinedVesselIds],
        count:     encounter.sideA.vesselIds.length + encounter.sideA.joinedVesselIds.length,
        label:     encounter.sideA.label,
      },
      participantB: {
        type:      'vessel_group',
        empireId:  encounter.sideB.ownerEmpireId,
        vesselIds: [...encounter.sideB.vesselIds, ...encounter.sideB.joinedVesselIds],
        count:     encounter.sideB.vesselIds.length + encounter.sideB.joinedVesselIds.length,
        label:     encounter.sideB.label,
      },
    };

    // Per-vessel wreck pass (always — dead vessel z każdej strony).
    for (const [vid, state] of encounter.vesselStates) {
      if (state.hp <= 0) {
        const vessel = this._vm?._vessels?.get(vid);
        if (vessel && !vessel.isWreck) this._wreckOne(vessel, mid, year);
      }
    }

    // ⚠ M1 (decyzja 1) — TU STAŁ side-level wreck żywych przegranych („tylko brak retreat”, czyli po time-oucie po 20
    // rundach: strona z mniejszą bezwzględną sumą HP traciła WSZYSTKIE żywe okręty). Usunięty razem z time-outem — okręt
    // ginie wyłącznie przy 0 HP (pętla wyżej). Strażnik i bezpiecznik kończą remisem (`winner` null) — bez wraków żywych.
    // Retreat: żywi vessele retreatującej strony pozostają i lecą swoimi rozkazami odwrotu (M1: wydanymi w trakcie starcia).

    // M1 (decyzja 3) — lot przyspieszony na zegarze starcia, który trwał do końca starcia (np. ostatni wróg zginął, gdy
    // uciekający był jeszcze w zasięgu): przeplanowany od bieżącej pozycji, żeby przylot nie przeskoczył (`_advanceFleeing`).
    for (const [vid, state] of encounter.vesselStates) {
      if (!(state?.fleeCompressedYears > 0)) continue;
      const vessel = this._vm?._vessels?.get(vid);
      if (vessel && !vessel.isWreck && state.hp > 0) this._vm?.rebaseTransitFromHere?.(vessel);
      state.fleeCompressedYears = 0;
    }

    // Persist combat damage na żywych ocalałych (NIE wrakach).
    // Skanujemy WSZYSTKIE strony — retreat zachowuje swoich żywych, no-retreat
    // wins side wcześniej oznaczył przegranych jako wraków.
    for (const [vid, state] of encounter.vesselStates) {
      if (state.hp <= 0) continue;  // wrak — combatDamage irrelevant
      const vessel = this._vm?._vessels?.get(vid);
      if (!vessel || vessel.isWreck) continue;
      const hpMissing     = Math.max(0, (state.hpStart       ?? state.hp) - state.hp);
      const shieldMissing = Math.max(0, (state.shieldHPStart ?? 0)         - (state.shieldHP ?? 0));
      if (hpMissing === 0 && shieldMissing === 0) {
        // Bezstratny — wyczyść poprzedni damage (rare: tylko jeśli był).
        if (vessel.combatDamage) vessel.combatDamage = null;
        continue;
      }
      vessel.combatDamage = {
        hpMissing,
        shieldMissing,
        lastBattleYear: year,
      };
    }

    // Player combat mission pause/resume (gated) — wznów albo wycofaj zawieszone misje gracza
    // PRZED emitem battle:resolved (AutoRetreatSystem i tak pomija stronę gracza).
    this._resolveMissionsPostBattle(encounter, battleId);

    gameState.set?.(`battles.${battleId}`, battleRec, 'deep_space_combat');
    EventBus.emit('battle:resolved', { warId: null, battleId, result: battleRec });

    encounter.isActive = false;
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  /**
   * Buduj per-vessel state z hull + modules. Per-vessel (nie aggregate)
   * bo P3-3 wymienia damage per pair.
   *
   * @private
   * @returns {VesselState}
   */
  // Czy statek ma jakąkolwiek broń (moduł z stats.damage)? Lekki odpowiednik
  // _buildVesselState — bez budowania pełnego stanu. Używany przez bramkę
  // "bezbronni się nie biją" w startEngagement.
  _vesselHasWeapons(v) {
    for (const modId of v?.modules ?? []) {
      if (SHIP_MODULES?.[modId]?.stats?.damage != null) return true;
    }
    return false;
  }

  _buildVesselState(v) {
    const hull = HULLS?.[v.hullId] ?? HULLS?.[v.shipId];
    let hp = hull?.baseHP ?? 50;
    let armor = hull?.baseArmor ?? 0;
    let shieldHP = 0;
    let shieldRegen = 0;
    const weapons = [];
    const evasion = hull?.baseEvasion ?? 0.1;

    for (const modId of v.modules ?? []) {
      const mod = SHIP_MODULES?.[modId];
      if (!mod?.stats) continue;
      if (mod.stats.hpBonus)      hp += mod.stats.hpBonus;
      if (mod.stats.armorRating)  armor += mod.stats.armorRating;
      if (mod.stats.shieldHP)     shieldHP += mod.stats.shieldHP;
      if (mod.stats.shieldRegen)  shieldRegen += mod.stats.shieldRegen;
      if (mod.stats.damage != null) {
        weapons.push({
          moduleId:               modId,
          damage:                 mod.stats.damage,
          tracking:               mod.stats.tracking ?? 0.7,
          armorPierce:            mod.stats.armorPierce ?? 0,
          // M4 P3: deep-space-specific
          rangeAU:                mod.stats.rangeAU ?? this._fallbackRangeAU(mod.stats.range ?? mod.stats.category),
          category:               mod.stats.category ?? mod.stats.range ?? 'medium',
          fireCooldownYears:      mod.stats.fireCooldownYears ?? 0.5,
          cooldownYearsRemaining: 0,
        });
      }
    }

    // Hull baseline (pełne HP/shield z modułów).
    const hpStartFull     = Math.max(1, hp);
    const shieldStartFull = shieldHP;

    // Persisted combat damage (wcześniejsze bitwy) — vessel.combatDamage stampowany
    // w _finalizeBattle dla żywych ocalałych. Statki NIE regenerują HP automatycznie
    // między bitwami (decyzja gracza 2026-05-20). Naprawa = osobna mechanika (stocznia, TODO).
    const dmg = v.combatDamage;
    let hpCurrent     = hpStartFull;
    let shieldCurrent = shieldStartFull;
    if (dmg) {
      const hpMissing     = Math.max(0, dmg.hpMissing     ?? 0);
      const shieldMissing = Math.max(0, dmg.shieldMissing ?? 0);
      hpCurrent     = Math.max(1, hpStartFull     - hpMissing);
      shieldCurrent = Math.max(0, shieldStartFull - shieldMissing);
    }

    return {
      hp:            hpCurrent,
      hpStart:       hpStartFull,
      shieldHP:      shieldCurrent,
      shieldHPStart: shieldStartFull,
      shieldRegen,
      armor,
      evasion,
      weapons,
      joinedAtRound: 0,
    };
  }

  /**
   * Fallback gdy module nie ma rangeAU — z legacy string range/category.
   * Używa GameConfig WEAPON_*_AU stałych.
   *
   * @private
   */
  _fallbackRangeAU(category) {
    if (category === 'short')  return GAME_CONFIG.WEAPON_SHORT_AU;
    if (category === 'long')   return GAME_CONFIG.WEAPON_LONG_AU;
    return GAME_CONFIG.WEAPON_MED_AU;
  }

  /**
   * Effective weapon range (AU) z mnożnikami tech (kategoria + all).
   * Wołane z _tickEncounter w P3-3.
   *
   * @param {{rangeAU: number, category: string}} weapon
   * @param {string} ownerEmpireId — 'player' używa TechSystem; empire bez tech w P3.
   * @returns {number}
   */
  _resolveWeaponRange(weapon, ownerEmpireId) {
    const baseAU = weapon.rangeAU ?? this._fallbackRangeAU(weapon.category);
    let mult = 1.0;
    if (ownerEmpireId === 'player') {
      const techSys = window.KOSMOS?.techSystem;
      if (techSys?.getMultiplier) {
        mult *= techSys.getMultiplier(`weapon_range_${weapon.category}`);
        mult *= techSys.getMultiplier('weapon_range_all');
      }
    }
    // Empire tech state — P5 doda. W P3 zostaje mult=1.0 dla wrogów.
    return baseAU * mult;
  }

  /**
   * Stationary AI: zatrzymaj enemy vessela na pozycji wejścia w combat.
   * Mission=null (brak waypoint pursuit), state='orbiting' (no in_transit drift).
   *
   * @private
   */
  /**
   * Znajdź dockedAt który ma większość vesseli z listy. Używane do pin'owania
   * enemy do tej samej planety co player defenders (combat slow fix).
   * @private
   */
  _findDominantDockedAt(vessels) {
    if (!Array.isArray(vessels) || vessels.length === 0) return null;
    const counts = new Map();
    for (const v of vessels) {
      const d = v.position?.dockedAt;
      if (!d) continue;
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    if (counts.size === 0) return null;
    let bestId = null;
    let bestCount = 0;
    for (const [id, count] of counts) {
      if (count > bestCount) { bestCount = count; bestId = id; }
    }
    // Wymóg: większość player vesseli musi być na tej samej orbicie.
    return bestCount * 2 > vessels.length ? bestId : null;
  }

  _freezeAsStationary(vessel, pinDockedAt = null) {
    if (!vessel) return;
    vessel.mission = null;
    if (vessel.position) {
      vessel.position.state = 'orbiting';
      // Combat slow fix 2026-05-21 — gdy player side orbituje planetę,
      // pin enemy do tej samej planety. Wymusza enemy orbiting (przez
      // _updatePositions z dockedAt) → enemy porusza się z planetą i
      // sideA, dystans pozostaje stały, walka konkluduje w normalnym
      // czasie zamiast trwać przez całą orbitę planety wokół słońca.
      // ⚠ JEDYNY ZAPIS W TEJ ŚCIEŻCE, KTÓRY TRWALE MUTUJE STATEK — i dlatego dostaje własny
      // guard, niezależnie od bramek wyżej. `pinDockedAt` to ciało wzięte z większości strony
      // GRACZA; wpisane statkowi z innego układu dawało `dockedAt` na ciało, którego w jego
      // układzie NIE MA, a `VesselManager._updatePositions` przeliczał z niego `x/y` — czyli
      // statek był przenoszony we własnym układzie i „dokowany" przy nieistniejącym ciele.
      // Nikt tego później nie czyścił, więc szkoda szła do zapisu. Rozwiązanie id jest globalne
      // (`_findEntity` = `EntityManager.get`), więc porównujemy układy jawnie.
      if (pinDockedAt) {
        const body = this._vm?._findEntity?.(pinDockedAt);
        if (body && isSameSystemStrict(body, vessel)) {
          vessel.position.dockedAt = pinDockedAt;
        } else if (window.KOSMOS?.debug?.combatTrace) {
          console.log('[DSCS] _freezeAsStationary: pominięto pin z innego układu',
            { vesselId: vessel.id, vSys: systemIdOf(vessel), pin: pinDockedAt, bodySys: body ? systemIdOf(body) : null });
        }
      }
    }
  }

  // ── Player combat mission pause/resume (m4PlayerCombatMissionPause) ──────────

  /** Suma MAX HP (pełne HP kadłuba, bez uszkodzeń) vesseli strony. ALIAS na _sideAggregateHpStart —
   *  state.hpStart = hpStartFull z _buildVesselState (pełne HP z hull+moduły), NIE HP-na-starcie-bitwy
   *  (to state.hp, pomniejszone o persisted combatDamage). Self-documenting nazwa dla progu abort
   *  (20% MAX HP floty). Mianownik obejmuje wraki (całą flotę w encounterze) → „rozbita flota wraca". */
  _sumMaxHP(encounter, sideKey) {
    return this._sideAggregateHpStart(encounter, sideKey);
  }

  /** Czy vessel gracza kwalifikuje się do PAUZY/WZNOWIENIA/ABORTU MISJI (warstwa order/mission).
   *  NIE dotyczy freeze (warstwa pozycji — bezwarunkowa dla całego sideA). Wyklucza:
   *   - brak `vessel.mission` (ręczny engage/pursue ma misję zawieszoną → null; sam movement order),
   *   - członka floty FleetSystem z aktywnym `activeOrder` (retreat_at_50 owns those — CHANGE 2). */
  _isMissionPauseEligible(vessel) {
    if (!vessel?.mission) return false;
    const fs = window.KOSMOS?.fleetSystem;
    const fleet = vessel.fleetId ? fs?._fleets?.get?.(vessel.fleetId) : null;
    if (fleet?.activeOrder) return false;
    return true;
  }

  /** Wejście w combat: FREEZE strony gracza (bug fix) + SNAPSHOT misji.
   *  FREEZE = bezwarunkowo dla KAŻDEGO player vessela (bez tego sideA dryfuje poza COMBAT_DISENGAGE_AU
   *  i _handleCombatRangeExit liczy to jako porażkę — reported symptom). SNAPSHOT = dla każdego z żywą
   *  misją in_transit (universal, by freeze nie osierocił misji). Marker `_combatPause.eligible`
   *  rozstrzyga przy końcu bitwy: abort (tylko eligible) vs samo resume. Gated flagą. */
  /**
   * Zamrożenie strony na czas walki + migawka misji (Finding 130, D-130-1).
   *
   * ⚠ ZAMRAŻANIE NIE JEST SYMETRYCZNE i to jest zamierzone. Strona AI jest zamrażana ZAWSZE,
   *   także przy fladze OFF — to zachowanie sprzed tej naprawy i kill-switch nie ma prawa go
   *   zmienić. Strona GRACZA jest zamrażana wyłącznie przy fladze ON (kontrakt z `046976d`:
   *   bez flagi gracz zachowuje movement orders). Migawka dochodzi tylko przy fladze ON.
   *
   * ⚠ `eligible` liczymy TYLKO dla gracza (D-130-3). To ono otwiera gałąź odwrotu przy niskim
   *   HP w `_resolveMissionsPostBattle`; dla AI odwrót wydaje `AutoRetreatSystem` na
   *   `battle:resolved`, więc druga gałąź dawałaby DWA odwroty na jedną bitwę.
   */
  _pauseSideForCombat(vessels, pinDockedAt, { isPlayer = false } = {}) {
    const F = GAME_CONFIG.FEATURES ?? {};
    const paused = isPlayer ? F.m4PlayerCombatMissionPause : F.m4EnemyCombatMissionPause;
    if (!paused) {
      if (!isPlayer) for (const v of vessels) this._freezeAsStationary(v, pinDockedAt);
      return;
    }
    const mos = window.KOSMOS?.movementOrderSystem;
    for (const v of vessels) {
      if (!v || v.isWreck) continue;
      const eligible = isPlayer ? this._isMissionPauseEligible(v) : false;
      const snapped  = mos?._suspendMissionIfAny?.(v, { forCombat: true }) ?? false;
      this._freezeAsStationary(v, pinDockedAt);
      if (snapped) v._combatPause = { eligible, isPlayer };
    }
  }

  /** Koniec bitwy: wznów/wycofaj zawieszone misje OBU stron (gated osobno per strona,
   *  D-130-1/3). Dla każdego vessela z markerem `_combatPause`
   *  z markerem `_combatPause`:
   *   - wrak → drop snapshot,
   *   - warstwa ORDER przejęła w trakcie (vessel.mission != null, np. retreat_at_50 wydał moveToPoint)
   *     → oddaj sterowanie (drop snapshot, bez wznowienia — brak wyścigu z FleetSystem),
   *   - eligible I pct floty ≤ RETREAT_THRESHOLD (bieżące/MAX HP) → ABORT: wycofaj do friendly planety,
   *   - inaczej → RESUME misji (body → żywa pozycja, punkt → zapamiętane koordy). */
  _resolveMissionsPostBattle(encounter, battleId) {
    if (!encounter) return;
    const F  = GAME_CONFIG.FEATURES ?? {};
    const vm = this._vm;
    const ar = window.KOSMOS?.autoRetreatSystem;

    for (const key of ['A', 'B']) {
      const side = key === 'A' ? encounter.sideA : encounter.sideB;
      if (!side) continue;
      const isPlayer = side.ownerEmpireId === 'player';
      if (!(isPlayer ? F.m4PlayerCombatMissionPause : F.m4EnemyCombatMissionPause)) continue;

      // Próg odwrotu liczymy WYŁĄCZNIE dla gracza — dla AI gałąź i tak nie istnieje (D-130-3),
      // a `_sumHP` po stronie bez `_combatPause` byłoby czystym kosztem.
      let pct = 1.0;
      if (isPlayer) {
        const maxHp = this._sumMaxHP(encounter, key);
        pct = maxHp > 0 ? this._sumHP(encounter, key) / maxHp : 1.0;
      }

      for (const vid of [...side.vesselIds, ...side.joinedVesselIds]) {
        const v = vm?._vessels?.get?.(vid);
        if (!v?._combatPause) continue;
        const eligible = v._combatPause.eligible;
        delete v._combatPause;
        if (v.isWreck) { delete v._suspendedMission; continue; }
        if (v.mission) { delete v._suspendedMission; continue; }   // order layer przejęła → nie wznawiaj
        if (isPlayer && eligible && pct <= RETREAT_THRESHOLD) {
          delete v._suspendedMission;
          ar?._issueRetreatOrder?.(v, battleId);                   // rozbita flota → friendly planeta
        } else {
          vm?._resumeMissionAfterOrder?.(v.id);                    // wznów z miejsca walki
        }
      }
    }
  }

  /**
   * Wreck delegation — preferuje EnemyAttackHandler._turnIntoWreck (rozszerzony
   * kontrakt z M2a). Fallback inline gwarantuje stabilność headless.
   *
   * @private
   */
  _wreckOne(vessel, mid, year) {
    if (!vessel || vessel.isWreck) return;
    const handler = window.KOSMOS?.enemyAttackHandler;
    if (handler?._turnIntoWreck) {
      handler._turnIntoWreck(vessel, mid, year);
      return;
    }
    vessel.isWreck  = true;
    vessel.status   = 'destroyed';
    vessel.mission  = null;
    vessel.wreckedAt = year;
    if (vessel.position) {
      vessel.position.state    = 'orbiting';
      vessel.position.dockedAt = null;
      vessel.position.x = mid.x;
      vessel.position.y = mid.y;
    }
    vessel.wreckLocation = { x: mid.x, y: mid.y };
    if (vessel.fuel) vessel.fuel.current = 0;
    EventBus.emit('vessel:wrecked', { vesselId: vessel.id, vessel });
  }

  /** @private */
  _findActiveEncounterContaining(vesselId) {
    for (const enc of this._activeEncounters.values()) {
      if (!enc.isActive) continue;
      if (enc.vesselStates.has(vesselId)) return enc;
    }
    return null;
  }

  /** @private */
  _ensureTimelineRound(encounter) {
    const r = encounter.currentRound;
    let entry = encounter.timeline.find(t => t.round === r);
    if (!entry) {
      entry = { round: r, year: encounter.currentYear ?? encounter.startYear,
                distanceAU: 0, events: [], joinEvents: [] };
      encounter.timeline.push(entry);
    }
    return entry;
  }

  /** @private */
  _countLosses(encounter, sideKey) {
    const side = sideKey === 'A' ? encounter.sideA : encounter.sideB;
    let losses = 0;
    for (const vid of [...side.vesselIds, ...side.joinedVesselIds]) {
      const state = encounter.vesselStates.get(vid);
      if (state && state.hp <= 0) losses++;
    }
    return losses;
  }

  /** @private */
  _sumHP(encounter, sideKey) {
    const side = sideKey === 'A' ? encounter.sideA : encounter.sideB;
    let sum = 0;
    for (const vid of [...side.vesselIds, ...side.joinedVesselIds]) {
      const state = encounter.vesselStates.get(vid);
      if (state) sum += Math.max(0, state.hp);
    }
    return sum;
  }

  /** @private */
  _year() {
    return window.KOSMOS?.timeSystem?.gameTime ?? 0;
  }

  /**
   * SB42 (Finding 419) — identyfikator starcia UNIKALNY. Podstawa `encounter_<rok, 2 miejsca>_<A>_<B>` bez zmian; gdy jest
   * już zajęta — przez trwające starcie (`_activeEncounters`) albo przez zapisaną bitwę (`battles.<battle_ds_…>`) —
   * dostaje przyrostek `_2`, `_3`, … Dotąd drugie starcie tej samej pary w tym samym 0,01 roku gry NADPISYWAŁO pierwsze:
   * pierwsze przestawało tykać i nigdy się nie kończyło, więc jego statki zostawały zamrożone na zawsze (migawka misji
   * i `_combatPause` wisiały), a rekord bitwy był nadpisywany.
   * @private
   */
  _makeEncounterId(year, ownerA, ownerB) {
    const yr = Number(year).toFixed(2).replace(/\./g, '_');
    const base = `encounter_${yr}_${ownerA}_${ownerB}`;
    const taken = (id) => this._activeEncounters.has(id)
      || gameState.get?.(`battles.${id.replace(/^encounter_/, 'battle_ds_')}`) != null;
    let id = base;
    for (let n = 2; taken(id); n++) id = `${base}_${n}`;
    return id;
  }

  // ── Public debug/test API ────────────────────────────────────────────

  /**
   * Wymuszone zakończenie encountera (devtools / test). Z parametrami
   * winner='A'|'B'|null i retreated='A'|'B'|null.
   */
  forceFinalize(encounterId, winner = null, retreated = null) {
    const enc = this._activeEncounters.get(encounterId);
    if (!enc) return null;
    this._finalizeBattle(enc, winner, retreated, 'forced');
    return enc;
  }

  /** Lista aktywnych encounter'ów (devtools). */
  listActive() {
    return [...this._activeEncounters.values()].filter(e => e.isActive);
  }

  /**
   * POLISH P1 (CP1, CP4) — odczyt dla zegara starcia `TimeSystem`: czy trwa starcie i czy gracz je ogląda.
   * @param {string|null} viewSystemId — oglądany układ (`activeSystemId`)
   * @returns {'watched'|'unwatched'|null} — `watched`: co najmniej jedno aktywne starcie w oglądanym układzie;
   *   `unwatched`: starcia trwają wyłącznie w innych układach; `null`: żadnego aktywnego starcia
   */
  engagementView(viewSystemId) {
    let any = false;
    for (const enc of this._activeEncounters.values()) {
      if (!enc.isActive) continue;
      if (enc.location?.systemId === viewSystemId) return 'watched';
      any = true;
    }
    return any ? 'unwatched' : null;
  }

  // ── Serialization (P3-8 — save v71) ─────────────────────────────────

  /**
   * Round-trip _activeEncounters do obiektu JSON-serializable.
   * vesselStates Map → object (klucze=vesselId, wartości=state).
   * Tylko isActive=true (zakończone encounters cleanup'owane w _tick).
   *
   * @returns {object} keyed by encounterId
   */
  serialize() {
    const out = {};
    for (const [id, enc] of this._activeEncounters) {
      if (!enc.isActive) continue;
      const vesselStatesObj = {};
      for (const [vid, state] of enc.vesselStates) {
        vesselStatesObj[vid] = { ...state, weapons: state.weapons.map(w => ({ ...w })) };
      }
      out[id] = {
        id:              enc.id,
        sideA:           { ...enc.sideA, vesselIds: [...enc.sideA.vesselIds], joinedVesselIds: [...enc.sideA.joinedVesselIds] },
        sideB:           { ...enc.sideB, vesselIds: [...enc.sideB.vesselIds], joinedVesselIds: [...enc.sideB.joinedVesselIds] },
        vesselStates:    vesselStatesObj,
        location:        { ...enc.location, point: { ...enc.location.point } },
        startYear:       enc.startYear,
        currentRound:    enc.currentRound,
        currentYear:     enc.currentYear,
        timeline:        enc.timeline.map(t => ({
          ...t,
          events:     [...(t.events ?? [])],
          joinEvents: [...(t.joinEvents ?? [])],
        })),
        isActive:        enc.isActive,
        seedBase:        enc.seedBase,
      };
    }
    return out;
  }

  /**
   * Restore _activeEncounters z save. Pomija encounter'y bez participantów
   * (np. wszystkie vessele wreck przy save — defensive).
   *
   * @param {object} data — keyed by encounterId
   */
  restore(data) {
    if (!data || typeof data !== 'object') return;
    for (const [id, enc] of Object.entries(data)) {
      if (!enc || !enc.isActive) continue;
      const vesselStates = new Map();
      for (const [vid, state] of Object.entries(enc.vesselStates ?? {})) {
        // Filter — vessel musi istnieć w vesselManager (wreck w międzyczasie
        // wycięty z save). Skip jeśli brak.
        if (!this._vm?._vessels?.has?.(vid)) continue;
        vesselStates.set(vid, { ...state, weapons: (state.weapons ?? []).map(w => ({ ...w })) });
      }
      if (vesselStates.size < 2) continue;  // brak walczących stron
      this._activeEncounters.set(id, {
        id:              enc.id ?? id,
        sideA:           enc.sideA ?? { vesselIds: [], joinedVesselIds: [], ownerEmpireId: 'player', label: t('battle.label.playerUnit') },
        sideB:           enc.sideB ?? { vesselIds: [], joinedVesselIds: [], ownerEmpireId: 'empire_unknown', label: t('battle.label.enemyUnnamed') },
        vesselStates,
        location:        enc.location ?? { systemId: 'sys_home', planetId: null, point: { x: 0, y: 0 } },
        startYear:       enc.startYear ?? 0,
        currentRound:    enc.currentRound ?? 0,
        currentYear:     enc.currentYear ?? enc.startYear ?? 0,
        timeline:        Array.isArray(enc.timeline) ? enc.timeline : [],
        isActive:        true,
        seedBase:        enc.seedBase ?? 0,
      });
    }
  }
}

// ── Module helpers (kopia z VesselCombatSystem dla symetrii) ───────────

// Znacznik odwrotu z bitwy — JEDNO źródło dla `_allOutsideOf` (D-FDd), zbliżenia przed rundą (SB49) i M1: ucieczki na
// zegarze starcia (`_advanceFleeing`), strażnika (`_combatantsOf`) i bramki „uciekający nie wraca od razu” (dyspozytor).
function _isRetreatingFromCombat(v) {
  return v?.movementOrder?._retreatFromCombat === true || v?.movementOrder?.retreatFromBattleId != null;
}

// M1 — ruch prowadzony rozkazem (MOS pisze pozycję co tik): lustro listy `isOrderControlled` w `VesselManager._updatePositions`.
function _isOrderMoved(v) {
  const mo = v?.movementOrder;
  return mo?.status === 'active' &&
    (mo.type === 'pursue' || mo.type === 'intercept' || mo.type === 'engage' || mo.type === 'patrol' || mo.type === 'escort');
}

function _inCombatState(v) {
  const st = v.position?.state;
  if (st === 'in_transit') return true;
  if (st === 'orbiting') return true;
  return false;
}

function _resolveOwner(v) {
  if (v.ownerEmpireId && v.ownerEmpireId !== 'player') return v.ownerEmpireId;
  if (v.owner && v.owner !== 'player') return v.owner;
  if (v.isEnemy) return v.ownerEmpireId ?? v.owner ?? 'unknown_empire';
  return 'player';
}
