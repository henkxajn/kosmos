// WP-5 / C1 — keeper INFRASTRUKTURY TESTOWEJ: „testy widzą to, co gra".
//
// PO CO: headless `GameCore.boot()` nie montował czterech globali, które `GameScene`
// montuje zawsze. Najdroższy z nich to `directorProduction`: bez niego
// `AcceptanceEngine._capitalBodyIdOf` czyta `undefined?.capitalOf?.(…)` ⇒ `null`, więc dla
// imperium AI STOLICA PRZESTAJE ISTNIEĆ — pre-warunek `capital_never_ceded` nie ma czego
// rozpoznać, a `heldValue` dolicza ją do puli oddawalnej. ZMIERZONE na imperium z jedną
// kolonią: goły boot dawał `heldValue 44 / capital false / sufit 22`, gra — `0 / true / 0`.
// Testy mierzyły więc świat, w którym CAŁY D-WP-8 jest bezwładny.
//
// ⚠ TO NIE BYŁO ODKRYCIE, TYLKO PIĄTA KOPIA OBEJŚCIA. `wp_ai_peace_offer`,
//   `wp_cession_execution`, `wp_occupied_badge`, `wp_peace_cooldown` i `wp_peace_table`
//   przepisywały ten sam trzywierszowy montaż ręcznie, z komentarzami cytującymi numery
//   linii `GameScene`. Reguła „gdy dwa miejsca obchodzą to samo pole, kanon jest już
//   spóźniony" — tu miejsc było pięć. C1 usuwa kopie; ten plik pilnuje kanonu, żeby szósty
//   keeper nie dostał zielonych testów na świecie bez ochrony stolicy.
//
// ══════════════════════════════════════════════════════════════════════════════
// ⚠ PROTOKÓŁ GATE'ÓW POKOJU — trzy rzeczy, które trzeba wiedzieć, zanim postawi się
//   scenę wojenną w teście albo w przeglądarce. Wszystkie ZMIERZONE, wszystkie pinowane
//   niżej (T6/T7/T8), żeby nagłówek nie był samą prozą.
//
//   1. STAGING WYCZERPANIA IDZIE PRZEZ `gameState`, NIE PRZEZ `changeExhaustion`.
//      `WarSystem.changeExhaustion` woła `_maybeAiPeaceOffer` na OBU ścieżkach — po zapisie
//      stanu (`:280`) i w EARLY-RETURN przy suficie (`:271`, dołożone w C3 właśnie po to,
//      żeby depesza nie była jednorazowa). Kto stawia scenę tą metodą, wyzwala depeszę
//      w środku stawiania i traci kontrolę nad momentem.
//   2. WYZWOLENIE IDZIE WYŁĄCZNIE PRZEZ `changeExhaustion`. To jedyny producent
//      `_maybeAiPeaceOffer` w `src/` — zapis do `gameState` nie emituje niczego.
//      ⇒ scenę stawia się `gameState.set(...)`, a odpala jednym `changeExhaustion(+δ)`.
//   3. UCHWYT WOJNY BIERZE SIĘ PO IMPERIUM: `getWarWith(empireId)`. `listActive():126`
//      zwraca `Object.values(wars).filter(active)`, więc przy DWÓCH wojnach `[0]` jest
//      kolejnością wstawienia, nie „tą wojną, o którą pytam".
// ══════════════════════════════════════════════════════════════════════════════
//
// ⚠ ŻADNEGO wywołania funkcji tłumaczącej w tym pliku (lustro `wp_peace_cooldown_smoke`):
//   `tools/check-i18n.mjs` skanuje `t()` w całym `src/`, więc cytat klucza w keeperze
//   trafiłby do puli „użyte".
//
// ⚠ PINY BIAŁEJ LISTY SĄ STRAŻNIKAMI REGRESJI, NIE NAPRAWĄ — na czystym drzewie są zielone,
//   bo lista jest dziś kompletna. Ich wartość mierzy się MUTACJĄ (kontrole w T4d/T5c),
//   dokładnie jak bateria mutacyjna zastępuje niemożliwy fail-first przy commicie, który
//   moduł TWORZY.
//
// Uruchom: node src/testing/smoke/wp_test_infra_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (window/localStorage/THREE)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { reseed } from '../headless/env.js';
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { GameCore } from '../headless/GameCore.js';
import { AcceptanceEngine } from '../../systems/diplomacy/AcceptanceEngine.js';
import { VERB_ACCEPTANCE, TERRITORIAL_BASE_VALUE } from '../../data/AcceptanceWeightData.js';
import { CASUS_BELLI } from '../../data/CasusBelliData.js';
import { colonyDevScore } from '../../utils/ColonyDevScore.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── Narzędzia pinów źródłowych (lustro `wp_peace_cooldown_smoke`) ───────────
// ⚠ CRLF (§270): źródło PO NORMALIZACJI. ⚠ Komentarze zdejmowane — inaczej pin
//   „kod czyta X" łapie własne wyjaśnienie zostawione obok.
const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const norm = (s) => s.replace(/\r\n/g, '\n');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const readClean = (...p) => stripComments(norm(readFileSync(join(SRC, ...p), 'utf8')));

// ⚠ IZOLACJA BOOTU (Pułapka 4 / Finding 228, spisana w `DirectorHarness:76-87`).
//   `GameCore.boot()` czyści `EntityManager` i `EventBus`, ale NIE czyści strumienia PRNG
//   ani singletona `gameState`. Bez reseedu drugi boot w tym samym procesie dostaje INNĄ
//   galaktykę — zmierzone w tym pliku: stolica `emp_001` wypadła raz jako `entity_94`,
//   raz jako `entity_49`. Skutek byłby podstępny: każda sekcja mierzyłaby inny świat,
//   a dołożenie sekcji WYŻEJ zmieniałoby fixture'y sekcji NIŻEJ. Reseed czyni ten plik
//   niezależnym od kolejności i od liczby bootów.
const BOOT_SEED = 'wp-test-infra';
const boot = (opts = {}) => {
  reseed(BOOT_SEED);
  gameState.restore(null);        // świeży `createDefaultState()` — zero cooldownów z poprzedniej sekcji
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization', aiEmpires: true, ...opts });
  // ⚠ AI STRIKES BACK S1 (SB1, przecelowanie R-B2b za zgodą właściciela) — wojna tworzy PULĘ okrętów imperium, co zmienia
  //   scenę tego keepera; pinuje on co innego, więc pula jest wyłączona w setupie (wzór `garrisonSystem.enabled`).
  if (window.KOSMOS.fleetPoolSystem) window.KOSMOS.fleetPoolSystem.enabled = false;
  return window.KOSMOS;
};

// ════════════════════════════════════════════════════════════════════════════
console.log('T1 — GOŁY boot montuje cztery globale parytetu z GameScene');
{
  const K = boot();
  const WIRED = [
    ['entityManager', 'GameScene:397'],
    ['territoryService', 'GameScene:457'],
    ['directorProduction', 'GameScene:460'],
    ['eventBus', 'GameScene:511'],
  ];
  for (const pair of WIRED) {
    assert(K[pair[0]] != null, 'T1a[' + pair[0] + ']: wpięte przez goły boot (parytet ' + pair[1] + ')');
  }
  // Kontrola NIEJAŁOWOŚCI: to nie są puste atrapy, tylko żywe kolaboratory.
  assert(typeof K.entityManager?.get === 'function', 'T1b: entityManager ma żywe `get`');
  assert(typeof K.eventBus?.emit === 'function', 'T1b: eventBus ma żywe `emit`');
  assert(typeof K.territoryService?.getSystemOwner === 'function', 'T1b: territoryService ma żywe `getSystemOwner`');
  assert(typeof K.directorProduction?.capitalOf === 'function', 'T1b: directorProduction ma żywe `capitalOf`');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — capitalOf DZIAŁA na gołym boocie ⇒ stolica chroniona, pula pusta');
{
  const K = boot();
  const emp = K.empireRegistry.listAll()[0]?.id ?? null;
  const cols = K.empireRegistry.getColoniesByEmpire?.(emp) ?? [];
  const bodyId = cols[0]?.planetId ?? null;
  // Anty-jałowość: bez imperium i bez ciała wszystkie asercje niżej byłyby o niczym.
  assert(emp != null && bodyId != null,
    'T2a (anty-jałowość): fixture ma imperium z kolonią — ' + emp + ' / ' + bodyId);

  const eng = K.diplomacySystem._acceptance();
  const ctx = eng._buildTermsContext(
    K, 'player', emp,
    { terms: { cessions: [{ bodyId: bodyId, fromEmpireId: emp, toEmpireId: 'player' }] } },
    { warId: null },
  );
  const capitalId = eng._capitalBodyIdOf(K, emp);
  assert(capitalId === bodyId,
    'T2b: `capitalOf` rozpoznaje stolicę imperium (było `null` przed kanonem)');
  assert(ctx?.cessions?.[0]?.capital === true,
    'T2c: cesja stolicy oznaczona `capital: true` ⇒ `capital_never_ceded` ma co blokować');

  // ⚠ Pin liczony z DEFINICJI, nie z literału „0": pula oddawalna = wszystkie ciała
  //   MINUS stolica. Przy jednej koloni daje to 0, ale rachunek zostaje prawdziwy także
  //   wtedy, gdy imperium ma ich więcej — inaczej pin byłby zakładnikiem fixture'u.
  const valueOf = (c) => TERRITORIAL_BASE_VALUE + colonyDevScore(c);
  const fullSum = cols.reduce((s, c) => s + valueOf(c), 0);
  const capitalValue = valueOf(cols.find(c => c?.planetId === capitalId) ?? null);
  assert(ctx?.heldValue === fullSum - capitalValue,
    'T2d: pula ODDAWALNA = suma ciał MINUS stolica (' + ctx?.heldValue + ' = ' + fullSum
    + ' − ' + capitalValue + ') — przed kanonem stolica wchodziła do puli');
  // Kontrola pinu: odjęta wartość jest NIEZEROWA, więc „wyłączenie stolicy" to realna
  // różnica, a nie odejmowanie zera od zera.
  assert(capitalValue > 0 && Number(ctx?.cessions?.[0]?.devValue) > 0,
    'T2e (kontrola pinu): stolica MA wartość (' + capitalValue + ') — wyłączenie realnie zmienia sufit');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT3 — boot NIE rejestruje guardów Directora (decyzja, nie przeoczenie)');
{
  const src = readClean('testing/headless/GameCore.js');
  assert(/new DirectorProduction\(\)/.test(src),
    'T3a: boot konstruuje INSTANCJĘ `DirectorProduction`');
  assert(!/registerProductionGuards/.test(src),
    'T3b: boot NIE woła `registerProductionGuards` — `DirectorRegistry._register` RZUCA przy '
    + 'duplikacie bez `allowOverride`, a `director_production_foundation_smoke` wywołuje '
    + 'rejestrację właśnie bez niej; rejestr jest singletonem modułu');
  // Kontrola pinu: rejestracja z `allowOverride` żyje tam, gdzie jest potrzebna.
  const harness = readClean('testing/headless/DirectorHarness.js');
  assert(/registerProductionGuards\([\s\S]{0,80}allowOverride:\s*true/.test(harness),
    'T3c (kontrola pinu): `DirectorHarness` NADAL rejestruje guardy z `allowOverride: true`');
}

// ════════════════════════════════════════════════════════════════════════════
// T4/T5 — BIAŁA LISTA KOLABORATORÓW SILNIKA AKCEPTACJI.
//
// ⚠ PUŁAPKA, KTÓRA UGRYZŁA DWA RAZY. `AcceptanceEngine._kosmos()` zwraca `this._deps`, czyli
//   BIAŁĄ LISTĘ, a nie przezroczyste proxy na `window.KOSMOS`. Klucz pominięty na liście NIE
//   RZUCA — `buildContext` widzi `undefined` i wstrzykuje wartość zdegradowaną, więc cała
//   mechanika umiera PO CICHU przy zielonych testach czystego silnika. Stało się tak przy
//   W1-3 (`threatAssessment` ⇒ `relative_power` martwy) i przy WP-2 (`colonyManager` +
//   `directorProduction` ⇒ wycena i sufit martwe).
//
// ⚠ DWA PINY, BO ODPOWIADAJĄ NA RÓŻNE PYTANIA — i żaden nie zastępuje drugiego:
//     T4 refleksja  → łapie odczyt spoza listy TYM SAMYM mechanizmem co defekt,
//                     ale tylko na gałęzi, którą matryca faktycznie wykonuje;
//     T5 parsowanie → widzi KAŻDY `K.<klucz>` w pliku niezależnie od gałęzi,
//                     ale nie dowodzi, że kod się wykonuje.
console.log('\nT4 — biała lista: REFLEKSJA (Proxy na `_deps`, matryca czasowników)');

/** Pełny przemiał `buildContext`: każdy czasownik × {bez cesji, z cesją} × oba kierunki. */
function sweepReads(engine, empId) {
  const deps = engine._deps;
  const seen = new Set();
  engine._deps = new Proxy(deps, {
    get(target, key) { if (typeof key === 'string') seen.add(key); return Reflect.get(target, key); },
  });
  const cess = { cessions: [{ bodyId: 'x', fromEmpireId: empId, toEmpireId: 'player' }] };
  for (const verb of Object.keys(VERB_ACCEPTANCE)) {
    for (const terms of [undefined, cess]) {
      for (const pair of [['player', empId], [empId, 'player']]) {
        try { engine.buildContext(pair[0], pair[1], { verb: verb, terms: terms }); } catch { /* opcjonalne */ }
      }
    }
  }
  engine._deps = deps;
  return [...seen].sort();
}

{
  const K = boot();
  const emp = K.empireRegistry.listAll()[0]?.id ?? null;
  const eng = K.diplomacySystem._acceptance();
  const white = Reflect.ownKeys(eng._deps).filter(k => typeof k === 'string').sort();
  const read = sweepReads(eng, emp);

  assert(white.length === 8,
    'T4a: biała lista ma 8 kluczy — ' + JSON.stringify(white));
  // ANTY-JAŁOWOŚĆ: pusty zbiór odczytów przeszedłby przez „⊆" bez mrugnięcia okiem.
  assert(read.length === 8,
    'T4b (anty-jałowość): matryca ODCZYTAŁA wszystkie 8 kluczy — ' + JSON.stringify(read));
  const missing = read.filter(k => !white.includes(k));
  assert(missing.length === 0,
    'T4c: każdy odczytany kolaborator jest na białej liście'
    + (missing.length ? ' — BRAKUJE: ' + JSON.stringify(missing) : ''));

  // KONTROLA PINU — ucięta lista MUSI dać czerwień. Bez tego „zielone" nie znaczy „porównuje".
  const full = eng._deps;
  const truncated = {};
  for (const k of white) {
    if (k === 'colonyManager' || k === 'directorProduction') continue;
    Object.defineProperty(truncated, k, Object.getOwnPropertyDescriptor(full, k));
  }
  const cut = new AcceptanceEngine(truncated);
  const cutWhite = Reflect.ownKeys(truncated).filter(k => typeof k === 'string');
  const cutMissing = sweepReads(cut, emp).filter(k => !cutWhite.includes(k)).sort();
  assert(JSON.stringify(cutMissing) === JSON.stringify(['colonyManager', 'directorProduction']),
    'T4d (kontrola pinu): lista bez 2 kluczy ⇒ pin zgłasza DOKŁADNIE te 2 — ' + JSON.stringify(cutMissing));
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT5 — biała lista: PARSOWANIE ŹRÓDŁA (`K.<klucz>` w AcceptanceEngine)');
{
  // JEDEN ekstraktor dla pliku ORAZ dla kontroli pinu — inaczej kontrola mierzyłaby
  // inny rachunek niż pin (lekcja „kontrola grepująca literał dowodzi napisu, nie kształtu").
  const readsOf = (src) => {
    const out = new Set();
    const re = /\bK\s*\??\.\s*([A-Za-z_$][\w$]*)/g;
    let m;
    while ((m = re.exec(src)) !== null) out.add(m[1]);
    return [...out].sort();
  };

  const K = boot();
  const white = Reflect.ownKeys(K.diplomacySystem._acceptance()._deps)
    .filter(k => typeof k === 'string');
  const src = readClean('systems/diplomacy/AcceptanceEngine.js');
  const parsed = readsOf(src);

  assert(parsed.length >= 8,
    'T5a (anty-jałowość): ekstraktor znalazł ' + parsed.length + ' kluczy w źródle — ' + JSON.stringify(parsed));
  const missing = parsed.filter(k => !white.includes(k));
  assert(missing.length === 0,
    'T5b: każdy `K.<klucz>` w źródle jest na białej liście'
    + (missing.length ? ' — BRAKUJE: ' + JSON.stringify(missing) : ''));

  // KONTROLA PINU — syntetyczne źródło z DZIEWIĄTYM kluczem musi zostać zgłoszone.
  const synthetic = src + '\n const probe = K?.someSystemNobodyWhitelisted;\n';
  const synthMissing = readsOf(synthetic).filter(k => !white.includes(k));
  assert(JSON.stringify(synthMissing) === JSON.stringify(['someSystemNobodyWhitelisted']),
    'T5c (kontrola pinu): 9. klucz w źródle zgłoszony jako spoza listy — ' + JSON.stringify(synthMissing));
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT6/T7 — protokół: KTÓRE wywołanie wyzwala depeszę pokojową AI');
{
  const K = boot();
  const emp = K.empireRegistry.listAll()[0]?.id ?? null;
  K.diplomacySystem.declareWar(emp, 'player_action');
  const war = K.warSystem.getWarWith(emp);
  const peaceCost = Number(CASUS_BELLI[war?.casusBelli]?.peaceCost) || 0;

  assert(war != null && peaceCost > 0,
    'T6a (anty-jałowość): wojna istnieje, casus belli `' + war?.casusBelli + '` ma peaceCost ' + peaceCost);

  // ⚠ SUBSKRYPCJA PO BOOCIE — `GameCore.boot()` woła `EventBus.clear()`, więc listener
  //   zarejestrowany wcześniej byłby cichy i cała ta sekcja mierzyłaby ciszę.
  let offers = 0;
  EventBus.on('war:aiPeaceOffer', () => { offers++; });

  // ── T6: STAGING przez `gameState` NIE wyzwala ──
  const staged = { player: peaceCost - 1 };
  staged[emp] = peaceCost - 1;
  K.gameState.set('wars.' + war.id,
    Object.assign({}, K.warSystem.getWar(war.id), { exhaustion: staged }),
    'keeper_stage');
  const readBack = K.warSystem.getWar(war.id)?.exhaustion ?? {};
  assert(readBack.player === peaceCost - 1 && readBack[emp] === peaceCost - 1,
    'T6b: staging ustawił OBA wyczerpania na ' + (peaceCost - 1));
  assert(offers === 0,
    'T6c: zapis do `gameState` NIE wyzwolił depeszy (depesz: ' + offers + ')');

  // ── T7: TRIGGER przez `changeExhaustion` ──
  K.warSystem.changeExhaustion(war.id, emp, 2, 'keeper_trigger');
  assert(offers === 1,
    'T7a: `changeExhaustion` wyzwolił DOKŁADNIE jedną depeszę (depesz: ' + offers + ')');
  // Wyjaśnienie, dlaczego poszła: próg `peaceCost` to tania bramka wstępna, rozstrzyga silnik.
  assert(K.diplomacySystem.evaluatePeace(emp, null)?.decision === true,
    'T7b: w tym stanie `evaluatePeace` mówi TAK — próg to bramka wstępna, werdykt należy do silnika');
  // Pin źródłowy: jedyny producent `_maybeAiPeaceOffer` siedzi w `changeExhaustion`,
  // i to na OBU ścieżkach (zapis stanu ORAZ early-return przy suficie).
  const warSrc = readClean('systems/WarSystem.js');
  assert((warSrc.match(/this\._maybeAiPeaceOffer\(/g) ?? []).length === 2,
    'T7c: `_maybeAiPeaceOffer` ma DOKŁADNIE dwa wywołania (zapis stanu + sufit)');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT8 — protokół: uchwyt wojny bierze się po IMPERIUM, nie z `listActive()[0]`');
{
  const K = boot();
  const empires = K.empireRegistry.listAll().map(e => e.id);
  assert(empires.length >= 2,
    'T8a (anty-jałowość): fixture ma ≥2 imperia — ' + JSON.stringify(empires));
  for (const e of empires) K.diplomacySystem.declareWar(e, 'player_action');

  const active = K.warSystem.listActive();
  assert(active.length === empires.length,
    'T8b: ' + empires.length + ' aktywne wojny w rejestrze (jest ' + active.length + ')');

  for (const e of empires) {
    const w = K.warSystem.getWarWith(e);
    const sides = [w?.aggressor, w?.defender];
    assert(w != null && sides.includes(e),
      'T8c[' + e + ']: `getWarWith` zwraca wojnę, w której to imperium NAPRAWDĘ walczy');
  }
  // Sedno: dla co najmniej jednego imperium `listActive()[0]` to CUDZA wojna.
  const mismatched = empires.filter(e => K.warSystem.getWarWith(e)?.id !== active[0]?.id);
  assert(mismatched.length >= 1,
    'T8d: `listActive()[0]` jest CUDZĄ wojną dla ' + mismatched.length + ' z ' + empires.length
    + ' imperiów — uchwyt po indeksie kłamie');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('=== WYNIK: ' + pass + ' PASS / ' + fail + ' FAIL (z ' + (pass + fail) + ') ===');
process.exit(fail === 0 ? 0 : 1);
