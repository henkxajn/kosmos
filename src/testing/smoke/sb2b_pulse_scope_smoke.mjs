// ═══════════════════════════════════════════════════════════════════════════════
// sb2b_pulse_scope_smoke — KEEPER Findingu 415 (AI STRIKES BACK, pre-S3, decyzja SB43), PRZECELOWANY w kroku #663
// (COMBAT_VISUALS_PLAN.md §3.2-36 / §3.2-37, §4 «#663 — delivered»).
// ─────────────────────────────────────────────────────────────────────────────
// Historia: `ThreeRenderer._spawnMovementPulse` dodawał pierścień przy starcie / przylocie / doku statku; SB43 zawęził go do
//   statków z OGLĄDANEGO układu i do wroga wykrytego ≥ contact (reguła `VesselFxLogic.isMovementPulseVisible`) — keeper pinował
//   tę regułę (T1–T5) i jej wołanie (T6).
// ⚠ ODWRÓCONY ŚWIADOMIE: krok #663 — dodatek 1 (pierścienie przylotu i doku: „brzydkie, usunąć”) i decyzja właściciela 37
//   (2026-11-11, kontrola #663: „bez pierścieni przy starcie, przylocie i doku”) — pierścieni ruchu statku NIE MA. Klasa Findingu
//   415 (pierścień w złym układzie / bez wykrycia) znika razem z nimi; keeper pilnuje, żeby nie wróciły bocznymi drzwiami.
// ⚠ `ThreeRenderer` nie importuje się pod node (THREE) ⇒ piny źródłowe (kod bez komentarzy, LF) z kontrolami.
// ⚠ Import przez przestrzeń nazw: po usunięciu reguły symbolu nie ma — pin dostaje kolor, przebieg się nie wywraca.
//
// PINY:
//   P1  renderer: brak metody `_spawnMovementPulse` i rodzaju efektu `pulse`
//   P2  renderer: żaden słuchacz `vessel:launched` / `vessel:arrived` / `vessel:docked` nie tworzy efektu (`_spawnFx`, pierścień)
//   P3  `VesselFxLogic` nie eksportuje już reguły `isMovementPulseVisible`
//   KONTROLE: słuchacze startu i doku dalej istnieją (sprite: przebudowa / zdjęcie), efekty skanu i walki dalej idą przez `_spawnFx`
// ═══════════════════════════════════════════════════════════════════════════════

import * as FX from '../../utils/VesselFxLogic.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const tr = strip(readFileSync(new URL('../../renderer/ThreeRenderer.js', import.meta.url), 'utf8'));
/** Ciała subskrybentów `EventBus.on('<ev>'` — od subskrypcji do następnej (wzór `vessel_consumption_smoke`). */
function handlerBodies(code, ev) {
  const out = [];
  for (const m of code.matchAll(new RegExp(`EventBus\\.on\\('${ev}'`, 'g'))) {
    const next = code.indexOf('EventBus.on(', m.index + 12);
    out.push(code.slice(m.index, next > m.index ? next : code.length));
  }
  return out;
}

console.log('\nP1  renderer: bez metody pulsu i rodzaju `pulse`');
assert(!/\n  _spawnMovementPulse\(/.test(tr) && !/_spawnMovementPulse/.test(tr), 'P1a brak `_spawnMovementPulse` (definicji i wywołań)');
assert(!/kind:\s*'pulse'/.test(tr) && !/case\s+'pulse'/.test(tr), "P1b brak rodzaju efektu 'pulse' (tworzenia i animacji)");

console.log('\nP2  renderer: słuchacze startu / przylotu / doku nie tworzą efektów');
const evs = ['vessel:launched', 'vessel:arrived', 'vessel:docked'];
const bodies = Object.fromEntries(evs.map((e) => [e, handlerBodies(tr, e)]));
const spawning = evs.filter((e) => bodies[e].some((b) => /_spawnFx\(|RingGeometry|_spawn[A-Z]\w*Pulse/.test(b)));
assert(spawning.length === 0, `P2 żaden słuchacz ${evs.join(' / ')} nie tworzy efektu (tworzą: ${spawning.join(', ') || '—'})`);
assert(bodies['vessel:launched'].some((b) => /_addVesselSprite\(/.test(b)) && bodies['vessel:docked'].some((b) => /_removeVesselSprite\(/.test(b)),
  'P2-0 KONTROLA: słuchacze startu i doku dalej istnieją (start — przebudowa sprite\'a, dok — zdjęcie sprite\'a), ta sama metoda je widzi');

console.log('\nP3  `VesselFxLogic`: bez reguły pierścienia ruchu');
assert(FX.isMovementPulseVisible === undefined, 'P3 `isMovementPulseVisible` nie jest już eksportowana');
assert(typeof FX.isEndpointVisibleByQuality === 'function' && typeof FX.isEngagementInView === 'function',
  'P3-0 KONTROLA: moduł się ładuje, sąsiednie reguły widoczności efektów zostają');

console.log('\nKONTROLA — inne efekty dalej idą przez `_spawnFx`');
assert(/\n  _spawnScanPing\(/.test(tr) && (tr.match(/this\._spawnFx\(/g) ?? []).length >= 5,
  `K efekty skanu i walki zostają (wywołań \`_spawnFx\`: ${(tr.match(/this\._spawnFx\(/g) ?? []).length})`);

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
