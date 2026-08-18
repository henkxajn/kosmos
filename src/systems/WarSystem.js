// WarSystem — śledzenie wojen w czasie
//
// Domena: gameState.wars[warId] = {
//   id, aggressor, defender, casusBelli,
//   startYear, fronts: [{systemId, controller}],
//   exhaustion: {player, empireId},
//   battles: [battleId],
//   active: bool,
// }
//
// Domena: gameState.battles[battleId] = wynik BattleSystem.resolveBattle(...)
//
// Automatyczne reguły:
//   diplomacy:warDeclared → utwórz wpis wojny z inferred casus belli
//   diplomacy:peaceSigned → zamknij wojnę (active=false)
//   Tick co 1 civYear:
//     - Floty obce z destSystemId i etaYear <= currentYear → przybywa do systemu
//     - Jeśli po przybyciu w systemie jest kolonia gracza LUB flota gracza → BATTLE
//     - Exhaustion rośnie proporcjonalnie do bitew × casusBelli.exhaustionRate
//     - Gdy exhaustion.player LUB exhaustion.defender >= 100 → auto-peace
//
// Na razie (Faza 4) AI obcych nie wysyła flot agresywnie — to Faza 7.
// Tutaj wojna to logika + reaktywne starcie gdy gracz staje na ich drodze.

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import gameState from '../core/GameState.js';
import { resolveBattle, empireFleetToBattleUnit, playerVesselsToBattleUnit } from './BattleSystem.js';
import { normalize as normalizeLocation } from '../utils/BattleLocation.js';
import { CASUS_BELLI, inferCasusBelli } from '../data/CasusBelliData.js';
import { CB_MEMORY_WINDOW } from '../data/OpinionModifierData.js';
import { HULLS } from '../data/HullsData.js';
import { SHIP_MODULES } from '../data/ShipModulesData.js';
import { isEnemyVessel, hasWeapons, isInService } from '../entities/Vessel.js';
import { GAME_CONFIG } from '../config/GameConfig.js';

// W1-4b — WYCZERPANIE JEST ASYMETRYCZNE, zależnie od WYNIKU bitwy (orzeczenie właściciela).
//
// Do W1-4 obie strony dostawały tyle samo (15 × rate), więc gracz wygrywający każde starcie
// 80:5 męczył się DOKŁADNIE tak samo jak rozbijany przeciwnik. To odwraca sens termu `war_status`
// — ta sama logika, która kazała odwrócić znak `relative_power`: wygrywający NACISKA przewagę,
// przegrywający szuka stołu. Wojna wyczerpuje przez SAMO TRWANIE (baza dla obu) i DODATKOWO
// przez przegrywanie (udział przegranego).
//
// ⚠ KLASYFIKACJA WYŁĄCZNIE PO `result.winner`. NIGDY po `lossesA/B` — te pola niosą KOLIZJĘ
// JEDNOSTEK (audyt, §Findings filed 3): w BattleSystem to delta HP, w DSCS liczba statków, przy
// tej samej nazwie pola i tym samym zdarzeniu. Oparcie o nie asymetrii wyczerpania przeniosłoby
// tę kolizję prosto do księgowania wojny.
const EXHAUSTION_BASE         = 2;   // obie strony — cena samego trwania wojny
const EXHAUSTION_LOSER_SHARE  = 7;   // DODATKOWO dla przegranego starcia (⇒ przegrany 9, wygrany 2)
// W1-4 — POTYCZKA (P3): starcie BEZ stanu wojny. Podnosi napięcie i zostawia ślad w pamięci,
// ale NIGDY nie dotyka exhaustion (to jest waluta wojny, a wojny nie ma).
const SKIRMISH_TENSION = 12;
const AUTO_PEACE_EXHAUSTION = 100;  // próg auto-peace

export class WarSystem {
  constructor() {
    this._tickAccum = 0;

    EventBus.on('diplomacy:warDeclared', ({ empireId, reason }) => this._onWarDeclared(empireId, reason));
    EventBus.on('diplomacy:peaceSigned', ({ empireId }) => this._onPeaceSigned(empireId));
    // W1-4 / W3-2 — KLASYFIKACJA przy szwie księgowania (decyzja 10). Widelec ma TRZY gałęzie
    // (zaksięgowana / w stanie wojny → księguj / potyczka) i dopiero po W3-2 jest naprawdę
    // wyczerpujący. Do W3-2 środkowa gałąź była cichym `return` — patrz `_classifyBattle`.
    EventBus.on('battle:resolved', (p) => this._classifyBattle(p));

    EventBus.on('time:tick', ({ civDeltaYears }) => {
      if (!civDeltaYears) return;
      this._tickAccum += civDeltaYears;
      if (this._tickAccum < 1.0) return;
      const steps = Math.floor(this._tickAccum);
      this._tickAccum -= steps;
      this._tickAll(steps);
    });
  }

  // ── Read-only ────────────────────────────────────────────────

  listActive() {
    const wars = gameState.get('wars') ?? {};
    return Object.values(wars).filter(w => w.active);
  }
  listAll() {
    const wars = gameState.get('wars') ?? {};
    return Object.values(wars);
  }
  getWar(warId) { return gameState.get(`wars.${warId}`) ?? null; }

  /** Zwraca rekord bitwy z gameState.battles (read-only). Używane przez
   *  FleetManagerOverlay (battle report w expanded wrak row). Może zwrócić
   *  battleId z deep-space combat (VesselCombatSystem) gdzie warId=null. */
  getBattleRecord(battleId) { return gameState.get(`battles.${battleId}`) ?? null; }

  /** Zwraca aktywną wojnę z danym imperium (gracz jako agresor lub obrońca) */
  getWarWith(empireId) {
    return this.listActive().find(w =>
      (w.aggressor === 'player' && w.defender === empireId) ||
      (w.defender === 'player' && w.aggressor === empireId)
    ) ?? null;
  }

  // ── Intent methods ───────────────────────────────────────────

  /**
   * Ręczne utworzenie wpisu wojny. Zazwyczaj wywoływane przez handler
   * diplomacy:warDeclared — ale dostępne dla debugowania.
   */
  createWar(aggressor, defender, casusBelliId = 'border_incident') {
    const warId = `war_${aggressor}_${defender}_${this._year()}`.replace(/\./g, '_');
    if (this.getWar(warId)) return this.getWar(warId);
    const war = {
      id:         warId,
      aggressor,
      defender,
      casusBelli: casusBelliId,
      startYear:  this._year(),
      fronts:     [],
      exhaustion: { [aggressor]: 0, [defender]: 0 },
      battles:    [],
      active:     true,
    };
    gameState.set(`wars.${warId}`, war, 'war_created');
    EventBus.emit('war:declared', { warId, aggressor, defender, casusBelli: casusBelliId });
    return war;
  }

  /** Dodaje front (kontroler aktualny = brak lub kto trzyma system) */
  addFront(warId, systemId, controller = null) {
    const war = this.getWar(warId);
    if (!war) return false;
    if (war.fronts.some(f => f.systemId === systemId)) return false;
    const next = { ...war, fronts: [...war.fronts, { systemId, controller }] };
    gameState.set(`wars.${warId}`, next, 'front_added');
    return true;
  }

  changeExhaustion(warId, side, delta, reason = '') {
    const war = this.getWar(warId);
    if (!war) return;
    const oldV = war.exhaustion?.[side] ?? 0;
    const newV = Math.max(0, Math.min(100, oldV + delta));
    if (newV === oldV) {
      // ⚠ D2/E3: wyczerpanie jest CLAMPOWANE do 100, więc po dobiciu do sufitu ten
      // wczesny return zjadał każdą kolejną próbę auto-pokoju. Dopóki auto-pokój był
      // BEZWARUNKOWY, nie miało to znaczenia — pierwsza próba zawsze kończyła wojnę.
      // Odkąd decyduje silnik (i może ODMÓWIĆ), jednorazowy strzał zamykałby wojnę
      // na zawsze w stanie „nie da się zakończyć". Każda kolejna bitwa próbuje ponownie.
      if (delta > 0 && oldV >= AUTO_PEACE_EXHAUSTION) this._triggerAutoPeace(warId, side);
      return;
    }
    const next = { ...war, exhaustion: { ...war.exhaustion, [side]: newV } };
    gameState.set(`wars.${warId}`, next, `exhaustion_${side}_${delta}_${reason}`);

    // Auto-peace gdy któryś przekroczy próg
    if (newV >= AUTO_PEACE_EXHAUSTION) {
      this._triggerAutoPeace(warId, side);
    }
  }

  /**
   * W1-4 — klasyfikacja bitwy przy szwie księgowania (P3, decyzja 10).
   * W3-2 — TU domknięta TRZECIA, CICHA ŚCIEŻKA, o której ten komentarz twierdził, że nie istnieje.
   *
   * ⚠ Widelec MA TRZY GAŁĘZIE i dopiero teraz jest wyczerpujący:
   *     (a) `warId` już jest        → zaksięgowane, nic do roboty
   *     (b) strony są W STANIE WOJNY → KSIĘGUJ (`recordBattle`)   ← DOPISANE W W3-2
   *     (c) reszta                   → POTYCZKA (napięcie + pamięć, nigdy exhaustion)
   *
   * Do W3-2 gałąź (b) była `return` — i to była luka, nie optymalizacja. `DeepSpaceCombatSystem`
   * wpisuje `warId: null` NA SZTYWNO (`:1006-1007`) i nie pyta, czy strony walczą w wojnie, więc
   * bitwa w przestrzeni głębokiej w trakcie ZADEKLAROWANEJ wojny wypadała między (a) i (c):
   * zero exhaustion, zero wpisu w `war.battles[]`, zero dominacji orbitalnej. Zmierzone
   * WYKONANIEM w `w3_seams_smoke` T2 (przed tą zmianą: `recordBattle` 0 wywołań).
   * Konsekwencja była gorsza niż brak liczby: `war_status` to 55-punktowy człon akceptacji
   * pokoju, więc wojny toczonej TAM, GDZIE GRACZ NAPRAWDĘ WALCZY, nie dało się zakończyć
   * wyczerpaniem. W1-4 domknął ten sam fork wyłącznie dla `EnemyAttackHandler`.
   *
   * ⚠ Księgujemy TUTAJ, a nie w DSCS/VCS — `WarSystem` jest jedynym księgowym (backbone P3),
   * a producenci bitew mają zostać czystymi dostawcami wyniku. Jeden szew pokrywa DSCS, VCS
   * i każdego przyszłego producenta; dwa wywołania w dwóch systemach rozjechałyby się.
   *
   * ⚠ Re-entrancja jest ograniczona z konstrukcji: `recordBattle` emituje `battle:resolved`
   * PONOWNIE, ale już z `warId`, więc drugi przebieg wychodzi natychmiast gałęzią (a).
   *
   * ⚠ Asymetria wyczerpania (W1-4b) przychodzi ZA DARMO — `recordBattle` liczy ją z
   * `result.winner` przez `_battleLoserSide`. Nowa gałąź nie dotyka `lossesA/B` (kolizja
   * jednostek, §Findings filed 3) ani nie powiela arytmetyki.
   */
  _classifyBattle({ warId, battleId, result } = {}) {
    if (warId) return;                       // (a) zaksięgowane na wojnę — nie potyczka
    const empireId = this._empireSideOf(result);
    if (!empireId) return;                   // nie ma komu przypisać incydentu

    const dipl = window.KOSMOS?.diplomacySystem;
    if (!dipl) return;
    // (b) Strony są w stanie wojny ⇒ to nie „walka bez stanu wojny", tylko starcie tej wojny.
    // Wojna mogła też zostać zadeklarowana MIĘDZY starciem a tym handlerem — ta sama gałąź.
    if (dipl.getStatus?.(empireId) === 'war') {
      // ⚠ Tylko starcia z udziałem GRACZA: `getWarWith` zwraca wojnę gracz↔imperium, więc bez
      // tej bramki potyczka AI↔AI zostałaby doksięgowana do CUDZEJ wojny. Dziś DSCS jest
      // player-only, ale D5 (pary AI↔AI) to zmieni — guard ma być na miejscu WCZEŚNIEJ.
      if (!this._hasPlayerSide(result)) return;
      const war = this.getWarWith(empireId);
      if (war) this.recordBattle(war.id, result);
      return;
    }

    dipl.changeTension(empireId, SKIRMISH_TENSION, 'skirmish');
    dipl.addMemory(empireId, 'skirmish', {
      battleId: battleId ?? null,
      year: this._year(),
      systemId: normalizeLocation(result?.location).systemId ?? null,
      winner: result?.winner ?? null,
    });
    EventBus.emit('war:skirmish', { empireId, battleId: battleId ?? null, result });
  }

  /**
   * Które imperium brało udział w bitwie (strona NIE-gracza). Uczestnik ma trzy kształty
   * (`empire` / `vessel_group` / `player`) o różnych polach — czytamy `empireId` z tej strony,
   * która go niesie.
   */
  _empireSideOf(result) {
    for (const p of [result?.participantA, result?.participantB]) {
      if (p?.empireId && p.empireId !== 'player') return p.empireId;
    }
    return null;
  }

  /**
   * Czy w tym starciu brał udział GRACZ (W3-2). Uczestnik ma trzy kształty i gracz jest
   * w nich oznaczony NIEJEDNOLICIE: DSCS/VCS dają `{type:'vessel_group', empireId:'player'}`,
   * a `EnemyAttackHandler` `{type:'player'}` BEZ `empireId` (`:161-164`). Czytamy oba —
   * to jest ta sama rozbieżność kształtów, która każe trzem konsumentom filtrować inaczej
   * (`W3_PLAN.md` §Audit S25) i której nie wolno tu powtórzyć jednym testem.
   */
  _hasPlayerSide(result) {
    for (const p of [result?.participantA, result?.participantB]) {
      if (p?.empireId === 'player' || p?.type === 'player') return true;
    }
    return false;
  }

  /**
   * Która STRONA WOJNY przegrała to starcie (W1-4b). `null` = remis albo nie da się przypisać.
   *
   * ⚠ Czyta WYŁĄCZNIE `result.winner` ('A' | 'B' | 'draw') i `empireId`/`type` zwycięskiego
   * uczestnika — dokładnie tę samą drogę, którą chodzi `_updateOrbitalDominance`. NIGDY
   * `lossesA/B`: te pola mają kolizję jednostek (HP-delta w BattleSystem vs liczba statków
   * w DSCS) i nie mogą nieść żadnej decyzji księgowej.
   *
   * Gdy zwycięzcy nie da się zmapować na `aggressor`/`defender` — zwracamy `null` i naliczamy
   * SAMĄ BAZĘ. Zgadywanie strony byłoby gorsze niż symetria: przypisałoby karę losowo.
   */
  _battleLoserSide(war, battleRec) {
    const w = battleRec?.winner;
    if (w !== 'A' && w !== 'B') return null;                 // remis / brak wyniku
    const part = w === 'A' ? battleRec.participantA : battleRec.participantB;
    if (!part) return null;
    const winnerId = part.empireId ?? (part.type === 'player' ? 'player' : null);
    if (!winnerId) return null;
    if (winnerId === war.aggressor) return war.defender;
    if (winnerId === war.defender)  return war.aggressor;
    return null;                                             // uczestnik spoza tej wojny
  }

  /** Rekord wyniku bitwy — przypisuje do wojny + zapisuje w gameState.battles. */
  recordBattle(warId, result) {
    const war = this.getWar(warId);
    if (!war) return null;
    const year = this._year();
    const battleId = `battle_${year}_${warId}_${war.battles.length + 1}`.replace(/\./g, '_');
    const battleRec = {
      id: battleId,
      warId,
      year,
      location: result.location ?? null,
      winner:   result.winner,
      retreated: result.retreated ?? null,
      lossesA: result.lossesA ?? 0,
      lossesB: result.lossesB ?? 0,
      turns:   result.turns ?? 0,
      participantA: result.participantA ?? null,
      participantB: result.participantB ?? null,
      timeline: result.timeline ?? [],
    };
    gameState.set(`battles.${battleId}`, battleRec, 'battle_recorded');
    const nextWar = { ...war, battles: [...war.battles, battleId] };
    gameState.set(`wars.${warId}`, nextWar, 'war_battle_appended');

    // Exhaustion — BAZA dla obu (wojna kosztuje przez samo trwanie) + UDZIAŁ PRZEGRANEGO.
    // Wszystko skalowane przez `casusBelli.exhaustionRate` (extermination 0.4 „walczą aż do
    // końca", territorial_claim 1.2 „krótkie wojny o cel").
    const cb = CASUS_BELLI[war.casusBelli] ?? CASUS_BELLI.border_incident;
    const rate = cb.exhaustionRate ?? 1.0;
    this.changeExhaustion(warId, war.aggressor, EXHAUSTION_BASE * rate, 'battle');
    this.changeExhaustion(warId, war.defender,  EXHAUSTION_BASE * rate, 'battle');

    const loserId = this._battleLoserSide(war, battleRec);
    if (loserId) this.changeExhaustion(warId, loserId, EXHAUSTION_LOSER_SHARE * rate, 'battle_lost');

    EventBus.emit('battle:resolved', { warId, battleId, result: battleRec });

    // Faza desantu: ustaw dominację orbitalną nad systemem bitwy
    this._updateOrbitalDominance(battleRec);

    return battleRec;
  }

  /**
   * Ustaw gameState.orbitalDominance[systemId] = { controllerId, year }
   * po rozstrzygnięciu bitwy. Controller = empireId (A wygrał) lub 'player' (B wygrał).
   * Draw → bez zmiany (poprzedni controller pozostaje).
   * Emituje battle:orbitalDominance dla InvasionSystem i UI.
   */
  _updateOrbitalDominance(battleRec) {
    // v66: location jest objectem {systemId, planetId, point}; helper obsługuje
    // też legacy string (pre-v66 save'y które nie przeszły migracji w runtime).
    const systemId = normalizeLocation(battleRec.location).systemId;
    if (!systemId || !battleRec.winner || battleRec.winner === 'draw') return;

    const winnerPart = battleRec.winner === 'A' ? battleRec.participantA : battleRec.participantB;
    if (!winnerPart) return;
    const controllerId = winnerPart.empireId ?? (winnerPart.type === 'player' ? 'player' : null);
    if (!controllerId) return;

    const year = this._year();
    gameState.set(`orbitalDominance.${systemId}`, { controllerId, year }, 'battle_resolved');
    EventBus.emit('battle:orbitalDominance', { systemId, controllerId, year });
  }

  /**
   * Natychmiastowe wymuszenie bitwy (debug / UI "Force Battle").
   * Wybiera najsilniejszą flotę imperium, ustawia ją w systemie gracza,
   * od razu rozstrzyga bitwę i zapisuje wynik. Nie czeka na tick.
   */
  forceBattle(warId) {
    const war = this.getWar(warId);
    if (!war?.active) return { success: false, reason: 'war_inactive' };
    const empireId = war.aggressor === 'player' ? war.defender : war.aggressor;
    const reg = window.KOSMOS?.empireRegistry;
    const homePlanet = window.KOSMOS?.homePlanet;
    if (!reg || !homePlanet) return { success: false, reason: 'no_registry_or_home' };
    const emp = reg.get(empireId);
    if (!emp) return { success: false, reason: 'no_empire' };
    const fleets = emp.fleets ?? [];
    if (fleets.length === 0) return { success: false, reason: 'no_fleet' };
    // Najsilniejsza flota
    const fleet = fleets.slice().sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))[0];
    const playerSystemId = homePlanet.systemId ?? 'sys_home';

    // Teleportuj flotę do systemu gracza
    const updated = fleets.map(f => f.id === fleet.id
      ? { ...f, systemId: playerSystemId, destSystemId: null, etaYear: null }
      : f);
    gameState.set(`empires.${empireId}.fleets`, updated, 'force_battle_teleport');

    // Rozstrzygnij bitwę i zapisz wynik
    const fleetUnit = empireFleetToBattleUnit(fleet, emp, fleet.id);
    const playerUnit = this._buildPlayerBattleUnit(playerSystemId);
    // M2a schema: location jako object (nie string). Abstract fleet battle nad
    // systemem gracza — planetId/point=null (brak konkretnej planety/punktu).
    const result = resolveBattle(fleetUnit, playerUnit, {
      casusBelli: war.casusBelli,
      location:   { systemId: playerSystemId, planetId: null, point: null },
      seed:       Math.floor(this._year() * 7919 + fleet.strength) & 0x7FFFFFFF,
    });

    // Straty dla floty obcej
    const newStrength = Math.max(0, fleet.strength - result.lossesA);
    reg.updateFleetStrength(empireId, fleet.id, newStrength, 'force_battle_damage');

    // Zapisz bitwę — location przechodzi przez spread z result (już object po v66).
    const recordedResult = {
      ...result,
      participantA: { type: 'empire', empireId, fleetId: fleet.id, strength: fleet.strength },
      participantB: { type: 'player', systemId: playerSystemId },
    };
    const rec = this.recordBattle(warId, recordedResult);
    return { success: true, battle: rec, result };
  }

  // ── Event handlers ───────────────────────────────────────────

  _onWarDeclared(empireId, reason) {
    // Gracz zawsze agresorem gdy wojnę wypowiedział player przez DiplomacyOverlay
    // W przypadku auto-war (threshold hostility) → imperium agresorem
    const isPlayerAction = (reason === 'player_action');
    const aggressor = isPlayerAction ? 'player' : empireId;
    const defender  = isPlayerAction ? empireId  : 'player';

    // Inferuj casus belli z relacji
    // D1: casus belli liczy się z OKNA ostatnich 10 wpisów pamięci relacji
    // (pierścień ma 20 — pełny zmieniłby dobór CB, patrz inferCasusBelli).
    const memory = window.KOSMOS?.diplomacySystem?.getMemory(empireId, CB_MEMORY_WINDOW) ?? [];
    const emp = window.KOSMOS?.empireRegistry?.get(empireId);
    const cbId = inferCasusBelli(memory, emp?.archetype);

    this.createWar(aggressor, defender, cbId);
  }

  _onPeaceSigned(empireId) {
    const war = this.getWarWith(empireId);
    if (!war) return;
    const next = { ...war, active: false, endYear: this._year() };
    gameState.set(`wars.${war.id}`, next, 'peace_signed');
    EventBus.emit('war:peaceSigned', { warId: war.id, empireId });
  }

  _triggerAutoPeace(warId, exhaustedSide) {
    const war = this.getWar(warId);
    if (!war || !war.active) return;
    const empireId = war.aggressor === 'player' ? war.defender : war.aggressor;
    const dipl = window.KOSMOS?.diplomacySystem;
    if (!dipl) return;
    // ⚠ D2/E3: to NIE JEST już wymuszenie. Dawniej „exhaustion >= 100 ⇒ pokój" omijało
    // jakąkolwiek ocenę; teraz `offerPeace` przechodzi przez Acceptance Engine, w którym
    // wyczerpanie jest WIELKIM TERMEM (55 pkt) mierzonym względem `casusBelli.peaceCost`.
    // Skutek zamierzony: wojna eksterminacyjna (peaceCost 100) nie kończy się sama —
    // katalog casus belli od zawsze to obiecywał, a nikt tego nie egzekwował.
    // ⚠ `playerInitiated: false` — patrz DiplomacySystem.offerPeace. Ta ścieżka PONAWIA
    // się przy każdej kolejnej bitwie (bo wyczerpanie stoi na suficie i samo nic nie ruszy),
    // więc stemplowanie `recent_refusal` dałoby parze w praktyce stałe −20 i zakleszczyło
    // wojnę dokładnie tak, jak przed dołożeniem tego retry. Ta sama flaga trzyma modal
    // odmowy (E4) z dala od serii bitew — gracz niczego tu nie klikał.
    const accepted = dipl.offerPeace(empireId, `exhaustion_${exhaustedSide}`, { playerInitiated: false });
    if (!accepted) {
      EventBus.emit('war:autoPeaceRefused', {
        warId, empireId, exhaustedSide, casusBelli: war.casusBelli ?? null,
      });
    }
  }

  // ── Ticker ───────────────────────────────────────────────────

  _tickAll(years) {
    const active = this.listActive();
    if (active.length === 0) return;

    const reg = window.KOSMOS?.empireRegistry;
    if (!reg) return;

    // Przemieszczaj floty obce, które mają ETA
    for (const war of active) {
      const empireId = war.aggressor === 'player' ? war.defender : war.aggressor;
      const emp = reg.get(empireId);
      if (!emp) continue;

      for (const fleet of emp.fleets ?? []) {
        if (!fleet.destSystemId || fleet.etaYear == null) continue;
        if (this._year() < fleet.etaYear) continue;
        // Flota dotarła
        this._fleetArrived(war, emp, fleet);
      }
    }

    // Faza 7: agresję AI przejął MilitaryAI (tick w AlienCivSystem).
    // WarSystem ogranicza się do przetwarzania dotarłych flot i rozstrzygania bitew.
  }

  _aiSendFleet_deprecated(war) {
    // DEPRECATED: Faza 7 przeniosła tę logikę do MilitaryAI.attack_player.
    // Pozostawione puste na wypadek referencji w starych save.
    return;
  }

  _fleetArrived(war, empire, fleet) {
    const reg = window.KOSMOS?.empireRegistry;
    // Flota doleciała do destSystemId — czy jest tam gracz?
    const destSystemId = fleet.destSystemId;

    // M2a Unified Aggregator — flagi FEATURES.unifiedAggregator.
    // Gdy fleet.materializationState === 'full' i są materializedVesselIds[],
    // konkretne vessele walczą swoją ścieżką (EnemyAttackHandler przy arrival
    // nad planetą lub VesselCombatSystem w deep-space). Abstract battle tu
    // zduplikowałoby combat — strength=0 → bezsensowna minibitwa (§P2/P3
    // m2-reconnaissance.md).
    //
    // Akcja: zeruj destSystemId/etaYear (flota "zaparkowana" w systemie jako
    // materialized), skip abstract battle. MilitaryAI znajdzie flotę z
    // destSystemId=null jako "idle" — pozwoli na nowe action, ale materialized
    // strength=0 → score=0 → AI nie wyśle tej floty (R4).
    if (GAME_CONFIG.FEATURES?.unifiedAggregator) {
      if (fleet.materializationState === 'full' &&
          Array.isArray(fleet.materializedVesselIds) &&
          fleet.materializedVesselIds.length > 0) {
        const fleets = [...(empire.fleets ?? [])];
        const idx = fleets.findIndex(f => f.id === fleet.id);
        if (idx >= 0) {
          fleets[idx] = { ...fleets[idx], systemId: destSystemId, destSystemId: null, etaYear: null };
          gameState.set(`empires.${empire.id}.fleets`, fleets, 'fleet_arrived_skipped_materialized');
        }
        return;
      }
    }

    const playerPresent = this._isPlayerInSystem(destSystemId);

    // Zawsze: flota teraz "mieszka" w destSystemId
    reg.updateFleetStrength(empire.id, fleet.id, fleet.strength, 'arrived'); // no-op na strength, ale triggers save
    // Zerowanie dest + etaYear:
    const fleets = [...(empire.fleets ?? [])];
    const idx = fleets.findIndex(f => f.id === fleet.id);
    if (idx >= 0) {
      fleets[idx] = { ...fleets[idx], systemId: destSystemId, destSystemId: null, etaYear: null };
      gameState.set(`empires.${empire.id}.fleets`, fleets, 'fleet_arrived');
    }

    if (!playerPresent) return;

    // BITWA
    const fleetUnit = empireFleetToBattleUnit(fleet, empire, fleet.id);
    const playerUnit = this._buildPlayerBattleUnit(destSystemId);
    // M2a schema: location jako object (nie string). Abstract fleet arrived —
    // planetId/point=null (bitwa odbywa się „nad systemem", brak konkretu).
    const result = resolveBattle(fleetUnit, playerUnit, {
      casusBelli: war.casusBelli,
      location:   { systemId: destSystemId, planetId: null, point: null },
      seed:       Math.floor(this._year() * 7919 + fleet.strength) & 0x7FFFFFFF,
    });

    // Aplikuj straty — flota obca pomniejszona o lossesA
    const newStrength = fleet.strength - result.lossesA;
    reg.updateFleetStrength(empire.id, fleet.id, newStrength, 'battle_damage');

    // Zapisz bitwę — location przechodzi przez spread z result (już object po v66).
    const recordedResult = {
      ...result,
      participantA: { type: 'empire', empireId: empire.id, fleetId: fleet.id, strength: fleet.strength },
      participantB: { type: 'player', systemId: destSystemId },
    };
    this.recordBattle(war.id, recordedResult);
  }

  _isPlayerInSystem(systemId) {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return false;
    // Gracz obecny, jeśli ma kolonię w tym systemie
    return colMgr.getAllColonies().some(c => {
      return this._getBodySystemId(c.planetId) === systemId;
    });
  }

  _getBodySystemId(planetId) {
    if (!planetId) return null;
    const body = EntityManager.get(planetId);
    return body?.systemId ?? null;
  }

  /**
   * Statki GRACZA zdolne bronić układu. Wrogie nie wzmacniają obrony, wraki nie walczą,
   * a okręt w REZERWIE nie broni niczego (W2 §C-6 — bez tego filtra magazyn nie kosztuje NIC).
   */
  _playerVesselsInSystem(systemId) {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr?._vessels) return [];
    return Array.from(vMgr._vessels.values()).filter(v =>
      v.systemId === systemId && !isEnemyVessel(v) && !v.isWreck && isInService(v)
    );
  }

  /** Kolonie GRACZA w układzie (brak stempla właściciela = gracz — kanon „nieostemplowane"). */
  _playerColoniesInSystem(systemId) {
    const colMgr = window.KOSMOS?.colonyManager;
    return (colMgr?.getAllColonies() ?? []).filter(c =>
      this._getBodySystemId(c.planetId) === systemId &&
      (!c.ownerEmpireId || c.ownerEmpireId === 'player')
    );
  }

  /**
   * Czy gracz JEST w tym układzie — cokolwiek, co mogłoby stanąć do bitwy?
   *
   * ⚠ W3-4b — pytanie brzmi trywialnie, a nie było zadawane NIGDZIE. `_buildPlayerBattleUnit`
   * dla układu, w którym gracz nie ma nic, zwracał JEDNOSTKĘ WIDMO: `playerVesselsToBattleUnit`
   * na pustej liście oddaje `{ hp: 100, weapons: [] }` — sto punktów wytrzymałości i ZERO broni.
   * Zmierzone na GATE 2: AI „wygrało bitwę" z tym workiem treningowym w układzie, w którym gracz
   * nie posiada niczego, a księga wojny obciążyła gracza udziałem przegranego (+3.6).
   * Ten predykat czyta DOKŁADNIE te same dwa wejścia co `_buildPlayerBattleUnit` — jedno źródło,
   * inaczej „kto broni" i „czy jest kogo bronić" mogłyby się rozjechać.
   */
  hasPlayerPresenceInSystem(systemId) {
    if (!systemId) return false;
    return this._playerVesselsInSystem(systemId).length > 0
        || this._playerColoniesInSystem(systemId).length > 0;
  }

  _buildPlayerBattleUnit(systemId) {
    const vessels = this._playerVesselsInSystem(systemId);

    // Zbierz statki gracza — baza jednostki bitwy
    let unit = playerVesselsToBattleUnit(vessels, HULLS, SHIP_MODULES, 'Gracz');

    // Dodaj obronę z budynków defensywnych w koloniach gracza w tym systemie.
    // defense_tower (level): +40 HP, +5 dmg, +1 armor per level.
    // defense_grid (level):  +100 HP, +10 dmg, +2 armor per level.
    // Bez żadnego z tych budynków gracz polega tylko na flocie; brak floty +
    // brak obrony → symboliczna obrona pasywna planety (30 HP / 2 dmg).
    const colonies = this._playerColoniesInSystem(systemId);

    let defHP = 0, defDmg = 0, defArmor = 0;
    for (const col of colonies) {
      const actives = col.buildingSystem?._active;
      if (!actives) continue;
      actives.forEach(entry => {
        const id = entry.building?.id;
        const lv = entry.level ?? 1;
        if (id === 'defense_tower') {
          defHP    += 40 * lv;
          defDmg   += 5  * lv;
          defArmor += 1  * lv;
        } else if (id === 'defense_grid') {
          defHP    += 100 * lv;
          defDmg   += 10  * lv;
          defArmor += 2   * lv;
        }
      });
    }

    const hasDefense = defHP > 0;
    const hasFleet   = vessels.length > 0;

    if (hasFleet && hasDefense) {
      // Flota + obrona — zsumuj stats
      unit = {
        ...unit,
        label: 'Flota + Obrona orbitalna',
        hp:    (unit.hp ?? 0) + defHP,
        armor: (unit.armor ?? 0) + defArmor,
        weapons: [...(unit.weapons ?? []), { damage: defDmg, tracking: 0.6 }],
      };
    } else if (!hasFleet && hasDefense) {
      // Tylko obrona orbitalna z budynków
      unit = {
        label: 'Obrona orbitalna',
        hp: defHP, shieldHP: 0, armor: defArmor, evasion: 0.05,
        techMult: 1.0, morale: 1.0,
        weapons: [{ damage: defDmg, tracking: 0.6 }],
      };
    } else if (!hasFleet && !hasDefense) {
      // Brak floty + brak obrony — symboliczna obrona pasywna (planeta nie jest
      // bezbronna: punkty obserwacyjne, improwizowane działka, ale bardzo słaba).
      // Każdy wrogi hull_small+ powinien wygrać.
      const hasColony = colonies.length > 0;
      if (hasColony) {
        unit = {
          label: 'Symboliczna obrona',
          hp: 30, shieldHP: 0, armor: 0, evasion: 0.02,
          techMult: 1.0, morale: 0.8,
          weapons: [{ damage: 2, tracking: 0.5 }],
        };
      }
    }
    // hasFleet && !hasDefense → unit = flota gracza (bez zmian)

    return unit;
  }

  // ── Pomocnicze ───────────────────────────────────────────────

  _year() { return window.KOSMOS?.timeSystem?.gameTime ?? 0; }

  /**
   * Kto kontroluje orbitę systemu (po ostatniej bitwie)?
   * @param {string} systemId
   * @returns {string|null} 'player' | empireId | null (nigdy nie było bitwy)
   */
  getOrbitalController(systemId) {
    return gameState.get(`orbitalDominance.${systemId}`)?.controllerId ?? null;
  }

  /**
   * Czy w systemie jest aktywna flota wroga (strength > 0)?
   * Używane do semantyki dominacji: pusta orbita = brak oporu = dominance domyślnie gracza.
   * @param {string} systemId
   * @returns {boolean}
   */
  /**
   * Czy w układzie stoi wroga siła zdolna odmówić graczowi dominacji orbitalnej?
   *
   * W1-3 (audyt V22) — do tej pory funkcja skanowała WYŁĄCZNIE `emp.fleets[].strength`,
   * czyli księgę, która w normalnej grze jest PUSTA (K-2, zmierzone w `war_seams_smoke` T5).
   * Skutek: prawdziwy okręt wojenny AI zaparkowany na orbicie NIE odbierał graczowi dominacji,
   * a UI desantu zostawało odblokowane mimo wrogiej eskadry nad głową. Teraz najpierw pytamy
   * o REALNE kadłuby, a księga abstrakcyjna zostaje jako druga ścieżka dla flot debugowych.
   *
   * Runtime-only — sam skan niczego nie serializuje. ⚠ Nota historyczna: do W3-3 mapa
   * `orbitalDominance` była czyszczona przy KAŻDYM wczytaniu (brak klucza w
   * `createDefaultState`), więc ta gałąź „brak kontrolera → sprawdź, czy ktoś stoi na orbicie"
   * po reloadzie przejmowała decyzję za wynik bitwy. Klucz jest już zadeklarowany i przeżywa
   * zapis (`w3_dominance_persist_smoke`), więc gałąź wraca do swojej właściwej roli:
   * rozstrzyga tylko układy, w których bitwy NIGDY nie było.
   */
  _hasHostileFleetInSystem(systemId) {
    if (!systemId) return false;

    // 1) REALNE kadłuby — wrogi, UZBROJONY, żywy statek w tym układzie.
    const vMgr = window.KOSMOS?.vesselManager;
    if (vMgr?._vessels) {
      for (const v of vMgr._vessels.values()) {
        if (!v || v.isWreck) continue;
        if (!isEnemyVessel(v)) continue;
        if ((v.systemId ?? 'sys_home') !== systemId) continue;
        // Bezbronny transportowiec nie „trzyma" orbity — ten sam próg, co bramka walki DSCS.
        if (!hasWeapons(v)) continue;
        return true;
      }
    }

    // 2) Księga abstrakcyjna — pusta w normalnej grze, żywa dla flot debugowych/legacy.
    const reg = window.KOSMOS?.empireRegistry;
    if (!reg) return false;
    const empires = reg.listAll?.() ?? [];
    for (const emp of empires) {
      if (!emp?.fleets) continue;
      for (const f of emp.fleets) {
        if ((f.strength ?? 0) <= 0) continue;
        if (f.systemId === systemId || f.destSystemId === systemId) return true;
      }
    }
    return false;
  }

  /**
   * Czy gracz ma dominację orbitalną nad planetą?
   * Używane przez ColonyOverlay (drop mode, orbital strike UI) i dropTroop().
   *
   * Dominacja gracza obowiązuje gdy:
   *  (a) explicit: controller == 'player' (po wygranej bitwie), LUB
   *  (b) domyślnie: w systemie NIE MA wrogiej floty z strength > 0.
   *
   * Pusty system = brak oporu = orbita bezpieczna. Jeśli flota wroga przybędzie,
   * dominacja znika automatycznie i gracz musi wygrać walkę, by znowu móc desantować.
   *
   * @param {string} planetId
   * @returns {boolean}
   */
  playerHasOrbitalDominance(planetId) {
    const sysId = this._getBodySystemId(planetId);
    if (!sysId) return false;
    const ctrl = this.getOrbitalController(sysId);
    if (ctrl === 'player') return true;
    if (ctrl) return false; // kontroler to wrogie imperium → player nie ma
    // Brak explicit controller — sprawdź czy w systemie jest wroga flota
    return !this._hasHostileFleetInSystem(sysId);
  }

  /**
   * Kto kontroluje orbitę konkretnej planety (pochodna getOrbitalController).
   * @param {string} planetId
   * @returns {string|null}
   */
  getPlanetOrbitalController(planetId) {
    const sysId = this._getBodySystemId(planetId);
    if (!sysId) return null;
    return this.getOrbitalController(sysId);
  }
}
