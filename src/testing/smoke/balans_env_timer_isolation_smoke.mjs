// ═══════════════════════════════════════════════════════════════
// BALANS 1.0 — keeper wady pomiarowej: „konsumpcja POP macierzystej zerowana"
// ───────────────────────────────────────────────────────────────
// Chroni poprawkę środowiska headless (`env.js`): `setTimeout(…, 0)` jest ODROCZONY
// (kolejka drenowana na granicy ticku przez `Ticker`), a NIE synchroniczny.
//
// Dlaczego to keeper, a nie jednorazowy dowód: wada była NIEWIDOCZNA w wynikach —
// panel liczył się dalej, tylko food/water/energy kolonii macierzystej były fikcją
// (docs/BALANS_PHASE2_RESOURCES.md §7). Instrument nie ma live-gate'u w przeglądarce,
// więc cicha regresja = najgorszy scenariusz.
//
//   T1  semantyka env: zero-delay ODROCZONY, flush wykonuje, re-entrancy = następna generacja
//   T2  Ticker drenuje kolejkę (wpięcie flusha w pętli)
//   T3  ⛔ WADA: nowa placówka NIE nadpisuje `civilization_consumption` macierzystej
//   T4  sentinel: przy STAREJ (synchronicznej) semantyce wada WRACA — test ma zęby
//   T5  izolacja: `setTimeout` z opóźnieniem > 0 nadal idzie do prawdziwego timera
// ═══════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUST be first (mocki window/document/THREE + seeded RNG)
import { flushZeroDelayTimers, pendingZeroDelayTimers } from '../headless/env.js';
import { GameCore } from '../headless/GameCore.js';
import { Ticker } from '../headless/Ticker.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// Kopia stawek producenta konsumpcji POP kolonii (null = brak producenta).
const popConsOf = (resSys) => {
  const p = resSys?._producers?.get?.('civilization_consumption');
  return p ? { food: p.food ?? 0, water: p.water ?? 0, energy: p.energy ?? 0 } : null;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Ciało do założenia placówki: dowolna planeta/księżyc ≠ macierzysta.
const pickTarget = (boot) => {
  const home = boot.homePlanet;
  return (boot.planets ?? []).find(p => p.id !== home.id)
      ?? (boot.moons ?? []).find(m => m.id !== home.id);
};

// ── T1: semantyka env ─────────────────────────────────────────────
console.log('T1 — env: setTimeout(…, 0) ODROCZONY (nie synchroniczny)');
{
  let ran = 0;
  setTimeout(() => { ran++; }, 0);
  assert(ran === 0, 'callback NIE wykonuje się synchronicznie przy zakolejkowaniu');
  assert(pendingZeroDelayTimers() === 1, 'czeka 1 callback w kolejce');
  const n = flushZeroDelayTimers();
  assert(ran === 1 && n === 1, 'flush wykonuje zakolejkowany callback (zwraca licznik)');
  assert(pendingZeroDelayTimers() === 0 && flushZeroDelayTimers() === 0, 'kolejka pusta po flushu (idempotentny)');

  // Re-entrancy: callback kolejkujący kolejny = NASTĘPNA generacja (jak makrozadanie
  // w przeglądarce) — jeden flush nie wpada w pętlę nieskończoną.
  let outer = 0, inner = 0;
  setTimeout(() => { outer++; setTimeout(() => { inner++; }, 0); }, 0);
  flushZeroDelayTimers();
  assert(outer === 1 && inner === 0, 'callback zakolejkowany PODCZAS flusha czeka na następny flush');
  flushZeroDelayTimers();
  assert(inner === 1, 'druga generacja wykonuje się przy kolejnym flushu');

  // Brak callbacku (np. setTimeout(undefined, 0)) nie wysadza kolejki.
  setTimeout(undefined, 0);
  assert(pendingZeroDelayTimers() === 0, 'nie-funkcja nie trafia do kolejki');
}

// ── T2: Ticker drenuje kolejkę ────────────────────────────────────
console.log('\nT2 — Ticker drenuje odroczone timery na granicy ticku');
{
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization_boosted', solo: true, planetClass: 'GOOD_FE' });
  let ran = 0;
  setTimeout(() => { ran++; }, 0);
  assert(ran === 0, 'przed pętlą callback czeka');
  new Ticker(core.timeSystem).run(1, { tickSize: 1.0 });
  assert(ran === 1, 'Ticker.run wykonał odroczony callback (wpięty flush)');
}

// ── T3: WADA — placówka nie rusza konsumpcji macierzystej ─────────
console.log('\nT3 — nowa placówka NIE nadpisuje konsumpcji POP kolonii macierzystej');
{
  const core = new GameCore();
  const boot = core.boot({ quiet: true, scenario: 'civilization_boosted', solo: true, planetClass: 'GOOD_FE' });
  const home = core.colonyManager.getColony(boot.homePlanet.id);
  // Konsumpcja macierzystej jest zarejestrowana (pop>0 w boosted starcie).
  home.civSystem._registeredPop = -1;
  home.civSystem._syncConsumption();
  const before = popConsOf(home.resourceSystem);
  assert(before !== null && before.food < 0, `macierzysta ma konsumpcję POP (food=${before?.food})`);
  assert(window.KOSMOS.resourceSystem === home.resourceSystem, 'aktywny ResourceSystem = macierzysta (warunek wady)');

  const target = pickTarget(boot);
  const outpost = core.colonyManager.createOutpost(target.id, { Fe: 10 }, 5);
  assert(!!outpost, `placówka założona na ${target.id}`);
  assert(same(popConsOf(home.resourceSystem), before),
         'PO konstrukcji placówki konsumpcja macierzystej NIETKNIĘTA (wada nie wystąpiła)');

  flushZeroDelayTimers();
  assert(same(popConsOf(home.resourceSystem), before),
         'PO flushu konsumpcja macierzystej NADAL nietknięta (callback trafił do własnego magazynu)');
  const own = popConsOf(outpost.resourceSystem);
  assert(own !== null && own.food === 0 && own.water === 0 && own.energy === 0,
         'placówka (pop=0) zarejestrowała zerową konsumpcję we WŁASNYM magazynie');
  assert(outpost.resourceSystem !== home.resourceSystem, 'placówka ma własny ResourceSystem (nie współdzieli)');
}

// ── T4: sentinel — stara semantyka przywraca wadę ─────────────────
console.log('\nT4 — sentinel: przy SYNCHRONICZNYM zero-delay wada WRACA (test ma zęby)');
{
  const core = new GameCore();
  const boot = core.boot({ quiet: true, scenario: 'civilization_boosted', solo: true, planetClass: 'GOOD_FE' });
  const home = core.colonyManager.getColony(boot.homePlanet.id);
  home.civSystem._registeredPop = -1;
  home.civSystem._syncConsumption();
  const before = popConsOf(home.resourceSystem);

  // Odtworzenie STAREGO env.js (`ms==0` → wykonaj natychmiast).
  const deferred = globalThis.setTimeout;
  globalThis.setTimeout = (cb, ms, ...args) => {
    if (!ms || ms === 0) { try { cb(...args); } catch {} return 0; }
    return deferred(cb, ms, ...args);
  };
  const target = pickTarget(boot);
  core.colonyManager.createOutpost(target.id, { Fe: 10 }, 5);
  globalThis.setTimeout = deferred;

  const after = popConsOf(home.resourceSystem);
  assert(!same(after, before),
         `stara semantyka NADPISUJE konsumpcję macierzystej (food ${before?.food} → ${after?.food})`);
  assert(after && after.food === 0 && after.water === 0 && after.energy === 0,
         'nadpisanie to dokładnie {food:0, water:0, energy:0} placówki (mechanizm z §7)');
}

// ── T5: izolacja — opóźnienie > 0 bez zmian ───────────────────────
console.log('\nT5 — setTimeout z opóźnieniem > 0 nadal idzie do prawdziwego timera');
{
  let ran = 0;
  const pendingBefore = pendingZeroDelayTimers();   // ≠0 dopuszczalne (boot z T4 nie był flushowany)
  const id = setTimeout(() => { ran++; }, 5000);
  assert(id !== 0 && id != null, 'niezerowe opóźnienie zwraca prawdziwy handle (nie id kolejki)');
  assert(pendingZeroDelayTimers() === pendingBefore, 'niezerowe opóźnienie NIE trafia do kolejki zero-delay');
  clearTimeout(id);
  assert(ran === 0, 'clearTimeout anuluje prawdziwy timer');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
