// D2/E8 (WOJNA I POKÓJ 1.0) — smoke: bramka właściciela w `_onColonyFounded`.
// Uruchom: node src/testing/smoke/diplomacy_colony_gate_smoke.mjs
//
// Handler `colony:founded` / `outpost:founded` podbija napięcie na parze gracz↔właściciel
// układu z powodem `player_<kind>_in_their_space`. Problem, który E8 zamyka: te eventy lecą
// dla KAŻDEJ kolonii — także dla kolonii imperiów AI — więc kolonizacja prowadzona przez AI
// obciążała GRACZA. Ten plik pinuje bramkę WYKONANIEM, bo żaden istniejący suite nie dotykał
// tej ścieżki (ani przed, ani po D1).
//
// ⚠ Świadomie NIE testujemy „napięcia AI↔AI po kolonizacji" — pary AI↔AI powstają dopiero
// w D5, więc dziś nie byłoby czego asertować (podpisana decyzja 5 fazy D2).

import '../headless/env.js';   // MUST be first

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

const EventBus      = (await import('../../core/EventBus.js')).default;
const EntityManager = (await import('../../core/EntityManager.js')).default;
const gameState     = (await import('../../core/GameState.js')).default;
const { DiplomacySystem } = await import('../../systems/DiplomacySystem.js');

// ── Świat: jeden układ należący do emp_001, jedno ciało w tym układzie ──────
const SYS = 'sys_emp_001';
const empires = new Map([['emp_001', { id: 'emp_001', name: 'Obcy', archetype: 'trader',
  personality: { trade: 0.5, aggression: 0.5 }, homeSystemId: SYS }]]);

window.KOSMOS = window.KOSMOS ?? {};
Object.assign(window.KOSMOS, {
  timeSystem: { gameTime: 100 },
  empireRegistry: { get: (id) => empires.get(id) ?? null, listAll: () => [...empires.values()] },
  galaxyData: { systems: [{ id: 'sys_home', empireId: null }, { id: SYS, empireId: 'emp_001' }] },
  gameState,
});

gameState.reset();
EventBus.clear?.();
EntityManager.add({ id: 'p_target', type: 'planet', name: 'Cel', systemId: SYS });

const dipl = new DiplomacySystem();
window.KOSMOS.diplomacySystem = dipl;
dipl.relations.ensure('player', 'emp_001');

const tension = () => dipl.getTension('emp_001');
const memCount = () => dipl.getMemory('emp_001', 20).filter(m => m.type === 'territorial_violation').length;
const reset = () => { dipl.relations.setTension('player', 'emp_001', 0, 'test_reset'); };

// ── G1: kolonia GRACZA w cudzym układzie → napięcie rośnie (zachowanie sprzed E8) ──
console.log('--- G1: kolonia gracza w cudzym układzie ---');
{
  reset();
  const memBefore = memCount();
  EventBus.emit('colony:founded', { colony: { planetId: 'p_target' } });
  ok('napięcie +30 (brak ownerEmpireId = kolonia gracza)', tension() === 30);
  ok('wpis pamięci territorial_violation dołożony', memCount() === memBefore + 1);
}

// ── G2: ownerEmpireId === 'player' też przechodzi (jawny zapis właściciela) ──
console.log('--- G2: jawne ownerEmpireId = player ---');
{
  reset();
  EventBus.emit('outpost:founded', { colony: { planetId: 'p_target', ownerEmpireId: 'player' } });
  ok('napięcie +30 (jawne ownerEmpireId=player traktowane jak gracz)', tension() === 30);
}

// ── G3: ⭐ kolonia AI w CUDZYM układzie → gracz NIE obciążony ──────────────
console.log('--- G3: kolonia AI w cudzym układzie (sedno E8) ---');
{
  reset();
  const memBefore = memCount();
  EventBus.emit('colony:founded', { colony: { planetId: 'p_target', ownerEmpireId: 'emp_002' } });
  ok('napięcie gracza NIETKNIĘTE (0) — nie gracz to zrobił', tension() === 0);
  ok('ZERO nowych wpisów pamięci na parze gracz↔właściciel układu', memCount() === memBefore);
}

// ── G4: kolonia AI we WŁASNYM układzie → też nic (dawniej: samo-obciążenie) ──
console.log('--- G4: kolonia AI we własnym układzie ---');
{
  reset();
  EventBus.emit('colony:founded', { colony: { planetId: 'p_target', ownerEmpireId: 'emp_001' } });
  ok('napięcie 0 — dawniej imperium podbijało napięcie gracza samą kolonizacją u siebie',
    tension() === 0);
}

// ── G5: outpost AI też bramkowany (oba eventy przez ten sam handler) ────────
console.log('--- G5: outpost AI ---');
{
  reset();
  EventBus.emit('outpost:founded', { colony: { planetId: 'p_target', ownerEmpireId: 'emp_002' } });
  ok('napięcie 0 — bramka działa na obu eventach', tension() === 0);
}

// ── G6: degradacje — brak planetId / ciało bez układu / układ bez właściciela ──
console.log('--- G6: degradacje ---');
{
  reset();
  EventBus.emit('colony:founded', { colony: {} });
  ok('brak planetId → no-op', tension() === 0);
  EntityManager.add({ id: 'p_nosys', type: 'planet', name: 'Bezdomna' });
  EventBus.emit('colony:founded', { colony: { planetId: 'p_nosys' } });
  ok('ciało bez systemId → no-op', tension() === 0);
  EntityManager.add({ id: 'p_neutral', type: 'planet', name: 'Neutralna', systemId: 'sys_home' });
  EventBus.emit('colony:founded', { colony: { planetId: 'p_neutral' } });
  ok('układ bez właściciela → no-op (kolonizacja pustki nikogo nie drażni)', tension() === 0);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail > 0 ? 1 : 0);
