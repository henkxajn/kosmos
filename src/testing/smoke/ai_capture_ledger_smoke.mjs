// AI CAPTURE — księga kampanii: jedna kampania na ciało (commit AC-7, D4).
//
// PO CO: identyfikator rekordu inwazji zawierał UŁAMKOWY `gameTime`, więc druga fala desantu na
// to samo ciało prawie zawsze zakładała DRUGI aktywny rekord. Zmierzone skutki (audyt): oba
// rekordy przechodziły warunek przejęcia, `transferColony` wykonywało się DWA RAZY — drugi raz
// jako fałszywy przerzut **AI→AI** na koloni, którą agresor już miał — a `colony:captured` szło
// w świat podwójnie. Gracz tego nie widział WYŁĄCZNIE dzięki bramce u odbiorcy
// (`GameScene`: `previousOwner === 'player'`), czyli zdarzenie było fałszywe, tylko dobrze schowane.
// Ten slice ZWIĘKSZA częstość zdarzenia (gdy AI zaczyna domykać podboje, fal jest więcej), więc
// guard wchodzi tutaj, a nie „kiedyś".
//
//   T1  Dwie fale na to samo ciało = JEDEN rekord (a nie dwa), z SUMĄ wylądowanych jednostek.
//   T2  …i dokładnie JEDNO `colony:captured`.
//   T3  REAKTYWACJA: rekord zgaszony jako `defenders_repelled` wraca do `active:true` przy
//       kolejnej fali. Bez tego druga fala dawała desant, którego NIKT nie rozlicza —
//       `_tickCaptureChecks` iteruje wyłącznie `listActive()`.
//   T4  Idempotencja u ŹRÓDŁA: `transferColony` na koloni, którą agresor JUŻ ma, zwraca `false`
//       i NIE emituje drugiego `colony:captured`.
//       KONTROLA PINU: przerzut do INNEGO imperium dalej działa (guard nie jest kłódką na wszystko).
//   T5  KONTROLA PINU: rekord INNEGO agresora na tym samym ciele NIE jest reużywany — dwa
//       imperia lądujące na jednym ciele to dwie osobne kampanie.
//
// Uruchom: node src/testing/smoke/ai_capture_ledger_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import { Ticker } from '../headless/Ticker.js';
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const EMP = 'emp_001';
const OTHER = 'emp_002';

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  const home = window.KOSMOS.homePlanet;
  const colony = core.colonyManager.getColony(home.id);
  for (const t of colony.grid?.toArray?.() ?? []) if (t) t.owner = 'player';
  return {
    core, home, colony,
    cm: core.colonyManager,
    gum: core.groundUnitManager,
    inv: core.invasionSystem,
    tick: (y) => new Ticker(core.timeSystem).run(y, { tickSize: 1.0, stopOnCrash: true }),
  };
}
const capitalOf = (c) => c.grid.toArray().filter(Boolean).find(t => t.capitalBase);
const recordsFor = (planetId) =>
  Object.values(gameState.get('invasions') ?? {}).filter(i => i.planetId === planetId);

// ── T1 + T2 — dwie fale, jedna kampania, jedno ogłoszenie ───────────────────────────────────
console.log('T1+T2 — dwie fale na to samo ciało: JEDEN rekord i JEDNO `colony:captured`');
{
  const { colony, home, inv, tick } = boot();
  const cap = capitalOf(colony);

  const w1 = inv.launchInvasion(EMP, home.id, 2);
  // ⚠ Druga fala PO upływie czasu — do AC-7 to gwarantowało inny `invId` (ułamkowy `gameTime`).
  tick(3);
  const w2 = inv.launchInvasion(EMP, home.id, 2);
  assert(w1?.success && w2?.success, 'T1: obie fale wylądowały (przesłanka)');

  const recs = recordsFor(home.id);
  assert(recs.length === 1,
    `T1 SEDNO: w księdze jest JEDNA kampania (${recs.length}), mimo dwóch fal rozdzielonych ` +
    'czasem. Przed AC-7 powstawały dwa rekordy, bo id zawierało ułamkowy `gameTime`');
  assert((recs[0]?.landedTroops?.length ?? 0) === 4,
    `T1: …i niesie SUMĘ wylądowanych jednostek (${recs[0]?.landedTroops?.length}/4) — druga fala ` +
    'dopisuje się do kampanii, a nie zakłada własnej');

  const captured = [];
  EventBus.on('colony:captured', (e) => captured.push(e));
  cap.owner = EMP;
  tick(4);

  assert(colony.ownerEmpireId === EMP, 'T2: kolonia przeszła w ręce agresora (przesłanka)');
  assert(captured.length === 1,
    `T2 SEDNO: \`colony:captured\` poleciało DOKŁADNIE RAZ (${captured.length}). Przed AC-7 przy ` +
    'dwóch rekordach leciało dwa razy — drugie ogłoszenie było przerzutem AI→AI na koloni, którą ' +
    'agresor już miał, i przechodziło niezauważone tylko dzięki bramce u ODBIORCY');
  assert(captured[0]?.previousOwner === 'player',
    `T2: …i to jedno ogłoszenie mówi prawdę o poprzednim właścicielu (\`${captured[0]?.previousOwner}\`)`);
}

// ── T3 — reaktywacja zgaszonej kampanii ─────────────────────────────────────────────────────
console.log('T3 — druga fala po `defenders_repelled` REAKTYWUJE rekord (a nie tworzy sieroty)');
{
  const { home, gum, inv, tick } = boot();
  const w1 = inv.launchInvasion(EMP, home.id, 2);
  for (const id of w1.landed) gum.removeUnit(id);      // obrona odparta
  tick(3);

  let rec = recordsFor(home.id)[0];
  assert(rec?.active === false && rec?.endReason === 'defenders_repelled',
    `T3: kampania zgasła jako \`${rec?.endReason}\` (przesłanka)`);

  inv.launchInvasion(EMP, home.id, 2);                 // druga fala
  rec = recordsFor(home.id)[0];

  assert(recordsFor(home.id).length === 1,
    'T3: nadal JEDEN rekord — druga fala nie zakłada drugiej kampanii');
  assert(rec?.active === true && !rec?.endReason && rec?.reactivatedYear != null,
    `T3 SEDNO: rekord WRÓCIŁ do żywych (active=${rec?.active}, endReason=${rec?.endReason ?? 'brak'}, ` +
    `reaktywacja w ${rec?.reactivatedYear}). Przed AC-7 reuse NIE przywracał \`active\`, więc druga ` +
    'fala dawała desant, którego nikt nigdy nie rozliczał — `_tickCaptureChecks` iteruje `listActive()`');
  assert((rec?.landedTroops?.length ?? 0) === 4,
    `T3: …i księga pamięta obie fale (${rec?.landedTroops?.length}/4)`);
}

// ── T4 — idempotencja u źródła ──────────────────────────────────────────────────────────────
console.log('T4 — `transferColony` na koloni, którą agresor JUŻ ma, jest no-opem');
{
  const { colony, home, cm } = boot();
  const captured = [];
  EventBus.on('colony:captured', (e) => captured.push(e));

  const first = cm.transferColony(home.id, EMP, 'invasion');
  assert(first === true && colony.ownerEmpireId === EMP, 'T4: pierwszy przerzut przechodzi (przesłanka)');
  assert(captured.length === 1, 'T4: …i ogłasza się raz');

  const second = cm.transferColony(home.id, EMP, 'invasion');
  assert(second === false,
    'T4 SEDNO: DRUGI przerzut do tego samego właściciela zwraca `false` — guard idempotencji, ' +
    'lustro tego, co `captureColonyForPlayer` miało od zawsze');
  assert(captured.length === 1,
    `T4 SEDNO 2: …i NIE emituje drugiego \`colony:captured\` (${captured.length}). Przed AC-7 szło ` +
    'zdarzenie z `previousOwner` = imperium, czyli fałszywy przerzut AI→AI');

  // KONTROLA PINU — guard blokuje TYLKO powtórkę, nie każdy przerzut.
  const third = cm.transferColony(home.id, OTHER, 'invasion');
  assert(third === true && colony.ownerEmpireId === OTHER,
    `T4 KONTROLA PINU: przerzut do INNEGO imperium dalej działa (${colony.ownerEmpireId}) — ` +
    'to guard na powtórkę, nie kłódka na mechanikę');
}

// ── T5 — dwa imperia na jednym ciele to dwie kampanie ───────────────────────────────────────
console.log('T5 KONTROLA PINU — rekord INNEGO agresora nie jest reużywany');
{
  const { home, inv } = boot();
  inv.launchInvasion(EMP, home.id, 2);
  inv.launchInvasion(OTHER, home.id, 2);

  const recs = recordsFor(home.id);
  assert(recs.length === 2 && new Set(recs.map(r => r.aggressor)).size === 2,
    `T5: dwa imperia lądujące na tym samym ciele mają DWIE osobne kampanie ` +
    `(${recs.map(r => r.aggressor).join(', ')}) — scalanie po samym \`planetId\` zlałoby ` +
    'cudzy desant w jeden rekord i zgubiłoby, kto właściwie atakuje');
  assert(recs.every(r => (r.landedTroops?.length ?? 0) === 2),
    'T5: …każda ze swoimi jednostkami (2 i 2), bez mieszania');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
