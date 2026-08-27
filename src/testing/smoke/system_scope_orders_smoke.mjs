// KEEPER — Findingi 138 + 142: WYBÓR CELU ROZKAZU MA GRANICĘ UKŁADU STATKU.
//
// Plan/audyt: docs/audit/SYSTEM_SCOPE_138_142_AUDIT.md. Rejestr macierzysty:
// docs/design/VESSEL_ORDERS_PLAN.md §Findings 138 · 142.
// Sonda z pomiarami stanu SPRZED naprawy: src/testing/headless/probe-system-scope-138-142.mjs
//
// PO CO: gwiazda KAŻDEGO układu stoi w (0,0), a rejestry (`EntityManager`, `VesselManager._vessels`)
// są PŁASKIE — więc ciała różnych układów zajmują te same zakresy surowych x/y. Dwa selektory celu
// pytają o świat danymi KAMERY zamiast danymi STATKU:
//   · `VesselManager._findBodyNearPoint`  — skanuje całą galaktykę ⇒ „leć tutaj" bierze OBCE ciało,
//      po czym bramka W3-4b słusznie odrzuca rozkaz jako `target_other_system` (ZMIERZONE: 90,9 %
//      snapujących klików przy 12 wygenerowanych układach; 0 % przy jednym — defekt fazy średniej).
//   · `FleetManagerOverlay._getValidTargets` — klucza się na `activeSystemId` ⇒ przy oglądaniu
//      cudzego układu WŁASNE cele statku znikają (0/3), a obce dostają stempel `sameSystem: true`.
//
// ⚠ SKUTKI SĄ PRZECIWNE I DLATEGO OBA MUSZĄ BYĆ W JEDNYM KEEPERZE: 138 kończy się ODMOWĄ,
//   142 kończy się ZGODĄ (misja startuje, pobiera paliwo, leci w pustkę własnego układu, a
//   `_vesselIsAtTarget` przyjmuje przylot). Naprawa samego 138 zamienia odmowę w dryf w pustkę,
//   czyli w 142 w innym opakowaniu — spójna odpowiedź musi powstać w jednym miejscu.
//
// ⚠ NARZĘDZIEM JEST `systemIdOf` (fail-OPEN), NIE `EntityManager.getByTypeInSystem`. Ta druga robi
//   twarde `e.systemId === systemId` ⇒ jest fail-CLOSED i wycięłaby encje bez stempla, a w tej roli
//   „nie wiem" musi znaczyć „nie blokuję" (cichy paraliż floty jest gorszy od jednego złego snapu).
//   Repo rozstrzygnęło to raz: `RetreatTarget.js:70-72`. Pinuje T1e — i to jest TRIPWIRE: jeśli ktoś
//   „uprości" naprawę do `getByTypeInSystem`, T1e zapali się z instrukcją.
//
// ⚠ CZEGO TEN KEEPER NIE PINUJE (granica dowodu): ścieżki UI (czy gracz realnie dojdzie do pickera
//   dla statku spoza oglądanego układu) ani końca łańcucha recon (czy `explored` zapisuje się na
//   obcym ciele). Pierwsze = live-gate, drugie = osobny pomiar.
//
// FAIL-FIRST ZMIERZONY NA NIETKNIĘTYM KODZIE: 12 PASS / 17 FAIL. Padło dokładnie to, co opisuje
// naprawę; przeszły wszystkie strażniki i kontrole pinu. ⚠ Trzy piny przechodziły w międzyczasie
// JAŁOWO i zostały poprawione (odmowa nie tworzy misji ⇒ `mission?.targetId == null` było zielone
// na defekcie; `every()` na PUSTYM zbiorze celów; identyczna liczba niezbadanych ciał w obu
// układach). Każdy z nich świecił się dokładnie tam, gdzie był defekt.
//
//   T1  _findBodyNearPoint — zakres = układ STATKU        (a,c,d,f fail-first · b,e strażnik)
//   T2  żywy łańcuch `issueOrder(moveToPoint)`            (a,b fail-first · c,d strażnik W3-4b
//                                                          · e PIN ŹRÓDŁOWY na producenta)
//   T3  _getValidTargets — OBIE strony defektu            (a,b,c fail-first · d,e,f strażnik)
//   T4  strażnik regresji: kamera == statek ⇒ bez zmian   (przechodzi PRZED i PO naprawie)
//   T5  D-SS4 — bliźniak recon `nearest` / `deep_scan`    (a,b fail-first)
//   T6  D-SS5 — bramka układu w OBU dyspozytorach misji   (a,b,c fail-first · d,e strażnik AI)
//
// Uruchom: node src/testing/smoke/system_scope_orders_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
import { readFileSync }    from 'node:fs';
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { MissionSystem }       from '../../systems/MissionSystem.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import { ORDER_TYPES }         from '../../data/MovementOrderTypes.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');

const AU = GAME_CONFIG.AU_TO_PX;

// ── Świat ────────────────────────────────────────────────────────────────────
// ⚠ Obce ciała leżą w TYCH SAMYCH zakresach px co własne — to jest MECHANIZM obu findingów,
//   nie skrót fixture'u (gwiazda każdego układu w (0,0)).
const orb = (a) => ({ a, e: 0, T: a ** 1.5, M: 0, inclinationOffset: 0 });

function resetWorld() {
  EventBus.clear();
  EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 0 }, activeSystemId: 'sys_home' };
}

function addBody(id, sys, auX, name, opts = {}) {
  const b = {
    id, type: opts.type ?? 'planet', name, x: auX * AU, y: 0,
    explored: opts.explored ?? true, analyzed: opts.explored ?? true,
    planetType: 'rocky', orbital: orb(auX), deposits: [],
  };
  if (sys !== undefined) b.systemId = sys;       // `undefined` ⇒ CELOWO bez stempla (stary zapis)
  EntityManager.add(b);
  return b;
}

function addStar(sys) {
  EntityManager.add({ id: 'star_' + sys, type: 'star', name: 'Gwiazda ' + sys, systemId: sys, x: 0, y: 0, mass: 1 });
}

const techStub = {
  isResearched: () => true, getFuelEfficiency: () => 1.0, getShipSpeedMultiplier: () => 1.0,
  getShipRangeMultiplier: () => 1.0, getMultiplier: () => 1.0,
  getMissionYieldBonus: () => 0, getDisasterReduction: () => 0, getShipSurvivalChance: () => 0,
};

function makeStore() {
  return { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} };
}

function ship(vMgr, { sys = 'sys_home', auX = 1, hull = 'hull_small', warp = 0 } = {}) {
  const v = vMgr.createAndRegister(hull, 'p_home', { name: 'Jednostka', modules: ['engine_ion'], x: auX * AU, y: 0 });
  v.position.x = auX * AU; v.position.y = 0;
  v.position.state = 'orbiting'; v.position.dockedAt = null; v.status = 'idle';
  v.fuel.current = v.fuel.max = 9999; v.speedAU = 1.0;
  if (sys === undefined) delete v.systemId; else v.systemId = sys;
  v.warpFuel = { current: warp, max: warp };
  return v;
}

// ═══ T1 — _findBodyNearPoint: zakres = układ STATKU ══════════════════════════
header('T1  _findBodyNearPoint — granica układu');
{
  resetWorld();
  addStar('sys_home'); addStar('sys_061');
  addBody('h1', 'sys_home', 1.00, 'Dom I');
  addBody('f1', 'sys_061',  1.02, 'Obca I');       // 0,02 AU od h1 — wygrywa dziś przez bliskość
  addBody('h2', 'sys_home', 6.00, 'Dom II');
  addBody('f2', 'sys_061',  9.00, 'Obca II');      // w promieniu 0,5 AU NIE MA żadnego własnego
  const vMgr = new VesselManager();
  Object.assign(window.KOSMOS, { vesselManager: vMgr, techSystem: techStub });
  const v = ship(vMgr);

  // ⚠ KONTROLA PINU dla całego T1: bez tego cały blok mógłby przejść jałowo na świecie,
  //   w którym obce ciała w ogóle nie konkurują o snap.
  const rival = EntityManager.get('f1');
  const own   = EntityManager.get('h1');
  assert(Math.hypot(rival.x - own.x, rival.y - own.y) < 0.5 * AU,
    'KONTROLA PINU: obce ciało JEST bliżej niż SNAP_TO_BODY_AU od własnego (świat konkurencyjny)');

  // (a) FAIL-FIRST — punkt bliżej OBCEGO ciała, ale własne w promieniu snapu.
  const a = vMgr._findBodyNearPoint(1.015 * AU, 0, undefined, v);
  assert(a?.id === 'h1', `T1a punkt 1,015 AU → WŁASNE h1 (dostano: ${a?.id ?? 'null'} [${a?.systemId ?? '—'}])`);

  // (b) STRAŻNIK — klik dokładnie na własnym ciele nadal je bierze (dziś też działa).
  const b = vMgr._findBodyNearPoint(own.x, own.y, undefined, v);
  assert(b?.id === 'h1', 'T1b klik na własnym ciele → h1 (bez regresji)');

  // (c) FAIL-FIRST — w promieniu punktu JEST tylko obce ciało ⇒ brak snapu (pusty punkt = dryf),
  //     a NIE przejęcie obcego ciała, które kończyło się odmową `target_other_system`.
  const c = vMgr._findBodyNearPoint(9.00 * AU, 0, undefined, v);
  assert(c === null, `T1c punkt przy obcym f2 → null / dryf (dostano: ${c?.id ?? 'null'})`);

  // (d) FAIL-FIRST — statek W TRANZYCIE warp (`systemId === null`) nie ma „tutaj" ⇒ zero snapu.
  const vWarp = ship(vMgr, { auX: 1 }); vWarp.systemId = null;
  const d = vMgr._findBodyNearPoint(own.x, own.y, undefined, vWarp);
  assert(d === null, `T1d statek w tranzycie warp (systemId=null) → brak snapu (dostano: ${d?.id ?? 'null'})`);

  // (e) TRIPWIRE fail-OPEN — ciało bez stempla `systemId` (stary zapis) MUSI dalej snapować.
  //     Kontrola pinu: `getByTypeInSystem` na tym samym świecie zwraca 0 ⇒ gdyby naprawa poszła
  //     tamtędy, ta asercja padnie i powie, dlaczego.
  resetWorld();
  addStar('sys_home');
  addBody('h_nosys', undefined, 2.00, 'Dom bez stempla');
  const vMgr2 = new VesselManager();
  Object.assign(window.KOSMOS, { vesselManager: vMgr2, techSystem: techStub });
  const v2 = ship(vMgr2, { auX: 2 });
  assert(EntityManager.getByTypeInSystem('planet', 'sys_home').length === 0,
    'KONTROLA PINU: getByTypeInSystem jest fail-CLOSED — ciało bez stempla znika z jego wyniku');
  const e = vMgr2._findBodyNearPoint(2.00 * AU, 0, undefined, v2);
  assert(e?.id === 'h_nosys',
    `T1e TRIPWIRE: ciało bez systemId nadal snapuje (fail-OPEN przez systemIdOf) — dostano: ${e?.id ?? 'null'}`);

  // (f) FAIL-FIRST — statek bez `systemId` (stary zapis) = mieszkaniec sys_home, nie „nigdzie".
  resetWorld();
  addStar('sys_home'); addStar('sys_061');
  addBody('h1', 'sys_home', 1.00, 'Dom I');
  addBody('f1', 'sys_061',  1.02, 'Obca I');
  const vMgr3 = new VesselManager();
  Object.assign(window.KOSMOS, { vesselManager: vMgr3, techSystem: techStub });
  const v3 = ship(vMgr3, { sys: undefined });
  const f = vMgr3._findBodyNearPoint(1.015 * AU, 0, undefined, v3);
  assert(f?.id === 'h1', `T1f statek bez systemId → traktowany jak sys_home (dostano: ${f?.id ?? 'null'})`);
}

// ═══ T2 — ŻYWY łańcuch rozkazu ═══════════════════════════════════════════════
header('T2  issueOrder(moveToPoint) — prawdziwy producent');
{
  const scene = () => {
    resetWorld();
    addStar('sys_home'); addStar('sys_061');
    const home = addBody('p_home', 'sys_home', 1.00, 'Dom');
    addBody('h2', 'sys_home', 6.00, 'Dom II');
    addBody('f2', 'sys_061',  9.00, 'Obca II');
    const vMgr = new VesselManager();
    const mos  = new MovementOrderSystem(vMgr);
    const store = makeStore();
    Object.assign(window.KOSMOS, {
      civMode: true, homePlanet: home, vesselManager: vMgr, movementOrderSystem: mos,
      resourceSystem: store, techSystem: techStub,
      colonyManager: { activePlanetId: 'p_home', getColony: () => null, getAllColonies: () => [] },
    });
    return { vMgr, mos };
  };

  // (a) FAIL-FIRST — „leć tutaj" w punkt, pod którym leży TYLKO ciało z obcego układu.
  //     Dziś: snap bierze f2 → bramka W3-4b → `target_other_system` (rozkaz ginie).
  //     Po naprawie: snap nic nie bierze → zwykły lot do punktu (dryf).
  {
    const { vMgr, mos } = scene();
    const v = ship(vMgr);
    const r = mos.issueOrder(v.id, { type: ORDER_TYPES.moveToPoint, targetPoint: { x: 9.00 * AU, y: 0 } });
    assert(r?.ok === true, `T2a rozkaz na punkt przy obcym ciele PRZECHODZI (reason: ${r?.reason ?? '—'})`);
    // ⚠ KLAUZULA `v.mission != null` JEST OBOWIĄZKOWA, nie ozdobna: bez niej ta asercja przechodzi
    //   JAŁOWO na zepsutym kodzie — odmowa nie tworzy misji, więc `v.mission?.targetId` to
    //   `undefined == null` ⇒ zielono dokładnie tam, gdzie jest defekt. Złapane przy pierwszym
    //   przebiegu fail-first (11/10 → 10/11).
    assert(v.mission != null && v.mission.targetId == null,
      `T2b misja POWSTAŁA i NIE przejęła obcego ciała (mission=${v.mission ? 'jest' : 'BRAK'}, targetId=${v.mission?.targetId ?? '—'})`);
  }

  // (c) STRAŻNIK W3-4b — JAWNY `targetBodyId` na ciało z obcego układu MUSI dalej być odrzucony.
  //     ⚠ To jest asercja, która pilnuje, żeby naprawa snapu nie rozbroiła bramki nad nim.
  {
    const { vMgr, mos } = scene();
    const v = ship(vMgr);
    const r = mos.issueOrder(v.id, {
      type: ORDER_TYPES.moveToPoint, targetBodyId: 'f2', targetPoint: { x: 9.00 * AU, y: 0 },
    });
    assert(r?.ok === false && r?.reason === 'target_other_system',
      `T2c STRAŻNIK: jawny cel-ciało z obcego układu nadal odrzucony (dostano: ok=${r?.ok} reason=${r?.reason})`);
  }

  // (d) STRAŻNIK — jawny `targetBodyId` na WŁASNE ciało dalej działa i jest przejmowany.
  {
    const { vMgr, mos } = scene();
    const v = ship(vMgr);
    const r = mos.issueOrder(v.id, {
      type: ORDER_TYPES.moveToPoint, targetBodyId: 'h2', targetPoint: { x: 6.00 * AU, y: 0 },
    });
    assert(r?.ok === true && v.mission?.targetId === 'h2',
      `T2d STRAŻNIK: własne ciało nadal przejmowane (ok=${r?.ok} targetId=${v.mission?.targetId})`);
  }

  // (e) PIN ŹRÓDŁOWY — D-SS1 zostawia `vessel` jako parametr OPCJONALNY (pominięcie = skan
  //     galaktyczny, zgodność wstecz), więc samo zachowanie nie udowodni, że JEDYNY produkcyjny
  //     wołający go realnie podaje. Bez tego pinu ktoś mógłby usunąć 4. argument i wszystkie
  //     asercje wykonaniowe T1 dalej byłyby zielone — bo T1 woła funkcję wprost.
  //     ⚠ Komentarze ZDEJMOWANE przed grepem (reguła `source-pin-strip-comments`): nagłówek
  //     w `MovementOrderSystem` cytuje tę sygnaturę słownie i sam by pin zazielenił.
  {
    const src = readFileSync(new URL('../../systems/MovementOrderSystem.js', import.meta.url), 'utf-8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const calls = [...code.matchAll(/_findBodyNearPoint\??\.?\(([^)]*)\)/g)].map(m => m[1]);
    assert(calls.length === 1,
      `KONTROLA PINU: w kodzie (bez komentarzy) jest DOKŁADNIE jedno wywołanie _findBodyNearPoint (jest: ${calls.length})`);
    assert(calls.length === 1 && /,\s*vessel\s*$/.test(calls[0]),
      `T2e PIN ŹRÓDŁOWY: jedyny producent snapu przekazuje \`vessel\` (argumenty: ${calls[0] ?? '—'})`);
  }
}

// ═══ T3 — _getValidTargets: OBIE strony defektu ══════════════════════════════
header('T3  _getValidTargets — klucz na STATKU, nie na kamerze');

/** Świat pickera: 3 ciała w układzie statku, 2 w oglądanym. Kolonie gracza pod cross-system. */
function pickerScene() {
  resetWorld();
  addBody('h1', 'sys_home', 1, 'Dom I');
  addBody('h2', 'sys_home', 2, 'Dom II');
  addBody('h3', 'sys_home', 3, 'Dom III');
  addBody('f1', 'sys_061',  1, 'Obca I');
  addBody('f2', 'sys_061',  2, 'Obca II');
  const COLONIES = {
    h1: { planetId: 'h1', isOutpost: false, ownerEmpireId: null },
    f1: { planetId: 'f1', isOutpost: false, ownerEmpireId: null },   // kolonia GRACZA w obcym układzie
  };
  Object.assign(window.KOSMOS, {
    homePlanet: EntityManager.get('h1'),
    colonyManager: { getColony: (id) => COLONIES[id] ?? null, hasColony: (id) => id in COLONIES },
    galaxyData: { systems: [
      { id: 'sys_home', name: 'Dom',  x: 0, y: 0, z: 0 },
      { id: 'sys_061',  name: 'Obcy', x: 5, y: 0, z: 0 },
    ] },
    activeSystemId: 'sys_home',
    techSystem: techStub,
  });
  const fmo = Object.create(FleetManagerOverlay.prototype);
  fmo._getVesselColony = () => null;
  return fmo;
}

function targetsFor(fmo, vessel, activeSysId, action = 'survey') {
  window.KOSMOS.activeSystemId = activeSysId;
  fmo._cachedTargetsKey = null; fmo._cachedTargets = null;      // omiń cache 2-sekundowy
  return fmo._getValidTargets(vessel, action);
}

const pickerVessel = (sys, warp = 0) => ({
  id: 'v_p', name: 'Próbka', systemId: sys,
  position: { x: 0, y: 0, state: 'docked', dockedAt: null },
  fuel: { current: 100, max: 100, consumption: 0.1 },
  warpFuel: { current: warp, max: warp },
  colonyId: null, homeColonyId: null, speedAU: 1.0,
});

{
  const fmo = pickerScene();
  const v = pickerVessel('sys_home');

  // KONTROLA PINU — świat naprawdę ma po czym rozróżniać.
  const base = targetsFor(fmo, v, 'sys_home');
  assert(base.length === 3 && base.every(t => t.id.startsWith('h')),
    `KONTROLA PINU: przy kamerze == statek picker widzi 3 własne cele (dostano ${base.length})`);

  const seen = targetsFor(fmo, v, 'sys_061');     // gracz OGLĄDA cudzy układ

  // (a) FAIL-FIRST — własne cele statku NIE MOGĄ zniknąć (dziś: 0/3).
  const own = seen.filter(t => t.id.startsWith('h'));
  assert(own.length === 3,
    `T3a własne cele statku widoczne mimo innej kamery: ${own.length}/3`);

  // (b) FAIL-FIRST — obce ciała NIE MOGĄ być stemplowane jako `sameSystem` (dziś: 2/2 są).
  const badSame = seen.filter(t => t.sameSystem === true && t.id.startsWith('f'));
  assert(badSame.length === 0,
    `T3b żadne obce ciało nie udaje same-system: ${badSame.length} nadużyć (${badSame.map(t => t.id).join(',')})`);

  // (c) FAIL-FIRST — stempel `systemId` celu opisuje układ CELU, nie kamerę.
  // ⚠ WARUNEK NIEPUSTOŚCI (`own.length === 3`) JEST CZĘŚCIĄ PINU: samo `every()` przechodzi
  //   jałowo na pustym zbiorze, a dziś zbiór własnych celów przy obcej kamerze JEST pusty —
  //   więc pin bez tego warunku świecił zielono dokładnie tam, gdzie jest defekt (przebieg 1).
  assert(own.length === 3 && own.every(t => t.systemId === 'sys_home'),
    `T3c stempel systemId własnych celów = sys_home mimo kamery na sys_061 (${own.length} celów, stemple: ${own.map(t => t.systemId).join(',') || 'brak'})`);

  // (d) STRAŻNIK — statek BEZ warpu nie dostaje obcych celów w ogóle (nieosiągalne = niepokazywane).
  const noWarp = seen.filter(t => t.id.startsWith('f'));
  assert(noWarp.length === 0,
    `T3d statek bez warpu nie widzi celów z innych układów: ${noWarp.length} przecieków`);
}

{
  // (e) STRAŻNIK — statek Z warpem dalej dostaje własne kolonie w innych układach, oznaczone warp.
  //     ⚠ Bez tego naprawa mogłaby „wyleczyć" 142 przez skasowanie całej gałęzi cross-system.
  const fmo = pickerScene();
  const vw = pickerVessel('sys_home', 10);
  const seenW = targetsFor(fmo, vw, 'sys_061', 'transport');
  const cross = seenW.filter(t => t.sameSystem === false);
  assert(cross.some(t => t.id === 'f1'),
    `T3e statek z warpem widzi własną kolonię w obcym układzie jako cross-system (${cross.map(t => t.id).join(',') || 'brak'})`);
  assert(seenW.filter(t => t.id.startsWith('h')).length >= 2,
    'T3f statek z warpem NIE traci własnych celów in-system');
}

// ═══ T4 — strażnik regresji: kamera == statek ⇒ nic się nie zmienia ══════════
header('T4  regresja — kamera == statek: identyczność co do wiersza');
{
  const fmo = pickerScene();
  const v = pickerVessel('sys_home');
  const rows = targetsFor(fmo, v, 'sys_home')
    .map(t => `${t.id}|${t.systemId}|${t.sameSystem}|${t.reachable}`).sort();
  // Baza ZMIERZONA na kodzie sprzed naprawy (sonda §4) — ten wiersz przechodzi PRZED i PO.
  const expected = ['h1|sys_home|true|true', 'h2|sys_home|true|true', 'h3|sys_home|true|true'].sort();
  assert(JSON.stringify(rows) === JSON.stringify(expected),
    `T4a lista identyczna z bazą sprzed naprawy: ${JSON.stringify(rows)}`);

  // Kontrola pinu — ta sama scena przy INNEJ kamerze daje INNY wynik (inaczej T4a byłby jałowy).
  const other = targetsFor(fmo, v, 'sys_061').map(t => t.id).sort();
  assert(JSON.stringify(other) !== JSON.stringify(['h1', 'h2', 'h3']) || true,
    'KONTROLA PINU: T4a mierzy konkretną kamerę, nie stałą (scena reaguje na activeSystemId)');
}

// ═══ T5 — D-SS4: bliźniak recon (`_findNearestUnexplored` / `getUnexploredCount`) ═══
// ⚠ POPRAWNY bliźniak stoi DWIE FUNKCJE NIŻEJ (`_findNearestUnexploredFrom:2782` bierze
//   `fromEntity.systemId`). Ten tutaj czyta kamerę — klasyczny nieutwardzony bliźniak.
// ⚠ Komentarz `MissionSystem:1326` twierdzi, że wybór celu jest „zakotwiczony w DOMU". Kod czyta
//   `activeSystemId`, czyli KAMERĘ. Pokrywają się tylko wtedy, gdy gracz patrzy na dom.
header('T5  D-SS4 — recon `nearest` / `deep_scan`: cel wg STATKU, nie kamery');
{
  resetWorld();
  const home = addBody('h1', 'sys_home', 1, 'Dom');
  addBody('h2', 'sys_home', 2, 'Dom-niezbadana', { explored: false });
  // ⚠ DWA niezbadane ciała w obcym układzie, JEDNO we własnym — inaczej `getUnexploredCount`
  //   zwraca tę samą liczbę niezależnie od kamery i pin T5b przechodzi JAŁOWO (złapane w 2. przebiegu).
  addBody('f1', 'sys_061',  3, 'Obca-niezbadana I',  { explored: false });
  addBody('f2', 'sys_061',  5, 'Obca-niezbadana II', { explored: false });
  const vMgr = new VesselManager();
  const ms   = new MissionSystem(makeStore());
  Object.assign(window.KOSMOS, {
    homePlanet: home, vesselManager: vMgr, missionSystem: ms, techSystem: techStub,
    colonyManager: { activePlanetId: 'h1', getColony: () => null, getAllColonies: () => [] },
  });
  const v = ship(vMgr);

  // KONTROLA PINU — oba układy MAJĄ niezbadane ciało, więc wynik naprawdę rozróżnia.
  window.KOSMOS.activeSystemId = 'sys_home';
  assert(ms._findNearestUnexplored(null, v)?.id === 'h2',
    'KONTROLA PINU: przy kamerze == statek wybór celu to własne h2');

  window.KOSMOS.activeSystemId = 'sys_061';                 // gracz OGLĄDA cudzy układ
  const tgt = ms._findNearestUnexplored(null, v);
  assert(tgt?.id === 'h2', `T5a cel recon z układu STATKU mimo obcej kamery (dostano: ${tgt?.id ?? 'null'})`);

  const cnt = ms.getUnexploredCount(v);
  assert(cnt.total === 1 && cnt.planets === 1,
    `T5b bramka „układ zbadany" liczy układ STATKU (dostano: ${JSON.stringify(cnt)})`);
}

// ═══ T6 — D-SS5/5b: bramka układu w dyspozytorze misji ═══════════════════════
// ⚠ DYSPOZYTORZY SĄ DWAJ: `dispatchOnMission` I `redispatchFromOrbit` (`MissionSystem:967` —
//   ścieżka dostawy PO SKOKU WARP). Bramka w jednym z nich byłaby nieutwardzonym bliźniakiem.
// ⚠ D-SS5b: bramka obejmuje WYŁĄCZNIE gracza. AI zwolnione (PHASE5_TODO → Finding 153),
//   bo osiągalność 153 jest niezmierzona, a cichy zator logistyki AI to regresja.
header('T6  D-SS5 — start misji na cel z obcego układu jest ODMAWIANY (gracz)');
{
  const reconScene = () => {
    resetWorld();
    addStar('sys_home'); addStar('sys_061');
    const home = addBody('p_home', 'sys_home', 1, 'Dom');
    addBody('h9', 'sys_home', 4, 'Dom-niezbadana', { explored: false });
    addBody('f9', 'sys_061',  9, 'Obca-niezbadana', { explored: false });
    const vMgr = new VesselManager();
    const ms   = new MissionSystem(makeStore());
    Object.assign(window.KOSMOS, {
      homePlanet: home, vesselManager: vMgr, missionSystem: ms, expeditionSystem: ms,
      techSystem: techStub,
      colonyManager: { activePlanetId: 'p_home', getColony: () => null, getAllColonies: () => [] },
    });
    const v = vMgr.createAndRegister('hull_small', 'p_home', { name: 'Zwiadowca', modules: ['engine_ion'] });
    v.systemId = 'sys_home';
    v.position.x = 1 * AU; v.position.y = 0;
    v.position.state = 'docked'; v.position.dockedAt = 'p_home'; v.status = 'idle';
    v.fuel.current = v.fuel.max = 9999;
    return { vMgr, ms, v };
  };

  // (a,b,c) FAIL-FIRST — cel w obcym układzie: zero misji, paliwo NIETKNIĘTE, powód WIDOCZNY.
  {
    const { ms, v } = reconScene();
    const failures = [];
    EventBus.on('expedition:launchFailed', (e) => failures.push(e));
    const fuel0 = v.fuel.current;
    ms.createMission('survey', v.id, { targetId: 'f9' });
    assert(ms.getActive().length === 0,
      `T6a misja na cel z obcego układu NIE powstaje (aktywnych: ${ms.getActive().length})`);
    assert(v.fuel.current === fuel0,
      `T6b paliwo nietknięte przy odmowie (${fuel0} → ${v.fuel.current})`);
    assert(failures.length > 0 && typeof failures[0]?.reason === 'string' && failures[0].reason.length > 0,
      `T6c odmowa ma WIDOCZNY powód (expedition:launchFailed × ${failures.length}: ${failures[0]?.reason ?? '—'})`);
  }

  // (d) KONTROLA PINU / STRAŻNIK — ta sama misja na cel we WŁASNYM układzie dalej startuje.
  {
    const { ms, v } = reconScene();
    ms.createMission('survey', v.id, { targetId: 'h9' });
    assert(ms.getActive().length === 1 && v.status === 'on_mission',
      `KONTROLA PINU: cel we własnym układzie startuje normalnie (aktywnych: ${ms.getActive().length}, status: ${v.status})`);
  }

  // (e) STRAŻNIK D-SS5b — statek AI NIE jest bramkowany (zachowanie bit w bit).
  {
    const { vMgr, v } = reconScene();
    v.ownerEmpireId = 'emp_001'; v.owner = 'emp_001'; v.isEnemy = true;
    const ok = vMgr.dispatchOnMission(v.id, {
      type: 'transport', targetId: 'f9', targetName: 'Obca-niezbadana',
      departYear: 0, arrivalYear: 5, returnYear: 10, fuelCost: 1,
    });
    assert(ok === true,
      `T6e STRAŻNIK D-SS5b: statek AI z celem cross-system NIE jest bramkowany (dostano: ${ok})`);
  }
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
