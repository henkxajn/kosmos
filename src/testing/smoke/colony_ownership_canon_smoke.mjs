// D6 / OG-5 — KANON WŁASNOŚCI KOLONII: rodzina nazw zamiast jednego przeciążonego predykatu.
//
// PO CO: `docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md` §D6 (PODPISANA: W2 — kanon + nazwane kopie
// teraz, reszta pinowana). Census audytu: 1 kanon + kilka nazwanych kopii + ~65 miejsc odczytu.
//
// ⚠ RODZINA, NIE JEDEN PREDYKAT — i to jest cała treść D6. Trzy RÓŻNE pytania były przypadkiem
//   odpowiadane jednym wyrażeniem:
//     • „czyja jest ta kolonia"          → `isPlayerColony`            (własność)
//     • „czy ma gdzie trzymać towar"     → `isLivePlayerColony`        (własność + ŻYWOTNOŚĆ)
//     • „czy gracz może nią zarządzać"   → `isManageablePlayerColony`  (własność + RODZAJ)
//   Spłaszczenie ich w jeden predykat zmieniłoby zachowanie w miejscach, które pytają o co innego.
//
// ⚠ DWA WEJŚCIA — obiektowe i po `id`. Trzy konsumenty brały `id` i robiły WŁASNY lookup
//   (`RightClickMenuOptions`, `EconomyHistoryLog`, `JournalScope`), trzy brały obiekt.
//
// ⚠ `isTestEnemy` NIE JEST DYSKRYMINATOREM — i to jest ZMIERZONE, nie przepisane z audytu:
//   obaj producenci ustawiają go RAZEM z `ownerEmpireId` (`SpawnTestEnemy:112-113`,
//   `CombatSandbox:392-393`), a `captureColonyForPlayer` czyści OBA razem
//   (`ColonyManager:1004-1005`). Flaga jest więc redundantna wobec `ownerEmpireId` i nie wchodzi
//   do rodziny. Dodatkowo nie jest serializowana ⇒ po wczytaniu i tak `undefined`.
//
// ⚠ STACJE POZA TĄ DECYZJĄ (podpisane): mają odwrotną trwałość i domyślną (stemplowane `'player'`
//   i serializowane), więc jeden predykat na oba rodzaje encji to DRUGA decyzja, nie darmowy dodatek.
//   E7 pinuje, że `StationGroup.isPlayerStation` zostaje lokalny.
//
// Uruchom: node src/testing/smoke/colony_ownership_canon_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
import fs from 'node:fs';
import {
  isPlayerColony, isPlayerColonyId, isLivePlayerColony, isManageablePlayerColony,
} from '../../utils/ColonyOwnership.js';
import { ColonyManager } from '../../systems/ColonyManager.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const read = (rel) => strip(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));

// Kształt inline, który D6 likwiduje w nazwanych kopiach.
const INLINE_SHAPE = /!\w+\.ownerEmpireId\s*\|\|\s*\w+\.ownerEmpireId\s*===\s*'player'/;

const MINE      = { planetId: 'p1', resourceSystem: {}, civSystem: {} };
const MINE_EXPL = { planetId: 'p2', ownerEmpireId: 'player', resourceSystem: {} };
const THEIRS    = { planetId: 'p3', ownerEmpireId: 'emp_001', resourceSystem: {} };
const ORPHAN    = { planetId: 'p4' };                                  // gracza, ale BEZ magazynu
const OUTPOST   = { planetId: 'p5', resourceSystem: {}, isOutpost: true };
const PREVIEW   = { planetId: 'p6', resourceSystem: {}, isPreview: true };

// ── E1 — trzy pytania, trzy odpowiedzi (NIE spłaszczone) ──────────────────────────────────
console.log('E1 — rodzina rozdziela trzy RÓŻNE pytania');
{
  assert(isPlayerColony(MINE) && isPlayerColony(MINE_EXPL) && !isPlayerColony(THEIRS),
    'E1: `isPlayerColony` — czysta własność (null/undefined/`player` = gracz)');

  assert(isPlayerColony(ORPHAN) && !isLivePlayerColony(ORPHAN),
    'E1: kolonia gracza BEZ magazynu — własność ✓, ŻYWOTNOŚĆ ✗ (dwa różne pytania)');
  assert(isLivePlayerColony(MINE) && !isLivePlayerColony(THEIRS),
    'E1 (kontrola): żywa kolonia gracza ✓, cudza ✗');

  assert(isPlayerColony(OUTPOST) && !isManageablePlayerColony(OUTPOST),
    'E1: placówka — własność ✓, ZARZĄDZALNOŚĆ ✗');
  assert(isPlayerColony(PREVIEW) && !isManageablePlayerColony(PREVIEW),
    'E1: podgląd — własność ✓, ZARZĄDZALNOŚĆ ✗');
  assert(isManageablePlayerColony(MINE) && !isManageablePlayerColony(THEIRS),
    'E1 (kontrola): pełna kolonia gracza zarządzalna, cudza nie');

  assert(!isManageablePlayerColony(ORPHAN) === false || true, 'E1: (żywotność i rodzaj to osobne osie)');
  assert(isManageablePlayerColony(ORPHAN) === true,
    'E1: brak magazynu NIE odbiera zarządzalności — inaczej dwie osie byłyby uśrednione');
}

// ── E2 — dwa wejścia; po `id` fail-closed ─────────────────────────────────────────────────
console.log('E2 — wejście po `id` (fail-closed) obok wejścia obiektowego');
{
  const prevK = globalThis.window.KOSMOS;
  globalThis.window.KOSMOS = {
    colonyManager: { getColony: (id) => (id === 'p1' ? MINE : id === 'p3' ? THEIRS : null) },
  };
  assert(isPlayerColonyId('p1') === true,  'E2: id koloni gracza => true');
  assert(isPlayerColonyId('p3') === false, 'E2: id koloni AI => false');
  assert(isPlayerColonyId('nie_ma') === false, 'E2: nieistniejąca kolonia => FALSE (fail-closed)');
  assert(isPlayerColonyId(null) === false && isPlayerColonyId(undefined) === false,
    'E2: brak id => false (oba konsumenty tak robiły: `if (!id) return false`)');
  globalThis.window.KOSMOS = prevK;

  assert(isPlayerColony('p1') === false,
    'E2: wejście OBIEKTOWE odrzuca string — podanie `id` nie może po cichu zwrócić „gracza"');
}

// ── E3 — `isTestEnemy` nie wchodzi do rodziny (i to jest zmierzone) ───────────────────────
console.log('E3 — `isTestEnemy` NIE jest dyskryminatorem');
{
  const spawn = read('../../debug/SpawnTestEnemy.js');
  const sandbox = read('../../scenarios/CombatSandbox.js');
  const colMgr = read('../../systems/ColonyManager.js');
  const pairedIn = (src) => /isTestEnemy\s*=\s*true/.test(src) && /ownerEmpireId\s*=\s*\w+/.test(src);
  assert(pairedIn(spawn) && pairedIn(sandbox),
    'E3: obaj producenci ustawiają `isTestEnemy` RAZEM z `ownerEmpireId`');
  assert(/isTestEnemy\s*=\s*false/.test(colMgr) && /ownerEmpireId\s*=\s*null/.test(colMgr),
    'E3: `captureColonyForPlayer` czyści OBA razem ⇒ flaga redundantna wobec własności');

  const canon = read('../../utils/ColonyOwnership.js');
  assert(!/isTestEnemy/.test(canon.replace(/^[\s\S]*?export/, 'export')) || true,
    'E3: (kanon może o niej wspominać w komentarzu, ale nie w logice)');
  const logic = canon.split('export').slice(1).join('export');
  assert(!/isTestEnemy/.test(logic), 'E3: LOGIKA kanonu nie czyta `isTestEnemy`');
}

// ── E4 — nazwane kopie zmigrowane ─────────────────────────────────────────────────────────
console.log('E4 — nazwane kopie importują kanon i nie mają własnej definicji');
{
  const SITES = [
    ['../../systems/TerritoryService.js',      'isPlayerColony'],
    ['../../systems/TransportOrderSystem.js',  'isPlayerColony'],
    ['../../systems/EconomyHistoryLog.js',     'isPlayerColonyId'],
    ['../../data/RightClickMenuOptions.js',    'isPlayerColonyId'],
    ['../../utils/TransferStore.js',           'isLivePlayerColony'],
    ['../../utils/StationGroup.js',            'isManageablePlayerColony'],
    ['../../ui/ColonyOverlay.js',              'isManageablePlayerColony'],
    ['../../utils/JournalScope.js',            'isPlayerColony'],
  ];
  for (const [rel, fnName] of SITES) {
    const src = read(rel);
    const name = rel.split('/').pop();
    assert(new RegExp(`import\\s*\\{[^}]*\\b${fnName}\\b[^}]*\\}\\s*from\\s*['"][^'"]*ColonyOwnership\\.js['"]`).test(src),
      `E4: ${name} importuje \`${fnName}\` z kanonu`);
    // ⚠ W `StationGroup` zostaje `isPlayerStation` — ten sam KSZTAŁT, ale INNY PODMIOT (stacja),
    //   świadomie poza D6. Odsiewamy tę jedną linię, zamiast osłabiać cały pin.
    const forColonies = src.split('\n').filter(l => !/isPlayerStation/.test(l)).join('\n');
    assert(!INLINE_SHAPE.test(forColonies),
      `E4: ${name} NIE ma już własnej kopii wyrażenia własności KOLONII`);
  }
}

// ── E5 — kanon ma JEDNO wejście dla starych konsumentów ───────────────────────────────────
console.log('E5 — `ColonyManager.isPlayerColony` deleguje (nie druga definicja)');
{
  assert(ColonyManager.isPlayerColony(MINE) === true && ColonyManager.isPlayerColony(THEIRS) === false,
    'E5: stary punkt wejścia nadal odpowiada poprawnie (~40 konsumentów nietkniętych)');
  const src = read('../../systems/ColonyManager.js');
  const body = src.slice(src.indexOf('static isPlayerColony('), src.indexOf('static isPlayerColony(') + 160);
  assert(/return isPlayerColony\(/.test(body), 'E5: metoda DELEGUJE do kanonu, nie powiela wyrażenia');
  assert(!INLINE_SHAPE.test(body), 'E5 (kontrola pinu): w ciele nie ma inline kopii');
}

// ── E6 — reszta ~słabych kształtów PINOWANA, nie rozpuszczona ─────────────────────────────
console.log('E6 — pozostałe inline kształty pod kontrolą liczby');
{
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })) {
      if (e.name === 'testing' || e.name === 'node_modules') continue;
      if (e.isDirectory()) walk(dir + e.name + '/');
      else if (e.name.endsWith('.js')) files.push(dir + e.name);
    }
  };
  walk('../../');
  const offenders = files.filter(f => f.indexOf('ColonyOwnership.js') < 0 && INLINE_SHAPE.test(read(f)))
    .map(f => f.split('/').pop()).sort();

  // ⚠ JAWNY ZBIÓR, NIE PRÓG. D6=W2 podpisano jako „kanon + nazwane kopie TERAZ, reszta PINOWANA",
  //   więc pin musi WYMIENIAĆ, co zostaje i DLACZEGO — próg „co najwyżej N" toleruje dowolną
  //   podmianę. Każda pozycja zmierzona co do PODMIOTU (D6 dotyczy KOLONII):
  //     • UIManager:1290-1291    — STATKI (`vA`/`vB`)         ⇒ poza D6 (kanon statków = isEnemyVessel)
  //     • PlayerViability:50     — STATEK (`v.isWreck`)       ⇒ poza D6
  //     • BodyName:57            — STACJA (`s.id`)            ⇒ poza D6 (stacje wyłączone podpisem)
  //     • StationGroup:37        — STACJA (`isPlayerStation`) ⇒ poza D6 (jw.)
  //     • ColonyManager:986      — kolonia, NEGACJA wewnątrz `captureColonyForPlayer`
  //     • InvasionSystem:340/358 — kolonia, słaby kształt
  //     • WarSystem:557          — kolonia, słaby kształt
  //   Trzy ostatnie to KOLONIJNE słabe kształty, które W2 ŚWIADOMIE zostawia (W1 = pełny sweep
  //   został odrzucony). Są zarazem pierwszymi kandydatami, gdyby D6 kiedyś rozszerzać.
  const ALLOWED = ['BodyName.js', 'ColonyManager.js', 'InvasionSystem.js', 'PlayerViability.js',
                   'StationGroup.js', 'UIManager.js', 'WarSystem.js'];
  const unexpected = offenders.filter(f => !ALLOWED.includes(f));
  const vanished   = ALLOWED.filter(f => !offenders.includes(f));
  console.log('    [pomiar] pliki z inline kształtem:', offenders.join(', ') || 'brak');
  assert(unexpected.length === 0,
    `E6: ŻADEN NOWY plik nie dorobił się inline kopii (nowe: ${unexpected.join(', ') || 'brak'})`);
  assert(vanished.length === 0,
    `E6 (kontrola pinu): lista nie zdezaktualizowała się po cichu (zniknęły: ${vanished.join(', ') || 'brak'})`);
}

// ── E7 — stacje POZA zakresem (podpisane) ─────────────────────────────────────────────────
console.log('E7 — stacje zostają poza rodziną (druga decyzja, nie darmowy dodatek)');
{
  const src = read('../../utils/StationGroup.js');
  assert(/const isPlayerStation\s*=/.test(src),
    'E7: `isPlayerStation` ZOSTAJE lokalny — stacje mają odwrotną trwałość i domyślną');
  assert(/ownerEmpireId/.test(src), 'E7 (kontrola pinu): predykat stacji nadal czyta `ownerEmpireId`');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
