// BRAMKA WŁASNOŚCI KOLONII — blok P0 (OG-2). Wczytanie NIE oddaje gracza koloni wroga.
//
// PO CO: audyt `docs/audit/COLONY_OWNERSHIP_GATE_AUDIT.md` §6 zmierzył, że higiena AC-8 nie
// przeżywa wczytania: `transferColony` nie czyścił `isHomePlanet`, `ColonyManager.restore`
// uzbrajał z tej flagi `_activePlanetId` NA CIELE WROGA, a zapisany `null` tego nie cofał.
// Efekt: awaria odtwarzała się z KAŻDEGO zapisu, bez udziału gracza. Plan
// `docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md`, blok P0 podpisany 2026-08-19.
//
//   T1  P0-C=W2 — `transferColony` CZYŚCI `isHomePlanet`, ale narracja utraty (`wasHomePlanet`)
//       przeżywa. KONTROLA PINU: zwykła kolonia raportuje `wasHomePlanet:false`.
//   T2  P0-C=W2 — `captureColonyForPlayer` PRZYWRACA flagę, gdy odbijamy WŁASNĄ stolicę.
//       KONTROLA PINU: zdobycie CUDZEJ stolicy jej nie przyznaje.
//   T3  P0-D=W1 — `removeColony` nie przepina na ex-dom trzymany przez wroga.
//       KONTROLA PINU ×2: wybiera INNĄ kolonię gracza, gdy jest; odpina, gdy nie ma żadnej.
//   T4  P0-A=W1 — round-trip przez PRODUKCYJNY zapis: gracz bez kolonii wraca ODPIĘTY.
//       KONTROLA PINU: gdy ma inną kolonię — wraca na NIĄ, nie na zdobycz wroga.
//   T5  P0-A=W1 — zapisana aktywna kolonia GRACZA jest zachowana (wierny port dawnej bramki).
//       KONTROLA PINU: zapisana aktywna kolonia WROGA jest odrzucana.
//   T6  P0-A=W1 — `restore()` SAM nie wiąże już niczego (koniec stanu „dwa z pięciu").
//   T7  Inwariant „pięć razem": po wyborze wszystkie wskaźniki opisują JEDNĄ kolonię.
//   T8  PIN ŹRÓDŁOWY — `GameScene` naprawdę woła wybór, i to POZA `if (homePlanetId)`.
//       (`GameScene.js` nie importuje się pod node — mapa `exports` stuba `three`.)
//
// Uruchom: node src/testing/smoke/colony_ownership_load_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EntityManager from '../../core/EntityManager.js';
import EventBus from '../../core/EventBus.js';
import { ColonyManager } from '../../systems/ColonyManager.js';
import { SaveSystem } from '../../systems/SaveSystem.js';
import { EmpireColonyBootstrap } from '../../systems/EmpireColonyBootstrap.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const EMP = 'emp_001';
const EMP2 = 'emp_002';

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  window.KOSMOS.civMode = true;
  return { core, home: window.KOSMOS.homePlanet, cm: core.colonyManager };
}

const freeBody = (cm, systemId, exclude) => EntityManager.getAll().find(e =>
  e.systemId === systemId && e.id !== exclude &&
  (e.type === 'planet' || e.type === 'moon') && !cm.getColony(e.id));

/**
 * Round-trip przez PRODUKCYJNĄ ścieżkę zapisu, w KOLEJNOŚCI z gry.
 *
 * ⚠ RELINK JEST OBOWIĄZKOWY, NIE OZDOBNY — i keeper to wykrył wykonaniem. `ColonyManager.restore`
 *   NIE odtwarza `ownerEmpireId` (P0-B=W1: własność jest wyprowadzana z `empires[].colonies`,
 *   `EmpireColonyBootstrap.js:543`), więc świeżo odtworzone kolonie są BEZ WŁAŚCICIELA i kanon
 *   `isPlayerColony` czyta KAŻDĄ z nich jako kolonię gracza — łącznie ze zdobyczą wroga.
 *   Pominięcie relinku dawało tu fałszywy wynik „gracz ma jeszcze kolonię".
 *   To jest dokładnie powód, dla którego wybór aktywnej koloni NIE MOŻE mieszkać w `restore`.
 *   Lustro `GameScene`: restore (`:2041`) → relink (`:2046`) → wybór (blok odroczony).
 */
function roundTrip(cm) {
  const c4x = new SaveSystem()._serializeCiv4x();
  cm._colonies.clear();
  cm._activePlanetId = null;
  cm.restore(c4x, null);
  EmpireColonyBootstrap.relinkColoniesAfterRestore(c4x.empireTech);
  return c4x;
}

// ── T1 — transferColony czyści flagę, narracja przeżywa ────────────────────────────────────
console.log('T1 — P0-C: utrata stolicy ZDEJMUJE `isHomePlanet`, ale komunikat zostaje „stolica"');
{
  const { cm, home } = boot();
  let captured = null;
  const off = (p) => { captured = p; };
  EventBus.on('colony:captured', off);

  cm.transferColony(home.id, EMP, 'probe');

  assert(cm.getColony(home.id)?.isHomePlanet === false,
    'T1 SEDNO: przejęta stolica NIE nosi już `isHomePlanet` — token, z którego `restore` uzbrajał ' +
    'aktywną kolonię, zniknął u źródła');
  assert(captured?.wasHomePlanet === true,
    'T1 KOLEJNOŚĆ JEST KONTRAKTEM: `colony:captured` nadal niesie `wasHomePlanet:true` — czyścimy ' +
    'PO snapshocie, więc „Stolica utracona" nie degraduje do „Kolonia utracona"');
  EventBus.off('colony:captured', off);
}
{
  // KONTROLA PINU — zwykła kolonia nigdy nie raportuje `wasHomePlanet`.
  const { cm, home } = boot();
  const body = freeBody(cm, home.systemId, home.id);
  const second = cm.createColony(body.id, { Fe: 50 }, 8, 0);
  let captured = null;
  const off = (p) => { captured = p; };
  EventBus.on('colony:captured', off);
  cm.transferColony(second.planetId, EMP, 'probe');
  assert(captured?.wasHomePlanet === false,
    'T1 KONTROLA PINU: utrata zwykłej koloni raportuje `wasHomePlanet:false` (pin mierzy snapshot, nie stałą)');
  EventBus.off('colony:captured', off);
}

// ── T2 — odbicie własnej stolicy przywraca rangę ───────────────────────────────────────────
console.log('T2 — P0-C: odbicie WŁASNEJ stolicy przywraca `isHomePlanet`');
{
  const { cm, home } = boot();
  cm.transferColony(home.id, EMP, 'probe');
  assert(cm.getColony(home.id)?.isHomePlanet === false, 'T2 przesłanka: po utracie flagi nie ma');

  cm.captureColonyForPlayer(home.id, 'probe_invasion');
  assert(cm.getColony(home.id)?.isHomePlanet === true,
    'T2 SEDNO: odbita stolica ODZYSKUJE rangę — inaczej zostałaby trwale zdegradowana, a ' +
    '`window.KOSMOS.homePlanet` i tak nadal by ją wskazywał (dwa pojęcia „domu" rozjechałyby się)');
}
{
  // KONTROLA PINU — zdobycie CUDZEJ stolicy nie czyni z niej naszej.
  const { cm } = boot();
  const ai = cm.getAllColonies().find(c => !ColonyManager.isPlayerColony(c));
  cm.captureColonyForPlayer(ai.planetId, 'probe_invasion');
  assert(cm.getColony(ai.planetId)?.isHomePlanet !== true,
    'T2 KONTROLA PINU: zdobyta kolonia AI NIE dostaje `isHomePlanet` (warunkiem jest tożsamość z macierzystą)');
}

// ── T3 — removeColony nie przepina na ex-dom wroga ─────────────────────────────────────────
console.log('T3 — P0-D: zniszczenie koloni nie oddaje gracza ex-domowi wroga');
{
  const { cm, home } = boot();
  const body = freeBody(cm, home.systemId, home.id);
  const second = cm.createColony(body.id, { Fe: 50 }, 8, 0);

  cm.transferColony(home.id, EMP, 'probe');
  assert(cm.activePlanetId === second.planetId, 'T3 przesłanka: AC-8 przepiął na drugą kolonię gracza');

  cm.removeColony(second.planetId, 'probe_collision');

  assert(cm.activePlanetId !== home.id,
    `T3 SEDNO: aktywna kolonia to \`${cm.activePlanetId}\`, NIE ex-dom wroga — bliźniak fallbacku ` +
    'z `removeColony` dostał ten sam filtr własności co `transferColony` w AC-8');
  assert(cm.activePlanetId == null && window.KOSMOS.resourceSystem === null,
    'T3 SEDNO 2: gracz nie ma już żadnej koloni ⇒ kontekst ODPIĘTY (magazyn nie zostaje z graczem)');
}
{
  // KONTROLA PINU — gdy gracz MA jeszcze kolonię, fallback przechodzi na NIĄ (nie wyłączyliśmy mechaniki).
  const { cm, home } = boot();
  const b1 = freeBody(cm, home.systemId, home.id);
  const c1 = cm.createColony(b1.id, { Fe: 50 }, 8, 0);
  const b2 = freeBody(cm, home.systemId, home.id);
  const c2 = cm.createColony(b2.id, { Fe: 50 }, 8, 0);
  cm.switchActiveColony(c1.planetId);
  cm.removeColony(c1.planetId, 'probe_collision');
  assert(cm.activePlanetId === home.id || cm.activePlanetId === c2.planetId,
    `T3 KONTROLA PINU: fallback wybrał kolonię GRACZA (\`${cm.activePlanetId}\`) — drabina działa, nie blokuje`);
  assert(window.KOSMOS.resourceSystem !== null, 'T3 KONTROLA PINU 2: magazyn zostaje, bo jest czyj');
}

// ── T4 — round-trip: gracz bez kolonii wraca ODPIĘTY ───────────────────────────────────────
console.log('T4 — P0-A: wczytanie NIE odtwarza awarii (§6 audytu)');
{
  const { cm, home } = boot();
  cm.transferColony(home.id, EMP, 'probe');
  assert(cm.activePlanetId == null, 'T4 przesłanka: AC-8 odpiął kontekst przed zapisem');

  const c4x = roundTrip(cm);
  assert(c4x.activePlanetId == null, 'T4 przesłanka 2: w pliku `activePlanetId` = null');

  cm.resolveActiveColonyAfterRestore();

  assert(cm.activePlanetId == null,
    `T4 SEDNO: po wczytaniu aktywna kolonia to \`${cm.activePlanetId}\` — kontekst został ODPIĘTY, ` +
    'a nie uzbrojony na ex-dom wroga z samej flagi');
  assert(window.KOSMOS.resourceSystem === null && window.KOSMOS.civSystem === null,
    'T4 SEDNO 2: magazyn i cywilizacja odpięte — stan z zapisu odtworzony wiernie, nie „naprawiony" na wroga');
}
{
  // KONTROLA PINU — ocalała kolonia gracza jest wybierana zamiast zdobyczy wroga.
  const { cm, home } = boot();
  const body = freeBody(cm, home.systemId, home.id);
  const second = cm.createColony(body.id, { Fe: 50 }, 8, 0);
  cm.transferColony(home.id, EMP, 'probe');

  roundTrip(cm);
  cm.resolveActiveColonyAfterRestore();

  assert(cm.activePlanetId === second.planetId,
    `T4 KONTROLA PINU: wczytanie wybrało ocalałą kolonię GRACZA (\`${cm.activePlanetId}\`), ` +
    'a nie ex-dom trzymany przez wroga');
  assert(window.KOSMOS.resourceSystem === cm.getColony(second.planetId)?.resourceSystem,
    'T4 KONTROLA PINU 2: magazyn `window.KOSMOS` to magazyn TEJ koloni');
}

// ── T5 — zapisana aktywna kolonia gracza przeżywa; wroga jest odrzucana ────────────────────
console.log('T5 — P0-A: zapisany widok gracza zachowany, ale ownership-gated');
{
  const { cm, home } = boot();
  const body = freeBody(cm, home.systemId, home.id);
  const second = cm.createColony(body.id, { Fe: 50 }, 8, 0);
  cm.switchActiveColony(second.planetId);

  roundTrip(cm);
  cm.resolveActiveColonyAfterRestore();

  assert(cm.activePlanetId === second.planetId,
    'T5 SEDNO: wczytanie wraca na kolonię, którą gracz oglądał — wierny port dawnej bramki `:2481`, ' +
    'tylko z dołożonym terminem własności (bez tego wczytanie snapowałoby zawsze na stolicę)');
}
{
  // KONTROLA PINU — zapisana aktywna kolonia, która w międzyczasie stała się wroga, jest odrzucana.
  const { cm, home } = boot();
  const body = freeBody(cm, home.systemId, home.id);
  const second = cm.createColony(body.id, { Fe: 50 }, 8, 0);
  cm.switchActiveColony(second.planetId);

  const c4x = new SaveSystem()._serializeCiv4x();
  assert(c4x.activePlanetId === second.planetId, 'T5 KONTROLA PINU przesłanka: plik wskazuje tę kolonię');

  cm._colonies.clear(); cm._activePlanetId = null;
  cm.restore(c4x, null);
  EmpireColonyBootstrap.relinkColoniesAfterRestore(c4x.empireTech);
  cm.getColony(second.planetId).ownerEmpireId = EMP2;   // w międzyczasie wpadła w cudze ręce
  cm.resolveActiveColonyAfterRestore();

  assert(cm.activePlanetId !== second.planetId,
    `T5 KONTROLA PINU: zapisana aktywna kolonia NALEŻĄCA DO WROGA jest odrzucona ` +
    `(wybrano \`${cm.activePlanetId}\`) — rung 0 też jest bramkowany własnością`);
}

// ── T6 — restore sam nie wiąże niczego ─────────────────────────────────────────────────────
console.log('T6 — P0-A: `restore()` nie jest już pisarzem wskaźników');
{
  const { cm, home } = boot();
  const body = freeBody(cm, home.systemId, home.id);
  cm.createColony(body.id, { Fe: 50 }, 8, 0);

  const c4x = new SaveSystem()._serializeCiv4x();
  cm._colonies.clear();
  cm._activePlanetId = null;
  window.KOSMOS.factorySystem = null;
  window.KOSMOS.prosperitySystem = null;

  cm.restore(c4x, null);

  assert(cm.activePlanetId == null,
    'T6 SEDNO: sam `restore` NIE wybiera aktywnej koloni (dawniej robił to z flagi `isHomePlanet`, ' +
    'w momencie, w którym własność jeszcze nie istnieje)');
  assert(window.KOSMOS.factorySystem === null && window.KOSMOS.prosperitySystem === null,
    'T6 SEDNO 2: koniec wiązania „dwa z pięciu" — `restore` nie dotyka `window.KOSMOS` ' +
    '(inwariant `switchActiveColony`: pięć wskaźników rusza się RAZEM albo wcale)');

  cm.resolveActiveColonyAfterRestore();
  assert(cm.activePlanetId != null && window.KOSMOS.factorySystem != null,
    'T6 KONTROLA PINU: wybór po relinku wiąże komplet — pin mierzy PRZENIESIENIE, nie usunięcie funkcji');
}

// ── T7 — inwariant „pięć razem" ────────────────────────────────────────────────────────────
console.log('T7 — po wyborze wszystkie wskaźniki opisują JEDNĄ kolonię');
{
  const { cm, home } = boot();
  const body = freeBody(cm, home.systemId, home.id);
  const second = cm.createColony(body.id, { Fe: 50 }, 8, 0);
  cm.switchActiveColony(second.planetId);
  roundTrip(cm);
  cm.resolveActiveColonyAfterRestore();

  const col = cm.getColony(cm.activePlanetId);
  const K = window.KOSMOS;
  assert(!!col
    && K.resourceSystem === col.resourceSystem
    && K.civSystem === col.civSystem
    && K.buildingSystem === col.buildingSystem
    && K.factorySystem === col.factorySystem
    && K.prosperitySystem === col.prosperitySystem,
    'T7 SEDNO: pięć wskaźników `window.KOSMOS` wskazuje podsystemy TEJ SAMEJ koloni ' +
    '(Faza 3 BUG 2: rozjazd dawał satysfakcję jednej koloni obok prosperity innej)');
}

// ── T9 — dwa podpisane rozstrzygnięcia, które inaczej nie miałyby żadnego pinu ─────────────
console.log('T9 — drabina PREFERUJE dom; ex-dom przestaje być niezniszczalny');
{
  // (a) RUNG 1: dom wygrywa z „pierwszą lepszą kolonią gracza", a nie tylko z kolejnością wstawiania.
  //     Bez przetasowania mapy ten pin byłby POZORNY — dom i tak jest pierwszy w `_colonies`.
  const { cm, home } = boot();
  const b1 = freeBody(cm, home.systemId, home.id);
  const other = cm.createColony(b1.id, { Fe: 50 }, 8, 0);

  const entries = [...cm._colonies.entries()];
  cm._colonies = new Map([
    ...entries.filter(([k]) => k !== home.id),
    ...entries.filter(([k]) => k === home.id),     // dom CELOWO na końcu iteracji
  ]);

  assert(cm._pickFallbackActiveColony(null) === home.id,
    'T9a: drabina wybiera PLANETĘ MACIERZYSTĄ, choć w iteracji jest ostatnia — rung 1 jest realny, ' +
    'a nie artefaktem kolejności wstawiania (`find` zwróciłby wtedy inną kolonię)');
  assert(cm._pickFallbackActiveColony(home.id) === other.planetId,
    'T9a KONTROLA PINU: z wykluczonym domem drabina schodzi na rung 2 (dowolna kolonia GRACZA)');
}
{
  // (b) P0-C — PODPISANY SKUTEK UBOCZNY: ex-dom przestaje być niezniszczalny.
  //     `removeColony` ma wczesny powrót `if (colony.isHomePlanet) return;`, więc dopóki flaga
  //     zostawała na zdobyczy, ciało wroga było NIEUSUWALNE. To było w podpisie jako świadomy skutek.
  const { cm, home } = boot();
  cm.transferColony(home.id, EMP, 'probe');
  cm.removeColony(home.id, 'probe_collision');

  assert(cm.getColony(home.id) == null,
    'T9b: ex-dom w rękach wroga DA SIĘ zniszczyć — zdjęcie `isHomePlanet` otwiera wczesny powrót ' +
    'w `removeColony` (podpisany skutek uboczny P0-C, nie odkrycie przy gate’cie)');
}
{
  // KONTROLA PINU — ŻYWA stolica gracza pozostaje niezniszczalna (nie zdjęliśmy ochrony wszystkim).
  const { cm, home } = boot();
  cm.removeColony(home.id, 'probe_collision');
  assert(cm.getColony(home.id) != null,
    'T9b KONTROLA PINU: stolica GRACZA nadal chroniona wczesnym powrotem — zmiana dotyczy tylko ciał, ' +
    'które przestały być stolicą');
}

// ── T8 — pin źródłowy: GameScene naprawdę woła wybór, i to poza `if (homePlanetId)` ────────
console.log('T8 — PIN ŹRÓDŁOWY: `GameScene` woła wybór i robi to bezwarunkowo');
{
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');

  // ⚠ KOMENTARZE ZDEJMOWANE PRZED SZUKANIEM (memory `source-pin-strip-comments`) — inaczej pin
  //   łapie własne wyjaśnienie zostawione obok kodu.
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const scene = stripComments(readFileSync(join(SRC, 'scenes', 'GameScene.js'), 'utf8'));

  assert(/resolveActiveColonyAfterRestore\s*\(\s*\)/.test(scene),
    'T8 SEDNO: `GameScene` woła `resolveActiveColonyAfterRestore()` — bez tego cała naprawa jest ' +
    'martwym kodem, a keeper mierzyłby metodę, której produkt nigdy nie uruchamia');

  // ⚠ T8 SEDNO 2 — INWARIANT, NA KTÓRYM STOI CAŁE P0-A: wybór MUSI biec PO relinku własności.
  //   `ColonyManager.restore` nie odtwarza `ownerEmpireId` (P0-B=W1 — własność wyprowadzana),
  //   więc przed relinkiem KAŻDA kolonia czyta się jako kolonia gracza i drabina wybrałaby
  //   zdobycz wroga. ZMIERZONE w przeglądzie: przeniesienie wywołania tuż za
  //   `colonyManager.restore(...)` (naturalna „upraszczająca" refaktoryzacja) odtwarza defekt §6
  //   W CAŁOŚCI, a oba keepery zostają ZIELONE — bo obydwa same narzucają sobie właściwą
  //   kolejność w helperze. Dlatego kolejność musi być pinowana ŹRÓDŁOWO, nie zachowaniem.
  //   Wzór pinu kolejnościowego: `director_station_seed_smoke.mjs:70`.
  //   (To jest dosłownie lekcja W3: „keeper musi pinować SPOSÓB SKŁADANIA SCENY".)
  const iRelink  = scene.indexOf('relinkColoniesAfterRestore');
  const iResolve = scene.indexOf('resolveActiveColonyAfterRestore');
  assert(iRelink >= 0 && iResolve > iRelink,
    'T8 SEDNO 2: wybór aktywnej koloni stoi PO `relinkColoniesAfterRestore` — przed relinkiem ' +
    'własność jeszcze nie istnieje i drabina oddałaby graczowi kolonię wroga');

  // Wybór nie może wrócić pod `if (homePlanetId)`.
  // ⚠ SPROSTOWANIE (przegląd adwersarialny): pierwotne uzasadnienie tego pinu było FAŁSZYWE.
  //   Twierdziło, że gracz po utracie wszystkiego „nie ma `homePlanetId` w zapisie". Zmierzone
  //   inaczej: `SaveSystem.js:180` zapisuje `window.KOSMOS.homePlanet?.id`, a tej referencji NIC
  //   nie czyści przy utracie (trzej pisarze: `GameScene:382/2067/3754`) — więc stara bramka BYŁA
  //   wchodzona, a defekt siedział w uzbrajaniu z `isHomePlanet` i w `if (homeCol)`.
  //   Wyjęcie spod bramki jest UTWARDZENIEM: wybór przestaje zależeć od referencji, której nikt
  //   nie utrzymuje. Pin zostaje — ale opisuje teraz prawdę.
  // ⚠ Zakres celowo SZEROKI (dawny wariant z oknem 80 znaków przepuszczał każde wstawione
  //   zdanie między deklaracją a ponownym `if`).
  const iDecl = scene.indexOf('const homePlanetId');
  const seg = (iDecl >= 0 && iResolve > iDecl) ? scene.slice(iDecl, iResolve) : '';
  assert(iDecl >= 0 && iResolve > iDecl && !/if\s*\(\s*homePlanetId\s*\)/.test(seg),
    'T8 SEDNO 2b: między deklaracją `homePlanetId` a wyborem NIE MA bramki `if (homePlanetId)` — ' +
    'wybór jest bezwarunkowy, więc działa też dla zapisu bez żywej referencji domu');

  assert(!/window\.KOSMOS\.resourceSystem\s*=\s*homeCol\./.test(scene),
    'T8 SEDNO 3: zniknęło ręczne przepisywanie wskaźników z `homeCol` — jedynym pisarzem jest ' +
    '`switchActiveColony` wewnątrz drabiny');

  // KONTROLA PINU — plik naprawdę został wczytany i ma spodziewaną treść.
  assert(/relinkColoniesAfterRestore/.test(scene) && scene.length > 10000,
    'T8 KONTROLA PINU: `GameScene.js` wczytany i zawiera relink (pin nie przechodzi na pustym pliku)');
}

console.log(`\n${fail === 0 ? '✅' : '❌'} colony_ownership_load: ${pass} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
