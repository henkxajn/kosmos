// W2 (WOJNA I POKÓJ 1.0) — smoke: migracja save v100 → v101.
// Uruchom: node src/testing/smoke/w2_migration_v101_smoke.mjs
//
// Zasiew trzech pól modelu rozmieszczenia na KAŻDYM statku: `serviceState` ('active'),
// `mobilizeProgress` (0), `crewLocked` (0). Pierwszy bump od v100.
//
// NAJWAŻNIEJSZA ASERCJA to M9: round-trip przez ŻYWY `VesselManager` — zmigrowany zapis
// wczytany do rejestru musi dać statek, który zachowuje się jak PRZED migracją, czyli
// jest W SŁUŻBIE. Sama obecność pola w blobie nic nie dowodzi: `restore` przepisuje statek
// literałem pole po polu i pominięte pole ginie po cichu (audyt W2 §S3).
//
// ⚠ IDEMPOTENCJA JEST TU WYMOGIEM BEZPIECZEŃSTWA DANYCH, NIE HIGIENY. Zapis zmigrowanego
//   stanu jest best-effort (`try/catch` w `migrate`), a `TitleScene._prepareContinue` przy
//   `saveData.error` woła `SaveSystem.clearSave()` — migracja, która rzuci albo popsuje
//   dane przy drugim przebiegu, KASUJE ZAPIS GRACZA. Stąd M3/M4.

globalThis.window = globalThis.window ?? {};
globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? {};
globalThis.localStorage = globalThis.localStorage ?? {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, v); },
  removeItem(k) { this._m.delete(k); },
  get length() { return this._m.size; },
  key(i) { return [...this._m.keys()][i] ?? null; },
};

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

const { CURRENT_VERSION, migrate } = await import('../../systems/SaveMigration.js');

const clone = (o) => JSON.parse(JSON.stringify(o));
const mig   = (d) => migrate(clone(d));

// Zapis v100 z trzema statkami — bez ANI JEDNEGO z nowych pól (tak wygląda realny stary save).
const legacySave = () => ({
  version: 100,
  civ4x: {
    civMode: true,
    vesselManager: {
      vessels: [
        { id: 'v_1', shipId: 'hull_frigate', name: 'Weteran',  colonyId: 'home', homeColonyId: 'home',
          position: { x: 1, y: 2, state: 'docked', dockedAt: 'home' }, modules: ['weapon_kinetic'],
          fuel: { current: 10, max: 10, consumption: 1 }, status: 'idle' },
        { id: 'v_2', shipId: 'hull_small',   name: 'Kurier',   colonyId: 'home', homeColonyId: 'home',
          position: { x: 3, y: 4, state: 'orbiting', dockedAt: 'home' }, modules: [],
          fuel: { current: 5, max: 5, consumption: 1 }, status: 'idle' },
        { id: 'v_3', shipId: 'hull_frigate', name: 'Wrak',     colonyId: 'home', homeColonyId: 'home',
          position: { x: 5, y: 6, state: 'orbiting', dockedAt: null }, modules: ['weapon_kinetic'],
          fuel: { current: 0, max: 10, consumption: 1 }, status: 'destroyed', isWreck: true },
      ],
      nextVesselId: 4,
    },
  },
});

// ── M1/M2 — wersja i zasiew ─────────────────────────────────────────────────────────────────
{
  const out = mig(legacySave());
  ok('M1: CURRENT_VERSION >= 101 (pin ZAKRESOWY, nie punktowy — README)', CURRENT_VERSION >= 101);
  ok('M2: zapis ostemplowany bieżącą wersją', out.version === CURRENT_VERSION);
  ok('M2: migracja nie zwróciła błędu', !out.error);

  const vs = out.civ4x.vesselManager.vessels;
  ok('M2: KAŻDY statek dostał serviceState="active" — stary zapis nie miał rezerwy',
    vs.length === 3 && vs.every(v => v.serviceState === 'active'));
  ok('M2: mobilizeProgress = 0 na każdym', vs.every(v => v.mobilizeProgress === 0));
  ok('M2: crewLocked = 0 na każdym (GRANDFATHERING — decyzja 8, patrz komentarz migracji)',
    vs.every(v => v.crewLocked === 0));
  ok('M2: WRAK też dostaje pola (jednolity kształt rekordu, bez wyjątków)',
    vs.find(v => v.id === 'v_3')?.serviceState === 'active');
}

// ── M3/M4 — idempotencja (wymóg bezpieczeństwa danych) ──────────────────────────────────────
{
  const once  = mig(legacySave());
  const twice = mig(once);
  ok('M3: drugi przebieg NICZEGO nie zmienia (bajt w bajt)',
    JSON.stringify(twice.civ4x) === JSON.stringify(once.civ4x));

  // Zapis, w którym część statków JUŻ ma nowe pola (przerwana migracja / save mieszany).
  const mixed = legacySave();
  mixed.civ4x.vesselManager.vessels[1].serviceState     = 'stored';
  mixed.civ4x.vesselManager.vessels[1].mobilizeProgress = 0.5;
  mixed.civ4x.vesselManager.vessels[1].crewLocked       = 0.4;
  const out = mig(mixed);
  const v2 = out.civ4x.vesselManager.vessels.find(v => v.id === 'v_2');
  ok('M4: istniejący stan REZERWY nie jest nadpisywany (`??=`, nie przypisanie)',
    v2.serviceState === 'stored' && v2.mobilizeProgress === 0.5 && v2.crewLocked === 0.4);
  ok('M4: sąsiedzi bez pól i tak dostają zasiew',
    out.civ4x.vesselManager.vessels.find(v => v.id === 'v_1').serviceState === 'active');
}

// ── M5/M6/M7 — odporność na braki i determinizm ─────────────────────────────────────────────
{
  ok('M5: zapis BEZ civ4x (gra nie-4X) przechodzi bez błędu',
    !mig({ version: 100 }).error);
  ok('M5: zapis z civ4x, ale bez vesselManager, przechodzi bez błędu',
    !mig({ version: 100, civ4x: { civMode: true } }).error);
  ok('M5: pusta lista statków przechodzi bez błędu',
    !mig({ version: 100, civ4x: { vesselManager: { vessels: [] } } }).error);
  ok('M6: wpis `null` w liście statków nie wywraca migracji (a rzut = skasowany zapis gracza)',
    !mig({ version: 100, civ4x: { vesselManager: { vessels: [null, { id: 'v_9' }] } } }).error);

  const a = mig(legacySave()), b = mig(legacySave());
  ok('M7: determinizm — dwa przebiegi dają identyczny wynik (zero PRNG, GALAXY_SEED nietknięty)',
    JSON.stringify(a.civ4x) === JSON.stringify(b.civ4x));
}

// ── M8 — stary alias `c4x` (zapisy sprzed zmiany nazwy) ─────────────────────────────────────
{
  const legacyKey = { version: 100, c4x: { vesselManager: { vessels: [{ id: 'v_1' }] } } };
  const out = mig(legacyKey);
  ok('M8: migracja czyta też stary klucz `c4x` (wzór `data.civ4x ?? data.c4x`)',
    out.c4x.vesselManager.vessels[0].serviceState === 'active');
}

// ── M9 — ROUND-TRIP PRZEZ ŻYWY REJESTR (najważniejsza asercja) ──────────────────────────────
{
  await import('../headless/env.js');
  const { VesselManager } = await import('../../systems/VesselManager.js');
  const { isInService }   = await import('../../entities/Vessel.js');

  const out = mig(legacySave());
  const vm = new VesselManager();
  vm.restore(out.civ4x.vesselManager);

  const veteran = vm.getVessel('v_1');
  ok('M9: statek ze zmigrowanego zapisu istnieje w ŻYWYM rejestrze', !!veteran);
  ok('M9: i jest W SŁUŻBIE — czyli zachowuje się dokładnie jak przed migracją',
    isInService(veteran) === true && veteran.serviceState === 'active');
  ok('M9: `crewLocked` = 0 po przejściu przez restore (nie ginie, nie zmienia się)',
    veteran.crewLocked === 0);
  ok('M9: pola sprzed migracji przetrwały nietknięte (nazwa/pozycja)',
    veteran.name === 'Weteran' && veteran.position.dockedAt === 'home');

  // Odwrotny kierunek: rezerwa zapisana po bumpie wraca jako rezerwa.
  const stored = vm.getVessel('v_2');
  stored.serviceState = 'stored'; stored.crewLocked = 0.4;
  const vm2 = new VesselManager();
  vm2.restore(vm.serialize());
  ok('M9: REZERWA przeżywa pełny obieg serialize → restore po bumpie',
    vm2.getVessel('v_2')?.serviceState === 'stored' && vm2.getVessel('v_2')?.crewLocked === 0.4);
}

console.log(`\n[w2_migration_v101_smoke] PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
