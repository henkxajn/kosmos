// D1 (WOJNA I POKÓJ 1.0) — smoke integracyjny fasady DiplomacySystem.
// Uruchom: node src/testing/smoke/diplomacy_d1_smoke.mjs
//
// PORT tmp_s3_4_smoke.mjs (S3.4 Light Diplomacy) na model relacji z D1. Zachowuje
// DOKŁADNE progi akceptacji traktatów (65/50/80/85) — zasiewane teraz przez
// modyfikator legacy_relations i czytane przez mostek D2 getTrustEquivalent —
// bo to jest asercja PARYTETU: te same wejścia mają dawać te same decyzje AI.
//
// Wycofane z oryginału: T4a/T4b (clamp trustu — teraz clamp opinii w
// diplomacy_opinion_smoke) i T6 (diplomacy:trustChanged — event skasowany).
// Dodane: D1-D7 (głośna awaria, walidacja id, cykl rozejmu, bramka decayu,
// kumulacja, bramka wojny na propozycji traktatu, okno casus belli, brak starych kluczy).

import '../headless/env.js';   // shim window/localStorage/document/THREE (pierwszy!)

const EventBus        = (await import('../../core/EventBus.js')).default;
const gameState       = (await import('../../core/GameState.js')).default;
const { GAME_CONFIG } = await import('../../config/GameConfig.js');
const { DiplomacySystem } = await import('../../systems/DiplomacySystem.js');
const { MissionSystem }   = await import('../../systems/MissionSystem.js');
const { AlienCivSystem }  = await import('../../systems/AlienCivSystem.js');
const { TREATY_TYPES }    = await import('../../data/TreatyData.js');
const { SHIP_MODULES, getModuleCapabilities } = await import('../../data/ShipModulesData.js');
const { canDoEnvoy, hasWeapons, canDoScience } = await import('../../entities/Vessel.js');
const { CURRENT_VERSION } = await import('../../systems/SaveMigration.js');
const { inferCasusBelli } = await import('../../data/CasusBelliData.js');
const { CB_MEMORY_WINDOW, TRUCE_YEARS } = await import('../../data/OpinionModifierData.js');
const plDict = (await import('../../i18n/pl.js')).default;
const enDict = (await import('../../i18n/en.js')).default;

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
const throws = (label, fn) => { let t = false; try { fn(); } catch { t = true; } assert(t, label); };

// ── Setup (scaffold przeniesiony z tmp_s3_4_smoke.mjs) ──────────────────────
GAME_CONFIG.FEATURES.lightDiplomacy = true;
GAME_CONFIG.FEATURES.diplomacyDecay = false;   // domyślnie OFF — D4 sprawdza obie gałęzie

const empires = new Map();
const galaxySystems = [{ id: 'sys_home', empireId: null }];
function addEmpire(id, { trade = 0.5, aggression = 0.5, archetype = 'trader' } = {}) {
  const sys = `sys_${id}`;
  empires.set(id, { id, name: id, namePL: id, archetype, personality: { trade, aggression }, homeSystemId: sys });
  galaxySystems.push({ id: sys, empireId: id });
  return id;
}
const contacted = new Set();

const timeSys = { gameTime: 0 };
const vessels = new Map();
const vMgrStub = {
  getVessel: (id) => vessels.get(id),
  getAllVessels: () => [...vessels.values()],
  lockOnAbstractMission: (id, m) => { const v = vessels.get(id); if (v) { v.status = 'on_mission'; v.mission = m; } return true; },
  releaseFromAbstractMission: (id) => { const v = vessels.get(id); if (v) { v.status = 'idle'; v.mission = null; } return true; },
  dockAtColony: () => {},
};

window.KOSMOS = window.KOSMOS ?? {};
window.KOSMOS.timeSystem = timeSys;
window.KOSMOS.empireRegistry = {
  get: (id) => empires.get(id) ?? null,
  listAll: () => [...empires.values()],
  // Lustro udokumentowanych NO-OPów prawdziwego EmpireRegistry (Slice 1 usunął
  // abstrakcyjne skalary; EconAI/MilitaryAI wołają je i tak — audyt §3.2a).
  // Bez nich H3 zalewa konsolę wyjątkami z try/catch w AlienCivSystem.
  updateResource: () => {},
  updateMilitaryPower: () => {},
  changeTechLevel: () => {},
};
window.KOSMOS.intelSystem = { isAtLeast: (id) => contacted.has(id) };
window.KOSMOS.galaxyData = { systems: galaxySystems };
window.KOSMOS.vesselManager = vMgrStub;
window.KOSMOS.colonyManager = { activePlanetId: 'p_home' };

const dipl = new DiplomacySystem();
window.KOSMOS.diplomacySystem = dipl;
const missionSystem = new MissionSystem(null);
window.KOSMOS.missionSystem = missionSystem;
const alienCiv = new AlienCivSystem();

function setYear(y) {
  timeSys.gameTime = y;
  EventBus.emit('time:display', { gameTime: y });
  EventBus.emit('time:tick', {});
}
function mkVessel(id, modules) {
  const v = { id, name: id, status: 'idle', modules, colonyId: 'p_home', systemId: 'sys_home', position: { state: 'docked' }, missionLog: [] };
  vessels.set(id, v);
  return v;
}
/** Ustaw opinię imperium o graczu na dokładną wartość (odpowiednik dawnego trustu). */
const seedOpinion = (id, value) => dipl.addOpinionModifier(id, 'player', 'legacy_relations', { value, source: 'test' });

// ── Stage 2: moduł dyplomatyczny (bez zmian) ────────────────────────────────
console.log('--- Stage 2: diplomatic_module + canDoEnvoy ---');
const dm = SHIP_MODULES['diplomatic_module'];
assert(dm && dm.slotType === 'special' && dm.stats?.enablesMissions?.includes('envoy'),
  'T1: diplomatic_module (slotType special, enablesMissions:[envoy])');
assert(getModuleCapabilities(['diplomatic_module']).has('envoy'), 'T2: getModuleCapabilities');
assert(canDoEnvoy({ modules: ['diplomatic_module'] }) === true && canDoEnvoy({ modules: ['weapon_laser'] }) === false, 'T3: canDoEnvoy');
assert(hasWeapons({ modules: ['weapon_laser'] }) === true && canDoScience({ modules: ['science_lab'] }) === true, 'T3b: hasWeapons/canDoScience');

// ── Stage 1': pasma opinii (port T5a-T5f na skalę opinii) ───────────────────
console.log('--- Stage 1: pasma opinii / getOpinionBand ---');
addEmpire('emp_op');
seedOpinion('emp_op', -30);
assert(dipl.getOpinionBand('emp_op') === 'hostile', 'T5a: opinia −30 (dawny trust 20) → hostile');
seedOpinion('emp_op', 0);
assert(dipl.getOpinionBand('emp_op') === 'neutral', 'T5b: opinia 0 (dawny trust 50) → neutral');
seedOpinion('emp_op', +20);
assert(dipl.getOpinionBand('emp_op') === 'friendly', 'T5c: opinia +20 (dawny trust 70) → friendly');
seedOpinion('emp_op', +35);
assert(dipl.getOpinionBand('emp_op') === 'friendly', 'T5d: opinia +35 → nadal friendly (ally TYLKO traktatem)');
dipl.signTreaty('emp_op', { id: 'alliance' });
assert(dipl.getOpinionBand('emp_op') === 'ally', 'T5e: traktat alliance → ally');
dipl.breakTreaty('emp_op', 'alliance');
assert(dipl.getOpinionBand('emp_op') === 'friendly', 'T5f: po zerwaniu sojuszu → friendly');

let opEvt = null;
const offOp = EventBus.on('diplomacy:opinionChanged', (e) => { opEvt = e; });
dipl.addOpinionModifier('emp_op', 'player', 'military_presence', { source: 'test' });
assert(opEvt && opEvt.ofId === 'emp_op' && opEvt.aboutId === 'player'
  && opEvt.modId === 'military_presence' && opEvt.opinion === 30,
  'T6: diplomacy:opinionChanged {ofId,aboutId,modId,opinion} (35−5=30)');
if (typeof offOp === 'function') offOp();

EventBus.emit('intel:contactEstablished', { empireId: 'emp_contact' });
assert(dipl.relations.has('player', 'emp_contact') && dipl.getOpinionOfPlayer('emp_contact') === 0
  && dipl.getTrustEquivalent('emp_contact') === 50,
  'T7: pierwszy kontakt → relacja istnieje, opinia 0 (= dawny trust 50)');

// ── Stage 3: envoy (abstrakcyjny) ───────────────────────────────────────────
console.log('--- Stage 3: envoy launch + timeline ---');
addEmpire('emp_envoy');
contacted.add('emp_envoy');
const envVessel = mkVessel('v_env', ['diplomatic_module']);

GAME_CONFIG.FEATURES.lightDiplomacy = false;
missionSystem._launchEnvoy('emp_envoy', 'v_env');
assert(missionSystem._missions.filter(m => m.type === 'envoy').length === 0, 'T8: envoy z flagą OFF → brak misji');
GAME_CONFIG.FEATURES.lightDiplomacy = true;

setYear(0);
missionSystem._launchEnvoy('emp_envoy', 'v_env');
const envM = missionSystem._missions.find(m => m.type === 'envoy');
assert(envM && envM.targetEmpireId === 'emp_envoy' && envVessel.status === 'on_mission', 'T9: envoy launch → misja + statek zablokowany');
assert(envM.arrivalYear === 2.5 && envM.returnYear === 5.0, 'T9b: timeline arrival=2.5y, return=5.0y');

setYear(2.5);
assert(dipl.getOpinionOfPlayer('emp_envoy') === 5 && envM.status === 'returning', 'T10a: dotarcie @2.5y → +5 opinii');
setYear(5.0);
assert(dipl.getOpinionOfPlayer('emp_envoy') === 10 && envVessel.status === 'idle',
  'T10b: powrót @5.0y → łącznie +10 (KUMULACJA, jak stary trust), statek idle');
assert(dipl.relations.get('emp_envoy', 'player').opinionModifiers.filter(m => m.id === 'envoy_goodwill').length === 1,
  'T10c: dwa dotarcia mieszczą się w JEDNYM wpisie (save nie puchnie)');

addEmpire('emp_nocontact');
mkVessel('v_env2', ['diplomatic_module']);
missionSystem._launchEnvoy('emp_nocontact', 'v_env2');
assert(missionSystem._missions.filter(m => m.type === 'envoy' && m.targetEmpireId === 'emp_nocontact').length === 0, 'T11: envoy bez kontaktu → fail');

// ── Stage 4: kary za obecność + zaleganie ───────────────────────────────────
console.log('--- Stage 4: vessel:arrived + trespassing ---');
addEmpire('emp_mil'); addEmpire('emp_res'); addEmpire('emp_env'); addEmpire('emp_cargo');

dipl._onVesselArrived({ id: 'a1', ownerEmpireId: 'player', systemId: 'sys_emp_mil', modules: ['weapon_laser'], position: { state: 'orbiting' } }, { targetId: null });
assert(dipl.getOpinionOfPlayer('emp_mil') === -5 && dipl.getTrustEquivalent('emp_mil') === 45, 'T12: zbrojny przylot → −5 (mostek: 45)');
dipl._onVesselArrived({ id: 'a2', ownerEmpireId: 'player', systemId: 'sys_emp_res', modules: ['science_lab'], position: { state: 'orbiting' } }, { targetId: null });
assert(dipl.getOpinionOfPlayer('emp_res') === -3 && dipl.getTrustEquivalent('emp_res') === 47, 'T13: przylot badawczy → −3 (mostek: 47)');
dipl._onVesselArrived({ id: 'a3', ownerEmpireId: 'player', systemId: 'sys_emp_env', modules: ['diplomatic_module'], position: { state: 'orbiting' } }, { targetId: null });
assert(dipl.getOpinionOfPlayer('emp_env') === 0, 'T14: emisariusz → brak kary');
dipl._onVesselArrived({ id: 'a4', ownerEmpireId: 'player', systemId: 'sys_emp_cargo', modules: ['cargo_small'], position: { state: 'orbiting' } }, { targetId: null });
assert(dipl.getOpinionOfPlayer('emp_cargo') === 0, 'T15: cargo → brak kary');

addEmpire('emp_tres');
const resV = mkVessel('v_res', ['science_lab']);
resV.systemId = 'sys_emp_tres';
resV.position.state = 'orbiting';
timeSys.gameTime = 10;
dipl._onVesselArrived(resV, { targetId: null });
assert(dipl.getOpinionOfPlayer('emp_tres') === -3, 'T16a: przylot badawczy w obcym układzie → −3 + tracking');
timeSys.gameTime = 12;
dipl._tickTrespassing();
assert(dipl.getOpinionOfPlayer('emp_tres') === -8, 'T16b: zaleganie ≥1 rok → −5 (razem −8)');
resV.systemId = 'sys_home';
dipl._tickTrespassing();
timeSys.gameTime = 20;
dipl._tickTrespassing();
assert(dipl.getOpinionOfPlayer('emp_tres') === -8, 'T16c: po opuszczeniu układu tracker czyszczony');

// ── Stage 5: traktaty (PARYTET progów) ──────────────────────────────────────
console.log('--- Stage 5: proposeTreaty / ramp / blokada paktem ---');
assert(!!TREATY_TYPES.trade_agreement && !!TREATY_TYPES.non_aggression, 'T17a: TREATY_TYPES definiuje oba typy');
assert(TREATY_TYPES.trade_agreement.accept === undefined && TREATY_TYPES.trade_agreement.minTrust === undefined
  && TREATY_TYPES.trade_agreement.yearlyTrust === undefined && TREATY_TYPES.non_aggression.blocksWar === undefined,
  'T17c: martwe pola TreatyData skasowane (accept/minTrust/yearlyTrust/blocksWar)');

addEmpire('emp_trade', { trade: 0.7 });
seedOpinion('emp_trade', +15);                       // mostek → 65, jak dawny trust 65
let accepted = null, rejected = null;
const offAcc = EventBus.on('diplomacy:treatyAccepted', (e) => { accepted = e; });
const offRej = EventBus.on('diplomacy:treatyRejected', (e) => { rejected = e; });
assert(dipl.proposeTreaty('emp_trade', 'trade_agreement') === true && accepted?.treatyId === 'trade_agreement'
  && dipl.hasTreaty('emp_trade', 'trade_agreement'),
  'T17b PARYTET: trade_agreement accept (trade 0.7, mostek 65)');

addEmpire('emp_lowtrust', { trade: 0.9 });           // mostek 50 < 60
assert(dipl.proposeTreaty('emp_lowtrust', 'trade_agreement') === false && rejected?.empireId === 'emp_lowtrust',
  'T18 PARYTET: trade_agreement reject (mostek 50 < 60)');

addEmpire('emp_pact', { aggression: 0.3 });
seedOpinion('emp_pact', +30);                        // mostek 80
assert(dipl.proposeTreaty('emp_pact', 'non_aggression') === true && dipl.hasTreaty('emp_pact', 'non_aggression'),
  'T19 PARYTET: non_aggression accept (aggression 0.3, mostek 80)');
if (typeof offAcc === 'function') offAcc();
if (typeof offRej === 'function') offRej();

// Ramp zastąpił _tickTreaties (+1 trust/rok) — DZIAŁA mimo wyłączonego decayu.
const opBefore = dipl.getOpinionOfPlayer('emp_trade');
dipl.relations.tickModifiers(1);
assert(dipl.getOpinionOfPlayer('emp_trade') === opBefore + 1, 'T20 PARYTET: umowa handlowa narasta +1/rok cyw.');
dipl.relations.tickModifiers(200);
assert(dipl.getOpinionOfPlayer('emp_trade') === opBefore + 50, 'T20b: narastanie saturuje na rampMax (+50)');

assert(dipl.declareWar('emp_pact', 'ultimatum_expired') === false && dipl.getStatus('emp_pact') !== 'war',
  'T21a: pakt blokuje auto-wojnę');
assert(dipl.declareWar('emp_pact', 'player_action') === true && dipl.getStatus('emp_pact') === 'war'
  && !dipl.hasTreaty('emp_pact', 'non_aggression')
  && dipl.relations.hasModifier('emp_pact', 'player', 'at_war') && dipl.getTrustEquivalent('emp_pact') < 60,
  'T21b: gracz wypowiada wojnę mimo paktu → war + pakt zerwany + at_war');

addEmpire('emp_war4', { trade: 0.8 });
seedOpinion('emp_war4', +15);
dipl.proposeTreaty('emp_war4', 'trade_agreement');
assert(dipl.relations.hasModifier('emp_war4', 'player', 'trade_partner'), 'T21c-pre: umowa zasiewa trade_partner');
dipl.declareWar('emp_war4', 'player_action');
assert(dipl.getStatus('emp_war4') === 'war' && !dipl.hasTreaty('emp_war4', 'trade_agreement')
  && !dipl.relations.hasModifier('emp_war4', 'player', 'trade_partner')
  && dipl.relations.hasModifier('emp_war4', 'player', 'at_war'),
  'T21c: wojna zrywa wszystkie traktaty (i ich modyfikatory) + at_war');

addEmpire('emp_ally', { aggression: 0.2 });
seedOpinion('emp_ally', +35);                        // mostek 85
assert(dipl.proposeTreaty('emp_ally', 'alliance') === true && dipl.hasTreaty('emp_ally', 'alliance')
  && dipl.getOpinionBand('emp_ally') === 'ally',
  'T21d PARYTET: alliance accept (aggression 0.2, mostek 85) → ally');

// ── Stage 7: AI envoy ───────────────────────────────────────────────────────
console.log('--- Stage 7: AlienCivSystem._maybeLaunchAIEnvoy ---');
addEmpire('emp_aienv', { aggression: 0.3, archetype: 'trader' });
contacted.add('emp_aienv');
timeSys.gameTime = 100;
let aiEnvoyEvt = null;
const offAi = EventBus.on('diplomacy:aiEnvoy', (e) => { aiEnvoyEvt = e; });
alienCiv._maybeLaunchAIEnvoy(empires.get('emp_aienv'), dipl);
assert(dipl.getOpinionOfPlayer('emp_aienv') === 3 && aiEnvoyEvt?.empireId === 'emp_aienv', 'T22a: AI envoy → +3 opinii + event');
aiEnvoyEvt = null;
alienCiv._maybeLaunchAIEnvoy(empires.get('emp_aienv'), dipl);
assert(dipl.getOpinionOfPlayer('emp_aienv') === 3 && aiEnvoyEvt === null, 'T22b: cooldown — drugie wywołanie bez efektu');
addEmpire('emp_xeno', { aggression: 0.9, archetype: 'xenophage' });
contacted.add('emp_xeno');
alienCiv._maybeLaunchAIEnvoy(empires.get('emp_xeno'), dipl);
assert(dipl.getOpinionOfPlayer('emp_xeno') === 0, 'T22c: xenophage NIE wysyła envoy');
addEmpire('emp_aiwar', { aggression: 0.3, archetype: 'trader' });
contacted.add('emp_aiwar');
dipl.declareWar('emp_aiwar', 'player_action');
const aiwarBefore = dipl.getOpinionOfPlayer('emp_aiwar');
alienCiv._maybeLaunchAIEnvoy(empires.get('emp_aiwar'), dipl);
assert(dipl.getOpinionOfPlayer('emp_aiwar') === aiwarBefore, 'T22d: AI envoy SKIP w stanie wojny');
if (typeof offAi === 'function') offAi();

// ── Save round-trip ─────────────────────────────────────────────────────────
console.log('--- Save: round-trip przez gameState ---');
addEmpire('emp_save');
seedOpinion('emp_save', +20);                        // mostek 70
dipl.signTreaty('emp_save', { id: 'trade_agreement' });
const snap = JSON.parse(JSON.stringify(gameState.serialize()));
seedOpinion('emp_save', -30);                        // mostek 20
gameState.restore(snap);
assert(dipl.getTrustEquivalent('emp_save') === 70 && dipl.hasTradeAgreement('emp_save'),
  'T23: opinia + traktaty przeżywają serialize/restore');
assert(CURRENT_VERSION >= 100, 'T24: CURRENT_VERSION >= 100 (D1 bump za rename kluczy par)');

// ══ NOWE ASERCJE D1 ═════════════════════════════════════════════════════════

// D1: głośna awaria + odczyt nie tworzy rekordu
console.log('--- D1: głośna awaria (audyt R12) ---');
throws('D1a: RelationsModel.get() rzuca przy braku pary', () => dipl.relations.get('player', 'emp_nope'));
assert(dipl.relations.getOrNull('player', 'emp_nope') === null, 'D1b: getOrNull zwraca null');
{
  const before = dipl.relations.listPairs().length;
  assert(dipl.getTension('emp_nope') === 0 && dipl.getOpinionOfPlayer('emp_nope') === 0, 'D1c: odczyt nieznanej pary → 0');
  assert(dipl.relations.listPairs().length === before, 'D1d: odczyt NIE utworzył rekordu');
}

// D2: walidacja id przy mutacji
console.log('--- D2: walidacja id ---');
throws('D2a: changeTension(undefined) rzuca', () => dipl.changeTension(undefined, +5));
throws('D2b: changeTension(STARY klucz) rzuca', () => dipl.changeTension('player_emp_001', +5));
throws('D2c: nieznany modyfikator rzuca', () => dipl.addOpinionModifier('emp_op', 'player', 'literowka'));

// D3: cykl rozejmu — naprawa audytu R7
console.log('--- D3: rozejm → pokój (audyt R7) ---');
{
  addEmpire('emp_truce');
  timeSys.gameTime = 300;
  dipl.changeTension('emp_truce', +50, 'test');
  dipl.declareWar('emp_truce', 'player_action');
  assert(dipl.getStatus('emp_truce') === 'war' && dipl.relations.hasModifier('emp_truce', 'player', 'at_war'), 'D3a: wojna → at_war');
  dipl.offerPeace('emp_truce', 'player_action');
  assert(dipl.getStatus('emp_truce') === 'truce'
    && !dipl.relations.hasModifier('emp_truce', 'player', 'at_war')
    && dipl.relations.hasModifier('emp_truce', 'player', 'recent_war'),
    'D3b: pokój → rozejm, at_war zdjęty, recent_war dołożony');
  assert(dipl.getTruceYearsLeft('emp_truce') === TRUCE_YEARS, 'D3c: licznik rozejmu = TRUCE_YEARS');
  timeSys.gameTime = 300 + TRUCE_YEARS;
  dipl._tickTruces();
  assert(dipl.getStatus('emp_truce') === 'peace' && dipl.getTruceYearsLeft('emp_truce') === 0,
    'D3d: po terminie rozejm → POKÓJ (dawniej stan terminalny)');
  const tensionBefore = dipl.getTension('emp_truce');
  timeSys.gameTime += 5;
  dipl._tickTensionDecay(1);
  assert(dipl.getTension('emp_truce') < tensionBefore,
    'D3e: decay napięcia WZNOWIONY po wygaśnięciu rozejmu (sedno naprawy R7)');
}

// D4: bramka decayu — obie gałęzie
console.log('--- D4: FEATURES.diplomacyDecay ---');
{
  addEmpire('emp_decay');
  dipl.addOpinionModifier('emp_decay', 'player', 'envoy_goodwill', { source: 'test' });
  GAME_CONFIG.FEATURES.diplomacyDecay = false;
  dipl.relations.tickModifiers(20);
  assert(dipl.getOpinionOfPlayer('emp_decay') === 5, 'D4a: decay OFF → +5 przeżywa 20 lat cyw. (parytet: stary trust nie zanikał)');
  GAME_CONFIG.FEATURES.diplomacyDecay = true;
  dipl.relations.tickModifiers(20);
  assert(dipl.getOpinionOfPlayer('emp_decay') === 0, 'D4b: decay ON → modyfikator wygasa');
  GAME_CONFIG.FEATURES.diplomacyDecay = false;
  assert(GAME_CONFIG.FEATURES.diplomacyDecay === false, 'D4c: domyślną wartością D1 jest OFF');
}

// D5: bramka wojny na propozycji traktatu
console.log('--- D5: proposeTreaty w stanie wojny ---');
{
  addEmpire('emp_wartreaty', { trade: 0.9 });
  seedOpinion('emp_wartreaty', +50);
  dipl.declareWar('emp_wartreaty', 'player_action');
  let rej = null;
  const off = EventBus.on('diplomacy:treatyRejected', (e) => { rej = e; });
  assert(dipl.proposeTreaty('emp_wartreaty', 'trade_agreement') === false && rej?.reason === 'at_war',
    'D5: propozycja w stanie wojny odrzucona z powodem at_war');
  if (typeof off === 'function') off();
}

// D6: okno casus belli (pierścień 20, okno 10)
console.log('--- D6: okno casus belli ---');
{
  addEmpire('emp_cb');
  for (let i = 0; i < 12; i++) dipl.addMemory('emp_cb', 'territorial_violation', { i });
  assert(inferCasusBelli(dipl.getMemory('emp_cb', CB_MEMORY_WINDOW), 'trader') === 'territorial_claim',
    'D6a: 12 naruszeń → territorial_claim');
  addEmpire('emp_cb2');
  dipl.addMemory('emp_cb2', 'territorial_violation', {});
  for (let i = 0; i < 11; i++) dipl.addMemory('emp_cb2', 'warning_issued', { i });
  assert(inferCasusBelli(dipl.getMemory('emp_cb2', CB_MEMORY_WINDOW), 'trader') === 'border_incident',
    'D6b: pojedyncze naruszenie wypchnięte poza okno 10 → border_incident');
  addEmpire('emp_cb3');
  for (let i = 0; i < 25; i++) dipl.addMemory('emp_cb3', 'warning_issued', { i });
  const ring = dipl.getMemory('emp_cb3', 999);
  assert(ring.length === 20 && ring.at(-1).payload.i === 24 && ring[0].payload.i === 5,
    'D6c: pierścień przycięty do 20, najstarsze wypadają (zostaje 5..24)');
}

// D7: żaden stary klucz nie przeżywa
console.log('--- D7: brak starych kluczy ---');
{
  const keys = Object.keys(gameState.get('diplomacy.relations') ?? {});
  assert(keys.length > 0 && keys.every(k => k.includes('__')), `D7a: wszystkie ${keys.length} kluczy w formacie pary`);
  assert(!keys.some(k => k.startsWith('player_')), 'D7b: zero kluczy player_*');
  const rec = gameState.get('diplomacy.relations')[keys[0]];
  assert(rec.trust === undefined && rec.hostility === undefined && rec.state === undefined && rec.lastIncidents === undefined,
    'D7c: rekordy nie niosą martwych pól');
}

// ── C5: harness — Snapshot + detektory ──────────────────────────────────────
console.log('--- H1: Snapshot (klucz tension + opinion/status) ---');
{
  const { capture } = await import('../headless/Snapshot.js');
  addEmpire('emp_snap');
  seedOpinion('emp_snap', +25);
  dipl.changeTension('emp_snap', +33, 'test');
  const core = {
    empireRegistry: window.KOSMOS.empireRegistry,
    diplomacySystem: dipl,
    alienCivSystem: { getState: () => 'IDLE' },
  };
  const snap2 = capture(core);
  const row = (snap2.empires ?? []).find(e => e.id === 'emp_snap');
  assert(!!row, 'H1a: snapshot zawiera wiersz imperium');
  assert(row?.tension === 33, 'H1b: pole `tension` (dawne `hostility`) = 33');
  assert(row?.hostility === undefined, 'H1c: stare pole `hostility` USUNIĘTE');
  assert(row?.opinion === 25, 'H1d: nowe pole `opinion` = +25');
  assert(row?.status === 'peace', 'H1e: nowe pole `status`');
  assert('objective' in (row ?? {}), 'H1f: pole `objective` obecne (C3, konsumenci w D2)');
}

console.log('--- H2: DIPLOMACY_FROZEN bramkowany flagą ---');
{
  const { createStandardDetectors } = await import('../analytics/BottleneckDetector.js');
  const core = {
    empireRegistry: window.KOSMOS.empireRegistry,
    diplomacySystem: dipl,
    alienCivSystem: { getState: () => 'IDLE' },
  };
  const frozenOf = (dets) => dets.detectors.find(d => d.name === 'DIPLOMACY_FROZEN')
    ?? dets.find?.(d => d.name === 'DIPLOMACY_FROZEN');
  const mk = () => { const r = createStandardDetectors(); return Array.isArray(r) ? { detectors: r } : r; };

  // Flaga OFF (domyślnie w D1) — detektor MUSI milczeć niezależnie od danych.
  GAME_CONFIG.FEATURES.diplomacyDecay = false;
  const dOff = frozenOf(mk());
  assert(!!dOff, 'H2a: detektor DIPLOMACY_FROZEN istnieje');
  let firedOff = false;
  for (let y = 0; y <= 420; y += 20) if (dOff.check(core, y)) firedOff = true;
  assert(firedOff === false, 'H2b: flaga OFF → detektor NIE flaguje (zerowa wariancja jest legalna w D1)');

  // Flaga ON + zamrożona opinia → detektor łapie.
  GAME_CONFIG.FEATURES.diplomacyDecay = true;
  const dOn = frozenOf(mk());
  let firedOn = null;
  for (let y = 0; y <= 420; y += 20) { const f = dOn.check(core, y); if (f) firedOn = f; }
  assert(firedOn === 'DIPLOMACY_FROZEN', 'H2c: flaga ON + brak ruchu opinii → DIPLOMACY_FROZEN');
  GAME_CONFIG.FEATURES.diplomacyDecay = false;
}

console.log('--- H3: przebieg długodystansowy (stabilność ticku) ---');
{
  addEmpire('emp_long');
  seedOpinion('emp_long', +40);
  dipl.signTreaty('emp_long', { id: 'trade_agreement' });
  dipl.changeTension('emp_long', +35, 'test');
  const startYear = 1000;
  timeSys.gameTime = startYear;
  let threwLong = null;
  try {
    // 300 lat cyw. po jednym roku — decay napięcia, ramp, wygasanie rozejmów,
    // ultimatum. Sprawdzamy, że pętla nie rzuca i nie rozjeżdża inwariantów.
    for (let y = 1; y <= 300; y++) {
      timeSys.gameTime = startYear + y;
      EventBus.emit('time:tick', { civDeltaYears: 1 });
    }
  } catch (e) { threwLong = e; }
  assert(threwLong === null, 'H3a: 300 lat cyw. ticku bez wyjątku' + (threwLong ? ` (${threwLong.message})` : ''));
  assert(dipl.getTension('emp_long') === 0, 'H3b: napięcie zdecayowało do 0 podczas pokoju');
  assert(dipl.relations.hasModifier('emp_long', 'player', 'trade_partner'), 'H3c: trwały modyfikator traktatu przeżył');
  assert(dipl.getOpinionOfPlayer('emp_long') === 40 + 50,
    'H3d: ramp umowy handlowej dobił do rampMax (+50) i tam został');
  {
    const keys = Object.keys(gameState.get('diplomacy.relations') ?? {});
    assert(keys.every(k => k.includes('__')), 'H3e: po 300 latach ticku nadal wyłącznie klucze par');
  }
  assert(dipl.getMemory('emp_long', 999).length <= 20, 'H3f: pierścień pamięci nie przekroczył limitu');
}

// ── i18n parytet ────────────────────────────────────────────────────────────
console.log('--- i18n: parytet pl + en ---');
{
  // ⚠ C4 skasował 'diplo.trustLabel' (pasek zaufania zastąpiony liczbą opinii) —
  // pełne pokrycie nowych kluczy UI ma diplomacy_overlay_breakdown_smoke.
  const keys = [
    'diplo.opinionLabel', 'diplo.status.hostile', 'diplo.status.neutral', 'diplo.status.friendly', 'diplo.status.ally',
    'diplo.btn.envoy', 'diplo.btn.trade', 'diplo.btn.pact', 'diplo.btn.alliance', 'diplo.treatyAccepted', 'diplo.treatyRejected',
    'mission.envoyNoContact', 'mission.envoyNoVessel', 'vessel.envoyDeparted', 'vessel.envoyReturned',
    'log.diplo.aiEnvoy', 'log.diplo.treatyAccepted',
  ];
  const missingPl = keys.filter(k => !plDict[k]);
  const missingEn = keys.filter(k => !enDict[k]);
  assert(missingPl.length === 0, 'T25a: klucze w pl.js' + (missingPl.length ? ' (brak: ' + missingPl.join(',') + ')' : ''));
  assert(missingEn.length === 0, 'T25b: klucze w en.js' + (missingEn.length ? ' (brak: ' + missingEn.join(',') + ')' : ''));
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
