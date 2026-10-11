// ═══════════════════════════════════════════════════════════════════════════════
// sb2b_pulse_scope_smoke — KEEPER Findingu 415 (AI STRIKES BACK, pre-S3, decyzja SB43)
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §6 (415).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: `ThreeRenderer._spawnMovementPulse` (start / przylot / dok) dodawał pierścień do sceny OGLĄDANEGO układu we
//   współrzędnych statku — bez terminu układu i wywiadu. Współrzędne są lokalne dla układu, więc pierścień statku z innego
//   układu stawał w miejscu bez statku, a ruch AI był widoczny bez wykrycia (bramka S2, krok 22: 8 pierścieni, wszystkie
//   od statków AI z innych układów, widok `sys_home`).
// SB43: pierścienie wyłącznie dla statków z oglądanego układu; statków nie-gracza — tylko gdy wykrycie gracza je pokazuje.
//
// ⚠ `ThreeRenderer` nie importuje się pod node (THREE) ⇒ reguła żyje w czystym `VesselFxLogic.isMovementPulseVisible`
//   (pinowana WYKONANIEM), a jej wołanie na wejściu `_spawnMovementPulse` — pinem ŹRÓDŁOWYM (kod bez komentarzy, LF),
//   z kontrolą: bramka sprite'a w tym samym pliku widoczna tą samą metodą. Pomiar w prawdziwej grze — Część C.
// ⚠ Import przez przestrzeń nazw: na kodzie sprzed kroku symbolu nie ma — pin dostaje kolor, przebieg się nie wywraca.
//
// PINY:
//   T1  statek AI w INNYM układzie niż oglądany — brak pierścienia (każda jakość wywiadu)
//   T2  statek AI w oglądanym układzie — pierścień tylko przy wywiadzie ≥ contact (unknown / rumor — brak)
//   T3  statek gracza w oglądanym układzie: pierścień zawsze — bez zmian wobec stanu sprzed SB43 (reguła jest nowa,
//       więc pin pada przed krokiem; „bez zmian w grze” mierzy Część C — licznik w prawdziwej grze)
//   T4  statek gracza w innym układzie — brak pierścienia; w skoku warp (`systemId` null) — według układu startu
//   T5  stary zapis bez `systemId` — `sys_home` (jak sprite)
//   T6  źródło: `_spawnMovementPulse` woła regułę PRZED utworzeniem pierścienia, z układem oglądanym i wywiadem
// ═══════════════════════════════════════════════════════════════════════════════

import * as FX from '../../utils/VesselFxLogic.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const vis = (o) => (typeof FX.isMovementPulseVisible === 'function' ? FX.isMovementPulseVisible(o) : undefined);
const Q = ['unknown', 'rumor', 'contact', 'detailed'];

console.log('\nT1  statek AI w innym układzie');
assert(Q.every(q => vis({ systemId: 'sys_059', activeSystemId: 'sys_home', isEnemy: true, quality: q }) === false),
  'T1 AI w `sys_059`, widok `sys_home` — brak pierścienia przy każdej jakości wywiadu');

console.log('\nT2  statek AI w oglądanym układzie');
assert(vis({ systemId: 'sys_home', activeSystemId: 'sys_home', isEnemy: true, quality: 'unknown' }) === false
    && vis({ systemId: 'sys_home', activeSystemId: 'sys_home', isEnemy: true, quality: 'rumor' }) === false,
  'T2a AI w oglądanym układzie bez wykrycia w miejscu (unknown / rumor) — brak');
assert(vis({ systemId: 'sys_home', activeSystemId: 'sys_home', isEnemy: true, quality: 'contact' }) === true
    && vis({ systemId: 'sys_home', activeSystemId: 'sys_home', isEnemy: true, quality: 'detailed' }) === true,
  'T2b AI w oglądanym układzie przy wywiadzie contact / detailed — pierścień');

console.log('\nT3  statek gracza w oglądanym układzie');
assert(vis({ systemId: 'sys_home', activeSystemId: 'sys_home', isEnemy: false, quality: null }) === true
    && vis({ systemId: 'sys_020', activeSystemId: 'sys_020', isEnemy: false, quality: null }) === true,
  'T3 statek gracza w oglądanym układzie — pierścień (bez zmian)');

console.log('\nT4  statek gracza w innym układzie / w skoku warp');
assert(vis({ systemId: 'sys_020', activeSystemId: 'sys_home', isEnemy: false, quality: null }) === false,
  'T4a statek gracza w `sys_020`, widok `sys_home` — brak');
assert(vis({ systemId: null, fromSystemId: 'sys_home', activeSystemId: 'sys_home', isEnemy: false, quality: null }) === true
    && vis({ systemId: null, fromSystemId: 'sys_home', activeSystemId: 'sys_020', isEnemy: false, quality: null }) === false
    && vis({ systemId: null, fromSystemId: null, activeSystemId: 'sys_home', isEnemy: false, quality: null }) === false,
  'T4b skok warp: pierścień tylko w układzie startu (bez układu startu — brak)');

console.log('\nT5  stary zapis bez `systemId`');
assert(vis({ systemId: undefined, activeSystemId: 'sys_home', isEnemy: false, quality: null }) === true
    && vis({ systemId: undefined, activeSystemId: 'sys_020', isEnemy: false, quality: null }) === false,
  'T5 brak pola `systemId` — `sys_home` (jak sprite)');

console.log('\nT6  źródło `ThreeRenderer._spawnMovementPulse`');
{
  const tr = strip(readFileSync(new URL('../../renderer/ThreeRenderer.js', import.meta.url), 'utf8'));
  const m = tr.match(/\n  _spawnMovementPulse\(vessel, color\) \{[\s\S]*?\n  \}/);
  const body = m?.[0] ?? '';
  const gate = body.indexOf('isMovementPulseVisible(');
  const ring = body.indexOf('new THREE.Mesh(');
  assert(gate > 0 && ring > gate, 'T6a reguła wołana na wejściu, PRZED utworzeniem pierścienia');
  assert(/activeSystemId:\s*window\.KOSMOS\?\.activeSystemId/.test(body) && /fromSystemId:\s*vessel\?\.mission\?\.fromSystemId/.test(body)
    && /getVesselContact\?\.\(vessel\.id\)\?\.quality/.test(body),
    'T6b do reguły trafia układ oglądany, układ startu skoku i jakość wywiadu statku z wydarzenia');
  assert(ring > 0 && /vessel\.systemId && vessel\.systemId !== activeSys/.test(tr),
    'T6-0 KONTROLA: metoda znaleziona, a bramka sprite\'a w tym samym pliku widoczna tą samą metodą');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
