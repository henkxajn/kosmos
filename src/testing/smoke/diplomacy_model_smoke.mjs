// D1 (WOJNA I POKÓJ 1.0) — smoke: RelationsModel + ReputationLedger na WSTRZYKNIĘTYM store.
// Uruchom: node src/testing/smoke/diplomacy_model_smoke.mjs
//
// Warstwa stanu, bez fasady: kontrakt kluczy/rekordu, głośna awaria (get rzuca),
// „odczyt NIGDY nie tworzy rekordu" (licznik zapisów), kumulacja modyfikatorów,
// napięcie/status/rozejm, pierścień pamięci, traktaty, granice, tick (ramp zawsze,
// decay TYLKO za flagą) i rejestr reputacji.
//
// Store jest atrapą liczącą zapisy — dzięki temu asercje „bez zmian ⇒ bez zapisu"
// są sprawdzane wykonaniem, a nie deklaracją (tick chodzi co rok po KAŻDEJ parze).

globalThis.window = globalThis.window ?? {};
globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? {};
globalThis.localStorage = globalThis.localStorage ?? {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, v); },
  removeItem(k) { this._m.delete(k); },
};

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };
const throws = (n, fn) => { let t = false; try { fn(); } catch { t = true; } ok(n, t); };

const { RelationsModel }   = await import('../../systems/diplomacy/RelationsModel.js');
const { ReputationLedger } = await import('../../systems/diplomacy/ReputationLedger.js');
const { GAME_CONFIG }      = await import('../../config/GameConfig.js');
const { MEMORY_MAX, OPINION_MODIFIERS } = await import('../../data/OpinionModifierData.js');

// ── Atrapa reactive store (kontrakt gameState: get/set po ścieżce z kropkami) ──
function makeStore() {
  const root = {};
  return {
    writes: 0,
    reasons: [],
    get(path) {
      if (!path) return root;
      let cur = root;
      for (const seg of path.split('.')) {
        if (cur == null) return undefined;
        cur = cur[seg];
      }
      return cur;
    },
    set(path, value, reason = '') {
      this.writes++;
      this.reasons.push(reason);
      const segs = path.split('.');
      let cur = root;
      for (const seg of segs.slice(0, -1)) {
        if (cur[seg] == null || typeof cur[seg] !== 'object') cur[seg] = {};
        cur = cur[seg];
      }
      cur[segs.at(-1)] = value;
    },
  };
}

let YEAR = 100;
const mkModel = () => { const s = makeStore(); return { s, m: new RelationsModel(s, () => YEAR) }; };

// ── M1: tworzenie rekordu i kontrakt schematu ──────────────────────────────
console.log('--- M1: ensure / get / getOrNull ---');
{
  const { s, m } = mkModel();
  ok('brak pary → getOrNull null', m.getOrNull('player', 'emp_003') === null);
  ok('brak pary → has false', m.has('player', 'emp_003') === false);
  throws('brak pary → get() RZUCA (audyt R12)', () => m.get('player', 'emp_003'));

  const rel = m.ensure('player', 'emp_003');
  ok('ensure sortuje strony (a < b)', rel.a === 'emp_003' && rel.b === 'player');
  ok('ensure zapisał pod kluczem pary', !!s.get('diplomacy.relations')['emp_003__player']);
  ok('schemat: puste kolekcje + neutralny start',
    Array.isArray(rel.opinionModifiers) && rel.opinionModifiers.length === 0
    && rel.tension === 0 && rel.status === 'peace' && rel.truceUntilYear === null
    && Array.isArray(rel.treaties) && Array.isArray(rel.memory) && rel.ultimatumStartYear === null);
  ok('schemat: bordersOpen zasiane (konsument w D3)',
    rel.bordersOpen?.a === true && rel.bordersOpen?.b === true);
  ok('schemat: BRAK martwych pól ze starego modelu',
    rel.trust === undefined && rel.hostility === undefined && rel.state === undefined
    && rel.lastIncidents === undefined && rel.lastChangeYear === undefined
    && rel.warStartYear === undefined && rel.empireId === undefined);

  const before = s.writes;
  m.ensure('emp_003', 'player');
  ok('ensure idempotentny (kolejność argumentów bez znaczenia, bez zapisu)', s.writes === before);
  ok('get() po ensure już nie rzuca', m.get('player', 'emp_003').a === 'emp_003');
  ok('listPairs zwraca klucz + rekord', m.listPairs()[0].key === 'emp_003__player');
  ok('listPairsWith filtruje po id',
    m.listPairsWith('player').length === 1 && m.listPairsWith('emp_999').length === 0);
}

// ── M2: ODCZYT NIGDY NIE TWORZY REKORDU ────────────────────────────────────
console.log('--- M2: odczyt nie wiwifikuje ---');
{
  const { s, m } = mkModel();
  const r = [
    m.getOpinion('emp_003', 'player'), m.getTension('player', 'emp_003'),
    m.getStatus('player', 'emp_003'),  m.getTruceUntilYear('player', 'emp_003'),
    m.getUltimatumStart('player', 'emp_003'),
  ];
  const lists = [m.getBreakdown('emp_003', 'player'), m.getMemory('player', 'emp_003'), m.getTreaties('player', 'emp_003')];
  ok('wartości domyślne bez rekordu', r[0] === 0 && r[1] === 0 && r[2] === 'peace' && r[3] === null && r[4] === null);
  ok('kolekcje domyślnie puste', lists.every(l => Array.isArray(l) && l.length === 0));
  ok('hasTreaty/hasModifier bez rekordu → false',
    m.hasTreaty('player', 'emp_003', 'alliance') === false && m.hasModifier('emp_003', 'player', 'at_war') === false);
  ok('bordersOpen bez rekordu → otwarte', m.getBordersOpen('emp_003', 'player') === true);
  ok('ZERO zapisów po samych odczytach (mapa Stratcom czyta per klatka)', s.writes === 0);
  ok('rejestr par nadal pusty', m.listPairs().length === 0);
}

// ── M3: walidacja id przy mutacji ──────────────────────────────────────────
console.log('--- M3: walidacja id ---');
{
  const { m } = mkModel();
  throws('mutacja z undefined id rzuca', () => m.addModifier(undefined, 'player', 'envoy_goodwill'));
  throws('mutacja ze STARYM kluczem jako id rzuca', () => m.setTension('player_emp_001', 'player', 10));
  throws('mutacja z kluczem pary jako id rzuca', () => m.addMemory('emp_001__player', 'player', 'x'));
  throws('nieznany modyfikator rzuca (literówka nie zniknie po cichu)',
    () => m.addModifier('emp_003', 'player', 'nie_ma_takiego'));
}

// ── M4: modyfikatory opinii ────────────────────────────────────────────────
console.log('--- M4: addModifier ---');
{
  const { m } = mkModel();
  const op = m.addModifier('emp_003', 'player', 'envoy_goodwill', { source: 'envoy_arrival' });
  ok('domyślna wartość z katalogu (+5)', op === 5 && m.getOpinion('emp_003', 'player') === 5);
  ok('KIERUNKOWOŚĆ: opinia gracza o nich nietknięta', m.getOpinion('player', 'emp_003') === 0);
  m.addModifier('emp_003', 'player', 'envoy_goodwill', { source: 'envoy_return' });
  ok('emisariusz kumuluje się (+5 +5 = +10, parytet)', m.getOpinion('emp_003', 'player') === 10);

  m.addModifier('emp_003', 'player', 'military_presence');
  m.addModifier('emp_003', 'player', 'military_presence');
  m.addModifier('emp_003', 'player', 'military_presence');
  ok('trzy zbrojne wizyty = −15 (nie −5)', m.getOpinion('emp_003', 'player') === 10 - 15);
  const mods = m.get('emp_003', 'player').opinionModifiers;
  ok('kumulacja mieści się w JEDNYM wpisie na id', mods.filter(x => x.id === 'military_presence').length === 1);
  ok('wpis niesie owner/decay/rok; przy kumulacji źródło = OSTATNIE zdarzenie',
    mods[0].id === 'envoy_goodwill' && mods[0].owner === 'a'
    && mods[0].decayPerYear === OPINION_MODIFIERS.envoy_goodwill.decayPerYear
    && mods[0].year === YEAR && mods[0].source === 'envoy_return');

  m.addModifier('emp_003', 'player', 'at_war');
  m.addModifier('emp_003', 'player', 'at_war');
  ok('at_war w trybie refresh — dwa razy to nadal −40',
    m.get('emp_003', 'player').opinionModifiers.filter(x => x.id === 'at_war').length === 1
    && m.getOpinion('emp_003', 'player') === -5 - 40);
  ok('jawne value nadpisuje katalog',
    m.addModifier('player', 'emp_003', 'recent_war', { value: -3 }) === -3);
  ok('hasModifier po właściwej stronie',
    m.hasModifier('emp_003', 'player', 'at_war') === true && m.hasModifier('player', 'emp_003', 'at_war') === false);
  ok('removeModifier zdejmuje i zwraca true', m.removeModifier('emp_003', 'player', 'at_war') === true);
  ok('opinia po zdjęciu at_war', m.getOpinion('emp_003', 'player') === -5);
  ok('removeModifier nieistniejącego → false', m.removeModifier('emp_003', 'player', 'at_war') === false);
}

// ── M5: napięcie ───────────────────────────────────────────────────────────
console.log('--- M5: napięcie ---');
{
  const { s, m } = mkModel();
  ok('setTension zwraca zapisaną wartość', m.setTension('player', 'emp_003', 30, 'test') === 30);
  ok('getTension czyta', m.getTension('player', 'emp_003') === 30);
  ok('clamp górny', m.setTension('player', 'emp_003', 500) === 100);
  ok('clamp dolny', m.setTension('player', 'emp_003', -50) === 0);
  const before = s.writes;
  m.setTension('player', 'emp_003', 0);
  ok('ta sama wartość → BEZ zapisu', s.writes === before);
}

// ── M6: status / rozejm ────────────────────────────────────────────────────
console.log('--- M6: status i rozejm ---');
{
  const { m } = mkModel();
  m.setStatus('player', 'emp_003', 'war');
  ok('status war + brak licznika rozejmu',
    m.getStatus('player', 'emp_003') === 'war' && m.getTruceUntilYear('player', 'emp_003') === null);
  m.setStatus('player', 'emp_003', 'truce', { truceUntilYear: YEAR + 10 });
  ok('rozejm z licznikiem', m.getStatus('player', 'emp_003') === 'truce' && m.getTruceUntilYear('player', 'emp_003') === 110);
  m.setStatus('player', 'emp_003', 'peace');
  ok('powrót do pokoju kasuje licznik', m.getTruceUntilYear('player', 'emp_003') === null);
  m.setUltimatumStart('player', 'emp_003', 105);
  ok('ultimatumStartYear zachowany na rekordzie', m.getUltimatumStart('player', 'emp_003') === 105);
  m.setUltimatumStart('player', 'emp_003', null);
  ok('ultimatum kasowalny', m.getUltimatumStart('player', 'emp_003') === null);
}

// ── M7: pierścień pamięci ──────────────────────────────────────────────────
console.log('--- M7: pamięć ---');
{
  const { m } = mkModel();
  const e = m.addMemory('player', 'emp_003', 'territorial_violation', { planetId: 'p1' });
  ok('wpis ma id/type/rok/payload',
    !!e.id && e.type === 'territorial_violation' && e.year === YEAR && e.payload.planetId === 'p1');
  for (let i = 0; i < MEMORY_MAX + 7; i++) m.addMemory('player', 'emp_003', 'surveillance_scan', { i });
  const all = m.getMemory('player', 'emp_003', 999);
  ok(`pierścień przycięty do MEMORY_MAX (${MEMORY_MAX})`, all.length === MEMORY_MAX);
  ok('najstarsze wypadają (pierwszy wpis już go nie ma)', !all.some(x => x.type === 'territorial_violation'));
  const last3 = m.getMemory('player', 'emp_003', 3);
  ok('getMemory(limit) zwraca OSTATNIE n', last3.length === 3 && last3.at(-1) === all.at(-1));
  ok('id wpisów unikalne', new Set(all.map(x => x.id)).size === all.length);
}

// ── M8: traktaty ───────────────────────────────────────────────────────────
console.log('--- M8: traktaty ---');
{
  const { m } = mkModel();
  ok('addTreaty true', m.addTreaty('player', 'emp_003', { id: 'trade_agreement' }) === true);
  ok('signedYear z zegara', m.getTreaties('player', 'emp_003')[0].signedYear === YEAR);
  ok('dedupe po id → false', m.addTreaty('player', 'emp_003', { id: 'trade_agreement' }) === false);
  ok('hasTreaty', m.hasTreaty('player', 'emp_003', 'trade_agreement') === true);
  ok('traktat bez id odrzucony', m.addTreaty('player', 'emp_003', {}) === false);
  ok('removeTreaty true', m.removeTreaty('player', 'emp_003', 'trade_agreement') === true);
  ok('removeTreaty nieistniejącego → false', m.removeTreaty('player', 'emp_003', 'trade_agreement') === false);
}

// ── M9: granice (schemat D1, konsument D3) ─────────────────────────────────
console.log('--- M9: granice ---');
{
  const { m } = mkModel();
  m.ensure('player', 'emp_003');
  ok('domyślnie otwarte po obu stronach',
    m.getBordersOpen('player', 'emp_003') === true && m.getBordersOpen('emp_003', 'player') === true);
  m.setBordersOpen('emp_003', 'player', false);
  ok('zamknięcie działa TYLKO po swojej stronie (kierunkowość)',
    m.getBordersOpen('emp_003', 'player') === false && m.getBordersOpen('player', 'emp_003') === true);
}

// ── M10: tick — ramp zawsze, decay tylko za flagą ──────────────────────────
console.log('--- M10: tickModifiers ---');
{
  // ⚠ OBIE gałęzie flagi ustawiane JAWNIE (wzór bloku D4 w diplomacy_d1_smoke).
  // Dawniej gałąź OFF jechała na ZASZYTEJ domyślnej, więc E6 (flip domyślnej na ON)
  // wywracał tu asercję, a dwie linie dalej suite twardo się wywalał (`.find(...).value`
  // po wpisie skasowanym przez decay — bez linii podsumowania). Kontrakt „obie gałęzie"
  // jest ten sam; zmienia się tylko to, że test nie zależy już od wartości domyślnej.
  const flagBefore = GAME_CONFIG.FEATURES.diplomacyDecay;

  const { s, m } = mkModel();
  m.addModifier('emp_003', 'player', 'envoy_goodwill');
  m.addModifier('emp_003', 'player', 'trade_partner');
  const writesBefore = s.writes;

  GAME_CONFIG.FEATURES.diplomacyDecay = false;
  ok('gałąź OFF ustawiona JAWNIE (test nie zależy od zaszytej domyślnej)',
    GAME_CONFIG.FEATURES.diplomacyDecay === false);
  m.tickModifiers(20);
  ok('decay OFF: envoy +5 przeżywa 20 lat cyw.',
    m.get('emp_003', 'player').opinionModifiers.find(x => x.id === 'envoy_goodwill').value === 5);
  ok('ramp DZIAŁA mimo wyłączonego decayu (odpowiednik _tickTreaties)',
    m.get('emp_003', 'player').opinionModifiers.find(x => x.id === 'trade_partner').value === 20);
  ok('tick zapisał (ramp zmienił stan)', s.writes > writesBefore);

  GAME_CONFIG.FEATURES.diplomacyDecay = true;
  m.tickModifiers(20);
  ok('decay ON: envoy +5 (1/rok) po 20 latach zniknął',
    !m.get('emp_003', 'player').opinionModifiers.some(x => x.id === 'envoy_goodwill'));
  ok('persistent trade_partner nietknięty decayem (i doszedł do 40)',
    m.get('emp_003', 'player').opinionModifiers.find(x => x.id === 'trade_partner').value === 40);
  GAME_CONFIG.FEATURES.diplomacyDecay = flagBefore;
  ok('flaga PRZYWRÓCONA po bloku (kolejne bloki nie są zanieczyszczone)',
    GAME_CONFIG.FEATURES.diplomacyDecay === flagBefore);

  const idle = mkModel();
  idle.m.ensure('player', 'emp_003');
  const w = idle.s.writes;
  idle.m.tickModifiers(5);
  ok('para bez modyfikatorów → tick nie zapisuje', idle.s.writes === w);
  const noop = mkModel();
  noop.m.addModifier('emp_003', 'player', 'at_war');       // persistent, decay 0, brak rampu
  const w2 = noop.s.writes;
  noop.m.tickModifiers(5);
  ok('brak realnej zmiany → BEZ zapisu (koniec churnu gameState co rok)', noop.s.writes === w2);
}

// ── M11: tickTruces RAPORTUJE, nie mutuje ──────────────────────────────────
console.log('--- M11: tickTruces ---');
{
  const { m } = mkModel();
  m.setStatus('player', 'emp_003', 'truce', { truceUntilYear: 110 });
  m.setStatus('player', 'emp_004', 'truce', { truceUntilYear: 130 });
  m.setStatus('player', 'emp_005', 'war');
  ok('przed terminem — nic nie wygasa', m.tickTruces(109).length === 0);
  const expired = m.tickTruces(115);
  ok('wygasł tylko ten po terminie', expired.length === 1 && expired[0].key === 'emp_003__player');
  ok('raport niesie obie strony', expired[0].a === 'emp_003' && expired[0].b === 'player');
  ok('tickTruces NIE zmienia statusu (przejście należy do fasady)',
    m.getStatus('player', 'emp_003') === 'truce');
  ok('wojna ignorowana', !m.tickTruces(9999).some(x => x.key.includes('emp_005')));
}

// ── M12: ReputationLedger ──────────────────────────────────────────────────
console.log('--- M12: reputacja ---');
{
  const s = makeStore();
  const led = new ReputationLedger(s);
  ok('get bez wpisu → neutralne 0, BEZ zapisu', led.getAggression('player') === 0 && s.writes === 0);
  throws('ensure bez id rzuca', () => led.ensure(''));
  led.ensure('player');
  ok('ensure tworzy wpis z decayem', s.get('diplomacy.reputation').player.decayPerYear === 1);
  const w = s.writes;
  led.ensure('player');
  ok('ensure idempotentny', s.writes === w);
  ok('addAggression zwraca nową wartość', led.addAggression('emp_003', 15, 'unprovoked_war') === 15);
  ok('clamp górny 100', led.addAggression('emp_003', 999) === 100);
  ok('clamp dolny 0', led.addAggression('emp_003', -999) === 0);
  ok('delta 0 nie zapisuje', (() => { const b = s.writes; led.addAggression('emp_003', 0); return s.writes === b; })());

  led.addAggression('emp_003', 10);
  const flagBefore = GAME_CONFIG.FEATURES.diplomacyDecay;
  // Gałąź OFF ustawiana JAWNIE — ta sama poprawka co w M10. Decay reputacji siedzi za
  // TĄ SAMĄ flagą co decay opinii, więc flip E6 zapala go razem z nią.
  GAME_CONFIG.FEATURES.diplomacyDecay = false;
  led.tick(5);
  ok('decay OFF → reputacja stoi', led.getAggression('emp_003') === 10);
  GAME_CONFIG.FEATURES.diplomacyDecay = true;
  led.tick(4);
  ok('decay ON → 1/rok', led.getAggression('emp_003') === 6);
  led.tick(100);
  ok('nie schodzi poniżej 0', led.getAggression('emp_003') === 0);
  GAME_CONFIG.FEATURES.diplomacyDecay = flagBefore;

  const s2 = makeStore();
  const led2 = new ReputationLedger(s2);
  led2.initForIds(['emp_001', 'emp_002']);
  const rep = s2.get('diplomacy.reputation');
  ok('initForIds zasiewa gracza I imperia', !!rep.player && !!rep.emp_001 && !!rep.emp_002);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
