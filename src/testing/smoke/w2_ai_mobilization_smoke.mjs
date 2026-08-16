// W2 — keeper mobilizacji AI (commit W2-7, WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: między W2-2 a tym commitem floty obcych stały w magazynie bezterminowo — deploy
// istniał, ale nikt po stronie AI go nie wołał. Ten keeper pinuje DECYZJĘ: kiedy imperium
// obsadza okręty, czym jest bramkowane, i ile z tego widzi gracz.
//
//   T1  sonda rezerwy liczy WŁAŚCIWY zbiór (kadłuby AI, w rezerwie, uzbrojone, przy stolicy)
//   T2  guard `empireOutgunnedByPlayer` — czyste porównanie, bez ani jednej stałej
//   T3  akcja mobilizuje PORCJAMI i NIGDY nie rzuca (tik AI nie może zginąć)
//   T4  kształt reguły: `delay: 0` W CAŁYM katalogu + `roll` jako jedyna przepustnica
//   T5  intel: rezerwa pisana i ODŚWIEŻANA za bramką, brak kolaboratora ⇒ `null`, nie 0
//   T6  powiadomienie BRAMKOWANE jakością kontaktu (mgła wojny, nie filtr hałasu)
//   T7  kurier w rezerwie zostaje ZMOBILIZOWANY, nie porzucony
//
// ⚠ „Nie do zaspokojenia przez sąsiada": T2 i T4 to piny, które łatwo zrobić zielonymi bez
//    treści. T2 ma więc PARĘ przypadków (silniejszy/słabszy) i kontrolę na braku modułu;
//    T4 nie sprawdza jednej reguły, tylko CAŁY katalog — bo pułapka `delay > 0` jest uśpiona
//    dokładnie tak długo, jak długo NIKT jej nie użyje.

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import { DIRECTOR_RULES } from '../../data/DirectorRuleData.js';
import { validateRule } from '../../utils/DirectorRuleMath.js';
import { DirectorMobilization } from '../../systems/director/DirectorMobilization.js';
import { createVessel } from '../../entities/Vessel.js';
import { PLAYER_OWNER_ID } from '../../systems/ThreatAssessment.js';
import { NotificationCenter } from '../../systems/NotificationCenter.js';
import { IntelSystem } from '../../systems/IntelSystem.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const CAP = 'p_capital';
const EMP = 'emp_001';
const WARSHIP = ['engine_ion', 'armor_standard', 'weapon_kinetic'];

/** Kadłub AI o zadanym stanie służby, zadokowany przy stolicy. */
function mkAi(id, state, { armed = true, dockedAt = CAP, empireId = EMP } = {}) {
  const v = createVessel('hull_frigate', CAP, {
    name: id, modules: armed ? [...WARSHIP] : ['engine_ion'], x: 0, y: 0,
    systemId: 'sys_ai', serviceState: state,
  });
  v.id = id;
  v.ownerEmpireId = empireId;
  v.owner = empireId;
  v.isEnemy = true;
  v.position.state = 'docked';
  v.position.dockedAt = dockedAt;
  return v;
}

/** Minimalny świat: rejestr statków + stolica + (opcjonalnie) ThreatAssessment-atrapa. */
function stubWorld(vessels, { strengths = null, deploy = null } = {}) {
  const map = new Map(vessels.map(v => [v.id, v]));
  const deployed = [];
  window.KOSMOS = window.KOSMOS ?? {};
  window.KOSMOS.vesselManager = {
    _vessels: map,
    getVessel: (id) => map.get(id) ?? null,
    deployVessel: deploy ?? ((id) => { deployed.push(id); const v = map.get(id); if (v) v.serviceState = 'mobilizing'; return { ok: true }; }),
  };
  window.KOSMOS.directorProduction = { capitalOf: () => ({ planetId: CAP, civSystem: { freePops: 7 } }) };
  window.KOSMOS.threatAssessment = strengths
    ? { getStrength: (id) => strengths[id] ?? 0, getReserveStrength: (id) => strengths[`${id}:reserve`] ?? 0 }
    : null;
  window.KOSMOS.timeSystem = { gameTime: 42 };
  return { deployed, map };
}

// ── T1 — sonda liczy właściwy zbiór ─────────────────────────────────────────────────────────
console.log('T1 — sonda rezerwy: kadłuby AI, w rezerwie, UZBROJONE, przy stolicy');
{
  const mine   = mkAi('v_stored', 'stored');
  const active = mkAi('v_active', 'active');
  const mobil  = mkAi('v_mobil',  'mobilizing');
  const cargo  = mkAi('v_cargo',  'stored', { armed: false });
  const far    = mkAi('v_far',    'stored', { dockedAt: 'p_other' });
  const alien  = mkAi('v_other',  'stored', { empireId: 'emp_002' });
  const player = createVessel('hull_frigate', CAP, { name: 'gracz', modules: [...WARSHIP], x: 0, y: 0, serviceState: 'stored' });
  player.id = 'v_player'; player.position.state = 'docked'; player.position.dockedAt = CAP;

  stubWorld([mine, active, mobil, cargo, far, alien, player]);
  const dm = new DirectorMobilization();
  const ids = dm.storedWarshipsAtCapital(EMP).map(v => v.id);

  assert(ids.length === 1 && ids[0] === 'v_stored',
    `T1: dokładnie JEDEN kadłub kwalifikuje się (${JSON.stringify(ids)})`);
  assert(!ids.includes('v_active'),  'T1: kadłub W SŁUŻBIE nie wchodzi (nie ma czego obsadzać)');
  assert(!ids.includes('v_mobil'),   'T1: kadłub W TRAKCIE mobilizacji nie wchodzi (drugi rozkaz byłby podwójny)');
  assert(!ids.includes('v_cargo'),   'T1: KURIER nie wchodzi — logistyka ma własną ścieżkę');
  assert(!ids.includes('v_far'),     'T1: rezerwa przy INNYM ciele nie wchodzi (to nie ta stocznia)');
  assert(!ids.includes('v_other'),   'T1: kadłub INNEGO imperium nie wchodzi');
  assert(!ids.includes('v_player'),  'T1 KONTROLA PINU: kadłub GRACZA nie wchodzi — filtr mierzy właściciela, nie sam stan');
  assert(dm.countStoredWarshipsAtCapital(EMP) === 1, 'T1: sonda i lista zgadzają się co do liczby');
}

// ── T2 — guard: czyste porównanie, zero stałych ─────────────────────────────────────────────
console.log('T2 — `empireOutgunnedByPlayer`: porównanie SIŁ, bez ani jednego progu');
{
  const dm = new DirectorMobilization();

  stubWorld([], { strengths: { [PLAYER_OWNER_ID]: 500, [EMP]: 100 } });
  assert(dm.isOutgunnedByPlayer(EMP) === true, 'T2: gracz silniejszy ⇒ mobilizuj');

  stubWorld([], { strengths: { [PLAYER_OWNER_ID]: 100, [EMP]: 500 } });
  assert(dm.isOutgunnedByPlayer(EMP) === false, 'T2: imperium silniejsze ⇒ NIE mobilizuj (wyścig sam się zatrzymuje)');

  stubWorld([], { strengths: { [PLAYER_OWNER_ID]: 300, [EMP]: 300 } });
  assert(dm.isOutgunnedByPlayer(EMP) === false,
    'T2: PARYTET zatrzymuje mobilizację — punkt równowagi jest własnością modelu, nie strojoną liczbą');

  stubWorld([], { strengths: { [PLAYER_OWNER_ID]: 0, [EMP]: 0 } });
  assert(dm.isOutgunnedByPlayer(EMP) === false,
    'T2: gracz bez okrętów w SŁUŻBIE ⇒ nikt nie mobilizuje (wzajemna deeskalacja, zamierzona)');

  stubWorld([], { strengths: null });
  assert(dm.isOutgunnedByPlayer(EMP) === false,
    'T2 KONTROLA: brak ThreatAssessment ⇒ BRAK decyzji, nie zgadywanie');
}

// ── T3 — akcja: porcjami i bez wyjątków ─────────────────────────────────────────────────────
console.log('T3 — akcja mobilizuje PORCJAMI i nigdy nie rzuca');
{
  const hulls = Array.from({ length: 5 }, (_, i) => mkAi(`v_${i}`, 'stored'));
  const { deployed } = stubWorld(hulls, { strengths: { [PLAYER_OWNER_ID]: 500, [EMP]: 0 } });
  const dm = new DirectorMobilization();

  let fired = null;
  const onFired = (e) => { fired = e; };
  EventBus.on('director:mobilized', onFired);
  dm.mobilizeVessels({ empireId: EMP, year: 42 }, { count: 2 });
  EventBus.off('director:mobilized', onFired);

  assert(deployed.length === 2, `T3: obsadzono DOKŁADNIE porcję (${deployed.length}/2 z 5 dostępnych)`);
  assert(fired?.count === 2 && fired?.empireId === EMP, 'T3: zdarzenie niesie liczbę i imperium');
  assert(fired?.empireName === undefined,
    'T3: zdarzenie NIE niesie nazwy imperium — nazwę rozstrzyga dopiero bramka intelu u odbiorcy');

  // Odmowa `deployVessel` MUSI być słyszalna — inaczej „reguła odpaliła i nic się nie stało"
  // jest nie do odróżnienia od „reguły nikt nie podłączył" (audyt R12).
  const hulls2 = [mkAi('v_x', 'stored')];
  stubWorld(hulls2, { strengths: { [PLAYER_OWNER_ID]: 500, [EMP]: 0 },
                      deploy: () => ({ ok: false, reason: 'no_crew_pops' }) });
  let rejected = null;
  const onRej = (e) => { rejected = e; };
  EventBus.on('director:mobilizeRejected', onRej);
  new DirectorMobilization().mobilizeVessels({ empireId: EMP, year: 42 }, { count: 1 });
  EventBus.off('director:mobilizeRejected', onRej);
  assert(rejected?.reason === 'deploy_refused' && /no_crew_pops/.test(rejected?.detail ?? ''),
    `T3: odmowa raportowana z powodem (${rejected?.reason} / ${rejected?.detail})`);

  // Wyjątek z `deployVessel` NIE MOŻE wyjść na zewnątrz: `AlienCivSystem` woła `tickEmpire`
  // poza własnym try/catch, więc rzut zabiłby tik KAŻDEGO kolejnego imperium.
  stubWorld([mkAi('v_boom', 'stored')], { strengths: { [PLAYER_OWNER_ID]: 5, [EMP]: 0 },
                                          deploy: () => { throw new Error('boom'); } });
  let threw = false;
  try { new DirectorMobilization().mobilizeVessels({ empireId: EMP, year: 42 }, { count: 1 }); }
  catch { threw = true; }
  assert(threw === false, 'T3: wyjątek z rozmieszczenia POCHŁONIĘTY — tik AI przeżywa');
}

// ── T4 — kształt reguły + pin całego katalogu ───────────────────────────────────────────────
console.log('T4 — `delay: 0` w CAŁYM katalogu; `roll` jako jedyna przepustnica');
{
  const rule = DIRECTOR_RULES.mobilize_reserve;
  assert(!!rule, 'T4: reguła `mobilize_reserve` jest w katalogu');
  assert(validateRule(rule, 'mobilize_reserve').length === 0, 'T4: przechodzi walidator katalogu');
  assert(rule.trigger?.probe === 'storedWarshipsAtCapital' && rule.trigger?.gte === 1,
    'T4: wyzwalacz to OBECNOŚĆ kadłubów (gte 1), nie strojony próg');
  assert((rule.guard ?? []).includes('empireHasFreeCrew'),
    'T4: guard załogowy ze Slice 1 jest wreszcie użyty (był zarejestrowany i martwy)');
  assert((rule.guard ?? []).includes('empireOutgunnedByPlayer'),
    'T4: decyzję niesie odczyt ThreatAssessment, nie autorska liczba');
  assert(!!rule.roll && rule.roll.unit === 'displayedYear',
    'T4: `roll` obecny i w latach WYŚWIETLANYCH — to JEDYNA przepustnica silnika');

  // ⚠ PIN CAŁEGO KATALOGU, nie tylko naszej reguły. `_firePending` biegnie POZA per-regułowym
  //   try/catch i dereferencuje wpis, który `GameState.set(..., null)` zostawia jako `null`
  //   (set PRZYPISUJE, nigdy nie usuwa) — pierwsza reguła z `delay > 0` zamienia uśpioną
  //   pułapkę w crash zabijający tik wszystkich kolejnych imperiów. Pin trzyma ją uśpioną.
  const withDelay = Object.entries(DIRECTOR_RULES).filter(([, r]) => Number(r.delay ?? 0) > 0);
  assert(withDelay.length === 0,
    `T4: ŻADNA reguła katalogu nie ma delay > 0 (${withDelay.map(([k]) => k).join(', ') || 'brak'})`);
  assert(Object.keys(DIRECTOR_RULES).length >= 6,
    `T4 KONTROLA PINU: katalog nie jest pusty (${Object.keys(DIRECTOR_RULES).length} reguł) — inaczej pin wyżej nic nie mierzy`);

  // Reguła bez `roll` MUSI mieć cooldown (kontrakt z nagłówka katalogu): tik biegnie co rok
  // CYWILIZACYJNY, więc bez obu odpalałaby 12× na rok wyświetlany.
  const unthrottled = Object.entries(DIRECTOR_RULES).filter(([, r]) => !r.roll && !r.cooldown);
  assert(unthrottled.length === 0,
    `T4: każda reguła ma roll ALBO cooldown (bez przepustnicy: ${unthrottled.map(([k]) => k).join(', ') || 'brak'})`);
}

// ── T5 — intel: za bramką, odświeżane, `null` gdy nie wiadomo ────────────────────────────────
console.log('T5 — rezerwa w intelu: bramka `detailed`, odświeżanie, brak modułu ⇒ null');
{
  const intel = new IntelSystem();

  stubWorld([], { strengths: { [EMP]: 100, [`${EMP}:reserve`]: 250 } });
  const readout = intel._reserveReadout(EMP);
  assert(readout.knownReserve === 250, `T5: siła rezerwy czytana z ThreatAssessment (${readout.knownReserve})`);
  assert(readout.knownCrewCapacity === 7, `T5: zdolność załogowa = wolne POPy STOLICY (${readout.knownCrewCapacity})`);

  // Brak kolaboratora ⇒ „nie wiem", a nie „wiem, że zero". To ta sama klasa co udokumentowany
  // defekt „Siła wojskowa ≈ 0 dla KAŻDEGO imperium".
  window.KOSMOS.threatAssessment = null;
  window.KOSMOS.directorProduction = null;
  const blind = intel._reserveReadout(EMP);
  assert(blind.knownReserve === null && blind.knownCrewCapacity === null,
    `T5: brak modułów ⇒ null/null (jest ${blind.knownReserve}/${blind.knownCrewCapacity}) — pewne zero byłoby kłamstwem`);
}

// ── T6 — powiadomienie bramkowane jakością kontaktu ──────────────────────────────────────────
console.log('T6 — powiadomienie o mobilizacji: mgła wojny, nie filtr hałasu');
{
  const nc = new NotificationCenter();
  window.KOSMOS = window.KOSMOS ?? {};
  window.KOSMOS.empireRegistry = { get: () => ({ id: EMP, name: 'Konsorcjum' }) };

  const at = (level) => { window.KOSMOS.intelSystem = { isAtLeast: (_id, want) => {
    const RANK = { unknown: 0, rumor: 1, contact: 2, detailed: 3 };
    return RANK[level] >= RANK[want];
  } }; };

  at('rumor');
  nc._handleMobilized({ empireId: EMP, count: 2 });
  assert(nc.getActive().length === 0,
    'T6: na plotce NIE ma wpisu — inaczej gracz czytałby mobilizację obcych bez rozpoznania (klasa wycieku ze Slice 1)');

  at('contact');
  nc._handleMobilized({ empireId: EMP, count: 2 });
  const afterContact = nc.getActive();
  assert(afterContact.length === 1, `T6: na kontakcie wpis POWSTAJE (${afterContact.length})`);
  assert(afterContact[0]?.type === 'mobilization' && afterContact[0]?.logChannel === 'intel',
    'T6: wpis idzie na kanał WYWIADU (a nie na system, jak przed poprawką TYPE_MAP)');
  assert(!/Konsorcjum/.test(afterContact[0]?.title ?? ''),
    'T6: na `contact` nazwa imperium jest ZATRZYMANA — wiadomo ŻE, nie KTO');

  at('detailed');
  nc._handleMobilized({ empireId: EMP, count: 3 });
  const named = nc.getActive()[0];
  assert(/Konsorcjum/.test(named?.title ?? ''), 'T6: dopiero pełne rozpoznanie ujawnia nazwę');

  window.KOSMOS.intelSystem = null;
  const before = nc.getActive().length;
  nc._handleMobilized({ empireId: EMP, count: 1 });
  assert(nc.getActive().length === before,
    'T6 KONTROLA: brak modułu intelu ⇒ FAIL-CLOSED (żadnego wpisu), nie fail-open');
}

// ── T7 — kurier w rezerwie zostaje zmobilizowany ────────────────────────────────────────────
console.log('T7 — logistyka AI: kurier w rezerwie idzie do mobilizacji, nie na wieczne czekanie');
{
  // Pinujemy KONTRAKT ścieżki, nie cały tik logistyki: dyspozytor musi ROZPOZNAĆ rezerwę
  // i zawołać `deployVessel`, zamiast raportować trasę jako obsadzoną i milczeć.
  const src = await import('node:fs').then(fs => fs.readFileSync('src/systems/EmpireLogisticsSystem.js', 'utf8'));
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  assert(/serviceState/.test(code),
    'T7: dyspozytor logistyki w ogóle PATRZY na stan służby (bez tego kurier w rezerwie jest niewidzialny)');
  assert(/deployVessel/.test(code),
    'T7: …i woła `deployVessel` — czyli AI płaci za kuriera tę samą cenę co gracz');
  assert(/director:mobilizeRejected/.test(code),
    'T7: odmowa dla kuriera trafia na ścieżkę audytu (stall logistyki był dotąd CAŁKOWICIE cichy)');
}

console.log(`\n[w2_ai_mobilization_smoke] PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
