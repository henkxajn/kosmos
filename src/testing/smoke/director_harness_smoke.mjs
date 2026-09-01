// D-178-3 — HARNESS DIRECTORA: keeper na MONTAŻU, nie na zachowaniu.
//   Plan: docs/design/COURIER_LOAD_ORDER_PLAN.md §4 · docs/design/FE_SUPPLY_PLAN.md §9.
//
// ⚠ DLACZEGO PIN NA MONTAŻU. Lekcja W3 („skonstruowany ≠ zamontowany"): reguła Directora żyła
//   i była oceniana, ale brak wiersza w bloku lokatora czynił ją NIEWIDZIALNĄ dla gate'u —
//   wszyscy konsumenci czytają przez `?.`, więc NIC NIE KRZYCZY. Keeper musi pinować SPOSÓB
//   SKŁADANIA SCENY, nie zachowanie przy gotowej scenie.
//
// ⚠ I DRUGI POWÓD, ŚWIEŻY: `DirectorHarness` był PODPISANY (D-178-3, ✅) i NIE ZBUDOWANY przez
//   cały czas życia trzech slice'ów. `git log --all --diff-filter=AD` na nazwie pliku zwracał
//   pustkę. Bez keepera na montażu nic tego nie odróżnia od stanu „jest".
//
//   T1  KOMPLET modułów Directora na lokatorze po `bootWithDirector`
//   T2  Prerekwizyty: InfluenceMap + stub stacji, a stub MA `serialize`/`restore` (pułapka 1)
//   T3  Kalibracja ZAPIECZONA domyślnie + JAWNY opt-out (pułapka 3)
//   T4  `Ticker` zwracany, a `core.tick` NIE ISTNIEJE — pin POWODU pułapki 2
//   T5  Żeton R-3: `hasOrbitalStation` true dla każdego imperium (inaczej harness mierzy CISZĘ)
//   T6  ŻADNA sonda w repo nie montuje Directora Z RĘKI (inaczej duplikacja przeżywa z +1 plikiem)

import '../headless/env.js';           // MUSI być pierwszy
import { bootWithDirector, DIRECTOR_MODULES, makeStationStub } from '../headless/DirectorHarness.js';
import { HEADLESS_GALAXY_SEED } from '../headless/GameCore.js';
import { DRIVER_DEFAULTS } from '../headless/balans-driver.mjs';
import { readFileSync, readdirSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf-8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const boot = bootWithDirector({ aiEmpires: true });
const K = boot.K;
const empires = (K.empireRegistry?.listAll?.() ?? []).map(e => e.id);

// ── T1 — komplet modułów na lokatorze ───────────────────────────────────────────────────────
console.log('T1 — KOMPLET stosu Directora na `window.KOSMOS` po `bootWithDirector`');
{
  assert(empires.length >= 2,
    `T1k NIEJAŁOWOŚĆ: boot dał ${empires.length} imperia AI — bez nich Director nie ma kim rządzić ` +
    'i każdy pin niżej przechodziłby jałowo');
  const brak = DIRECTOR_MODULES.filter(n => !K[n]);
  assert(brak.length === 0,
    `T1: wszystkie ${DIRECTOR_MODULES.length} modułów Directora zamontowane (brakuje: ${brak.join(', ') || 'nic'})`);
  // ⚠ Pin KOLEJNOŚCI: `DirectorSystem` waliduje katalog w konstruktorze i RZUCA na nieznanej
  //   nazwie (R12), więc sam fakt, że boot się nie wywrócił, dowodzi rejestracji PRZED nim.
  assert(!!K.directorSystem,
    'T1b: `DirectorSystem` skonstruowany — a że waliduje CAŁY katalog w konstruktorze (R12), ' +
    'jego istnienie DOWODZI, że rejestracje zachowań poszły PRZED nim');
}

// ── T2 — prerekwizyty + pułapka 1 (serialize/restore stuba) ─────────────────────────────────
console.log('\nT2 — prerekwizyty, których `GameCore` nie montuje');
{
  // ⚠ PIN WYKONANIOWY, nie istnieniowy. `new InfluenceMap()` przechodzi bez `TerritoryService`,
  //   a rzuca dopiero pierwszy REALNY odczyt (R12). Sprawdzanie `!!K.influenceMap` przepuściłoby
  //   harness, w którym każda sonda nacisku wywraca się przy pierwszym użyciu.
  let imOk = true, imErr = '';
  try { K.influenceMap.getBorderSystems(empires[0] ?? 'emp_001'); }
  catch (e) { imOk = false; imErr = e.message; }
  assert(!!K.influenceMap && imOk,
    `T2a: \`InfluenceMap\` nie tylko ISTNIEJE, ale WYKONUJE odczyt (${imOk ? 'ok' : imErr}) — ` +
    'sondy nacisku i ofensywy czytają ją wprost');
  assert(!!K.stationSystem,
    'T2b: `stationSystem` na lokatorze (żeton R-3)');
  const stub = makeStationStub(['emp_x']);
  let ok = true;
  try { const d = stub.serialize(); stub.restore(d); } catch { ok = false; }
  assert(typeof stub.serialize === 'function' && typeof stub.restore === 'function' && ok,
    'T2c PUŁAPKA 1: stub stacji MA `serialize`/`restore` i round-trip nie rzuca — autozapis woła ' +
    'je co rok gry, bez nich `SaveSystem` rzuca co tik i zalewa wyjście');
  assert(stub.serialize().stations.length === 1,
    'T2ck KONTROLA: `serialize` zwraca realną treść, nie pusty obiekt');
}

// ── T3 — kalibracja zapieczona + jawny opt-out (pułapka 3) ──────────────────────────────────
console.log('\nT3 — kalibracja JEST domyślna, opt-out JAWNY');
{
  const HARNESS = src('../headless/DirectorHarness.js');
  assert(/DRIVER_DEFAULTS/.test(HARNESS) && /HEADLESS_GALAXY_SEED/.test(HARNESS),
    'T3a: harness czyta `DRIVER_DEFAULTS` i przypięty `HEADLESS_GALAXY_SEED` — kalibracja jest ' +
    'W ŚRODKU, a nie zostawiona wołającemu');
  assert(/aiEmpires\s*=\s*true/.test(HARNESS),
    'T3b: `aiEmpires` domyślnie TRUE (poprawka właściciela do D-178-3)');
  assert(/calibrated\s*=\s*true/.test(HARNESS) && /calibrated\s*\?/.test(HARNESS),
    'T3c: opt-out z kalibracji istnieje i jest JAWNY (`calibrated: false`)');
  assert(DRIVER_DEFAULTS.scenario === 'civilization_boosted' && typeof HEADLESS_GALAXY_SEED === 'number',
    'T3k KONTROLA: `DRIVER_DEFAULTS`/`HEADLESS_GALAXY_SEED` realnie istnieją i mają treść ' +
    `(scenario=${DRIVER_DEFAULTS.scenario}, seed=${HEADLESS_GALAXY_SEED})`);
}

// ── T4 — Ticker, i POWÓD pułapki 2 ──────────────────────────────────────────────────────────
console.log('\nT4 — `Ticker` zwracany; `core.tick` NIE ISTNIEJE (pin powodu pułapki 2)');
{
  assert(!!boot.ticker && typeof boot.ticker.run === 'function',
    'T4a: harness zwraca `Ticker` z `run()` — jedyną poprawną pętlę czasu');
  assert(typeof boot.core.tick !== 'function',
    'T4b PIN POWODU: `core.tick` NIE ISTNIEJE — własna pętla stoi na roku 0,0 i zwraca fałszywe ' +
    '„zero wygaśnięć". Gdyby kiedyś powstał, ten pin padnie i o to chodzi');
}

// ── T5 — żeton R-3 ──────────────────────────────────────────────────────────────────────────
console.log('\nT5 — żeton R-3: bez stacji KAŻDE zamówienie okrętu AI kończy `no_orbital_station`');
{
  const wyniki = empires.map(id => [id, K.directorProduction?.hasOrbitalStation?.(id)]);
  assert(wyniki.length > 0 && wyniki.every(([, v]) => v === true),
    `T5: `+ wyniki.map(([id, v]) => `${id}=${v}`).join(', ') + ' — każde imperium ma żeton, ' +
    'inaczej harness mierzyłby CISZĘ zamiast produkcji');
}

// ── T6 — koniec ręcznego montażu ────────────────────────────────────────────────────────────
console.log('\nT6 — żadna sonda nie montuje Directora Z RĘKI (inaczej duplikacja przeżywa)');
{
  const dir = new URL('../headless/', import.meta.url);
  const pliki = readdirSync(dir).filter(f => f.startsWith('probe-') && f.endsWith('.mjs'));
  assert(pliki.length >= 10,
    `T6k NIEJAŁOWOŚĆ: znaleziono ${pliki.length} sond — inaczej „brak ręcznego montażu" ` +
    'byłoby prawdą o pustym katalogu');
  // ⚠ PIN ZAWĘŻONY PO POMIARZE — i to jest korekta mojego własnego pina. Pierwsza wersja łapała
  //   KAŻDĄ sondę konstruującą moduł Directora, w tym `probe-130-z2`, która buduje SYNTETYCZNY
  //   `window.KOSMOS` (0 odwołań do `GameCore`) i izoluje jedno zachowanie. Migracja takiej sondy
  //   na pełny, skalibrowany boot ZMIENIŁABY to, co ona mierzy — to nie deduplikacja, tylko
  //   zepsucie działającego przyrządu. D-178-3 chroni przed ręcznym składaniem PEŁNEJ GRY,
  //   więc pin łapie dokładnie to: sonda, która bootuje `GameCore` I montuje Director sama.
  const reczne = pliki.filter(f => {
    const t = src('../headless/' + f);
    return /new\s+Director[A-Za-z]*\s*\(/.test(t) && /GameCore/.test(t);
  });
  assert(reczne.length === 0,
    `T6: żadna sonda BOOTUJĄCA GameCore nie montuje Directora sama (ręczne: ${reczne.join(', ') || 'brak'}) — ` +
    'takie mają iść przez `bootWithDirector`');
  const jednostkowe = pliki.filter(f => {
    const t = src('../headless/' + f);
    return /new\s+Director[A-Za-z]*\s*\(/.test(t) && !/GameCore/.test(t);
  });
  assert(jednostkowe.length > 0,
    `T6b KONTROLA ZAKRESU: sondy JEDNOSTKOWE na syntetycznym świecie zostają nietknięte ` +
    `(${jednostkowe.join(', ')}) — pin nie ma ich migrować`);
}

// ── T7 — IZOLACJA BOOTU (Finding 228) ───────────────────────────────────────────────────────
console.log('\nT7 — dwa boothy w JEDNYM procesie musza dac IDENTYCZNY swiat');
{
  // ⚠ TEN PIN POWSTAL Z MOJEGO BLEDU POMIARU. `GameCore.boot` czysci `EntityManager` i `EventBus`,
  //   ale NIE reseeduje PRNG i NIE resetuje `gameState` (singleton z `director.rules`). Drugi boot
  //   w tym samym procesie dostawal INNA galaktyke i cudze cooldowny regul. Tabela R0-vs-R4
  //   puszczona tak dala R4 „pop 36, Fe 19 826"; te same warianty w osobnych procesach — „pop 6".
  //   Falszywy wynik trafil do commita `8226dcc`. Bez tego pinu KAZDA przyszla tabela
  //   porownawcza jest podejrzana.
  const probka = () => {
    const { ticker, K } = bootWithDirector({ aiEmpires: true });
    ticker.run(120, { quiet: true });
    const emp = K.empireRegistry.listAll()[0]?.id;
    const c = K.directorProduction.capitalOf(emp);
    const solar = [...(c?.buildingSystem?._active?.values() ?? [])]
      .filter(e => e.building?.id === 'solar_farm').length;
    return { emp, pop: Math.floor(c?.civSystem?.population ?? -1),
             Fe: Math.floor(c?.resourceSystem?.getAmount?.('Fe') ?? -1), solar };
  };
  const a = probka(), b = probka();
  assert(a.pop > 0 && a.emp,
    `T7k NIEJALOWOSC: pierwszy boot dal zywy swiat (${a.emp}, pop ${a.pop}) — inaczej „identyczne" ` +
    'byloby prawda o dwoch pustkach');
  assert(a.emp === b.emp && a.pop === b.pop && a.Fe === b.Fe && a.solar === b.solar,
    `T7: drugi boot w tym samym procesie jest IDENTYCZNY z pierwszym ` +
    `(#1 ${JSON.stringify(a)} vs #2 ${JSON.stringify(b)})`);
  const HARNESS = src('../headless/DirectorHarness.js');
  assert(/reseed\(/.test(HARNESS) && /gameState\.restore\(null\)/.test(HARNESS),
    'T7b PIN ZRODLOWY: harness reseeduje PRNG i resetuje `gameState` przed bootem — dwa konkretne ' +
    'przecieki, ktorych `GameCore.boot` nie zamyka');
}

console.log(`\n${fail === 0 ? 'OK' : 'FAIL'} — ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
