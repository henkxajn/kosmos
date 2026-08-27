// Finding 155 — keeper: ZWYCIĘZCA Z UCZESTNIKÓW, NIE Z RÓL WOJNY.
// Plan: docs/design/BATTLE_NARRATION_PLAN.md.
//
// PO CO: `GameScene:2398-2402` (ścieżka A, brana ZAWSZE gdy `warId` jest ustawione) mapowało
// literę wyniku na nazwy wzięte z REKORDU WOJNY (`war.aggressor === 'player' ? 'Gracz' : …`),
// czyli zakładało `A = agresor wojny`. Nic tego nie gwarantuje: `recordBattle` kopiuje
// `participantA/B` dosłownie, a `EnemyAttackHandler` ZAWSZE stawia wroga jako `A`.
// ⇒ ZAOBSERWOWANE NA ŻYWO (GATE B2): trzy rajdery zestrzelone przez obronę stolicy, a Dziennik
// napisał „Zwycięzca: Liga Spalonej Drogi". Drugi wariant tego samego: `playerSide` liczone jako
// `participantB?.type === 'player' ? 'B' : 'A'` DEGENERUJE się do `'A'` dla bitew deep-space,
// bo tam OBAJ uczestnicy mają `type: 'vessel_group'`.
//
// ⚠ GRANICA DOWODU: `GameScene.js` NIE IMPORTUJE SIĘ pod node (stub `three` celowo nie wystawia
//   `TextureLoader` — patrz COLONY_OWNERSHIP_GUARD_PLAN §Dyscypliny). Dlatego cała matematyka
//   mieszka w czystym `utils/BattleSides.js` i jest tu pinowana WYKONANIEM, a WPIĘCIE w scenę —
//   pinem ŹRÓDŁOWYM ze zdejmowaniem komentarzy i własną kontrolą pinu.
//
//   T1  tabela kształtów uczestnika × kto jest graczem (DSCS/VCS, EAH, stary zapis bez
//       `empireId`, abstrakcja, empire↔empire)
//   T2  ⚠ PRZYPADEK Z GATE'U B2 + KONTROLA PINU: stara matematyka na TEJ SAMEJ próbce daje
//       ZŁĄ odpowiedź (inaczej fixture niczego nie różnicuje)
//   T3  nazwy: rejestr → `label` → surowe `empireId` → etykieta nieznanego
//   T4  NIE ZGADUJEMY: brak gracza / gracz po obu stronach ⇒ `playerSide === null`
//   T5  D5 — `WarSystem._hasPlayerSide` deleguje do kanonu i zachowuje semantykę
//   T6  pin ŹRÓDŁOWY wpięcia w `GameScene` (obie ścieżki + D4 + i18n) z kontrolą pinu

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isPlayerParticipant, participantName, resolveBattleSides, battleWinnerName,
} from '../../utils/BattleSides.js';
import { WarSystem } from '../../systems/WarSystem.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// Rejestr-atrapa w kształcie `EmpireRegistry` (tylko `get`).
const REG = { get: (id) => (id === 'emp_001' ? { name: 'Liga Spalonej Drogi', archetype: 'hegemon' } : null) };
const LABELS = { registry: REG, playerLabel: 'Gracz', unknownLabel: 'Obcy' };

// Kształty uczestników spotykane w produkcji.
const P = {
  playerGroup: { type: 'vessel_group', empireId: 'player', vesselIds: ['v_1'], label: 'Gracz' },
  enemyGroup:  { type: 'vessel_group', empireId: 'emp_001', vesselIds: ['v_2'], label: 'Rajderzy' },
  playerEah:   { type: 'player', empireId: 'player', systemId: 'sys_home' },
  playerLegacy:{ type: 'player' },                       // stary zapis: BEZ empireId (sprzed W3-7)
  empireAbstr: { type: 'empire', empireId: 'emp_001', fleetId: 'f_1' },
  otherGroup:  { type: 'vessel_group', empireId: 'emp_002', vesselIds: ['v_3'] },
};
const battle = (pA, pB, winner, extra = {}) => ({ participantA: pA, participantB: pB, winner, ...extra });

// ── T1 — tabela kształtów ───────────────────────────────────────────────────
console.log('T1 — gracz rozpoznany w KAŻDYM kształcie uczestnika');
{
  const cases = [
    ['DSCS/VCS, gracz jako A', battle(P.playerGroup, P.enemyGroup, 'A'), 'A', true],
    ['DSCS/VCS, gracz jako B', battle(P.enemyGroup, P.playerGroup, 'B'), 'B', true],
    ['EAH (type=player+empireId)', battle(P.enemyGroup, P.playerEah, 'B'), 'B', true],
    ['stary zapis (type=player BEZ empireId)', battle(P.enemyGroup, P.playerLegacy, 'A'), 'B', true],
    ['abstrakcja (empire vs player)', battle(P.empireAbstr, P.playerEah, 'A'), 'B', true],
    ['empire ↔ empire (bez gracza)', battle(P.enemyGroup, P.otherGroup, 'A'), null, false],
  ];
  for (const [label, rec, expectSide, expectInvolved] of cases) {
    const s = resolveBattleSides(rec, LABELS);
    assert(s.playerSide === expectSide && s.playerInvolved === expectInvolved,
      `T1: ${label} → playerSide=${JSON.stringify(s.playerSide)}, udział=${s.playerInvolved}`);
  }
  assert(isPlayerParticipant(P.playerLegacy) && !isPlayerParticipant(P.enemyGroup),
    'T1: predykat pyta o OBA znaczniki — `type` ORAZ `empireId` (klasa defektu S25)');
}

// ── T2 — przypadek z gate'u B2 + kontrola pinu ──────────────────────────────
console.log('T2 — ⚠ PRZYPADEK Z ŻYWEJ GRY: gracz AGRESOREM wojny, wróg jako participantA');
{
  // Wojna: agresorem jest GRACZ. Bitwa: rajdery `emp_001` (A) vs obrona stolicy (B). Wygrał gracz.
  const war = { aggressor: 'player', defender: 'emp_001' };
  const rec = battle(P.enemyGroup, P.playerEah, 'B', { retreated: 'A', lossesA: 3, lossesB: 0 });

  const sides = resolveBattleSides(rec, LABELS);
  assert(battleWinnerName(rec, sides) === 'Gracz',
    `T2: zwycięzcą jest GRACZ (${battleWinnerName(rec, sides)}) — tak brzmiała prawda o tej walce`);
  assert(sides.playerSide === 'B',
    `T2: …a gracz stoi po stronie B (${sides.playerSide}), więc adnotacja o odwrocie wskaże WROGA`);

  // ⚠ KONTROLA PINU — stara matematyka na TEJ SAMEJ próbce. Bez tego fixture nie dowodzi
  //   niczego: przechodziłby także wtedy, gdyby defekt nigdy nie istniał.
  const legacyAName = war.aggressor === 'player' ? 'Gracz' : (REG.get(war.aggressor)?.name ?? war.aggressor);
  const legacyDName = war.defender  === 'player' ? 'Gracz' : (REG.get(war.defender)?.name  ?? war.defender);
  const legacyWinner = rec.winner === 'A' ? legacyAName : rec.winner === 'B' ? legacyDName : '—';
  assert(legacyWinner === 'Liga Spalonej Drogi',
    `T2: KONTROLA PINU — stara matematyka mówi „${legacyWinner}" (zwycięstwo WROGA) na tej samej bitwie`);

  // Drugi wariant: bitwa deep-space, gracz jako B. Stare `playerSide` degeneruje do 'A'.
  const ds = battle(P.enemyGroup, P.playerGroup, 'B');
  const legacySide = ds.participantB?.type === 'player' ? 'B' : 'A';
  const dsSides = resolveBattleSides(ds, LABELS);
  assert(legacySide === 'A' && dsSides.playerSide === 'B',
    `T2: KONTROLA PINU — dla deep-space stare playerSide=${legacySide} (degeneracja), nowe=${dsSides.playerSide}`);
  assert((ds.winner === legacySide) === false && (ds.winner === dsSides.playerSide) === true,
    'T2: …czyli ta sama wygrana była raportowana jako PORAŻKA gracza');
}

// ── T3 — nazwy stron ────────────────────────────────────────────────────────
console.log('T3 — nazwa strony: rejestr → label → empireId → etykieta nieznanego');
{
  assert(participantName(P.enemyGroup, LABELS) === 'Liga Spalonej Drogi', 'T3: nazwa z rejestru imperiów');
  assert(participantName(P.otherGroup, LABELS) === 'emp_002',
    'T3: brak w rejestrze i brak label → surowe empireId (zamiast cichego „Obcy")');
  assert(participantName({ type: 'vessel_group', empireId: 'emp_9', label: 'Rajderzy' }, LABELS) === 'Rajderzy',
    'T3: brak w rejestrze, ale jest label → label');
  assert(participantName(null, LABELS) === 'Obcy', 'T3: brak uczestnika → etykieta nieznanego');
  assert(participantName(P.playerGroup, LABELS) === 'Gracz',
    'T3: gracz ma etykietę gracza, mimo że niesie własny `label`');
}

// ── T4 — nie zgadujemy ──────────────────────────────────────────────────────
console.log('T4 — brak przypisania ⇒ null, nigdy domysł');
{
  const none = resolveBattleSides(battle(P.enemyGroup, P.otherGroup, 'A'), LABELS);
  assert(none.playerSide === null && none.playerInvolved === false,
    'T4: bitwa bez gracza → playerSide null (a nie „A")');
  const both = resolveBattleSides(battle(P.playerGroup, P.playerEah, 'A'), LABELS);
  assert(both.playerSide === null && both.playerInvolved === true,
    'T4: gracz po OBU stronach (kształt niemożliwy) → null, nie rzut monetą');
  const empty = resolveBattleSides(null, LABELS);
  assert(empty.playerSide === null && empty.playerInvolved === false && empty.sideAName === 'Obcy',
    'T4: brak rekordu nie wywraca narracji');
  assert(battleWinnerName(battle(P.playerGroup, P.enemyGroup, 'draw'), none) === '—',
    'T4: remis ma własną etykietę, nie nazwę strony');
}

// ── T5 — D5: kanon w WarSystem ──────────────────────────────────────────────
console.log('T5 — D5: `WarSystem._hasPlayerSide` deleguje do kanonu, semantyka bez zmian');
{
  // Prototyp, nie instancja — metoda nie używa `this`, a konstruktor subskrybuje EventBus.
  const has = (rec) => WarSystem.prototype._hasPlayerSide.call({}, rec);
  assert(has(battle(P.enemyGroup, P.playerEah, 'A')) === true, 'T5: kształt EAH → gracz wykryty');
  assert(has(battle(P.playerGroup, P.enemyGroup, 'A')) === true, 'T5: kształt DSCS → gracz wykryty');
  assert(has(battle(P.enemyGroup, P.playerLegacy, 'A')) === true, 'T5: stary zapis bez empireId → wykryty');
  assert(has(battle(P.enemyGroup, P.otherGroup, 'A')) === false, 'T5: empire↔empire → brak gracza');

  const src = readFileSync(new URL('../../systems/WarSystem.js', import.meta.url), 'utf8');
  assert(/_hasPlayerSide\s*\([^)]*\)\s*\{[^}]*isPlayerParticipant/.test(src),
    'T5: …i robi to przez KANON, nie własną kopię predykatu');
}

// ── T6 — pin ŹRÓDŁOWY wpięcia w GameScene ───────────────────────────────────
console.log('T6 — pin ŹRÓDŁOWY: scena liczy tożsamość kanonem, a nie rolami wojny');
{
  // ⚠ KOMENTARZE ZDEJMOWANE PRZED SZUKANIEM (memory `source-pin-strip-comments`) — inaczej pin
  //   łapie własne wyjaśnienie zostawione w kodzie po usunięciu starej matematyki.
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const raw   = readFileSync(join(SRC, 'scenes', 'GameScene.js'), 'utf8');
  const scene = stripComments(raw);

  // KONTROLA PINU dla samego strippera — bez niej „nie znaleziono" nie odróżnia naprawy od
  // zepsutego wyrażenia regularnego.
  assert(raw.includes('Finding 155') && !scene.includes('Finding 155'),
    'T6: KONTROLA PINU — stripComments faktycznie zdejmuje komentarze…');
  assert(scene.includes('resolveBattleSides'),
    'T6: …a treści kodu nie zjada');

  const calls = (scene.match(/resolveBattleSides\s*\(/g) ?? []).length;
  assert(calls === 2,
    `T6: OBA listenery bitwy liczą strony kanonem (${calls} wywołania — kino + Dziennik)`);
  assert(!/aggressorName\s*:\s*war\.aggressor|war\.aggressor\s*===\s*'player'\s*\?\s*'Gracz'/.test(scene),
    'T6: nazwy stron NIE pochodzą już z ról wojny');
  assert(!/participantB\?\.\s*type\s*===\s*'player'\s*\?\s*'B'\s*:\s*'A'/.test(scene),
    'T6: zdegenerowane playerSide (`participantB.type === player ? B : A`) ZNIKŁO z obu listenerów');
  assert(/battleWinnerName\s*\(/.test(scene),
    'T6: etykieta zwycięzcy idzie przez kanon (mapowanie litery na stronę)');
  // D4 — adnotacja o odwrocie tylko przy znanej stronie gracza.
  assert(/playerInvolved\s*&&\s*sides\.playerSide\s*&&\s*result\.retreated/.test(scene),
    'T6: D4 — adnotacja o odwrocie bramkowana znaną stroną gracza');
  // D3 — linia Dziennika przez i18n, z zachowanym językowo neutralnym uchwytem ⚔.
  assert(/t\(\s*'log\.battleLine'/.test(scene),
    'T6: D3 — linia bitwy idzie przez i18n, nie przez zahardkodowany polski');
  const pl = readFileSync(join(SRC, 'i18n', 'pl.js'), 'utf8');
  const en = readFileSync(join(SRC, 'i18n', 'en.js'), 'utf8');
  assert(/'log\.battleLine':\s*'⚔/.test(pl) && /'log\.battleLine':\s*'⚔/.test(en),
    'T6: …a prefiks ⚔ zostaje w OBU językach (językowo neutralny uchwyt filtra na gate\'cie)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
