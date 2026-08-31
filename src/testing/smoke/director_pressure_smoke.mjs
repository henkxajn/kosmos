// S6 — keeper nacisku militarnego L1–L2 (workstream C, Slice 1, FINAŁ). Spec: §Tests planu.
//
// DWA HAZARDY, dla których ten plik istnieje (§Audit H + decyzja 7):
//   (a) PODWÓJNE LICZENIE — `military_presence` nalicza się JUŻ SAM przy wejściu uzbrojonego
//       statku do przestrzeni ROSZCZONEJ. Gdyby nacisk reagował na to samo, gracz dostałby
//       dwie kary za jeden czyn. Test pada, jeśli Director doda drugi wpis o tym samym skutku.
//   (b) DRABINA WOJNY — L1+L2 NIE MOGĄ przekroczyć progu automatycznej wojny (80) przy ŻADNEJ
//       liczbie powtórzeń. Nacisk ma grozić, nie wypowiadać (decyzja 7: kanał opinii, nie napięcia).
//
//   T1  sonda strefy granicznej: liczy TYLKO uzbrojone statki gracza w POWŁOCE, nie w roszczonej
//   T2  incydent = JEDEN wpis, kanał `opinion`, nowy typ (nie `military_presence`)
//   T3  napięcie NIETKNIĘTE — nawet po 50 powtórzeniach nacisku
//   T4  odpowiedź zbrojna idzie ścieżką `queueWarships` (L1: 2 obrońców, L2: +1 roamer)
//   T5  R-4: brak techu/załogi → incydent JEST, okrętów NIE MA, powód w zdarzeniu (nie cisza)
//   T6  eskalacja L1→L2 w oknie; po cooldownie NIE eskaluje
//   T7  katalog/rejestry/kanały/i18n + postawa obronna w gameState

import '../headless/env.js';                 // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { DIRECTOR_RULES } from '../../data/DirectorRuleData.js';
import { validateRule } from '../../utils/DirectorRuleMath.js';
import { DirectorSystem } from '../../systems/director/DirectorSystem.js';
import { DirectorProbes, DirectorActions } from '../../systems/director/DirectorRegistry.js';
import { OPINION_MODIFIERS } from '../../data/OpinionModifierData.js';
import { INCIDENT_CHANNELS } from '../../data/AcceptanceWeightData.js';
import { DirectorPressure, registerPressureBehaviors } from '../../systems/director/DirectorPressure.js';
import { DirectorFirstContact, registerFirstContactBehaviors } from '../../systems/director/DirectorFirstContact.js';
import { DirectorDoctrine, registerDoctrineBehaviors } from '../../systems/director/DirectorDoctrine.js';
import { DirectorProduction, registerProductionGuards } from '../../systems/director/DirectorProduction.js';
import { DirectorMobilization, registerMobilizationBehaviors } from '../../systems/director/DirectorMobilization.js';
import { DirectorOffensive, registerOffensiveBehaviors } from '../../systems/director/DirectorOffensive.js';
import { DirectorRecall, registerRecallBehaviors } from '../../systems/director/DirectorRecall.js';

registerPressureBehaviors(new DirectorPressure(), { allowOverride: true });
registerFirstContactBehaviors(new DirectorFirstContact(), { allowOverride: true });
// W1-5 — katalog ma teraz reguły doktryn, a konstruktor DirectorSystem waliduje KAŻDĄ
// nazwę i RZUCA na nieznanej (decyzja 7). Bez tej rejestracji keeper wywala się na starcie —
// i to jest zachowanie ZAMIERZONE, nie kruchość testu.
registerDoctrineBehaviors(new DirectorDoctrine(), { allowOverride: true });
registerMobilizationBehaviors(new DirectorMobilization(), { allowOverride: true });
// W3-5: katalog niesie regule wyboru celu (`strike_player_target`), wiec jej nazwy TEZ musza
// byc w rejestrach — konstruktor DirectorSystem waliduje CALY katalog i rzuca na nieznanej.
registerOffensiveBehaviors(new DirectorOffensive(), { allowOverride: true });
registerRecallBehaviors(new DirectorRecall(), { allowOverride: true });
// W2-7: reguła mobilizacji używa guardu `empireHasFreeCrew` z rejestratora PRODUKCJI,
// więc katalog nie zwaliduje się bez obu rodzin naraz.
registerProductionGuards(new DirectorProduction(), { allowOverride: true });

let pass = 0, fail = 0;
const A = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const codeOnly = (p) => readFileSync(p, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const L1 = DIRECTOR_RULES.military_pressure_l1;
const L2 = DIRECTOR_RULES.military_pressure_l2;

/**
 * Świat-atrapa. `claimed`/`border` rozłączne — dokładnie jak `InfluenceMap.classifyGalaxy`.
 * Napięcie jest tu ŻYWĄ liczbą: jeśli cokolwiek w ścieżce nacisku je ruszy, T3 to zobaczy.
 */
function stubWorld({ status = 'peace', year = 100, vessels = [], queueOk = true } = {}) {
  const opinions = [], memories = [], queued = [];
  let tension = 10;
  window.KOSMOS = {
    timeSystem: { gameTime: year },
    influenceMap: {
      isClaimedBy:    (sysId) => sysId === 'sys_claimed',
      isInBorderZone: (sysId) => sysId === 'sys_border',
    },
    vesselManager: { getAllVessels: () => vessels },
    // Katalog niesie też `first_contact`, a `DirectorSystem` ocenia KAŻDĄ regułę. Bez tej
    // atrapy jego sonda rzuca (kolaboratorzy są GŁOŚNI), `tickEmpire` to łapie i zasypuje
    // wyjście stack-trace'ami. Poziom 0 < próg 5 → reguła cicho nie odpala.
    observatorySystem: { getMaxObservatoryLevel: () => 0 },
    diplomacySystem: {
      getStatus: () => status,
      getTension: () => tension,
      changeTension: (id, d) => { tension += d; },        // ŚLAD — nacisk nie ma prawa tu wejść
      addOpinionModifier: (ofId, aboutId, modId, opts) => opinions.push({ ofId, aboutId, modId, opts }),
      addMemory: (empireId, type, payload) => memories.push({ empireId, type, payload }),
    },
    directorProduction: {
      queueWarships: (ctx, params) => {
        queued.push({ empireId: ctx.empireId, ...params });
        return queueOk ? { ok: true, queued: params.count ?? 1 }
                       : { ok: false, reason: 'no_module' };
      },
    },
    empireRegistry: { get: (id) => ({ id, personality: { aggression: 0.5 } }) },
  };
  return { opinions, memories, queued, tensionOf: () => tension };
}

const armed  = (sysId, id = 'v1') => ({ id, systemId: sysId, modules: ['weapon_laser'], ownerEmpireId: null });
const unarmed = (sysId, id = 'v2') => ({ id, systemId: sysId, modules: ['cargo_small'], ownerEmpireId: null });
const enemy  = (sysId, id = 'v3') => ({ id, systemId: sysId, modules: ['weapon_laser'], ownerEmpireId: 'emp_002' });

// ── T1 — sonda ──────────────────────────────────────────────────────────────
console.log('\nT1: sonda strefy granicznej liczy WŁAŚCIWE statki');
{
  const dp = new DirectorPressure();
  stubWorld({ vessels: [armed('sys_border')] });
  A(dp.countArmedPlayerVesselsInBorder('emp_001') === 1, 'T1a: uzbrojony statek gracza w POWŁOCE → liczony');

  stubWorld({ vessels: [armed('sys_claimed')] });
  A(dp.countArmedPlayerVesselsInBorder('emp_001') === 0,
    'T1b: ten sam statek w przestrzeni ROSZCZONEJ → NIE liczony (tam działa military_presence)');

  stubWorld({ vessels: [unarmed('sys_border')] });
  A(dp.countArmedPlayerVesselsInBorder('emp_001') === 0, 'T1c: statek BEZ broni → nie jest naciskiem');

  stubWorld({ vessels: [enemy('sys_border')] });
  A(dp.countArmedPlayerVesselsInBorder('emp_001') === 0, 'T1d: cudzy okręt → nie jest naciskiem GRACZA');

  stubWorld({ vessels: [{ ...armed('sys_border'), isWreck: true }] });
  A(dp.countArmedPlayerVesselsInBorder('emp_001') === 0, 'T1e: wrak nie naciska');

  stubWorld({ vessels: [armed('sys_border', 'a'), armed('sys_border', 'b'), armed('sys_far', 'c')] });
  A(dp.countArmedPlayerVesselsInBorder('emp_001') === 2, 'T1f: liczy tylko te w powłoce (2 z 3)');
}

// ── T2/T3 — incydent i drabina wojny ────────────────────────────────────────
console.log('\nT2/T3: JEDEN wpis na kanale opinii, napięcie NIETKNIĘTE');
{
  gameState.set('director', { rules: {}, pending: {}, posture: {} }, 'test');
  const dp = new DirectorPressure();
  const w = stubWorld({ vessels: [armed('sys_border')] });
  dp.pressureResponse({ empireId: 'emp_001', empire: {}, ruleId: 'military_pressure_l1' }, { level: 1, count: 2 });

  A(w.opinions.length === 1, `T2a: DOKŁADNIE jeden modyfikator opinii (było ${w.opinions.length})`);
  A(w.opinions[0]?.modId === 'border_pressure', 'T2b: …i jest to NOWY typ, nie military_presence');
  A(!w.opinions.some((o) => o.modId === 'military_presence'),
    'T2c: nacisk NIE dokłada military_presence (podwójna kara za jeden czyn)');
  A(INCIDENT_CHANNELS.border_pressure === 'opinion', 'T2d: typ zadeklarowany na kanale `opinion`');
  A(w.memories.some((m) => m.type === 'border_pressure'), 'T2e: wpis pamięci obecny');

  // (b) DRABINA WOJNY — 50 powtórzeń, napięcie ma NIE DRGNĄĆ.
  const before = w.tensionOf();
  for (let i = 0; i < 50; i++) {
    dp.pressureResponse({ empireId: 'emp_001', empire: {}, ruleId: 'military_pressure_l2' }, { level: 2, count: 2 });
  }
  A(w.tensionOf() === before,
    `T3a: po 50 naciskach napięcie NIETKNIĘTE (${before} → ${w.tensionOf()}) — próg wojny 80 nieosiągalny`);

  // Pin źródłowy: w całym pliku nacisku NIE MA wywołania ruszającego napięcie.
  const SRC = codeOnly('src/systems/director/DirectorPressure.js');
  A(!/changeTension|setTension|setUltimatum/.test(SRC),
    'T3b: kod nacisku nie odwołuje się do napięcia ANI RAZU (źródło bez komentarzy)');
}

// ── T4/T5 — odpowiedź zbrojna i R-4 ─────────────────────────────────────────
console.log('\nT4/T5: odpowiedź zbrojna ścieżką GATE 1 + świadoma cisza zbrojna (R-4)');
{
  gameState.set('director', { rules: {}, pending: {}, posture: {} }, 'test');
  const dp = new DirectorPressure();
  let w = stubWorld({ vessels: [armed('sys_border')] });
  dp.pressureResponse({ empireId: 'emp_001', empire: {}, ruleId: 'military_pressure_l1' }, { level: 1, count: 2 });
  A(w.queued.length === 1 && w.queued[0].template === 'frigate_system_defender' && w.queued[0].count === 2,
    'T4a: L1 zamawia 2 fregaty OBRONY UKŁADU');

  w = stubWorld({ vessels: [armed('sys_border')] });
  dp.pressureResponse({ empireId: 'emp_001', empire: { personality: { aggression: 0.9 } }, ruleId: 'military_pressure_l2' }, { level: 2 });
  A(w.queued.length === 2, 'T4b: L2 zamawia DWA zlecenia (obrona + roamer)');
  A(w.queued[1].template === 'frigate_missile_escort' && w.queued[1].count === 1,
    'T4c: …a roamer dobrany z osobowości (agresywne → rakiety)');

  w = stubWorld({ vessels: [armed('sys_border')] });
  dp.pressureResponse({ empireId: 'emp_001', empire: { personality: { aggression: 0.1 } }, ruleId: 'military_pressure_l2' }, { level: 2 });
  A(w.queued[1].template === 'frigate_laser_escort', 'T4d: ostrożne imperium wybiera lasery');

  // R-4: przed `ion_drives` imperium NIE MA czym odpowiedzieć — incydent MUSI zajść mimo to,
  // a powód odmowy MUSI być widoczny. To jest różnica między „odmówiła" a „nikt nie podłączył".
  gameState.set('director', { rules: {}, pending: {}, posture: {} }, 'test');
  w = stubWorld({ vessels: [armed('sys_border')], queueOk: false });
  let incident = null;
  const h = (d) => { incident = d; };
  EventBus.on('director:pressureIncident', h);
  dp.pressureResponse({ empireId: 'emp_001', empire: {}, ruleId: 'military_pressure_l1' }, { level: 1 });
  A(w.opinions.length === 1, 'T5a: R-4 — incydent dyplomatyczny zachodzi MIMO braku odpowiedzi zbrojnej');
  A(incident && incident.queuedOrders === 0, 'T5b: …zero zamówionych okrętów');
  A(incident && incident.refused.includes('no_module'),
    'T5c: …a POWÓD jest w zdarzeniu (nie cicha cisza — audyt R12)');
  EventBus.off('director:pressureIncident', h);
  EventBus.clear();
}

// ── T6 — eskalacja w oknie / brak eskalacji po cooldownie ───────────────────
console.log('\nT6: eskalacja L1→L2 w oknie, brak po cooldownie');
{
  A(L1.escalatesTo === 'military_pressure_l2' && L1.escalationWindowYears === 10.0,
    'T6a: L1 eskaluje do L2 w oknie 10 lat wyświetlanych');
  A(L1.cooldown?.years === 5.0, 'T6b: cooldown L1 = 5 lat (krótszy niż okno — eskalacja jest osiągalna)');
  A(L2.trigger?.gte === 3 && L1.trigger?.gte === 1,
    'T6c: L2 ma WŁASNY, cięższy próg (≥3) — inaczej odpalałaby się sama na warunkach L1');

  // WYKONANIE: powtórka w oknie musi trafić w akcję z level=2.
  gameState.set('director', { rules: {}, pending: {}, posture: {} }, 'test');
  const seenLevels = [];
  DirectorActions.register('pressureResponse', (ctx, params) => seenLevels.push(params.level), { allowOverride: true });
  stubWorld({ vessels: [armed('sys_border')], year: 500 });
  const ds = new DirectorSystem();
  for (let y = 500; y < 530; y++) {
    window.KOSMOS.timeSystem.gameTime = y;
    ds.tickEmpire('emp_001', { personality: { aggression: 1 } });
  }
  A(seenLevels.length >= 2, `T6d: nacisk odpalił wielokrotnie (${seenLevels.length}×) — cooldown nie blokuje na zawsze`);
  A(seenLevels.includes(2), 'T6e: powtórka w oknie ESKALOWAŁA do L2');
  const gapRespected = seenLevels.length <= 7;
  A(gapRespected, `T6f: 30 lat / cooldown 5 lat → najwyżej ~6-7 odpaleń (było ${seenLevels.length})`);
  // Przywróć prawdziwą akcję dla kolejnych bloków.
  registerPressureBehaviors(new DirectorPressure(), { allowOverride: true });
  EventBus.clear();
}

// ── T8 — SEMANTYKA ESKALACJI (defekt z GATE 3) ──────────────────────────────
console.log('\nT8: pierwszy incydent imperium = ZAWSZE L1 + izolacja miedzy imperiami');
{
  // GATE 3 zmierzyl: pierwszy incydent emp_002 mial level 2, a emp_001 osiagnal L2 przy
  // jednym odpaleniu w licznikach. Przyczyna NIE byla ani kluczem stanu (ten jest
  // per (regula, imperium)), ani obsluga null w oknie eskalacji (ta zwraca false) —
  // tylko tym, ze L1 i L2 to DWIE NIEZALEZNE reguly z NIEZALEZNYMI rzutami, wiec przy
  // ciezkim nacisku L2 byl uprawniony od pierwszego tiku i potrafil trafic pierwszy.
  const runEmpires = (empires, years = 8, vesselCount = 3) => {
    const fired = [];
    DirectorActions.register('pressureResponse',
      (ctx, p) => fired.push({ empire: ctx.empireId, rule: ctx.ruleId, level: p.level, year: ctx.year }),
      { allowOverride: true });
    const vessels = Array.from({ length: vesselCount }, (_, i) =>
      ({ id: `v${i}`, systemId: 'sys_border', modules: ['weapon_laser'], ownerEmpireId: null }));
    gameState.set('director', { rules: {}, pending: {}, posture: {} }, 'test');
    stubWorld({ vessels, year: 20 });
    const ds = new DirectorSystem();
    for (let y = 20; y < 20 + years; y++) {
      window.KOSMOS.timeSystem.gameTime = y;
      for (const e of empires) ds.tickEmpire(e, { personality: { aggression: 0.5 } });
    }
    return fired;
  };

  // Osiem seedow — `emp_D` i `emp_G` to dokladnie te, ktore PRZED naprawa otwieraly L2.
  const SEEDS = ['emp_A', 'emp_B', 'emp_C', 'emp_D', 'emp_E', 'emp_F', 'emp_G', 'emp_H'];
  const firedAll = runEmpires(SEEDS);
  let badOpen = null;
  for (const e of SEEDS) {
    const first = firedAll.find((f) => f.empire === e);
    if (first && first.level !== 1) { badOpen = `${e} otworzyl na L${first.level}`; break; }
  }
  A(badOpen === null, `T8a: pierwszy incydent KAZDEGO z 8 imperiow to L1 ${badOpen ?? ''}`);

  // Zaden empire nie moze dostac dwoch incydentow w TYM SAMYM roku (L1 i L2 naraz).
  const sameYearDup = firedAll.some((f, i) =>
    firedAll.some((g, j) => j !== i && g.empire === f.empire && g.year === f.year));
  A(!sameYearDup, 'T8b: zadne imperium nie dostaje DWOCH incydentow w tym samym roku');

  // Izolacja: stan reguly jest per (regula, imperium) — odpalenie u jednego imperium
  // NIE otwiera szczebla L2 u drugiego.
  const a = gameState.get('director.rules.military_pressure_l1|emp_A');
  const b = gameState.get('director.rules.military_pressure_l1|emp_B');
  A(!!a && !!b && a !== b, 'T8c: kazde imperium ma WLASNY rekord stanu reguly');

  const dp2 = new DirectorPressure();
  gameState.set('director', { rules: {}, pending: {}, posture: {} }, 'test');
  gameState.set('director.rules.military_pressure_l1|emp_X', { lastFiredYear: 50, firedOnce: true }, 'test');
  A(dp2.isEscalationReady('emp_X', 51) === true,  'T8d: L2 gotowy dla imperium, u ktorego L1 juz padl');
  A(dp2.isEscalationReady('emp_Y', 51) === false, 'T8e: …i NIEgotowy dla SASIADA (izolacja miedzy imperiami)');
  A(dp2.isEscalationReady('emp_X', 50) === false, 'T8f: …ani w TYM SAMYM roku co L1 (bez dubla)');

  // Eskalacja przez `escalatesTo` MUSI dzialac mimo guardu na L2 — guardy sa sprawdzane
  // dla REGULY ocenianej (L1), a nie dla celu eskalacji.
  const levels = firedAll.filter((f) => f.empire === 'emp_A').map((f) => f.level);
  A(levels.includes(2), `T8g: eskalacja do L2 nadal osiagalna (poziomy emp_A: ${levels.join(',')})`);
  registerPressureBehaviors(new DirectorPressure(), { allowOverride: true });
  EventBus.clear();
}

// ── T9 — postawa obronna przezywa zapis ─────────────────────────────────────
console.log('\nT9: postawa obronna w round-tripie zapisu');
{
  gameState.set('director', { rules: {}, pending: {}, posture: {} }, 'test');
  const dp = new DirectorPressure();
  stubWorld({ vessels: [armed('sys_border')], year: 300 });
  dp.pressureResponse({ empireId: 'emp_001', empire: {}, ruleId: 'military_pressure_l1' }, { level: 1 });

  const snapshot = JSON.parse(JSON.stringify(gameState.get('director')));
  gameState.set('director', snapshot, 'test_roundtrip');          // symulacja save→load
  const after = gameState.get('director.posture.emp_001');
  A(after?.level === 1 && after?.sinceYear === 300,
    'T9a: postawa obronna przezywa round-trip (poziom + rok wyswietlany)');

  // Pusty ksztalt po restore — warunek „v100 bez migracji".
  gameState.set('director', { rules: {}, pending: {} }, 'test_old_save');   // zapis SPRZED S6
  DirectorPressure.initSubdomain();
  const seeded = gameState.get('director.posture');
  A(seeded && Object.keys(seeded).length === 0,
    'T9b: stary zapis BEZ klucza `posture` dostaje pusty ksztalt (zero migracji)');
}

// ── T7 — katalog, kanały, postawa, i18n ─────────────────────────────────────
console.log('\nT7: katalog, kanały incydentów, postawa obronna, i18n');
{
  A(validateRule(L1, 'military_pressure_l1').length === 0, 'T7a: L1 przechodzi walidator');
  A(validateRule(L2, 'military_pressure_l2').length === 0, 'T7b: L2 przechodzi walidator');
  A(DirectorProbes.has('armedPlayerVesselsInBorderZone'), 'T7c: sonda zarejestrowana');
  A(DirectorActions.has('pressureResponse'), 'T7d: akcja zarejestrowana');
  A(!!OPINION_MODIFIERS.border_pressure && OPINION_MODIFIERS.border_pressure.defaultValue < 0,
    'T7e: modyfikator `border_pressure` istnieje i jest ujemny');

  // Każdy typ kanału 'opinion' MUSI mieć wpis w katalogu modyfikatorów (inwariant D2).
  for (const [type, ch] of Object.entries(INCIDENT_CHANNELS)) {
    if (ch !== 'opinion') continue;
    A(!!OPINION_MODIFIERS[type], `T7f/${type}: typ kanału 'opinion' ma modyfikator w katalogu`);
  }

  gameState.set('director', { rules: {}, pending: {}, posture: {} }, 'test');
  const dp = new DirectorPressure();
  stubWorld({ vessels: [armed('sys_border'), armed('sys_border', 'b')], year: 777 });
  dp.pressureResponse({ empireId: 'emp_042', empire: {}, ruleId: 'military_pressure_l2' }, { level: 2 });
  const posture = gameState.get('director.posture.emp_042');
  A(posture?.level === 2 && posture?.sinceYear === 777 && posture?.vessels === 2,
    'T7g: postawa obronna zapisana (poziom, rok, liczba statków)');

  const pl = readFileSync('src/i18n/pl.js', 'utf8');
  const en = readFileSync('src/i18n/en.js', 'utf8');
  A(pl.includes("'diplo.mod.borderPressure'") && en.includes("'diplo.mod.borderPressure'"),
    'T7h: etykieta modyfikatora w PL I EN');

  const DBG = codeOnly('src/core/DebugLog.js');
  A(/director:pressureIncident/.test(DBG), 'T7i: incydent nacisku trafia do ścieżki audytu DebugLog');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
