// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// announce_once_smoke — KEEPER kroku POZA arciem COMBAT VISUALS: #640 (zalew kontaktów) + #675 (okno łaski przed wynikiem
//   bitwy) — reguła kroku: JEDEN komunikat na zdarzenie (COMBAT_VISUALS_PLAN.md §3.2-14, -25; Findingi 640, 675, 657).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CO PINUJE (wyłącznie logika — bez pinów na stałych rysunku):
//   C1 10 na 10 w zasięgu obserwatorium kolonii: JEDNO okno pierwszego wykrycia z listą 10 kontaktów, pauza RAZ, wznowienie RAZ
//      (po zamknięciu); świadek: 10 zdarzeń `vessel:firstSighting` na statek (beat pierwszego kontaktu bez zmian) i jedna partia
//   C2 Dziennik obserwatorium: JEDNA linia na partię (liczba kontaktów); jeden statek — dzisiejszy tekst co do znaku
//   C3 mgła wojny w oknie zbiorczym = okno pojedyncze, statek po statku: bez identyfikacji — sama odległość (bez nazwy, kadłuba,
//      imperium); przy intel ≥ contact — nazwa, kadłub, imperium; okno JEDNEGO statku — treść sprzed kroku (te same napisy)
//   C4 kontakt sensoryczny: 13 statków gracza × 10 wrogów — JEDNA linia z listą wrogów (świadek: ≥ 120 par); wróg raz na 10 lat
//   C5 identyfikacja i utrata kontaktu: jedna linia na partię; jeden statek — dzisiejszy tekst i pola (pozycja przy utracie)
//   C6 4 bitwy 10 na 10: wpisów Dziennika daleko poniżej bufora 500 (świadek: tyle samo zdarzeń co przed krokiem ≈ 600)
//   C7 okno zbierania: przed upływem `WINDOW_MS` czasu prezentacji linii nie ma, po — jest; pauza zatrzymuje okno; 0 — od razu
//   C8 partia, gdy okno już jest otwarte: czeka i wychodzi po zamknięciu — nigdy dwa okna naraz, pauza raz, wznowienie raz;
//      przelot pierwszego kontaktu (decyzja 5) — bez okna
//   G1 split 4v4 (ziarno 2 — od M1): JEDEN baner, JEDNA linia bitwy, JEDNA linia potyczki (dobicie dołącza); KONTROLA okno 0 — po dwie
//   G2 zwykłe 10 na 10: baner i linia bitwy dokładnie po oknie łaski (czas prezentacji od ostatniego `battle:resolved`)
//   G3 pauza zatrzymuje okno łaski (5 s w pauzie — nic; po wznowieniu — reszta okna)
//   G4 #657 po M1: 1 na 1 (ziarno 3) — odwrót AI to lot w trakcie starcia, bez ponownego zwarcia ⇒ JEDNO starcie, jeden baner
//      z oknem i bez (dawniej odwrót kończył starcie, a ponowne zwarcie w tej samej klatce dawało drugie)
//   G5 wyniki starć z oknem i bez — identyczne (okno nie dotyka walki)
//   G6 źródło: pętla gry woła `_tickAnnouncements` PO `timeSystem.update`; `vessel:engaged` → `_joinBattleGrace`; baner i narrator
//      dostają okno; `ObservatorySystem` emituje partię raz, poza pętlą; `UIManager` nie pisze już linii kontaktu na parę;
//      kontakt sensoryczny pod bramką `m4Notifications`
//   G7 i18n PL + EN: 18 nowych kluczy w obu słownikach (13 kroku + 5 mgły #687); teksty bez surowych `{n}`
//   F  mgła wojny linii kontaktu (#687, decyzja właściciela 2026-11-11): „Kontakt sensoryczny” i „Utracono kontakt” podają nazwę
//      obcego statku WYŁĄCZNIE, gdy pozwala reguła kanoniczna `VesselReveal.enemyVesselNamed` (wywiad o STATKU ≥ contact — ta sama
//      co etykiety CTRL); poniżej — odległość (jeden statek) / pozycja (utrata) / liczba (kilka). F1 jeden wróg · F2 partie mieszane
//      i same anonimowe · F3 utrata: wrak zidentyfikowanego z nazwą (jakość w ładunku zdarzenia — rekord zdjęty wcześniej), wrak
//      i wygaśnięcie zdegradowanego bez nazwy · F4 moduł: anonim nigdy nie wypisuje nazwy ani id · F5 jedna reguła w źródle.
//      Każdy pin wykluczający ma ŚWIADKA (nazwa pojawia się, gdy reguła pozwala) — inaczej przeszedłby jałowo.
//
// ⚠ Keeper wykonuje KOD GRY, nie replikę: handlery `GameScene` (`EventBus.on('…', …)`) wycięte ze źródła bez komentarzy i związane
//   z atrapą sceny, metody (`_showFirstSightings`, `_tickAnnouncements`, …) skompilowane ze źródła; okno DOM — szpieg
//   `buildScheduledEventPopup` (zapis konfiguracji, `dismiss` = zamknięcie przyciskiem). Świat: prawdziwe DSCS + stager `cvBattle`
//   + `WarSystem` + `IntelSystem` + `ObservatorySystem` + `NotificationCenter` + `EventLogSystem`, bez renderera.
// ⚠ Fail-first: moduł `ContactNarration` i metody powstają w tym kroku — import dynamiczny w try/catch, każdy blok łapie wyjątek:
//   piny DEGRADUJĄ (czerwone), suita się nie przerywa.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { reseed }                from '../headless/env.js';
import { readFileSync }          from 'node:fs';
import EventBus                  from '../../core/EventBus.js';
import EntityManager             from '../../core/EntityManager.js';
import gameState                 from '../../core/GameState.js';
import { GAME_CONFIG }           from '../../config/GameConfig.js';
import { TimeSystem }            from '../../systems/TimeSystem.js';
import { VesselManager }         from '../../systems/VesselManager.js';
import { MovementOrderSystem }   from '../../systems/MovementOrderSystem.js';
import { ProximitySystem }       from '../../systems/ProximitySystem.js';
import { VesselCombatSystem }    from '../../systems/VesselCombatSystem.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { EnemyAttackHandler }    from '../../systems/EnemyAttackHandler.js';
import { OrbitalSpaceSystem }    from '../../systems/OrbitalSpaceSystem.js';
import { WarSystem }             from '../../systems/WarSystem.js';
import { IntelSystem }           from '../../systems/IntelSystem.js';
import { ObservatorySystem }     from '../../systems/ObservatorySystem.js';
import { EventLogSystem }        from '../../systems/EventLogSystem.js';
import { NotificationCenter }    from '../../systems/NotificationCenter.js';
import { setNextVesselId, isEnemyVessel } from '../../entities/Vessel.js';
import { t, setLocale, getLocale } from '../../i18n/i18n.js';
import PL                        from '../../i18n/pl.js';
import EN                        from '../../i18n/en.js';
import { HULLS }                 from '../../data/HullsData.js';
import { formatStatLine, formatStatLineWithCursor } from '../../ui/TerminalPopupBase.js';
import { PresentationClock }     from '../../renderer/combat/PresentationClock.js';
import { normalize as normalizeBattleLocation, isDeepSpace as isDeepSpaceBattle } from '../../utils/BattleLocation.js';
import { resolveBattleSides, battleWinnerName } from '../../utils/BattleSides.js';
import { systemDisplayName }     from '../../ui/MapLabelLogic.js';
import { systemIdOf }            from '../../utils/SystemScope.js';
import { enemyVesselNamed }      from '../../utils/VesselReveal.js';
import * as BC                   from '../../ui/BattleClusterLogic.js';
import * as NR                   from '../../ui/CombatNarration.js';

const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const CN = await tryImport('../../ui/ContactNarration.js');
const STAGER = await tryImport('../../debug/CvBattleStager.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const block = (title, fn) => { header(title); try { fn(); } catch (e) { assert(false, `${title} — wyjątek (pin degraduje, nie przerywa): ${e.message}`); } };
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
const F = GAME_CONFIG.FEATURES;
setLocale('pl');

const GS = read('src/scenes/GameScene.js');
const GSc = strip(GS);
const UI = read('src/scenes/UIManager.js');
const UIc = strip(UI);
const OBS = strip(read('src/systems/ObservatorySystem.js'));

// Metoda klasy wycięta ze źródła (sygnatura na początku linii z wcięciem 2) i skompilowana z zakresem.
const methodSrc = (code, name) => {
  const i = code.indexOf(`\n  ${name}(`);
  if (i < 0) return null;
  const end = code.indexOf('\n  }\n', i);
  return end < 0 ? null : code.slice(i + 1, end + 4);
};
const _said = new Set();
const sayOnce = (msg) => { if (!_said.has(msg)) { _said.add(msg); console.log(msg); } };
const compile = (code, name, scope = {}) => {
  const src = methodSrc(code, name);
  if (!src) { sayOnce(`  ! brak metody ${name}`); return null; }
  try { return new Function(...Object.keys(scope), `return function ${src.trim().slice(name.length)};`)(...Object.values(scope)); }
  catch (e) { console.log(`  ! kompilacja ${name}: ${e.message}`); return null; }
};
// Handler `EventBus.on('<ev>', <funkcja strzałkowa>)` wycięty ze źródła BEZ komentarzy (n-te wystąpienie) — tekst funkcji do
// nawiasu zamykającego `EventBus.on(`, ze świadomością napisów.
const handlerSrc = (code, ev, nth = 0) => {
  const key = `EventBus.on('${ev}', `;
  let i = -1;
  for (let n = 0; n <= nth; n++) { i = code.indexOf(key, i + 1); if (i < 0) return null; }
  const j = i + key.length;
  let depth = 0, quote = null;
  for (let k = j; k < code.length; k++) {
    const ch = code[k];
    if (quote) { if (ch === '\\') { k++; continue; } if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') { if (depth === 0) return code.slice(j, k); depth--; }
  }
  return null;
};
const handler = (code, ev, nth, scope, self) => {
  const src = handlerSrc(code, ev, nth);
  if (!src) { sayOnce(`  ! brak handlera ${ev} #${nth}`); return null; }
  try { return new Function(...Object.keys(scope), `return function () { return (${src}); };`)(...Object.values(scope)).call(self); }
  catch (e) { console.log(`  ! kompilacja handlera ${ev}: ${e.message}`); return null; }
};

// ═══ Świat bez renderera ══════════════════════════════════════════════════════════════════════════════════════════
const AU = GAME_CONFIG.AU_TO_PX;
const SYS = 'sys_t';
const EMP = 'emp_t';
const clock = { now: 1e7 };
performance.now = () => clock.now;
let ts, vm, dscs, log, obs, nc, saveSys, gs;
const W = {};   // świadkowie (surowe zdarzenia — tyle linii / okien dawał Dziennik przed krokiem)
const popups = [];   // szpieg okna DOM: { cfg, open, dismiss }

function spyBuild(cfg) {
  const p = { cfg, open: true };
  p.dismiss = () => { if (!p.open) return; p.open = false; cfg.onDismiss?.(); };
  popups.push(p);
  return { overlay: globalThis.document.createElement('div'), dismiss: p.dismiss, btnElements: [] };
}
const openPopups = () => popups.filter((p) => p.open);

const SCOPE = () => ({
  window: globalThis.window, GAME_CONFIG, t, getLocale, EntityManager, HULLS, EventBus, document: globalThis.document, isEnemyVessel,
  enemyVesselNamed,
  buildScheduledEventPopup: spyBuild, formatStatLine, formatStatLineWithCursor, requestAnimationFrame: () => 0,
  PresentationClock, ContactBatcher: CN?.ContactBatcher, CONTACT_NARRATION: CN?.CONTACT_NARRATION,
  PROXIMITY_COOLDOWN_YEARS: CN?.PROXIMITY_COOLDOWN_YEARS, contactLogEntry: CN?.contactLogEntry, systemIdOf,
  clusterBannerStep: BC.clusterBannerStep, clusterPeerIds: BC.clusterPeerIds, clusterRadiusPx: BC.clusterRadiusPx,
  clusterGraceJoin: BC.clusterGraceJoin, clusterBannerDue: BC.clusterBannerDue, clusterGraceMs: BC.clusterGraceMs,
  CLUSTER_GRACE: BC.CLUSTER_GRACE, ClusterNarrator: NR.ClusterNarrator, encounterIdOfBattle: NR.encounterIdOfBattle,
  isClusterNarrated: NR.isClusterNarrated, normalizeBattleLocation, isDeepSpaceBattle, systemDisplayName, resolveBattleSides,
  battleWinnerName,
});
const METHODS = ['_showFirstSightings', '_onSightingPopupDismissed', '_sightingPopupOne', '_sightingPopupMany', '_tickAnnouncements',
  '_announceNowMs', '_battleGraceMs', '_releaseBattleGrace', '_joinBattleGrace', '_writeNarration', '_noteContact',
  '_noteProximityContact', '_battleLogEntry', '_clusterNarratorOf', '_narrateBattleCluster', '_clusterBattleBanners'];

// Atrapa sceny: prawdziwe metody i handlery `GameScene`; baner = zapis (kolejka banerów schodzi od razu — DOM poza keeperem).
function makeScene() {
  const scope = SCOPE();
  const s = { timeSystem: ts, starSystemManager: { getAllSystems: () => [] }, _battleQueue: [], shown: [] };
  for (const m of METHODS) s[m] = compile(GS, m, scope);
  s._tryShowNextBattle = function () {
    while (this._battleQueue.length) this.shown.push({ b: this._battleQueue.shift(), atMs: this._announceNowMs?.() ?? null });
  };
  const ui = { skirmishLineText: compile(UI, 'skirmishLineText', { window: globalThis.window, t }) };
  ui._log = (text, type) => window.KOSMOS.eventLogSystem.pushLegacy(text, type);
  s.uiManager = ui;
  // Handlery `GameScene` z bieżącego źródła. Na kodzie sprzed kroku (fail-first) nie ma `vessel:firstSightings` ani
  // `vessel:engaged`, jest dawny `vessel:firstSighting` (okno na statek) — podpina się to, co jest w źródle.
  const subs = [['battle:resolved', 0], ['battle:resolved', 1], ['war:skirmish', 0], ['vessel:engaged', 0],
    ['intel:vesselContactChanged', 0], ['intel:vesselContactLost', 0], ['vessel:firstSightings', 0], ['vessel:firstSighting', 0]];
  if (F.m4Notifications) subs.push(['vessel:proximityEnter', 0]);
  for (const [ev, nth] of subs) {
    if (!handlerSrc(GSc, ev, nth)) continue;
    const fn = handler(GSc, ev, nth, scope, s);
    if (fn) EventBus.on(ev, fn);
  }
  const uiScope = { GAME_CONFIG, isClusterNarrated: NR.isClusterNarrated, window: globalThis.window, t };
  const uiSk = handler(UIc, 'war:skirmish', 0, uiScope, ui);
  if (uiSk) EventBus.on('war:skirmish', uiSk);
  // Dawny kontakt sensoryczny w `UIManager` (linia na parę) — istnieje wyłącznie na kodzie sprzed kroku.
  if (F.m4Notifications && handlerSrc(UIc, 'vessel:proximityEnter', 0)) {
    ui._lastProximityLog = new Map(); ui._PROXIMITY_LOG_COOLDOWN_YEARS = 10;
    const fn = handler(UIc, 'vessel:proximityEnter', 0, uiScope, ui);
    if (fn) EventBus.on('vessel:proximityEnter', fn);
  }
  return s;
}

function world({ observatory = 5 } = {}) {
  // ⚠ `gameState.reset()` obowiązkowy: rekordy Wywiadu (`intel.vessels.<id>`) żyją w GLOBALNYM magazynie, a id statków liczą się
  //   od `v_1` w każdym świecie — bez resetu statek dziedziczy jakość wywiadu statku o tym samym id z poprzedniego bloku (zmierzone:
  //   „Cień” obserwowany z 1,1 AU wychodził jako `contact` po „Grocie” z F1).
  EventBus.clear(); EntityManager.clear(); gameState.reset();
  global.window = global.window ?? {};
  clock.now = 1e7;
  setNextVesselId(1);
  popups.length = 0;
  ts = new TimeSystem();
  ts.gameTime = 100.00002;
  ts.multiplierIndex = 1;
  window.KOSMOS = { timeSystem: ts, activeSystemId: SYS };
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom', systemId: SYS, x: -4 * AU, y: 0, radius: 6, mass: 1, visual: { radius: 6 } });
  vm = new VesselManager(); const mos = new MovementOrderSystem(vm); const prox = new ProximitySystem(vm);
  dscs = new DeepSpaceCombatSystem(vm); new VesselCombatSystem(vm); const eah = new EnemyAttackHandler(); const oss = new OrbitalSpaceSystem();
  saveSys = { _autosaveInterval: 1 };
  // Kolonia gracza; `observatory` > 0 — obserwatorium tego poziomu (5 = zasięg 35 AU — cała bitwa w zasięgu), 0 — bez wykrywania.
  const home = { planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {}, fleet: [], planet: EntityManager.get('p_home') };
  if (observatory > 0) home.buildingSystem = { _active: new Map([['p_home_obs', { building: { id: 'observatory' }, level: observatory }]]) };
  const cols = [home];
  const empires = [{ id: EMP, name: 'Testowe Imperium' }];
  log = new EventLogSystem();
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: EntityManager.get('p_home'), vesselManager: vm, movementOrderSystem: mos,
    proximitySystem: prox, deepSpaceCombatSystem: dscs, enemyAttackHandler: eah, orbitalSpaceSystem: oss,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find((c) => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: log,
    empireRegistry: { listAll: () => empires, get: (id) => empires.find((e) => e.id === id) ?? null },
    // Potyczka: imperium w POKOJU z graczem — `WarSystem._classifyBattle` emituje `war:skirmish` (linia potyczki narratora).
    diplomacySystem: { getStatus: () => 'peace', getTension: () => 50, changeTension: () => {}, addMemory: () => {}, getMemory: () => [] },
    starSystemManager: { getAllSystems: () => [] },
    debug: { combatTrace: false },
  });
  window.KOSMOS.intelSystem = new IntelSystem();
  obs = new ObservatorySystem(); window.KOSMOS.observatorySystem = obs;
  nc = new NotificationCenter(); window.KOSMOS.notificationCenter = nc;
  new WarSystem();   // słucha `battle:resolved` PRZED narratorem — kolejność jak w grze
  Object.assign(W, { sight: 0, batches: 0, prox: 0, ident: 0, lost: 0, battles: [], results: [], pause: 0, resume: 0, lastResolveMs: null, encs: 0,
    proxNamed: new Map() });
  const lastPair = new Map();
  EventBus.on('vessel:firstSighting', () => W.sight++);
  EventBus.on('vessel:firstSightings', () => W.batches++);
  EventBus.on('vessel:proximityEnter', ({ vesselAId, vesselBId, sameFaction }) => {
    if (sameFaction) return;
    const a = vm.getVessel(vesselAId), b = vm.getVessel(vesselBId);
    if (!a || !b) return;
    const pa = !a.ownerEmpireId || a.ownerEmpireId === 'player', pb = !b.ownerEmpireId || b.ownerEmpireId === 'player';
    if (!pa && !pb) return;
    const key = vesselAId < vesselBId ? `${vesselAId}|${vesselBId}` : `${vesselBId}|${vesselAId}`;
    const last = lastPair.get(key);
    if (last != null && ts.gameTime - last < 10) return;
    lastPair.set(key, ts.gameTime); W.prox++;   // dawny Dziennik: linia na parę, 10 lat na parę
  });
  // Świadek mgły (#687): czy reguła kanoniczna pozwalała nazwać wroga w chwili jego PIERWSZEGO kontaktu sensorycznego. Wywiad
  // (`IntelSystem`) obserwuje parę przed świadkiem i przed sceną — kolejność subskrypcji jak w grze, więc ta sama jakość.
  EventBus.on('vessel:proximityEnter', ({ vesselAId, vesselBId, sameFaction }) => {
    if (sameFaction) return;
    const a = vm.getVessel(vesselAId), b = vm.getVessel(vesselBId);
    if (!a || !b || isEnemyVessel(a) === isEnemyVessel(b)) return;
    const foe = isEnemyVessel(a) ? a : b;
    if (!W.proxNamed.has(foe.id)) W.proxNamed.set(foe.id, enemyVesselNamed(window.KOSMOS.intelSystem?.getVesselContact?.(foe.id)?.quality));
  });
  EventBus.on('intel:vesselContactChanged', ({ newQuality, reason }) => { if ((newQuality === 'contact' || newQuality === 'detailed') && reason !== 'observatory_scan') W.ident++; });
  EventBus.on('intel:vesselContactLost', () => W.lost++);
  EventBus.on('time:pause', () => W.pause++);
  EventBus.on('time:resume', () => W.resume++);
  EventBus.on('vessel:engaged', () => W.encs++);
  gs = makeScene();
  // świadek wyniku — subskrybowany PO scenie: chwila ostatniego rozstrzygnięcia na zegarze prezentacji sceny
  EventBus.on('battle:resolved', ({ battleId, result }) => {
    if (!String(battleId).startsWith('battle_ds_')) return;
    W.battles.push(battleId);
    W.results.push([result.winner, result.lossesA, result.lossesB, result.turns, result.retreated ?? null]);
    W.lastResolveMs = gs._announceNowMs?.() ?? null;
  });
}
const helpers = () => STAGER?.cvBattleDebugHelpers?.({ getRenderer: () => null, getSaveSystem: () => saveSys }) ?? null;
// Klatka gry jak `GameScene`: `timeSystem.update`, potem okna ogłoszeń (`_tickAnnouncements`).
const frame = (ms = 16) => { clock.now += ms; ts.update(ms); gs._tickAnnouncements?.(clock.now); };
const entries = () => log.getEntries();
const linesMatching = (re) => entries().filter((e) => re.test(e.text));
const addPlayerFrigates = (n, at) => {
  for (let i = 0; i < n; i++) {
    const v = vm.createAndRegister('hull_frigate', 'p_home', { name: `Dom ${i + 1}`, modules: ['weapon_laser'] });
    v.systemId = SYS; v.position.x = at.x + (0.4 + 0.05 * i) * AU; v.position.y = at.y;
    v.position.state = 'orbiting'; v.position.dockedAt = null; v.status = 'idle';
  }
};
// Rozegraj do końca (okna wykryć zamykane jak przez gracza), potem ogon 3 s (okno łaski, partie kontaktów).
function playOut({ dismiss = true, tailMs = 3000, maxFrames = 120000 } = {}) {
  ts.play();
  let quietSince = null;
  for (let n = 0; n < maxFrames; n++) {
    frame(16);
    if (dismiss) for (const p of openPopups()) p.dismiss();
    const busy = dscs.listActive().length > 0 || openPopups().length > 0 || (gs._battleClusterHold?.length ?? 0) > 0
      || (gs._clusterNarrator?.holding ?? 0) > 0 || (gs._contactBatcher?.size ?? 0) > 0;
    if (busy) { quietSince = null; continue; }
    quietSince ??= clock.now;
    if (clock.now - quietSince > tailMs) break;
  }
}
const ENEMY_LINE = { prox: /^Kontakt sensoryczny/, ident: /^🔭 Wykryto obc/, lost: /^🔭 Utracono kontakt/, obs: /^🔭 Wykryto niezidentyfikowan/,
  battle: /^⚔ Bitwa/, skirmish: /^⚔ Potyczka/ };

// ═══ C1–C5 — jedna bitwa 10 na 10 w zasięgu obserwatorium ═════════════════════════════════════════════════════════
block('C1–C5 — 10 na 10 w zasięgu kolonii z obserwatorium, 13 statków gracza: jedno okno, jedna linia na zdarzenie', () => {
  reseed('announce-once'); world({ observatory: 5 });
  const st = helpers()?.cvBattle({ seed: 1 });
  const enc0 = dscs.listActive()[0];
  addPlayerFrigates(3, enc0?.location?.point ?? { x: 0, y: 0 });
  ts.play();
  for (let n = 0; n < 200 && popups.length === 0; n++) frame(16);
  const p0 = popups[0];
  assert(st?.ok === true && popups.length === 1 && openPopups().length === 1 && W.sight === 10 && W.batches === 1,
    `C1a JEDNO okno pierwszego wykrycia (okien ${popups.length}); świadek: ${W.sight} zdarzeń na statek (beat pierwszego kontaktu), ${W.batches} partia`);
  const rows = (p0?.cfg?.contentHTML?.match(/class="at-stat"/g) ?? []).length;
  assert(/: 10$/.test(p0?.cfg?.headline ?? '') && rows === 10,
    `C1b okno wymienia wszystkie kontakty: nagłówek „${p0?.cfg?.headline}”, wierszy ${rows} (8 kontaktów + „i jeszcze 2” + zagrożenie)`);
  assert(W.pause === 1 && W.resume === 0 && ts.isPaused === true,
    `C1c pauza RAZ przy otwarciu (pauz ${W.pause}, wznowień ${W.resume}) — gra stoi`);
  for (let n = 0; n < 30; n++) frame(16);
  assert(popups.length === 1 && W.pause === 1, 'C1d gra w pauzie — żadne kolejne okno nie powstaje');
  p0?.dismiss();
  assert(W.resume === 1 && ts.isPaused === false && openPopups().length === 0,
    `C1e zamknięcie okna — wznowienie RAZ i żadne okno nie wisi otwarte przy biegnącej grze (wznowień ${W.resume}, otwartych ${openPopups().length})`);
  playOut();
  const obsLines = linesMatching(ENEMY_LINE.obs);
  assert(obsLines.length === 1 && obsLines[0].text === t('log.unidentifiedContacts', 10) && popups.length === 1 && W.pause === 1 && W.resume === 1,
    `C2a Dziennik obserwatorium: ${obsLines.length} linia — „${obsLines[0]?.text}”; do końca bitwy okien ${popups.length}, pauz ${W.pause}, wznowień ${W.resume}`);
  const prox = linesMatching(ENEMY_LINE.prox);
  const pTxt = prox[0]?.text ?? '';
  assert(W.prox >= 120 && prox.length === 1
    && (pTxt.startsWith(t('log.m4.proximityContacts', 10, '').trim().replace(/:$/, '')) || pTxt === t('log.m4.proximityContactsAnon', 10)),
    `C4a kontakt sensoryczny: ${prox.length} linia (świadek: ${W.prox} par statek gracza × wróg — dawniej tyle linii) — „${pTxt}”`);
  // C4b — lista wg reguły nazwy (#687): nazwy wyłącznie wrogów, których reguła pozwalała nazwać w chwili kontaktu (najwyżej 5,
  // dalej „+N”), reszta — liczba „niezidentyfikowane: N”; sami niezidentyfikowani — linia bez listy.
  const foes = vm.getAllVessels().filter((v) => isEnemyVessel(v));
  const shown = foes.filter((v) => pTxt.includes(v.name));
  const k = foes.filter((v) => W.proxNamed.get(v.id) === true).length, m = foes.length - k;
  const listOk = k === 0 ? pTxt === t('log.m4.proximityContactsAnon', foes.length)
    : shown.length === Math.min(k, 5) && (k > 5) === /\+\d+(;|$)/.test(pTxt) && (m > 0) === pTxt.includes(t('log.el.unidentifiedCount', m));
  assert(W.proxNamed.size === foes.length && foes.length === 10 && shown.every((v) => W.proxNamed.get(v.id) === true) && listOk,
    `C4b lista wg reguły nazwy: zidentyfikowanych w chwili kontaktu ${k}, nie ${m}; nazw w linii ${shown.length} — wszystkie dozwolone`);
  const ident = linesMatching(ENEMY_LINE.ident);
  assert(W.ident === 10 && ident.length === 1 && ident[0].text.includes(`(${t('intel.levelContact')}, 10)`),
    `C5a identyfikacja: ${ident.length} linia na ${W.ident} identyfikacji — „${ident[0]?.text}”`);
  const lost = linesMatching(ENEMY_LINE.lost);
  assert(W.lost >= 2 && lost.length === 1 && lost[0].text.startsWith(t('log.el.contactsLost', W.lost, '').trim().replace(/:$/, '')),
    `C5b utrata kontaktu: ${lost.length} linia na ${W.lost} utraconych — „${lost[0]?.text}”`);
  const bat = linesMatching(ENEMY_LINE.battle), sk = linesMatching(ENEMY_LINE.skirmish);
  assert(bat.length === 1 && sk.length === 1 && gs.shown.length === 1,
    `C5c KONTROLA (zielona po obu stronach — jedno starcie): ${bat.length} linia bitwy, ${sk.length} potyczki, ${gs.shown.length} baner`);
});

block('C4c — wróg raz na 10 lat: nowa para (inny statek gracza) z tym samym wrogiem — bez nowej linii; po 10 latach — linia', () => {
  reseed('announce-once'); world({ observatory: 0 });
  const vA = vm.createAndRegister('hull_frigate', 'p_home', { name: 'Alfa', modules: ['weapon_laser'] });
  const vB = vm.createAndRegister('hull_frigate', 'p_home', { name: 'Beta', modules: ['weapon_laser'] });
  const foe = vm.createAndRegister('hull_frigate', 'p_none', { name: 'Rajder', modules: ['weapon_laser'] });
  for (const v of [vA, vB, foe]) { v.systemId = SYS; v.position.state = 'orbiting'; v.position.dockedAt = null; }
  foe.ownerEmpireId = EMP; foe.owner = EMP; foe.isEnemy = true;
  const hit = (a, b, d) => EventBus.emit('vessel:proximityEnter', { vesselAId: a.id, vesselBId: b.id, distanceAU: d, sameFaction: false });
  hit(vA, foe, 1.2); hit(vB, foe, 0.9);
  for (let n = 0; n < 30; n++) frame(16);
  const one = linesMatching(ENEMY_LINE.prox);
  assert(one.length === 1 && one[0].text === t('log.m4.proximityContactAnon', '1.20'),
    `C4c jeden wróg, dwie pary w oknie — jedna linia z odległością PIERWSZEGO kontaktu (druga para blokowana przerwą wroga; wywiad „rumor” — bez nazwy, #687): „${one[0]?.text}”`);
  ts.gameTime += 3; hit(vA, foe, 1.0);
  for (let n = 0; n < 30; n++) frame(16);
  const two = linesMatching(ENEMY_LINE.prox).length;
  ts.gameTime += 8; hit(vB, foe, 1.0);
  for (let n = 0; n < 30; n++) frame(16);
  const three = linesMatching(ENEMY_LINE.prox).length;
  assert(two === 1 && three === 2, `C4d po 3 latach nowa para — bez linii (${two}); po 11 latach — druga linia (${three})`);
});

// ═══ C3 — mgła wojny w oknie zbiorczym ═══════════════════════════════════════════════════════════════════════════
block('C3 — mgła wojny: okno zbiorcze = okno pojedyncze statek po statku; okno jednego statku — treść sprzed kroku', () => {
  reseed('announce-once'); world({ observatory: 0 });
  const q = new Map();
  window.KOSMOS.intelSystem = { getVesselContact: (id) => (q.has(id) ? { quality: q.get(id) } : null) };
  const mk = (name, x, quality, attack = false) => {
    const v = vm.createAndRegister('hull_destroyer', 'p_none', { name, modules: ['weapon_laser'] });
    v.systemId = SYS; v.position.x = x * AU; v.position.y = 0; v.ownerEmpireId = EMP; v.isEnemy = true;
    if (attack) v.mission = { type: 'attack', targetId: 'p_home', arrivalYear: ts.gameTime + 1 };
    if (quality) q.set(v.id, quality);
    return { vessel: v, empireId: EMP, empireName: 'Testowe Imperium', firstContactFlyby: false };
  };
  const sA = mk('Cień', -3, null), sB = mk('Mgła', -2, 'rumor'), sC = mk('Grot', -1, 'contact', true);
  const hullPL = HULLS.hull_destroyer?.namePL ?? 'hull_destroyer';
  const many = gs._sightingPopupMany([sA, sB, sC]);
  const rowOf = (name) => (many.stats.split('</div>').find((r) => r.includes(name)) ?? '');
  const anon = many.stats.split('</div>').filter((r) => r.includes(t('intel.unidentifiedContact')));
  assert(anon.length === 2 && !/Cień|Mgła/.test(many.stats) && anon.every((r) => !r.includes(hullPL) && !r.includes('Testowe Imperium') && /AU/.test(r)),
    'C3a bez identyfikacji (brak / rumor): wiersz „Niezidentyfikowany kontakt” + odległość — bez nazwy, kadłuba i imperium');
  const g = rowOf('Grot');
  assert(g.includes(hullPL) && g.includes('Testowe Imperium') && g.includes(t('sighting.attack')) && g.includes('at-stat-neg'),
    'C3b przy intel ≥ contact: nazwa, kadłub, imperium i znacznik ataku (jak w oknie pojedynczym zidentyfikowanego)');
  assert(many.headline === t('sighting.headlineContacts', 3) && many.desc === t('sighting.descContacts'),
    `C3c nie wszystkie zidentyfikowane — nagłówek „kontakty”: „${many.headline}”`);
  q.set(sA.vessel.id, 'contact'); q.set(sB.vessel.id, 'detailed');
  const all = gs._sightingPopupMany([sA, sB, sC]);
  assert(all.headline === t('sighting.headlineEnemy', 3) && /Cień/.test(all.stats) && /Mgła/.test(all.stats),
    `C3d KONTROLA: wszystkie zidentyfikowane — nagłówek „wrogie jednostki” i nazwy (${all.headline})`);
  q.delete(sA.vessel.id);
  const one = gs._sightingPopupOne(sA);
  assert(one.headline === '⚠ NIEZIDENTYFIKOWANY KONTAKT' && one.stats.includes('Niezidentyfikowana') && !one.stats.includes('Cień')
    && one.button === '[ENTER] Rozumiem',
    'C3e okno JEDNEGO niezidentyfikowanego — treść sprzed kroku (nagłówek, „Niezidentyfikowana”, przycisk), bez nazwy');
  const oneId = gs._sightingPopupOne(sC);
  assert(oneId.headline === '⚔ WYKRYTO WROGĄ JEDNOSTKĘ' && oneId.stats.includes('Grot') && oneId.stats.includes('ATAK') && oneId.stats.includes('Dom'),
    'C3f okno JEDNEGO zidentyfikowanego — treść sprzed kroku (nazwa, misja ATAK, cel)');
  gs._showFirstSightings([sA]);
  assert(popups.length === 1 && popups[0].cfg.headline === one.headline, 'C3g partia jednego statku idzie ścieżką okna pojedynczego');
  popups[0]?.dismiss();
});

// ═══ C5d — jeden statek: dzisiejsze teksty (czysty moduł) ═════════════════════════════════════════════════════════
block('C5d — partia jednego ZIDENTYFIKOWANEGO statku = dzisiejsza linia co do znaku (kontakt, identyfikacja, utrata z pozycją)', () => {
  const E = CN.contactLogEntry;
  const p = E({ kind: 'proximity', items: [{ id: 'v1', name: 'Rajder', named: true, distanceAU: 0.4321 }] });
  const i = E({ kind: 'identified', sub: 'detailed', items: [{ id: 'v1', name: 'Rajder', named: true }] });
  const l = E({ kind: 'lost', items: [{ id: 'v1', name: 'Rajder', named: true, position: { x: 10.4, y: -3.6 } }] });
  const l0 = E({ kind: 'lost', items: [{ id: 'v1', name: null, named: true, position: null }] });
  assert(p.text === t('log.m4.proximityContact', 'Rajder', '0.43') && p.channel === 'intel' && p.severity === 'info' && p.entityRef === 'v1',
    `C5d kontakt sensoryczny: „${p.text}” (kanał wywiadu, info, klik → statek)`);
  assert(i.text === t('log.el.vesselDetected', t('intel.levelDetailed'), 'Rajder') && i.severity === 'info',
    `C5e identyfikacja: „${i.text}”`);
  assert(l.text === t('log.el.contactLost', 'Rajder', '[10,-4]') && l.severity === 'warn' && l0.text === t('log.el.contactLost', 'v1', `[${t('log.el.positionUnknown')}]`),
    `C5f utrata z pozycją / bez nazwy i pozycji: „${l.text}” · „${l0.text}”`);
  const b = new CN.ContactBatcher();
  b.add('identified', { systemId: 's1', sub: 'contact', id: 'a', name: 'A' }, 0);
  b.add('identified', { systemId: 's1', sub: 'detailed', id: 'b', name: 'B' }, 0);
  b.add('identified', { systemId: 's2', sub: 'contact', id: 'c', name: 'C' }, 0);
  b.add('identified', { systemId: 's1', sub: 'contact', id: 'a', name: 'A' }, 10);
  const out = b.due(1000, 250);
  assert(out.length === 3 && out.find((x) => x.systemId === 's1' && x.sub === 'contact').items.length === 1,
    'C5g klucz partii: układ × poziom wywiadu; ten sam statek w oknie — raz');
});

// ═══ C6 — 4 bitwy ════════════════════════════════════════════════════════════════════════════════════════════════
block('C6 — 4 bitwy 10 na 10: Dziennik daleko poniżej bufora 500 (historia nie wypada)', () => {
  reseed('announce-once'); world({ observatory: 5 });
  const marker = log.push({ text: 'ZNACZNIK HISTORII', channel: 'system' });
  let raw = 0;
  for (let b = 1; b <= 4; b++) {
    const before = { ...W };
    const st = helpers()?.cvBattle({ seed: b });
    if (b === 1) addPlayerFrigates(3, dscs.listActive()[0]?.location?.point ?? { x: 0, y: 0 });
    playOut();
    raw += (W.sight - before.sight) + (W.prox - before.prox) + (W.ident - before.ident) + (W.lost - before.lost) + 2;
    if (!st?.ok) assert(false, `C6 bitwa ${b} nie wystartowała`);
  }
  const n = entries().length;
  assert(raw >= 500, `C6a świadek: zdarzenia, które przed krokiem dawały linię — ${raw} (bufor 500)`);
  assert(n <= 50 && entries().some((e) => e.id === marker.id),
    `C6b Dziennik po 4 bitwach: ${n} wpisów (bufor ${500}); wpis sprzed bitew zostaje w historii`);
});

// ═══ C7 — okno zbierania ═════════════════════════════════════════════════════════════════════════════════════════
block('C7 — okno zbierania kontaktów: czas prezentacji, pauza zatrzymuje, 0 — od razu', () => {
  reseed('announce-once'); world({ observatory: 0 });
  const foe = vm.createAndRegister('hull_frigate', 'p_none', { name: 'Rajder', modules: ['weapon_laser'] });
  foe.systemId = SYS; foe.ownerEmpireId = EMP; foe.isEnemy = true;
  ts.play();
  frame(16);
  EventBus.emit('intel:vesselContactLost', { vesselId: foe.id, lastKnownPosition: { x: 1, y: 2 }, reason: 'timeout' });
  const t0 = gs._announceNowMs();
  for (let n = 0; n < 10; n++) frame(16);
  const early = linesMatching(ENEMY_LINE.lost).length;
  for (let n = 0; n < 10; n++) frame(16);
  const late = linesMatching(ENEMY_LINE.lost).length;
  assert(early === 0 && late === 1 && gs._announceNowMs() - t0 >= CN.CONTACT_NARRATION.WINDOW_MS,
    `C7a przed upływem okna (${CN.CONTACT_NARRATION.WINDOW_MS} ms) — ${early} linii, po — ${late}`);
  EventBus.emit('intel:vesselContactLost', { vesselId: foe.id, lastKnownPosition: null, reason: 'timeout' });
  ts.pause();
  for (let n = 0; n < 300; n++) frame(16);
  const paused = linesMatching(ENEMY_LINE.lost).length;
  ts.play();
  for (let n = 0; n < 20; n++) frame(16);
  assert(paused === 1 && linesMatching(ENEMY_LINE.lost).length === 2, `C7b pauza 4,8 s — linii nadal ${paused}; po wznowieniu — 2`);
  const w = CN.CONTACT_NARRATION.WINDOW_MS;
  CN.CONTACT_NARRATION.WINDOW_MS = 0;
  EventBus.emit('intel:vesselContactLost', { vesselId: foe.id, lastKnownPosition: null, reason: 'timeout' });
  frame(16);
  CN.CONTACT_NARRATION.WINDOW_MS = w;
  assert(linesMatching(ENEMY_LINE.lost).length === 3, 'C7c okno 0 — linia w tej samej klatce');
});

// ═══ C8 — kolejka okien, przelot ═════════════════════════════════════════════════════════════════════════════════
block('C8 — partia przy otwartym oknie czeka; nigdy dwa okna naraz; pauza raz, wznowienie raz; przelot — bez okna', () => {
  reseed('announce-once'); world({ observatory: 0 });
  const mk = (name, fly = false) => {
    const v = vm.createAndRegister('hull_frigate', 'p_none', { name, modules: ['weapon_laser'] });
    v.systemId = SYS; v.ownerEmpireId = EMP; v.isEnemy = true;
    return { vessel: v, empireId: EMP, empireName: 'Testowe Imperium', firstContactFlyby: fly };
  };
  gs._showFirstSightings([mk('Sonda', true)]);
  assert(popups.length === 0 && W.pause === 0, 'C8a przelot pierwszego kontaktu (decyzja 5) — bez okna i bez pauzy');
  gs._showFirstSightings([mk('Sonda 2', true), mk('Pierwszy')]);
  gs._showFirstSightings([mk('Drugi'), mk('Trzeci')]);
  assert(popups.length === 1 && openPopups().length === 1 && W.pause === 1 && W.resume === 0,
    `C8b drugie wywołanie przy otwartym oknie — czeka (okien ${popups.length}, pauz ${W.pause})`);
  popups[0].dismiss();
  assert(popups.length === 2 && openPopups().length === 1 && W.resume === 0 && /: 2$/.test(popups[1].cfg.headline),
    `C8c po zamknięciu — od razu okno czekającej partii (${popups[1]?.cfg?.headline}), bez wznowienia pomiędzy`);
  popups[1].dismiss();
  assert(openPopups().length === 0 && W.pause === 1 && W.resume === 1, `C8d ostatnie zamknięcie — wznowienie raz (pauz ${W.pause}, wznowień ${W.resume})`);
});

// ═══ F — mgła wojny linii kontaktu (#687) ════════════════════════════════════════════════════════════════════════
// Nazwa obcego statku w „Kontakt sensoryczny” i „Utracono kontakt” WYŁĄCZNIE, gdy pozwala `VesselReveal.enemyVesselNamed`
// (wywiad o STATKU ≥ contact — ta sama reguła co etykiety CTRL). Prawdziwy Wywiad (`IntelSystem`): obserwacja z odległości
// ≥ 0,3 AU daje `rumor`, < 0,3 AU — `contact`; wrak i wygaśnięcie zdejmują rekord.
const ownAt = (name) => {
  const v = vm.createAndRegister('hull_frigate', 'p_home', { name, modules: ['weapon_laser'] });
  v.systemId = SYS; v.position.state = 'orbiting'; v.position.dockedAt = null;
  return v;
};
const enemyAt = (name, x = 2) => {
  const v = vm.createAndRegister('hull_frigate', 'p_none', { name, modules: ['weapon_laser'] });
  v.systemId = SYS; v.position.x = x * AU; v.position.y = 0; v.position.state = 'orbiting'; v.position.dockedAt = null;
  v.ownerEmpireId = EMP; v.owner = EMP; v.isEnemy = true;
  return v;
};
const near = (own, foe, d) => EventBus.emit('vessel:proximityEnter', { vesselAId: own.id, vesselBId: foe.id, distanceAU: d, sameFaction: false });
const flush = (n = 30) => { for (let i = 0; i < n; i++) frame(16); };
const qOf = (v) => window.KOSMOS.intelSystem?.getVesselContact?.(v.id)?.quality ?? 'unknown';
const leaks = (text, vs) => vs.filter((v) => text.includes(v.name) || new RegExp(`\\b${v.id}\\b`).test(text));
const posOf = (v) => `[${Math.round(v.position.x)},${Math.round(v.position.y)}]`;

block('F1 — kontakt sensoryczny JEDNEGO wroga poniżej progu nazwy: sama odległość; KONTROLA — wróg zidentyfikowany z nazwą', () => {
  reseed('announce-once'); world({ observatory: 0 });
  const own = ownAt('Alfa');
  const foe = enemyAt('Rajder');
  near(own, foe, 1.2); flush();
  const anon = linesMatching(ENEMY_LINE.prox);
  assert(qOf(foe) === 'rumor' && enemyVesselNamed(qOf(foe)) === false && anon.length === 1
    && anon[0].text === t('log.m4.proximityContactAnon', '1.20') && leaks(anon[0].text, [foe]).length === 0,
    `F1a wywiad o wrogu „${qOf(foe)}” (reguła: bez nazwy) — „${anon[0]?.text}”: odległość, bez nazwy i bez id`);
  const known = enemyAt('Grot');
  near(own, known, 0.2); flush();   // < 0,3 AU — obserwacja daje `contact`
  const named = linesMatching(ENEMY_LINE.prox).find((e) => e.id !== anon[0]?.id);
  assert(qOf(known) === 'contact' && named?.text === t('log.m4.proximityContact', 'Grot', '0.20'),
    `F1b KONTROLA (świadek nazwy): wywiad „${qOf(known)}” (reguła: nazwa) — „${named?.text}”`);
});

block('F2 — partia kilku wrogów: nazwy wyłącznie zidentyfikowanych, reszta liczbą; sami niezidentyfikowani — sama liczba', () => {
  reseed('announce-once'); world({ observatory: 0 });
  const own = ownAt('Alfa');
  const a = enemyAt('Grot'), b = enemyAt('Cień'), c = enemyAt('Mgła');
  near(own, a, 0.2); near(own, b, 1.1); near(own, c, 1.3); flush();
  const mix = linesMatching(ENEMY_LINE.prox);
  assert(mix.length === 1 && mix[0].text === t('log.m4.proximityContacts', 3, `Grot; ${t('log.el.unidentifiedCount', 2)}`)
    && leaks(mix[0].text, [b, c]).length === 0,
    `F2a jeden zidentyfikowany i dwóch nie (wywiad ${[a, b, c].map(qOf).join(' / ')}): „${mix[0]?.text}” — nazwa tylko zidentyfikowanego (świadek), reszta liczbą`);
  const d = enemyAt('Wir'), e = enemyAt('Pył'), f = enemyAt('Smuga');
  near(own, d, 1.0); near(own, e, 1.2); near(own, f, 1.4); flush();
  const anon = linesMatching(ENEMY_LINE.prox).filter((x) => x.id !== mix[0]?.id);
  assert(anon.length === 1 && anon[0].text === t('log.m4.proximityContactsAnon', 3) && leaks(anon[0].text, [d, e, f]).length === 0,
    `F2b trzech niezidentyfikowanych: „${anon[0]?.text}” — liczba, bez nazw`);
});

block('F3 — utrata kontaktu: wrak zidentyfikowanego — z nazwą; wrak niezidentyfikowanego i wygaśnięcie zdegradowanego — bez nazwy', () => {
  reseed('announce-once'); world({ observatory: 0 });
  const intel = window.KOSMOS.intelSystem;
  const own = ownAt('Alfa');
  const known = enemyAt('Grot', 2), ghost = enemyAt('Cień', 3);
  near(own, known, 0.2); near(own, ghost, 1.2); flush();
  intel._onVesselWrecked({ vesselId: known.id }); flush();
  const l1 = linesMatching(ENEMY_LINE.lost);
  assert(l1.length === 1 && l1[0].text === t('log.el.contactLost', 'Grot', posOf(known)),
    `F3a KONTROLA (świadek nazwy): wrak wroga zidentyfikowanego — rekord Wywiadu zdjęty PRZED zdarzeniem, jakość w ładunku — „${l1[0]?.text}”`);
  intel._onVesselWrecked({ vesselId: ghost.id }); flush();
  const l2 = linesMatching(ENEMY_LINE.lost).filter((x) => x.id !== l1[0]?.id);
  assert(l2.length === 1 && l2[0].text === t('log.el.contactLostAnon', posOf(ghost)) && leaks(l2[0].text, [ghost]).length === 0,
    `F3b wrak wroga z wywiadem „rumor”: „${l2[0]?.text}” — pozycja, bez nazwy`);
  // wygaśnięcie: kontakt z 0,2 AU, statek wychodzi z zasięgu; po 11 latach `contact` → `rumor`, po 21 — rekord zdjęty
  const fade = enemyAt('Wir', 4);
  near(own, fade, 0.2); flush();
  EventBus.emit('vessel:proximityExit', { vesselAId: own.id, vesselBId: fade.id, sameFaction: false });
  ts.gameTime += 11; intel._tickVesselDegradation(1);
  const mid = qOf(fade);
  const before = linesMatching(ENEMY_LINE.lost).length;
  ts.gameTime += 10; intel._tickVesselDegradation(1); flush();
  const l3 = linesMatching(ENEMY_LINE.lost);
  assert(mid === 'rumor' && l3.length === before + 1 && l3[0].text === t('log.el.contactLostAnon', posOf(fade)) && leaks(l3[0].text, [fade]).length === 0,
    `F3c wygaśnięcie po degradacji do „${mid}”: „${l3[0]?.text}” — bez nazwy (gracz od 10 lat zna tylko pozycję)`);
});

block('F4 — moduł: pozycja anonimowa nigdy nie wypisuje nazwy ani id (każdy rodzaj, 1 / 2 / 7 statków, sami anonimowi i mieszani)', () => {
  const E = CN.contactLogEntry;
  const mk = (i, named) => ({ id: `vx_${i}`, name: `Statek${i}x`, named, distanceAU: 1 + i / 10, position: { x: i, y: -i } });
  const bad = [];
  let witness = 0;
  for (const kind of CN.CONTACT_KINDS) for (const n of [1, 2, 7]) for (const mixed of [false, true]) {
    const items = Array.from({ length: n }, (_, i) => mk(i, mixed && i === 0));
    const txt = E({ kind, sub: 'contact', items })?.text ?? '';
    if (!txt) { bad.push(`${kind}/${n}/${mixed}: pusty wpis`); continue; }
    for (const it of items) {
      if (!it.named && (txt.includes(it.name) || txt.includes(it.id))) bad.push(`${kind}/${n}/${mixed}: „${txt}”`);
      if (it.named && txt.includes(it.name)) witness++;
    }
  }
  assert(bad.length === 0 && witness === 9,
    `F4a brak przecieków (${bad.length}${bad.length ? ': ' + bad.slice(0, 2).join(' | ') : ''}); świadek: nazwa zidentyfikowanego obecna w ${witness}/9 wpisach mieszanych`);
  const b = new CN.ContactBatcher();
  b.add('lost', { systemId: 's1', id: 'q1', name: 'Tajny', named: false, position: { x: 1, y: 1 } }, 0);
  b.add('lost', { systemId: 's1', id: 'q2', name: 'Jawny', named: true, position: { x: 2, y: 2 } }, 0);
  const items = b.due(1000, 250)[0]?.items ?? [];
  const q1 = items.find((it) => it.id === 'q1'), q2 = items.find((it) => it.id === 'q2');
  assert(q1?.named === false && q1?.name === null && q2?.named === true && q2?.name === 'Jawny',
    'F4b partia nie przechowuje nazwy pozycji anonimowej (obrona w głąb); zidentyfikowana — z nazwą (świadek)');
});

block('F5 — jedna reguła nazwy w źródle: każda bramka nazwy na ścieżce kontaktów pyta `VesselReveal.enemyVesselNamed`', () => {
  const bodies = {
    _noteProximityContact: methodSrc(GSc, '_noteProximityContact'),
    'intel:vesselContactChanged': handlerSrc(GSc, 'intel:vesselContactChanged', 0),
    'intel:vesselContactLost': handlerSrc(GSc, 'intel:vesselContactLost', 0),
    _sightingPopupOne: methodSrc(GSc, '_sightingPopupOne'),
    _sightingPopupMany: methodSrc(GSc, '_sightingPopupMany'),
  };
  const missing = Object.entries(bodies).filter(([, s]) => !s).map(([k]) => k);
  const asks = Object.entries(bodies).filter(([, s]) => /\benemyVesselNamed\(/.test(s ?? '')).map(([k]) => k);
  const inline = Object.entries(bodies)
    .filter(([, s]) => /(===|!==)\s*'contact'\s*(\|\||&&)[^;\n]*(===|!==)\s*'detailed'/.test(s ?? '')).map(([k]) => k);
  assert(missing.length === 0 && asks.length === 5 && inline.length === 0
    && /import \{ enemyVesselNamed \} from '\.\.\/utils\/VesselReveal\.js';/.test(GSc),
    `F5a pytają regułę: ${asks.length}/5 (${asks.join(', ')}); próg wpisany ręcznie: ${inline.length ? inline.join(', ') : 'nigdzie'}`);
  const INT = strip(read('src/systems/IntelSystem.js'));
  const lostEmits = INT.match(/EventBus\.emit\('intel:vesselContactLost', \{[\s\S]*?\}\);/g) ?? [];
  assert(lostEmits.length === 2 && lostEmits.every((s) => /quality:\s*rec\.quality/.test(s)),
    `F5b Wywiad: oba zdarzenia utraty kontaktu (wrak, wygaśnięcie) niosą jakość w chwili utraty (${lostEmits.length} emisji)`);
});

// ═══ G — okno łaski ══════════════════════════════════════════════════════════════════════════════════════════════
function runBattle(opts, { graceRounds = null, onWorld = null } = {}) {
  const keep = BC.CLUSTER_GRACE?.ROUNDS;
  if (graceRounds != null && BC.CLUSTER_GRACE) BC.CLUSTER_GRACE.ROUNDS = graceRounds;
  try {
    reseed('announce-once'); world({ observatory: 0 });
    onWorld?.();   // M1 (G4) — słuchacze po `world()` (ten czyści szynę zdarzeń)
    const st = helpers()?.cvBattle(opts);
    playOut();
    return { st, banners: gs.shown, battle: linesMatching(ENEMY_LINE.battle), skirmish: linesMatching(ENEMY_LINE.skirmish), W: { ...W } };
  } finally { if (BC.CLUSTER_GRACE) BC.CLUSTER_GRACE.ROUNDS = keep; }
}

// ⚠ PRZECELOWANIE M1 „bitwy do końca” (decyzja 33, 2026-11-11): w split 4v4 ziarno 1 dobiciem było ponowne zwarcie #657 po odwrocie
//   AI — M1 je usuwa z założenia (odwrót to lot, uciekający nie wraca od razu). Dobicie zgodne z M1 daje ziarno 2: ocalali dwóch
//   skończonych pojedynków zwierają się w chwili końca (1 runda) — to samo pytanie #675, inna scena. Liczby G1c nagrane na M1.
const G_SPLIT = { seed: 2, nA: 4, nB: 4, split: true };
block('G1 — split 4v4 (ziarno 2): jeden baner, jedna linia bitwy, jedna potyczki; KONTROLA okno 0 — po dwie (#675)', () => {
  const ON = runBattle(G_SPLIT);
  const OFF = runBattle(G_SPLIT, { graceRounds: 0 });
  assert(ON.st?.ok === true && ON.W.battles.length === 5 && ON.W.encs === 5,
    `G1a świadek: DSCS — ${ON.W.encs} starć, ${ON.W.battles.length} rozstrzygnięć (4 pojedynki + dobicie)`);
  assert(ON.banners.length === 1 && ON.battle.length === 1 && ON.skirmish.length === 1,
    `G1b z oknem: ${ON.banners.length} baner, ${ON.battle.length} linia bitwy, ${ON.skirmish.length} potyczki`);
  const m = ON.banners[0]?.b?.result;
  assert(m?.lossesA === 3 && m?.lossesB === 4 && m?.turns === 16 && ON.banners[0]?.b?.clusterSize === 5 && ON.battle[0]?.text.includes('3/4'),
    `G1c wynik scalony z dobiciem: straty ${m?.lossesA}/${m?.lossesB}, tury ${m?.turns}, starć ${ON.banners[0]?.b?.clusterSize}`);
  assert(OFF.banners.length === 2 && OFF.battle.length === 2 && OFF.skirmish.length === 2,
    `G1d KONTROLA okno 0: ${OFF.banners.length} banery, ${OFF.battle.length} linie bitwy, ${OFF.skirmish.length} potyczki (dzisiejsze #675)`);
});

block('G2 — zwykłe 10 na 10: baner i linia bitwy dokładnie po oknie łaski (czas prezentacji)', () => {
  reseed('announce-once'); world({ observatory: 0 });
  helpers()?.cvBattle({ seed: 1 });
  let lineAt = null;
  const lineTimes = () => { if (lineAt == null && linesMatching(ENEMY_LINE.battle).length) lineAt = gs._announceNowMs(); };
  ts.play();
  for (let n = 0; n < 60000; n++) { frame(16); lineTimes(); if (gs.shown.length && lineAt != null) break; }
  const G = gs._battleGraceMs();
  const dt = (gs.shown[0]?.atMs ?? NaN) - (W.lastResolveMs ?? NaN);
  assert(W.battles.length === 1 && G === 1.5 * ts.combatRoundMs() && dt >= G && dt <= G + 16 && lineAt === gs.shown[0]?.atMs,
    `G2 jedno starcie: baner ${dt.toFixed(0)} ms czasu prezentacji po rozstrzygnięciu (okno ${G} ms = 1,5 rundy), linia bitwy w tej samej chwili`);
});

block('G3 — pauza zatrzymuje okno łaski', () => {
  reseed('announce-once'); world({ observatory: 0 });
  helpers()?.cvBattle({ seed: 1, nA: 4, nB: 4 });
  const pauseAtEnd = () => ts.pause();   // gracz pauzuje w chwili końca bitwy
  EventBus.on('battle:resolved', pauseAtEnd);
  ts.play();
  for (let n = 0; n < 60000 && !W.battles.length; n++) frame(16);
  const atResolve = gs._announceNowMs();
  for (let n = 0; n < 300; n++) frame(16);   // 4,8 s czasu realnego w pauzie
  const shownPaused = gs.shown.length, presPaused = gs._announceNowMs() - atResolve;
  EventBus.off('battle:resolved', pauseAtEnd);
  ts.play();
  let n2 = 0;
  for (; n2 < 1000 && !gs.shown.length; n2++) frame(16);
  const G = gs._battleGraceMs();
  assert(W.battles.length === 1 && shownPaused === 0 && presPaused === 0 && gs.shown.length === 1 && n2 * 16 >= G && n2 * 16 <= G + 32,
    `G3 4,8 s w pauzie — banerów ${shownPaused}, zegar prezentacji stoi (+${presPaused} ms); po wznowieniu baner po ${n2 * 16} ms (okno ${G} ms)`);
});

// ⚠ PRZECELOWANIE M1 (decyzja 33, 2026-11-11): dawniej odwrót AI KOŃCZYŁ starcie w zasięgu broni, a ponowne zwarcie w tej samej
//   klatce dawało drugie starcie (#657) — okno łaski składało je w jeden baner. M1: odwrót to lot pod ogniem, uciekający nie wraca
//   od razu ⇒ JEDNO starcie (tu oba okręty giną w 9. rundzie), jeden baner z oknem i bez. Pin pyta o brak ponownego zwarcia.
block('G4 — #657 po M1: 1 na 1 (ziarno 3) — odwrót AI w trakcie starcia, bez ponownego zwarcia: jedno starcie, jeden baner z oknem i bez', () => {
  let retreatStarted = 0;
  const ON = runBattle({ seed: 3, nA: 1, nB: 1 }, { onWorld: () => EventBus.on('combat:retreatStarted', () => { retreatStarted++; }) });
  const seenOn = retreatStarted;
  const OFF = runBattle({ seed: 3, nA: 1, nB: 1 }, { graceRounds: 0 });
  assert(ON.W.battles.length === 1 && ON.W.encs === 1 && seenOn >= 1,
    `G4a świadek: ${ON.W.encs} starcie, rozkaz odwrotu AI w trakcie starcia (combat:retreatStarted ${seenOn}) — bez ponownego zwarcia`);
  assert(ON.banners.length === 1 && ON.battle.length === 1 && OFF.banners.length === 1 && OFF.battle.length === 1,
    `G4b z oknem: ${ON.banners.length} baner / ${ON.battle.length} linia; okno 0: ${OFF.banners.length} / ${OFF.battle.length} (nie ma czego składać)`);
});

block('G5 — wyniki starć z oknem łaski i bez — identyczne', () => {
  const a = runBattle(G_SPLIT);   // M1 — scena G1 (ziarno 2)
  const b = runBattle(G_SPLIT, { graceRounds: 0 });
  assert(JSON.stringify(a.W.results) === JSON.stringify(b.W.results) && a.W.results.length === 5,
    `G5 ${a.W.results.length} wyników, ta sama sygnatura (zwycięzca, straty, tury, odwrót): ${JSON.stringify(a.W.results)}`);
});

// ═══ G6 — źródło ═════════════════════════════════════════════════════════════════════════════════════════════════
block('G6 — szwy w źródle', () => {
  assert(/this\.timeSystem\.update\(deltaMs\);\s*this\._tickAnnouncements\(now\);\s*requestAnimationFrame\(gameLoop\);/.test(GSc),
    'G6a pętla gry: `_tickAnnouncements` PO `timeSystem.update` (zdarzenia klatki zdążą dołączyć)');
  assert(/EventBus\.on\('vessel:engaged', \(\{ encounterId, sideA, sideB \}\) => \{\s*this\._joinBattleGrace\(/.test(GSc),
    'G6b `vessel:engaged` → `_joinBattleGrace`');
  assert(/clusterBannerStep\(this\._battleClusterHold, \{[^}]*graceMs: this\._battleGraceMs\(\)/.test(GSc)
    && /onBattleResolved\(\{[^}]*graceMs: this\._battleGraceMs\(\)/.test(GSc),
    'G6c baner (`_clusterBattleBanners`) i narrator (`_narrateBattleCluster`) dostają okno łaski');
  const emits = OBS.match(/EventBus\.emit\('vessel:firstSightings'/g) ?? [];
  assert(emits.length === 1 && /if \(sightings\.length\) \{[\s\S]*?EventBus\.emit\('vessel:firstSightings'/.test(OBS)
    && /EventBus\.emit\('vessel:firstSighting', sighting\)/.test(OBS),
    'G6d `ObservatorySystem`: partia emitowana RAZ, po pętli; zdarzenie na statek zostaje (beat pierwszego kontaktu)');
  assert(!/EventBus\.on\('vessel:proximityEnter'/.test(UIc) && /if \(GAME_CONFIG\.FEATURES\?\.m4Notifications\) \{\s*EventBus\.on\('vessel:proximityEnter'/.test(GSc),
    'G6e linia kontaktu sensorycznego — tylko `GameScene`, pod bramką `m4Notifications` (`UIManager` nie subskrybuje)');
  assert(!/EventBus\.on\('vessel:firstSighting',/.test(GSc) && /EventBus\.on\('vessel:firstSightings', \(\{ sightings \}\) => this\._showFirstSightings\(sightings\)\)/.test(GSc),
    'G6f okno wykryć słucha partii (`vessel:firstSightings`), nie zdarzenia na statek');
});

// ═══ G7 — i18n ═══════════════════════════════════════════════════════════════════════════════════════════════════
block('G7 — i18n PL + EN: nowe klucze w obu słownikach, teksty bez surowych `{n}`', () => {
  const KEYS = ['log.unidentifiedContacts', 'log.m4.proximityContacts', 'log.el.vesselsDetected', 'log.el.contactsLost',
    'sighting.headlineEnemy', 'sighting.headlineContacts', 'sighting.descEnemy', 'sighting.descContacts', 'sighting.more',
    'sighting.attack', 'sighting.threat', 'sighting.threatActive', 'sighting.understood',
    // #687 — mgła linii kontaktu
    'log.m4.proximityContactAnon', 'log.m4.proximityContactsAnon', 'log.el.contactLostAnon', 'log.el.contactsLostAnon',
    'log.el.unidentifiedCount'];
  const missing = KEYS.filter((k) => typeof PL[k] !== 'string' || typeof EN[k] !== 'string' || PL[k] === EN[k]);
  const keep = getLocale();
  const raw = [];
  for (const loc of ['pl', 'en']) {
    setLocale(loc);
    const txt = [t('log.unidentifiedContacts', 4), t('log.m4.proximityContacts', 4, 'A, B'), t('log.el.vesselsDetected', 'X', 4, 'A'),
      t('log.el.contactsLost', 4, 'A'), t('sighting.headlineEnemy', 4), t('sighting.more', 2),
      t('log.m4.proximityContactAnon', '1.20'), t('log.m4.proximityContactsAnon', 4), t('log.el.contactLostAnon', '[1,2]'),
      t('log.el.contactsLostAnon', 4), t('log.el.unidentifiedCount', 3)];
    for (const s of txt) if (/\{\d\}/.test(s) || /^(log|sighting)\./.test(s)) raw.push(`${loc}: ${s}`);
  }
  setLocale(keep);
  assert(missing.length === 0 && raw.length === 0 && KEYS.length === 18,
    `G7 ${KEYS.length} kluczy PL + EN${missing.length ? ' — brak: ' + missing.join(', ') : ''}${raw.length ? ' — surowe: ' + raw.join(' | ') : ''}`);
});

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
