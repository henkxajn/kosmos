// W3 — keeper bramki własności na przylocie międzygwiezdnym (commit W3-5b, workstream B).
//
// PO CO: `MissionEventModal._onInterstellarArrived` ogłasza „DOTARŁEŚ do nowego układu"
// i dokłada darmowy przegląd celu (typ gwiazdy, liczba planet i księżyców, ile w strefie
// zamieszkiwalnej). Nie miał ŻADNEGO filtru właściciela, więc odpalał się także dla statku
// WROGA — z fałszywą treścią i z wyciekiem wywiadowczym omijającym warstwę intelu.
// Rodzina §Findings 22: konsument, który nigdy nie pyta, CZYJ jest ten stan.
//
// ⚠ DLACZEGO TERAZ, a nie w W3-7 (gdzie mieszka reszta widoczności): do W3-5 ta ścieżka była
//   praktycznie nieosiągalna — żaden AI nie skakał z własnej inicjatywy. Reguła wyboru celu
//   sprawia, że rajder skacze SAM, a ten modal **pauzuje grę**. Bez bramki KAŻDE uderzenie
//   zatrzymywałoby graczowi rozgrywkę kłamliwym komunikatem — czyli W3-5 dowoziłby regresję
//   rozgrywki razem z funkcją.
//
//   T1  statek WROGA nie otwiera popupu przylotu (bramka po `isEnemyVessel`)
//   T2  KONTROLA PINU: statek GRACZA dalej go otwiera — bramkujemy właściciela, nie funkcję
//   T3  pin źródłowy: bramka stoi PRZED zbieraniem danych o układzie (nie liczymy przeglądu,
//       którego i tak nie pokażemy — inaczej wyciek wróciłby przy pierwszym refaktorze)

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import { createVessel } from '../../entities/Vessel.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Import PO env.js — moduł dotyka DOM przy ładowaniu.
const MEM = await import('../../ui/MissionEventModal.js');

function mkVessel({ enemy = false, name = 'Statek' } = {}) {
  const v = createVessel('hull_frigate', 'entity_3', {
    name, modules: ['engine_warp', 'warp_tank'], x: 0, y: 0, systemId: 'sys_home',
  });
  if (enemy) { v.ownerEmpireId = 'emp_001'; v.owner = 'emp_001'; v.isEnemy = true; }
  return v;
}

// Obserwowalny skutek = PAUZA GRY. Popup przylotu jest pauzujący (`_showNext` emituje
// `time:pause` dla wpisu bez `noPause`), więc liczymy dokładnie tę szkodę, którą opisuje
// znalezisko: przerwaną rozgrywkę gracza.
let pauses = 0;
EventBus.on("time:pause", () => { pauses++; });

// ── T1/T2 — bramka właściciela ──────────────────────────────────────────────
console.log('T1/T2 — przylot WROGA nie otwiera popupu; przylot GRACZA otwiera');
{
  MEM.initMissionEvents();

  const before = pauses;
  EventBus.emit('interstellar:arrived', {
    vessel: mkVessel({ enemy: true, name: 'Rajder AI' }),
    systemId: 'sys_026', star: { spectralType: 'G' }, targetName: 'Obcy układ',
  });
  const afterEnemy = pauses;
  assert(afterEnemy === before,
    `T1 SEDNO: przylot WROGIEGO statku NIE pauzuje gry (${before} → ${afterEnemy}). ` +
    'Bez bramki gracz dostawał modal „dotarłeś do nowego układu" — z cudzego przylotu, ' +
    'z pauzą gry i z darmowym przeglądem układu, który powinien poznać wywiadem');

  EventBus.emit('interstellar:arrived', {
    vessel: mkVessel({ enemy: false, name: 'Mój zwiadowca' }),
    systemId: 'sys_026', star: { spectralType: 'G' }, targetName: 'Obcy układ',
  });
  const afterPlayer = pauses;
  assert(afterPlayer > afterEnemy,
    `T2 KONTROLA PINU: przylot WŁASNEGO statku dalej otwiera popup i pauzuje (${afterEnemy} → ${afterPlayer}) — ` +
    'bramkujemy WŁAŚCICIELA, nie funkcję');
}

// ── T3 — pin źródłowy: bramka przed zbieraniem danych ───────────────────────
console.log('T3 — pin źródłowy: bramka stoi PRZED przeglądem układu');
{
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const src = stripComments(readFileSync(join(SRC, 'ui', 'MissionEventModal.js'), 'utf8'));
  const fnAt = src.indexOf('function _onInterstellarArrived');
  assert(fnAt >= 0, 'T3: funkcja znaleziona w źródle');
  const body = src.slice(fnAt, fnAt + 1200);
  const gateAt = body.indexOf('isEnemyVessel');
  const surveyAt = body.indexOf('getByType');
  assert(gateAt >= 0, 'T3: bramka `isEnemyVessel` JEST w funkcji');
  assert(surveyAt >= 0 && gateAt < surveyAt,
    `T3 SEDNO: bramka (${gateAt}) stoi PRZED zbieraniem przeglądu układu (${surveyAt}) — nie ` +
    'liczymy danych, których i tak nie pokażemy. Odwrotna kolejność przeżyłaby ten test ' +
    'w zachowaniu, a wyciek wróciłby przy pierwszym refaktorze renderu');
}

console.log(`\n═══ ${pass} PASS, ${fail} FAIL ═══`);
process.exit(fail === 0 ? 0 : 1);
