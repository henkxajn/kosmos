// COMBAT SYSTEM SCOPE — keeper: starcie jest JEDNOUKŁADOWE Z KONSTRUKCJI.
//
// PO CO: `DeepSpaceCombatSystem` łączył w jedno starcie statki z RÓŻNYCH układów. ZMIERZONE
// w żywej grze: encounter ze stemplem `location.systemId = 'sys_024'` zawierał statek gracza
// z `sys_024` ORAZ dwa statki z `sys_061` i `sys_home` (potwierdzone dwoma zrzutami ekranu
// przy przełączaniu widoku układu — statki były fizycznie w innych układach).
//
// MECHANIZM (klasa „globalne id ≠ położenie", ta sama co Finding 138 / W3-4b): każdy układ ma
// WŁASNĄ ramkę współrzędnych wyśrodkowaną na swojej gwieździe w (0,0), ale rejestr statków jest
// PŁASKI — trzyma całą galaktykę. Statek 0,2 AU od SWOJEJ gwiazdy ma więc niemal te same surowe
// `x/y` co statek 0,2 AU od INNEJ gwiazdy. Trzy miejsca liczyły na surowych `x/y` bez terminu układu:
//   1. `startEngagement` — „team-up gather" iterował `vm._vessels.values()` po CAŁEJ galaktyce;
//   2. `handleCombatRangeEnter` — jedyne publiczne wejście, bramkowało tylko `sameFaction`/wrak;
//   3. `_createEncounter` — stempel `location.systemId` ZGADYWANY z `sideAVessels[0]`, czyli
//      z kolejności iteracji rejestru. To on maskował mieszaninę: rekord bitwy wyglądał na
//      jednoukładowy, więc żaden konsument `battle:resolved` nie miał jak wykryć anomalii.
// `VesselCombatSystem` ma ZNAKOWO TĘ SAMĄ pętlę i ten sam stempel — uśpiony flagą, ale
// z odczytanym fallbackiem (`:156-165`) i utrzymywaną ścieżką rollbacku. Utwardzony w tym
// samym commicie (reguła nieutwardzonego bliźniaka — `removeColony:667`).
//
// ⚠ DLACZEGO `ProximitySystem` NIE WYSTARCZA JAKO STRAŻNIK (to była moja błędna hipoteza,
//   obalona pomiarem źródła): `_checkPair:187` MA guard międzyukładowy, ale NIE jest jedynym
//   producentem `vessel:combatRangeEnter`. `MovementOrderSystem` emituje je BEZPOŚREDNIO
//   w dwóch miejscach (`:1163` force-engage w `_tickEngageOrder`, `:1505` po ukończeniu
//   pursue/intercept — ten drugi z dystansem WPISANYM NA SZTYWNO), dodatkowo majstrując przy
//   `ps._activeCombatPairs`. Dlatego bramka MUSI stać w dyspozytorze DSCS, który widzi
//   wszystkich trzech producentów — a nie w strażniku, którego dwóch z nich omija.
//
// ⚠ PREDYKAT JEST FAIL-CLOSED I TO JEST ŚWIADOMA RÓŻNICA WOBEC `isSameSystem`.
//   `isSameSystem` (fail-OPEN) zostaje NIETKNIĘTY dla bramek WYDANIA rozkazu — jego nagłówek
//   mówi wprost, że blokowanie na podstawie niewiedzy zamieniłoby defekt w „cichy paraliż floty".
//   W WALCE bilans jest odwrotny: cena fałszywego POZYTYWU to trwale stracone kadłuby i zatruty
//   klucz `orbitalDominance` w ZAPISIE; cena fałszywego NEGATYWU to jedna niestoczona bitwa.
//   `null` nie znaczy tu „nie wiemy": `systemIdOf` mapuje `undefined → 'sys_home'`, więc do `null`
//   dochodzi WYŁĄCZNIE prawdziwy tranzyt warp — a statek w warpie nie ma prawa walczyć (jego
//   `x/y` to koordynaty sprzed skoku). Pinuje T4; T5 pilnuje, że stare zapisy NIE zostały wyłączone.
//
// Uruchom: node src/testing/smoke/combat_system_scope_smoke.mjs

import '../headless/env.js';               // MUSI być pierwszy
import EventBus                  from '../../core/EventBus.js';
import EntityManager             from '../../core/EntityManager.js';
import { GAME_CONFIG }           from '../../config/GameConfig.js';
import { VesselManager }         from '../../systems/VesselManager.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { VesselCombatSystem }    from '../../systems/VesselCombatSystem.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');

const AU = 110;

function resetWorld() {
  EventBus.clear();
  EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 10 }, activeSystemId: 'sys_home' };
  // ⚠ Gwiazda KAŻDEGO układu stoi w (0,0) — to jest MECHANIZM defektu, nie skrót fixture'u.
  EntityManager.add({ id: 'star_home', type: 'star', name: 'Sol',    systemId: 'sys_home', x: 0, y: 0 });
  EntityManager.add({ id: 'star_24',   type: 'star', name: 'Diphda', systemId: 'sys_024', x: 0, y: 0 });
  EntityManager.add({ id: 'star_61',   type: 'star', name: 'Nekkar', systemId: 'sys_061', x: 0, y: 0 });
}

function scene() {
  resetWorld();
  const vm = new VesselManager();
  window.KOSMOS.vesselManager = vm;
  const dscs = new DeepSpaceCombatSystem(vm);
  window.KOSMOS.deepSpaceCombatSystem = dscs;
  return { vm, dscs };
}

/**
 * Statek w zadanym układzie, na zadanej pozycji W RAMCE TEGO UKŁADU.
 * `sys === null` ⇒ tranzyt warp (świadomy znacznik, patrz SystemScope).
 * `sys === 'ABSENT'` ⇒ pole `systemId` USUNIĘTE (stary zapis sprzed multi-system).
 */
function ship(vm, { sys = 'sys_home', xAU = 1.0, yAU = 0, empire = null, armed = false, name } = {}) {
  const v = vm.createAndRegister('hull_frigate', 'p_none',
    { name: name ?? `v_${sys}_${xAU}`, modules: armed ? ['weapon_laser'] : [] });
  if (sys === 'ABSENT') delete v.systemId; else v.systemId = sys;
  v.position.x = xAU * AU; v.position.y = yAU * AU;
  v.position.state = 'orbiting';           // _inCombatState przyjmuje orbiting/in_transit
  v.position.dockedAt = null;
  v.status = 'idle'; v.mission = null;
  if (v.fuel) v.fuel.current = v.fuel.max;
  if (empire) { v.ownerEmpireId = empire; v.owner = empire; v.isEnemy = true; }
  return v;
}

const rosterOf = (enc) => enc ? [...enc.sideA.vesselIds, ...enc.sideA.joinedVesselIds,
                                 ...enc.sideB.vesselIds, ...enc.sideB.joinedVesselIds] : [];

// ════════════════════════════════════════════════════════════════════════════════════════
header('T1 — GATHER: skład starcia NIE wychodzi poza układ pary wyzwalającej');
{
  const { vm, dscs } = scene();
  // ⚠ INTRUZ MUSI NALEŻEĆ DO TEGO SAMEGO IMPERIUM CO LOKALNY WRÓG. Pierwsza wersja tego
  //   fixture'u dawała mu inne imperium i test przechodził na NIEPOPRAWIONYM kodzie — intruz
  //   był wprawdzie zebrany przez gather, ale wypadał przy wyborze `bestGroup` (jedna strona
  //   przeciwna na starcie). Mierzyłby więc dobór imperium, a nie termin układu. FAŁSZYWA ZIELEŃ.
  const me  = ship(vm, { sys: 'sys_024', xAU: 1.10, armed: true,  name: 'USS Furia' });
  const foe = ship(vm, { sys: 'sys_024', xAU: 1.12, armed: true,  empire: 'emp_001', name: 'Lokalny wrog' });
  // INTRUZ — inny układ, ale w surowych px praktycznie w tym samym miejscu, TO SAMO imperium.
  const alien = ship(vm, { sys: 'sys_061', xAU: 1.11, armed: true, empire: 'emp_001', name: 'Merkury II' });

  const enc = dscs.startEngagement(me.id, foe.id);
  assert(!!enc, 'starcie POWSTAŁO (bez tego reszta T1 mierzyłaby ciszę)');
  const roster = rosterOf(enc);
  assert(!roster.includes(alien.id),
    `INTRUZ z sys_061 NIE trafił do składu (roster=${roster.join(',')}). ⚠ PRZED NAPRAWĄ ta asercja ` +
    'PADAŁABY — gather iterował `vm._vessels.values()` po CAŁEJ galaktyce i kwalifikował po gołym hypot');
  assert(roster.includes(me.id) && roster.includes(foe.id),
    'para wyzwalająca JEST w składzie');
}

header('T1b — KONTROLA PINU: sojusznik w TYM SAMYM układzie NADAL dołącza (gather nie umarł)');
{
  const { vm, dscs } = scene();
  const me  = ship(vm, { sys: 'sys_024', xAU: 1.10, armed: true,  name: 'USS Furia' });
  const foe = ship(vm, { sys: 'sys_024', xAU: 1.12, armed: true,  empire: 'emp_001', name: 'Wrog' });
  // Ten sam układ, ta sama odległość i TO SAMO imperium co INTRUZ w T1 — jedyna różnica to systemId.
  const ally = ship(vm, { sys: 'sys_024', xAU: 1.11, armed: true, empire: 'emp_001', name: 'Wrog II' });

  const enc = dscs.startEngagement(me.id, foe.id);
  const roster = rosterOf(enc);
  assert(!!enc && roster.includes(ally.id),
    `sojusznik z TEGO SAMEGO układu DOŁĄCZYŁ (roster=${roster.join(',')}) — bez tej kontroli ` +
    'T1 przechodziłby także wtedy, gdyby naprawa po prostu wyłączyła team-up w całości');
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T2 — DYSPOZYTOR: para z RÓŻNYCH układów nie otwiera starcia');
{
  const { vm, dscs } = scene();
  const me    = ship(vm, { sys: 'sys_024', xAU: 1.10, armed: true, name: 'USS Furia' });
  const alien = ship(vm, { sys: 'sys_061', xAU: 1.11, armed: true, empire: 'emp_001', name: 'Merkury II' });

  const ok = dscs.handleCombatRangeEnter(me.id, alien.id, false);
  assert(ok === false, `dyspozytor ODMÓWIŁ (zwrot=${ok})`);
  assert(dscs._activeEncounters.size === 0,
    `żadne starcie nie powstało (aktywnych=${dscs._activeEncounters.size}). ⚠ To jest bramka, która ` +
    'pokrywa WSZYSTKICH TRZECH producentów `vessel:combatRangeEnter` — w tym dwa force-emity ' +
    'z MovementOrderSystem (:1163, :1505), które OMIJAJĄ guard w ProximitySystem');
}

header('T2b — KONTROLA PINU: para w TYM SAMYM układzie dalej otwiera starcie');
{
  const { vm, dscs } = scene();
  const me  = ship(vm, { sys: 'sys_024', xAU: 1.10, armed: true, name: 'USS Furia' });
  const foe = ship(vm, { sys: 'sys_024', xAU: 1.11, armed: true, empire: 'emp_001', name: 'Wrog' });

  const ok = dscs.handleCombatRangeEnter(me.id, foe.id, false);
  assert(ok === true && dscs._activeEncounters.size === 1,
    `starcie lokalne DZIAŁA jak dotąd (zwrot=${ok}, aktywnych=${dscs._activeEncounters.size}) ` +
    '— to jest kontrola, że naprawa nie wyłączyła walki po cichu');
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T3 — INWARIANT: stempel `location.systemId` zgadza się z KAŻDYM uczestnikiem');
{
  // ⚠ GRANICA TEGO PINU: po naprawie roster i stempel są SPRZĘŻONE (skoro wszyscy są z jednego
  //   układu, stempel z pary wyzwalającej i stempel z `sideAVessels[0]` dają to samo). Ten test
  //   NIE izoluje więc samego stempla od rostera — mierzy INWARIANT, który psuł się na obu.
  //   Izolację stempla pilnuje T3b (pin źródłowy).
  const { vm, dscs } = scene();
  // Wszyscy przeciwnicy z TEGO SAMEGO imperium — inaczej intruzi wypadliby przy wyborze
  // `bestGroup` i test mierzyłby dobór imperium zamiast terminu układu (patrz nota w T1).
  const me    = ship(vm, { sys: 'sys_024', xAU: 1.10, armed: true, name: 'USS Furia' });
  const foe   = ship(vm, { sys: 'sys_024', xAU: 1.12, armed: true, empire: 'emp_001' });
  ship(vm, { sys: 'sys_061',  xAU: 1.11, armed: true, empire: 'emp_001', name: 'Merkury II' });
  ship(vm, { sys: 'sys_home', xAU: 1.09, armed: true, empire: 'emp_001', name: 'science probe' });

  const enc = dscs.startEngagement(me.id, foe.id);
  assert(!!enc, 'starcie powstało');
  const stamp = enc?.location?.systemId;
  const members = rosterOf(enc).map(id => vm._vessels.get(id));
  const offenders = members.filter(v => (v.systemId ?? 'sys_home') !== stamp)
                           .map(v => `${v.name}[${v.systemId}]`);
  assert(offenders.length === 0,
    `każdy uczestnik jest w układzie stempla (stempel=${stamp}, obcy=${offenders.join(',') || 'brak'})`);
  assert(stamp === 'sys_024', `stempel wskazuje układ pary wyzwalającej (${stamp})`);
}

header('T3b — PIN ŹRÓDŁOWY: stempel NIE jest już zgadywany z `sideAVessels[0]`');
{
  const fs = await import('node:fs');
  const src = fs.readFileSync('src/systems/DeepSpaceCombatSystem.js', 'utf8')
    .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');   // zdejmij komentarze
  assert(!/sideAVessels\[0\]\s*\?\.\s*systemId/.test(src),
    'wyrażenie `sideAVessels[0]?.systemId` zniknęło z KODU (nie tylko z komentarza)');
  // KONTROLA PINU — wzorzec naprawdę wykrywa, gdyby wróciło.
  assert(/sideAVessels\[0\]\s*\?\.\s*systemId/.test('const s = sideAVessels[0]?.systemId ?? x;'),
    'KONTROLA PINU: wzorzec wykrywa dawne wyrażenie — bez tego zielone T3b znaczyłoby „regex jest zepsuty"');
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T4 — FAIL-CLOSED: statek w TRANZYCIE WARP (systemId === null) nie walczy');
{
  const { vm, dscs } = scene();
  const me    = ship(vm, { sys: 'sys_home', xAU: 1.10, armed: true, name: 'USS Furia' });
  const warping = ship(vm, { sys: null, xAU: 1.11, armed: true, empire: 'emp_001', name: 'Kurier w warpie' });

  const ok = dscs.handleCombatRangeEnter(me.id, warping.id, false);
  assert(ok === false && dscs._activeEncounters.size === 0,
    `statek między układami NIE wchodzi do walki (zwrot=${ok}). Jego \`x/y\` to koordynaty ` +
    'sprzed skoku — walka na nich byłaby fikcją');
}

header('T5 — KONTROLA REGRESJI: stary zapis (BRAK pola `systemId`) DALEJ walczy');
{
  // ⚠ To jest asercja przeciw najgroźniejszemu skutkowi ubocznemu fail-closed: cichemu
  //   wyłączeniu walki dla statków sprzed multi-system. `systemIdOf` mapuje `undefined` →
  //   `'sys_home'`, a serialize/restore stemplują jawnie — więc te statki MUSZĄ przechodzić.
  const { vm, dscs } = scene();
  const oldA = ship(vm, { sys: 'ABSENT', xAU: 1.10, armed: true, name: 'Weteran' });
  const oldB = ship(vm, { sys: 'ABSENT', xAU: 1.11, armed: true, empire: 'emp_001', name: 'Stary wrog' });
  assert(oldA.systemId === undefined && oldB.systemId === undefined,
    'KONTROLA PINU: fixture NAPRAWDĘ nie ma pola `systemId` (inaczej T5 nie mierzyłby starego zapisu)');

  const ok = dscs.handleCombatRangeEnter(oldA.id, oldB.id, false);
  assert(ok === true && dscs._activeEncounters.size === 1,
    `statki bez pola \`systemId\` walczą normalnie (zwrot=${ok}) — traktowane jak \`sys_home\``);

  // I odwrotnie: stary statek vs statek jawnie z INNEGO układu — odmowa.
  const { vm: vm2, dscs: dscs2 } = scene();
  const oldC  = ship(vm2, { sys: 'ABSENT',  xAU: 1.10, armed: true });
  const alien = ship(vm2, { sys: 'sys_061', xAU: 1.11, armed: true, empire: 'emp_001' });
  assert(dscs2.handleCombatRangeEnter(oldC.id, alien.id, false) === false,
    'stary statek (⇒ sys_home) vs statek z sys_061 — odmowa');
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T6 — BLIŹNIAK: VesselCombatSystem utwardzony w tym samym commicie');
{
  // VCS jest dziś uśpiony (m4DeepSpaceCombat=true ⇒ delegacja do DSCS), ale ma ODCZYTANY
  // fallback do instant-path, gdy DSCS nie jest zamontowany (`:156-165`), i jawnie utrzymywaną
  // ścieżkę rollbacku flagi. Nieutwardzony bliźniak to mina — lekcja `removeColony:667`.
  assert(GAME_CONFIG.FEATURES?.m4DeepSpaceCombat === true,
    'KONTROLA PINU: flaga m4DeepSpaceCombat jest ON — czyli VCS jest UŚPIONY, a mimo to go pinujemy');

  const { vm } = scene();
  window.KOSMOS.deepSpaceCombatSystem = null;        // wymuś fallback VCS na instant-path
  const vcs = new VesselCombatSystem(vm);
  window.KOSMOS.vesselCombatSystem = vcs;

  const me    = ship(vm, { sys: 'sys_024', xAU: 1.10, armed: true, name: 'USS Furia' });
  const alien = ship(vm, { sys: 'sys_061', xAU: 1.11, armed: true, empire: 'emp_001' });

  let battles = 0;
  EventBus.on('battle:resolved', () => battles++);
  vcs._handleCombatRangeEnter({ vesselAId: me.id, vesselBId: alien.id, sameFaction: false });
  assert(battles === 0,
    `VCS (ścieżka awaryjna) NIE rozstrzygnął bitwy międzyukładowej (bitew=${battles})`);

  // KONTROLA PINU — ta sama ścieżka dla pary lokalnej MUSI zadziałać.
  const foe = ship(vm, { sys: 'sys_024', xAU: 1.12, armed: true, empire: 'emp_001' });
  vcs._handleCombatRangeEnter({ vesselAId: me.id, vesselBId: foe.id, sameFaction: false });
  assert(battles > 0,
    `KONTROLA PINU: para lokalna DALEJ wywołuje bitwę w VCS (bitew=${battles}) — inaczej pin ` +
    'znaczyłby tylko „VCS jest martwy"');
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T7 — DEFENSE-IN-DEPTH: `_joinEncounter` sam odmawia obcemu układowi');
{
  // ⚠ Ta ścieżka jest po T2 NIEOSIĄGALNA z zewnątrz (jedyni wołający `_joinEncounter` to `:145`
  //   i `:150`, oba za bramką dyspozytora). Wołamy ją WPROST, bo guard ma być prawdą LOKALNĄ
  //   tej funkcji — inaczej drugi wołający w przyszłości przywróci mieszaninę na zielono.
  const { vm, dscs } = scene();
  const me  = ship(vm, { sys: 'sys_024', xAU: 1.10, armed: true });
  const foe = ship(vm, { sys: 'sys_024', xAU: 1.12, armed: true, empire: 'emp_001' });
  const enc = dscs.startEngagement(me.id, foe.id);
  assert(!!enc, 'PRZESŁANKA: starcie lokalne powstało');

  const alien = ship(vm, { sys: 'sys_061', xAU: 1.11, armed: true, empire: 'emp_001' });
  dscs._joinEncounter(enc, alien.id);
  assert(!enc.vesselStates.has(alien.id),
    'statek z sys_061 NIE dołączył do starcia stemplowanego sys_024');

  // KONTROLA PINU — posiłek z TEGO SAMEGO układu MUSI dołączyć.
  const ally = ship(vm, { sys: 'sys_024', xAU: 1.13, armed: true, empire: 'emp_001' });
  dscs._joinEncounter(enc, ally.id);
  assert(enc.vesselStates.has(ally.id),
    'KONTROLA PINU: posiłek z TEGO SAMEGO układu dołączył — guard nie zabił mechanizmu posiłków');
}

header('T8 — DEFENSE-IN-DEPTH: `_freezeAsStationary` nie przypina ciała z innego układu');
{
  const { vm, dscs } = scene();
  EntityManager.add({ id: 'p_24a', type: 'planet', name: 'Diphda I', systemId: 'sys_024', x: 1.1 * AU, y: 0 });
  const alien = ship(vm, { sys: 'sys_061', xAU: 1.11, armed: true, empire: 'emp_001' });

  dscs._freezeAsStationary(alien, 'p_24a');
  assert(alien.position.dockedAt == null,
    `statek z sys_061 NIE dostał \`dockedAt\` na ciało z sys_024 (got=${alien.position.dockedAt}). ` +
    '⚠ To jedyny zapis w tej ścieżce, który TRWALE mutuje statek — bez guardu szkoda szła do ZAPISU');

  // KONTROLA PINU — pin z TEGO SAMEGO układu MUSI się zapisać (inaczej psujemy combat slow fix).
  const local = ship(vm, { sys: 'sys_024', xAU: 1.10, armed: true, empire: 'emp_001' });
  dscs._freezeAsStationary(local, 'p_24a');
  assert(local.position.dockedAt === 'p_24a',
    `KONTROLA PINU: pin lokalny DZIAŁA (got=${local.position.dockedAt}) — bez tego guard zabiłby ` +
    'combat slow fix z 2026-05-21 (wróg przypięty do orbity obrońcy, żeby dystans nie rósł)');
  assert(local.mission === null, 'freeze nadal zeruje misję (zachowanie niezmienione)');
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n════ combat_system_scope_smoke: ${pass} PASS / ${fail} FAIL ════`);
process.exit(fail > 0 ? 1 : 0);
