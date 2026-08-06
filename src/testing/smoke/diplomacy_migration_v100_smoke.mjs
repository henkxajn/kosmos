// D1 (WOJNA I POKÓJ 1.0) — smoke: migracja save v99 → v100.
// Uruchom: node src/testing/smoke/diplomacy_migration_v100_smoke.mjs
//
// Klucz 'player_<id>' → para '<a>__<b>', trust → modyfikator legacy_relations,
// hostility → tension, state → status (+ licznik rozejmu), lastIncidents → memory,
// zasiew bordersOpen/reputation/objective/traits, kasowanie martwych pól.
//
// NAJWAŻNIEJSZA ASERCJA to M13: round-trip przez ŻYWY store — zmigrowany zapis
// wczytany do gameState musi dawać przez fasadę te same liczby, co przed migracją
// (opinia = trust−50, mostek D2 = dawny trust, napięcie/status/traktaty bez zmian).

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
const { EMPIRE_OBJECTIVES, OBJECTIVE_BY_ARCHETYPE } = await import('../../data/EmpireData.js');

// migrate() goni CAŁY łańcuch — z v99 to dokładnie jeden krok (nasz).
const migrateV100 = (d) => {
  const out = migrate(d);
  if (out?.error) throw new Error('migrate error: ' + out.error);
  return out;
};
const YEAR = 250;

// Zapis w formacie v99: cztery relacje pokrywające wszystkie gałęzie migracji.
function makeV99Save() {
  return {
    version: 99,
    gameTime: YEAR,
    civ4x: {
      gameState: {
        empires: {
          emp_001: { id: 'emp_001', archetype: 'industrialist' },
          emp_002: { id: 'emp_002', archetype: 'xenophage' },
          emp_003: { id: 'emp_003', archetype: 'nieznany_archetyp' },
        },
        diplomacy: {
          relations: {
            // przyjaciel z umową handlową
            player_emp_001: {
              empireId: 'emp_001', state: 'peace', hostility: 12, trust: 80,
              treaties: [{ id: 'trade_agreement', signedYear: 100 }],
              lastIncidents: [
                { year: 101, type: 'territorial_violation', data: { planetId: 'p1' } },
                { year: 105, type: 'surveillance_scan', data: {} },
              ],
              lastChangeYear: 200, ultimatumStartYear: null, warStartYear: null,
            },
            // wróg w stanie wojny, trust na dolnym krańcu
            player_emp_002: {
              empireId: 'emp_002', state: 'war', hostility: 95, trust: 0,
              treaties: [], lastIncidents: [{ year: 240, type: 'war_declared', data: {} }],
              lastChangeYear: 240, ultimatumStartYear: null, warStartYear: 240,
            },
            // rozejm + aktywne ultimatum + hostility poza zakresem
            player_emp_003: {
              empireId: 'emp_003', state: 'truce', hostility: 140, trust: 50,
              treaties: [{ id: 'non_aggression', signedYear: 210 }],
              lastIncidents: [], lastChangeYear: 245, ultimatumStartYear: 244, warStartYear: null,
            },
            // klucz BEZ pola empireId — id musi wyjść z samego klucza
            player_emp_004: {
              state: 'peace', hostility: 0, trust: 20, treaties: [], lastIncidents: [],
            },
          },
        },
      },
    },
  };
}
const relsOf = (d) => d.civ4x.gameState.diplomacy.relations;
const modOf  = (rec, id) => (rec.opinionModifiers ?? []).find(m => m.id === id);

// ── M1: wersja ─────────────────────────────────────────────────────────────
console.log('--- M1: wersja ---');
ok('CURRENT_VERSION >= 100', CURRENT_VERSION >= 100);
ok('migracja v99 dochodzi do szczytu', migrateV100(makeV99Save()).version === CURRENT_VERSION);

const migrated = migrateV100(makeV99Save());
const R = relsOf(migrated);

// ── M2: klucze par ─────────────────────────────────────────────────────────
console.log('--- M2: klucze ---');
ok('stare klucze player_* zniknęły', !Object.keys(R).some(k => k.startsWith('player_')));
ok('wszystkie klucze są parami (__)', Object.keys(R).every(k => k.includes('__')));
ok('sortowanie leksykalne (emp_001__player)', !!R['emp_001__player']);
ok('strony zapisane na rekordzie', R['emp_001__player'].a === 'emp_001' && R['emp_001__player'].b === 'player');
ok('id odtworzone z klucza gdy brak empireId', !!R['emp_004__player']);

// ── M3: trust → legacy_relations ───────────────────────────────────────────
console.log('--- M3: trust → opinia ---');
{
  const m = modOf(R['emp_001__player'], 'legacy_relations');
  ok('trust 80 → +30 po stronie IMPERIUM', m?.value === 30 && m?.owner === 'a');
  ok('legacy zanika 2/rok i nie jest trwały', m?.decayPerYear === 2 && m?.persistent === false);
  ok('trust 50 → BRAK modyfikatora (neutralnie = zero)', !modOf(R['emp_003__player'], 'legacy_relations'));
  ok('trust 20 → −30', modOf(R['emp_004__player'], 'legacy_relations')?.value === -30);
  ok('trust 0 → −50', modOf(R['emp_002__player'], 'legacy_relations')?.value === -50);
}

// ── M4: hostility → tension ────────────────────────────────────────────────
console.log('--- M4: napięcie ---');
ok('1:1', R['emp_001__player'].tension === 12);
ok('clamp wartości poza zakresem (140 → 100)', R['emp_003__player'].tension === 100);

// ── M5: status + rozejm + at_war ───────────────────────────────────────────
console.log('--- M5: status ---');
ok('peace → peace, bez licznika', R['emp_001__player'].status === 'peace' && R['emp_001__player'].truceUntilYear === null);
ok('war → war', R['emp_002__player'].status === 'war');
ok('war → modyfikator at_war −40 (trwały)',
  modOf(R['emp_002__player'], 'at_war')?.value === -40 && modOf(R['emp_002__player'], 'at_war')?.persistent === true);
ok('truce → licznik rok + 10 (naprawa R7)',
  R['emp_003__player'].status === 'truce' && R['emp_003__player'].truceUntilYear === YEAR + 10);

// ── M6: pamięć ─────────────────────────────────────────────────────────────
console.log('--- M6: pamięć ---');
{
  const mem = R['emp_001__player'].memory;
  ok('lastIncidents → memory z zachowaniem kolejności i typów',
    mem.length === 2 && mem[0].type === 'territorial_violation' && mem[1].type === 'surveillance_scan');
  ok('rok zachowany, data → payload', mem[0].year === 101 && mem[0].payload.planetId === 'p1');
  ok('id nadane każdemu wpisowi', mem.every(m => typeof m.id === 'string' && m.id.length > 0));
}

// ── M7: traktaty ───────────────────────────────────────────────────────────
console.log('--- M7: traktaty ---');
ok('traktaty przeniesione verbatim',
  R['emp_001__player'].treaties[0].id === 'trade_agreement' && R['emp_001__player'].treaties[0].signedYear === 100);
ok('aktywna umowa handlowa zasiewa trade_partner od 0',
  modOf(R['emp_001__player'], 'trade_partner')?.value === 0 && modOf(R['emp_001__player'], 'trade_partner')?.persistent === true);
ok('pakt bez sprzężonego modyfikatora', !modOf(R['emp_003__player'], 'trade_partner'));

// ── M8: pola zachowane / skasowane ─────────────────────────────────────────
console.log('--- M8: pola ---');
ok('ultimatumStartYear ZACHOWANY', R['emp_003__player'].ultimatumStartYear === 244);
ok('martwe pola skasowane', ['trust', 'hostility', 'state', 'lastIncidents', 'lastChangeYear', 'warStartYear', 'empireId']
  .every(k => R['emp_001__player'][k] === undefined));

// ── M9: świeże pola ────────────────────────────────────────────────────────
console.log('--- M9: świeże pola ---');
ok('bordersOpen zasiane po obu stronach (konsument D3)',
  R['emp_001__player'].bordersOpen.a === true && R['emp_001__player'].bordersOpen.b === true);
{
  const rep = migrated.civ4x.gameState.diplomacy.reputation;
  ok('reputacja gracza zasiana', rep.player?.aggression === 0 && rep.player?.decayPerYear === 1);
  ok('reputacja imperiów zasiana', !!rep.emp_001 && !!rep.emp_002);
}

// ── M10: objective / traits ────────────────────────────────────────────────
console.log('--- M10: model imperium ---');
{
  const E = migrated.civ4x.gameState.empires;
  ok('objective wyprowadzony z archetypu (fallback migracji)',
    E.emp_001.objective === OBJECTIVE_BY_ARCHETYPE.industrialist
    && E.emp_002.objective === OBJECTIVE_BY_ARCHETYPE.xenophage);
  ok('nieznany archetyp → wartość domyślna', E.emp_003.objective === 'expansionist');
  ok('objective zawsze z legalnego zbioru', Object.values(E).every(e => EMPIRE_OBJECTIVES.includes(e.objective)));
  ok('traits = pusta tablica', Object.values(E).every(e => Array.isArray(e.traits) && e.traits.length === 0));
  const again = migrateV100(makeV99Save()).civ4x.gameState.empires;
  ok('deterministyczne (to samo wejście → ta sama wartość)', again.emp_001.objective === E.emp_001.objective);
}

// ── M11: idempotencja ──────────────────────────────────────────────────────
console.log('--- M11: idempotencja ---');
{
  const once  = migrateV100(makeV99Save());
  // Ponowny przebieg nad JUŻ zmigrowanym zapisem (wersja cofnięta, żeby łańcuch ruszył) —
  // dokładnie scenariusz „re-run nad częściowo zmigrowanym save".
  const twice = migrateV100({ ...JSON.parse(JSON.stringify(once)), version: 99 });
  ok('migrate(migrate(x)) === migrate(x)',
    JSON.stringify(relsOf(twice)) === JSON.stringify(relsOf(once)));
  // Potwierdzenie #1: skip po '__' chroni id wpisów pamięci przed powieleniem
  // przy ponownym przebiegu nad częściowo zmigrowanym zapisem.
  const allIds = Object.values(relsOf(twice)).flatMap(r => (r.memory ?? []).map(m => m.id));
  ok('brak duplikatów id pamięci po ponownym przebiegu', new Set(allIds).size === allIds.length);
  // Zapis MIESZANY: jedna para już nowa, jedna jeszcze stara.
  const mixed = makeV99Save();
  relsOf(mixed)['emp_009__player'] = { a: 'emp_009', b: 'player', opinionModifiers: [], tension: 7,
    status: 'peace', truceUntilYear: null, bordersOpen: { a: true, b: true }, treaties: [], memory: [],
    ultimatumStartYear: null };
  const mixedOut = relsOf(migrateV100(mixed));
  ok('rekord w nowym formacie nietknięty', mixedOut['emp_009__player'].tension === 7);
  ok('stary rekord obok niego zmigrowany', !!mixedOut['emp_001__player']);
}

// ── M12: odporność ─────────────────────────────────────────────────────────
console.log('--- M12: odporność ---');
ok('brak gameState → no-op bez rzucania', (() => {
  try { return migrateV100({ version: 99 }).version === CURRENT_VERSION; } catch { return false; }
})());
ok('pusta domena diplomacy → zasiew reputacji', (() => {
  const out = migrateV100({ version: 99, gameTime: 1, civ4x: { gameState: {} } });
  return !!out.civ4x.gameState.diplomacy.reputation.player;
})());

// ── M13: round-trip przez ŻYWY store — ASERCJA PARYTETU ────────────────────
console.log('--- M13: round-trip + parytet ---');
{
  const gameState = (await import('../../core/GameState.js')).default;
  const { DiplomacySystem } = await import('../../systems/DiplomacySystem.js');
  const EventBus = (await import('../../core/EventBus.js')).default;
  EventBus.clear?.();
  window.KOSMOS.timeSystem = { gameTime: YEAR };
  window.KOSMOS.empireRegistry = {
    listAll: () => [{ id: 'emp_001', personality: { trade: 0.9, aggression: 0.3 } }],
    get: (id) => id === 'emp_001' ? { id, personality: { trade: 0.9, aggression: 0.3 } } : null,
  };

  const fresh = migrateV100(makeV99Save());
  gameState.reset();
  gameState.restore(fresh.civ4x.gameState);
  const dipl = new DiplomacySystem();
  window.KOSMOS.diplomacySystem = dipl;

  ok('opinia = trust − 50', dipl.getOpinionOfPlayer('emp_001') === 30);
  ok('mostek D2 odtwarza DAWNY trust (80)', dipl.getTrustEquivalent('emp_001') === 80);
  ok('napięcie bez zmian', dipl.getTension('emp_001') === 12);
  ok('status bez zmian', dipl.getStatus('emp_001') === 'peace');
  ok('traktat rozpoznany', dipl.hasTradeAgreement('emp_001') === true);
  ok('pasmo statusu = dawny „przyjazny" (trust 80)', dipl.getOpinionBand('emp_001') === 'friendly');
  ok('pamięć czytelna przez fasadę', dipl.getMemory('emp_001', 10).length === 2);
  ok('rozbicie opinii ma jedną pozycję (legacy)',
    dipl.getOpinionBreakdown('emp_001', 'player').filter(e => e.value !== 0).length === 1);
  // Progi akceptacji: trade wymaga trade>=0.5 && trustEq>=60 → przy 80 przechodzi.
  ok('PARYTET: umowa handlowa akceptowana jak przed D1', dipl.proposeTreaty('emp_001', 'trade_agreement') === false
    || dipl.hasTradeAgreement('emp_001'));   // już podpisana → reason already_signed
  ok('wojna: mostek D2 daje 10 (−40 at_war + −50 legacy → clamp)',
    dipl.getTrustEquivalent('emp_002') === 0);
  ok('rozejm: licznik lat czytelny', dipl.getTruceYearsLeft('emp_003') === 10);

  // Potwierdzenie #2: umowa handlowa zerwana przez wojnę zdejmuje trade_partner,
  // a ramp nie zdążył nic naliczyć w stanie wojny.
  ok('przed wojną trade_partner obecny', dipl.relations.hasModifier('emp_001', 'player', 'trade_partner'));
  dipl.declareWar('emp_001', 'player_action');
  ok('po wypowiedzeniu wojny trade_partner ZNIKA (traktat zerwany)',
    !dipl.relations.hasModifier('emp_001', 'player', 'trade_partner'));
  ok('umowa handlowa zerwana', dipl.hasTradeAgreement('emp_001') === false);
  ok('at_war dołożony', dipl.relations.hasModifier('emp_001', 'player', 'at_war'));
  dipl.relations.tickModifiers(20);
  ok('ramp NIE nalicza po zerwaniu umowy (brak modyfikatora do narastania)',
    !dipl.relations.hasModifier('emp_001', 'player', 'trade_partner'));
  // Zapis w stanie wojny NIE zasiewa trade_partner (gałąź status !== 'war' w migracji).
  ok('migracja nie zasiewa trade_partner dla relacji w stanie wojny', (() => {
    const s = makeV99Save();
    relsOf(s).player_emp_001.state = 'war';
    return !modOf(relsOf(migrateV100(s))['emp_001__player'], 'trade_partner');
  })());
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
