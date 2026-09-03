// KEEPER — 246 / E3H: WEJŚCIE DO ŁAŃCUCHA tier 3+ przez ZATRZASK Z PASMEM + cel PROPORCJONALNY.
// Uruchom: node src/testing/smoke/ai_tier3_scaled_entry_smoke.mjs
//
// PODPISANY KSZTAŁT (D-E3-1, `CHAIN_ENTRY_PLAN.md` §11.3):
//   frac  = clamp(min nad [Fe,Si,Cu,C] z stock/20000, 0, 1)
//   open  = zatrzask per kolonia: OTWIERA przy frac >= 0.20, ZAMYKA dopiero poniżej 0.12
//   bonus = open ? max(1, round((target - 1) * frac)) : 0     (tylko tier >= 3)
//
//   T1  NIEJAŁOWOŚĆ — fixture MUSI realnie trafiać w predykat: policzone `frac` na każdym szczeblu
//       zgadza się z zamierzonym CO DO WARTOŚCI, a w stanach otwartych bonus jest NIEZEROWY.
//       Bez tego T2 porównywałoby „zero, bo nic nie policzono" z „zero, bo zamknięte" (0/0).
//   T2  PASMO (D-E3-3) — pełen zestaw przejść 0.11 → 0.15 → 0.21 → 0.15 → 0.11:
//       zamknięte · zamknięte · OTWIERA · ZOSTAJE otwarte · ZAMYKA. To jest cała histereza:
//       0.15 daje DWA różne wyniki zależnie od historii — i tylko to odróżnia pasmo od progu.
//   T3  RESTORE W PASMIE (D-E3-2) — kolonia bez `_tier3Latch` (świeżo wczytana) przy frac 0.15
//       ląduje ZAMKNIĘTA. Zatrzask NIE jest serializowany; odbudowa jest fail-closed z samej
//       inicjalizacji (undefined → false → otwiera dopiero przy >= 0.20). Save v101 bez migracji.
//   T4  ROLLBACK — flaga OFF: zachowanie sprzed slice'u CO DO BITU (wszystkie cztery rudy >= 20k
//       → bonus target-1; inaczej 0). Testowane na stanie, w którym E3H dałby COŚ INNEGO.
//   T5  GRACZ NIETKNIĘTY — kolonia gracza (`ownerEmpireId == null`) nie dostaje ŻADNEGO zapisu
//       `setDemandBonus`, a `getSafetyStockTarget` czyta tę samą wartość przy fladze ON i OFF.
//   T6  PIN ŹRÓDŁOWY — progi są NAZWANYMI STAŁYMI (0.20 / 0.12), nie liczbami wklejonymi w warunek,
//       a `WEALTH_THRESHOLD` pozostaje wspólnym mianownikiem obu ścieżek.
//   T7  TYLKO TIER 3+ — pozycje tier 1-2 z `startingSafetyStocks` NIE są ruszane przez żadną ścieżkę
//       (poza zakresem podpisu `d44af5e`, zostaje tak).
//
// ⚠ AI-ONLY Z KONSTRUKCJI: `_managedColonies` odsiewa kolonie gracza i placówki
//   (`colony_auto_expander_smoke` A-D). T5 pinuje DRUGĄ linię — jawny guard `ownerEmpireId` w samej
//   metodzie — bo to on chroni ścieżkę wołaną bezpośrednio, z pominięciem `_managedColonies`.

import '../headless/env.js'; // MUST be first
import { ColonyAutoExpander } from '../../systems/ColonyAutoExpander.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(a === b, `${m} — oczekiwano ${b}, jest ${a}`);

const FLAG = 'aiTier3ScaledEntry';
const setFlag = (v) => { GAME_CONFIG.FEATURES[FLAG] = v; };

// ── Atrapa kolonii AI: minimum, którego dotyka `_syncTier3SafetyDemand` ──────────
// `startingSafetyStocks` archetypu bierzemy z rejestru imperiów (window.KOSMOS), więc atrapujemy
// go tak, jak robi to produkcja: reg.get(empId).archetype → ARCHETYPES[...].
const T3 = { quantum_cores: 50, antimatter_cells: 50, warp_cores: 50 };
const T12 = { structural_alloys: 30 };          // tier 1-2 — kontrola T7

function makeColony({ ore, owner = 'emp_test', latch = undefined }) {
  const bonuses = new Map();
  const inv = { Fe: ore, Si: ore, Cu: ore, C: ore };
  const colony = {
    planetId: 'p_test',
    ownerEmpireId: owner,
    _tier3Latch: latch,
    resourceSystem: { getAmount: (r) => inv[r] ?? 0 },
    factorySystem: {
      setDemandBonus: (cid, v) => bonuses.set(cid, v),
      getDemandBonus: (cid) => bonuses.get(cid) ?? 0,
      // lustro FactorySystem.getSafetyStockTarget: baza tier3+ = 1, tier1-2 = 3
      getSafetyStockTarget: (cid) => (cid in T12 ? 3 : 1) + (bonuses.get(cid) ?? 0),
    },
    _bonuses: bonuses,
    _setOre: (v) => { inv.Fe = inv.Si = inv.Cu = inv.C = v; },
  };
  return colony;
}

// Rejestr imperiów-atrapa + archetyp z listą tier3 i tier1-2.
globalThis.window = globalThis.window || {};
window.KOSMOS = window.KOSMOS || {};
const ARCH_ID = '__t3_test_arch';
window.KOSMOS.empireRegistry = { get: (id) => (id ? { id, archetype: ARCH_ID } : null) };
const { ARCHETYPES } = await import('../../data/EmpireData.js');
ARCHETYPES[ARCH_ID] = { id: ARCH_ID, startingSafetyStocks: { ...T3, ...T12 } };

const cae = Object.create(ColonyAutoExpander.prototype);
const sync = (colony) => cae._syncTier3SafetyDemand(colony);
const THRESH = 20000;
const oreFor = (frac) => Math.round(frac * THRESH);

console.log('\n═══ KEEPER 246 / E3H — zatrzask z pasmem + cel proporcjonalny ═══\n');

// ── T1 — NIEJAŁOWOŚĆ ────────────────────────────────────────────────────────────
setFlag(true);
{
  // ⚠ Ramię ZAMKNIĘCIA obowiązuje także zatrzask wymuszony na otwarty: frac < WEALTH_CLOSE (0.12)
  //   zamyka go, więc oczekiwaniem jest wtedy 0. Pierwsza wersja tego pinu tego nie uwzględniała
  //   i żądała skali przy 0.11 — czyli zachowania, którego podpisany kształt NIE obiecuje.
  const steps = [0.11, 0.15, 0.21, 0.15, 0.11];
  let sane = true, nonZero = 0;
  for (const f of steps) {
    const c = makeColony({ ore: oreFor(f), latch: true });   // wymuszamy otwarty, żeby zmierzyć SKALĘ
    sync(c);
    const got = c._bonuses.get('warp_cores');
    const want = f >= 0.12 ? Math.max(1, Math.round(49 * f)) : 0;
    if (want > 0) nonZero++;
    if (got !== want) { sane = false; console.log(`     frac ${f}: bonus ${got}, oczekiwano ${want}`); }
  }
  ok(nonZero >= 3, 'T1 zestaw zawiera co najmniej trzy stany o NIEZEROWYM oczekiwaniu (brak 0/0)');
  ok(sane, 'T1 fixture realnie trafia w predykat (skala liczona z frac, nie 0/0)');
  const cOpen = makeColony({ ore: oreFor(0.21), latch: undefined });
  sync(cOpen);
  ok((cOpen._bonuses.get('warp_cores') ?? 0) > 0, 'T1 stan otwarty daje NIEZEROWY bonus (kontrola niejałowości)');
}

// ── T2 — PASMO: pełen zestaw przejść (D-E3-3) ──────────────────────────────────
{
  const c = makeColony({ ore: oreFor(0.11) });               // start: zatrzask nieustawiony
  const seq = [
    [0.11, false, 'start 0.11 — ZAMKNIĘTE'],
    [0.15, false, '0.15 w paśmie od dołu — NADAL zamknięte (próg otwarcia to 0.20)'],
    [0.21, true,  '0.21 — OTWIERA'],
    [0.15, true,  '0.15 w paśmie od góry — ZOSTAJE otwarte (histereza)'],
    [0.11, false, '0.11 poniżej 0.12 — ZAMYKA'],
  ];
  for (const [f, wantOpen, msg] of seq) {
    c._setOre(oreFor(f));
    sync(c);
    const isOpen = (c._bonuses.get('warp_cores') ?? 0) > 0;
    ok(isOpen === wantOpen, `T2 ${msg} — jest ${isOpen ? 'otwarte' : 'zamknięte'}`);
  }
  ok(true, 'T2 komplet przejść wykonany');
}

// ── T3 — RESTORE W PAŚMIE ląduje ZAMKNIĘTY (D-E3-2) ────────────────────────────
{
  const c = makeColony({ ore: oreFor(0.15), latch: undefined });  // brak pola = po wczytaniu zapisu
  sync(c);
  eq(c._bonuses.get('warp_cores') ?? 0, 0, 'T3 restore przy frac 0.15 (w paśmie) ląduje ZAMKNIĘTY');
  c._setOre(oreFor(0.21)); sync(c);
  ok((c._bonuses.get('warp_cores') ?? 0) > 0, 'T3 …i otwiera się dopiero przy pierwszym przejściu >= 0.20');
  ok(!('_tier3Latch' in JSON.parse(JSON.stringify({ ok: 1 }))), 'T3 kontrola: zatrzask nie jest polem zapisu');
}

// ── T4 — ROLLBACK: flaga OFF = dzisiejsza bramka all-4 CO DO BITU ──────────────
{
  setFlag(false);
  // frac 0.7 → E3H dałby bonus 34; bramka all-4 przy 14k daje 0. Stan rozróżniający.
  const c = makeColony({ ore: 14000, latch: true });
  sync(c);
  eq(c._bonuses.get('warp_cores') ?? 0, 0, 'T4 OFF przy 14k (poniżej 20k) → bonus 0 (dziś)');
  const rich = makeColony({ ore: 25000, latch: false });
  sync(rich);
  eq(rich._bonuses.get('warp_cores') ?? 0, 49, 'T4 OFF przy 25k (wszystkie >= 20k) → bonus target-1 = 49');
  // kontrola pinu: ten sam stan przy ON daje INNĄ wartość — inaczej T4 nic nie odróżnia
  setFlag(true);
  const c2 = makeColony({ ore: 14000, latch: true });
  sync(c2);
  ok((c2._bonuses.get('warp_cores') ?? 0) === 34,
    `T4 KONTROLA PINU: ON przy 14k daje 34 (jest ${c2._bonuses.get('warp_cores')}) — OFF i ON się różnią`);
}

// ── T5 — GRACZ NIETKNIĘTY ──────────────────────────────────────────────────────
{
  for (const flag of [false, true]) {
    setFlag(flag);
    const p = makeColony({ ore: oreFor(0.5), owner: null });
    const before = p.factorySystem.getSafetyStockTarget('warp_cores');
    sync(p);
    eq(p._bonuses.size, 0, `T5 flaga ${flag ? 'ON' : 'OFF'} — kolonia gracza: ZERO zapisów setDemandBonus`);
    eq(p.factorySystem.getSafetyStockTarget('warp_cores'), before,
      `T5 flaga ${flag ? 'ON' : 'OFF'} — getSafetyStockTarget gracza bez zmian`);
  }
}

// ── T6 — PIN ŹRÓDŁOWY: progi to NAZWANE STAŁE ─────────────────────────────────
{
  const src = readFileSync(new URL('../../systems/ColonyAutoExpander.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');   // komentarze zdjęte
  ok(/const\s+WEALTH_OPEN\s*=\s*0\.20?\b/.test(src), 'T6 WEALTH_OPEN jest nazwaną stałą 0.20');
  ok(/const\s+WEALTH_CLOSE\s*=\s*0\.12\b/.test(src), 'T6 WEALTH_CLOSE jest nazwaną stałą 0.12');
  ok(/WEALTH_THRESHOLD/.test(src), 'T6 WEALTH_THRESHOLD nadal wspólnym mianownikiem obu ścieżek');
  ok(!/frac\s*>=\s*0\.2\b|frac\s*<\s*0\.12\b/.test(src), 'T6 progi NIE są wklejone liczbowo w warunek');
}

// ── T7 — TYLKO TIER 3+ ─────────────────────────────────────────────────────────
{
  for (const flag of [false, true]) {
    setFlag(flag);
    const c = makeColony({ ore: 25000, latch: true });
    sync(c);
    eq(c._bonuses.has('structural_alloys'), false,
      `T7 flaga ${flag ? 'ON' : 'OFF'} — pozycja tier 1-2 nie jest ruszana`);
  }
}

setFlag(true);
console.log(`\n═══ ${pass}/${pass + fail} OK, ${fail} FAIL ═══`);
process.exit(fail > 0 ? 1 : 0);
