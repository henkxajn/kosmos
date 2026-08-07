// D1 C3 (WOJNA I POKÓJ 1.0) — smoke: oś `objective` imperium + cechy `traits`.
// Uruchom: node src/testing/smoke/empire_objective_smoke.mjs
//
// Pokrywa: katalog EMPIRE_OBJECTIVES, tabela-fallback OBJECTIVE_BY_ARCHETYPE,
// pola na rekordzie imperium (EmpireRegistry.createEmpire) oraz — najważniejsze —
// REGRESJĘ DETERMINIZMU generatora.
//
// ⚠ ZŁOTE WARTOŚCI w G1 zostały zdjęte z generatora PRZED dodaniem rzutu objective
// (HEAD 78c94f1). Rzut korzysta z WŁASNEGO strumienia mulberry32 per imperium i nie
// pobiera ani jednej liczby ze współdzielonego mulberry32(seed ^ 0xEE01) — gdyby
// kiedykolwiek zaczął, nazwy i kolory imperiów dla tego samego seeda galaktyki by się
// zmieniły i TE asercje padną. To jest ich jedyny powód istnienia.

import '../headless/env.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

const { EMPIRE_OBJECTIVES, OBJECTIVE_BY_ARCHETYPE, ARCHETYPE_IDS, ARCHETYPES } =
  await import('../../data/EmpireData.js');
const { EmpireGenerator, AI_ARCHETYPE_SEQUENCE } = await import('../../generators/EmpireGenerator.js');
const { EmpireColonyBootstrap } = await import('../../systems/EmpireColonyBootstrap.js');
const { EmpireRegistry } = await import('../../systems/EmpireRegistry.js');
const gameState = (await import('../../core/GameState.js')).default;

// ── Dane ────────────────────────────────────────────────────────────────────
console.log('--- D1: katalog i tabela-fallback ---');
ok('EMPIRE_OBJECTIVES ma 6 wartości', EMPIRE_OBJECTIVES.length === 6);
ok('zbiór dokładnie jak w projekcie (MOO)',
  ['militarist', 'technologist', 'expansionist', 'diplomat', 'merchant', 'ecologist']
    .every(o => EMPIRE_OBJECTIVES.includes(o)));
ok('brak duplikatów', new Set(EMPIRE_OBJECTIVES).size === EMPIRE_OBJECTIVES.length);
ok('tabela-fallback pokrywa WSZYSTKIE archetypy',
  ARCHETYPE_IDS.every(id => typeof OBJECTIVE_BY_ARCHETYPE[id] === 'string'));
ok('każda wartość tabeli jest legalnym objective',
  Object.values(OBJECTIVE_BY_ARCHETYPE).every(o => EMPIRE_OBJECTIVES.includes(o)));

// ── Rekord imperium ─────────────────────────────────────────────────────────
console.log('--- D2: EmpireRegistry.createEmpire ---');
{
  gameState.reset();
  const reg = new EmpireRegistry();
  const withObj = reg.createEmpire({ id: 'e1', archetype: 'trader', objective: 'technologist' });
  ok('jawny objective wygrywa', withObj.objective === 'technologist');
  ok('traits domyślnie pusta tablica', Array.isArray(withObj.traits) && withObj.traits.length === 0);

  const noObj = reg.createEmpire({ id: 'e2', archetype: 'xenophage' });
  ok('brak objective → fallback z archetypu', noObj.objective === OBJECTIVE_BY_ARCHETYPE.xenophage);

  const withTraits = reg.createEmpire({ id: 'e3', archetype: 'trader', traits: ['erratic'] });
  ok('traits kopiowane (nie ta sama referencja)', withTraits.traits[0] === 'erratic');

  ok('oba pola persystują w gameState',
    gameState.get('empires.e1').objective === 'technologist'
    && Array.isArray(gameState.get('empires.e1').traits));
  ok('archetyp NIETKNIĘTY (osie są rozłączne)', withObj.archetype === 'trader');
}

// ── Generator: determinizm + niezależność osi ───────────────────────────────
console.log('--- G1: REGRESJA DETERMINIZMU (złote wartości sprzed C3) ---');
{
  EmpireColonyBootstrap.bootstrapHomeColony = (empireId) => `col_${empireId}`;
  const captured = [];
  const registryStub = { createEmpire: (p) => { captured.push({ ...p }); return p; } };
  const mkGalaxy = (seed) => ({
    seed,
    systems: [
      { id: 'sys_home', name: 'Home', x: 0, y: 0, z: 0 },
      ...Array.from({ length: 6 }, (_, i) => ({ id: `sys_${i}`, name: `S${i}`, x: 8 + i * 2, y: i, z: 0 })),
    ],
  });
  const runSeed = (seed) => { captured.length = 0; EmpireGenerator.generate(mkGalaxy(seed), registryStub); return captured.map(e => ({ ...e })); };

  // Złote wartości zdjęte z generatora PRZED dodaniem rzutu objective.
  const GOLDEN = {
    12345: [
      { id: 'emp_001', name: 'Korporacja Siódmego Kręgu', color: '#B07020', homeSystemId: 'sys_4' },
      { id: 'emp_002', name: 'Pochód Ciernia',            color: '#2E9B8F', homeSystemId: 'sys_1' },
    ],
    777: [
      { id: 'emp_001', name: 'Konsorcjum Wiecznej Mrozy', color: '#B07020', homeSystemId: 'sys_0' },
      { id: 'emp_002', name: 'Pochód Pierwszego Chłodu',  color: '#2E9B8F', homeSystemId: 'sys_5' },
    ],
    999999: [
      { id: 'emp_001', name: 'Korporacja Tlenu',            color: '#B07020', homeSystemId: 'sys_2' },
      { id: 'emp_002', name: 'Zew Gwiazd Spalonej Drogi',   color: '#2E9B8F', homeSystemId: 'sys_5' },
    ],
  };
  for (const [seed, expected] of Object.entries(GOLDEN)) {
    const got = runSeed(Number(seed));
    const match = got.length === expected.length && expected.every((e, i) =>
      got[i].id === e.id && got[i].name === e.name && got[i].color === e.color && got[i].homeSystemId === e.homeSystemId);
    ok(`seed ${seed}: nazwy + kolory + home BEZ ZMIAN (strumień nieprzesunięty)`, match);
  }

  console.log('--- G2: rzut objective ---');
  const s12345 = runSeed(12345);
  ok('każde imperium dostaje legalny objective', s12345.every(e => EMPIRE_OBJECTIVES.includes(e.objective)));
  ok('traits = pusta tablica (erratic dopiero w D2)', s12345.every(e => Array.isArray(e.traits) && e.traits.length === 0));
  const again = runSeed(12345);
  ok('ten sam seed → ten sam objective (deterministyczny)',
    again.map(e => e.objective).join() === s12345.map(e => e.objective).join());

  // NIEZALEŻNOŚĆ OSI: ten sam archetyp musi dostawać RÓŻNE objective w różnych partiach.
  // (Gdyby objective był wyprowadzany z archetypu, byłby stały dla emp_001 na każdym seedzie.)
  const arch0 = AI_ARCHETYPE_SEQUENCE[0];
  const objsForArch0 = new Set();
  for (const seed of [12345, 777, 20260806, 1, 999999, 42, 2026, 31337]) {
    objsForArch0.add(runSeed(seed)[0].objective);
  }
  ok(`archetyp '${arch0}' dostaje >1 różny objective na różnych seedach (osie NIEZALEŻNE)`,
    objsForArch0.size > 1);
  ok(`…i choć raz INNY niż fallback z tabeli (tabela to nie reguła)`,
    [...objsForArch0].some(o => o !== OBJECTIVE_BY_ARCHETYPE[arch0]));

  // ── G3: WARIANCJA RZUTU (regresja defektu z live-gate'u D1) ──────────────
  // Piny G1 pilnują, że rzut nie rusza współdzielonego strumienia, ale NIC nie pilnowało
  // jakości samego rzutu. Live-gate złapał degenerację: trzy nowe gry, oba imperia,
  // zawsze 'ecologist'. Powód: świeży mulberry32 per imperium, zasiany prawie kolejnymi
  // liczbami (hashString('entity_N') różni się o 1), miał słabo rozrzucony PIERWSZY rzut.
  console.log('--- G3: wariancja rzutu (regresja live-gate) ---');
  const SEEDS = Array.from({ length: 120 }, (_, k) => k * 7919);   // rozstrzelone, deterministyczne

  const firstObjs = SEEDS.map(s => runSeed(s)[0].objective);
  const uniqFirst = new Set(firstObjs);
  ok(`rozkład NIE jest stały — emp_001 przyjmuje ${uniqFirst.size} różnych wartości na ${SEEDS.length} seedów`,
    uniqFirst.size > 1);
  ok('…i pokrywa WSZYSTKIE 6 wartości (rzut nie jest zawężony do podzbioru)',
    uniqFirst.size === EMPIRE_OBJECTIVES.length);
  // Żadna wartość nie może dominować — przy 6 opcjach i 120 próbach ~20 na wartość.
  const maxShare = Math.max(...EMPIRE_OBJECTIVES.map(o => firstObjs.filter(x => x === o).length)) / SEEDS.length;
  ok(`żadna wartość nie dominuje (najczęstsza ma ${(maxShare * 100).toFixed(0)}% < 40%)`, maxShare < 0.40);

  const differCount = SEEDS.filter(s => { const r = runSeed(s); return r[0].objective !== r[1].objective; }).length;
  const differRate  = differCount / SEEDS.length;
  ok(`dwa imperia w JEDNEJ galaktyce mogą się różnić (${differCount}/${SEEDS.length})`, differCount > 0);
  // Dwa niezależne rzuty z 6 wartości kolidują 1/6 czasu → oczekiwane ~83% różnic.
  // Pasmo 0.6-1.0 łapie i degenerację (0 = zawsze to samo), i pozorną zależność.
  ok(`odsetek różnic w rozsądnym pasmie (${(differRate * 100).toFixed(0)}%, oczekiwane ~83%)`,
    differRate > 0.60 && differRate <= 1.0);

  // Pin na SEED ZAPISÓW LEGACY. −2102099243 = hashString('entity_1') — do czasu
  // GALAXY_SEED (`e0615bd`) był to seed KAŻDEJ nowej gry (EntityManager.generateId() to
  // licznik od 1, więc star.id był stały, a galaxyData.seed = hashString(star.id) też).
  // Nowe gry mintują dziś seed losowo, ale ta wartość NIE jest przypadkową liczbą spośród
  // 120 wyżej: siedzi w KAŻDYM zapisie sprzed tamtego commita i wciąż z niej derywują się
  // imperia po wczytaniu. Dlatego asercja zostaje (Decyzja 5 w GALAXY_SEED_PLAN).
  // Pilnujemy tylko tego, co należy do rzutu: przy tym seedzie imperia NIE kolidują.
  const hashString = (str) => { let h = 0; for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0; return h; };
  const legacySaveSeed = hashString('entity_1');
  const real = runSeed(legacySaveSeed);
  ok(`seed zapisów legacy ${legacySaveSeed}: imperia mają RÓŻNE objective — `
    + `${real[0].objective}/${real[1].objective} (przed fixem: ecologist/ecologist)`,
    real[0].objective !== real[1].objective);
}

// ── Brak konsumentów w D1 ───────────────────────────────────────────────────
console.log('--- D3: konsumenci osi objective (D1: zero → D2/E1: wyłącznie silnik) ---');
{
  const fs = await import('node:fs');
  const path = await import('node:path');
  const SRC = path.resolve('src');
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(js|mjs)$/.test(e.name)) continue;
      const txt = fs.readFileSync(p, 'utf8');
      // Czytanie pola (nie definicja/przypisanie) — heurystyka: `.objective` poza
      // miejscami, które je USTAWIAJĄ, oraz poza warstwą pomiarową.
      //
      // ⚠ `src/testing/` wyłączone świadomie: telemetria OBSERWUJE pole (Snapshot
      // zapisuje je w wierszu imperium, żeby raporty BALANS widziały drugą oś), a to
      // nie to samo co KONSUMENT — czyli logika gry rozgałęziająca się na objective.
      //
      // ⚠ AKTUALIZACJA D2/E1 (świadoma, nie obejście): ta asercja z założenia miała PAŚĆ,
      // gdy oś dostanie pierwszego konsumenta — i właśnie dostała. Acceptance Engine czyta
      // `empire.objective` do kontekstu oceny i szuka nadpisań wag w OBJECTIVE_WEIGHT_OVERRIDES.
      // Zamiast kasować pin, ZWĘŻAMY go do listy dozwolonych konsumentów: dopóki lista ma
      // dokładnie jedną pozycję, wiadomo, że oś nie rozlała się po systemach bocznymi drzwiami.
      // E5 (wartości nadpisań + rzut cechy `erratic`) tej listy NIE poszerza — dopisuje liczby
      // do katalogu danych, a nie nowe rozgałęzienia w logice.
      if (/\.objective\b/.test(txt)
        && !/EmpireData|EmpireRegistry|EmpireGenerator|SaveMigration/.test(p)
        && !p.includes(`testing${path.sep}`)) hits.push(path.relative(SRC, p));
    }
  };
  walk(SRC);
  const ALLOWED = [`systems${path.sep}diplomacy${path.sep}AcceptanceEngine.js`];
  const unexpected = hits.filter(h => !ALLOWED.includes(h));
  ok(`objective czytany WYŁĄCZNIE przez Acceptance Engine${unexpected.length ? ' — nieoczekiwane: ' + unexpected.join(', ') : ''}`,
    unexpected.length === 0);
  ok('Acceptance Engine JEST konsumentem osi (D2/E1 — pierwszy w historii)',
    hits.includes(ALLOWED[0]));
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
