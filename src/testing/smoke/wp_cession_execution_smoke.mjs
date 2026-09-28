// WP-3 — keeper WYKONANIA CESJI przy stole pokoju (W4-simple, WOJNA I POKÓJ).
//
// PO CO: WP-2 otworzył kanał warunków (`proposal.terms.cessions`) i nauczył silnik je OCENIAĆ.
// WP-3 dokłada to, czego nie było: przekaz przez `offerPeace`, RE-WALIDACJĘ tuż przed
// wykonaniem, samo WYKONANIE istniejącą mechaniką zmiany rąk i wymuszony NAP.
//
// ⚠ TRZY RZECZY, KTÓRE SĄ TU KONTRAKTEM, A NIE PREFERENCJĄ (każda ZMIERZONA w FAZIE A):
//   1. KOLEJNOŚĆ (D-WP-11): cesje muszą wykonać się PRZED `emit('diplomacy:peaceSigned')`,
//      bo to ten emit zamyka wojnę (`WarSystem._onPeaceSigned` → `active:false`), a księga
//      zdobyczy zapisuje WYŁĄCZNIE przy AKTYWNEJ wojnie (`getWarBetween` → `listActive`).
//      Zmierzone: PRZED ⇒ 1 wpis `via:'cession'`; PO ⇒ 0 wpisów.
//   2. KIERUNEK (b): AI→gracz idzie przez `captureColonyForPlayer`, NIE przez
//      `transferColony(bodyId, null)`. Zmierzone: `transferColony` NIGDY nie woła
//      `EmpireRegistry.removeColony`, więc oddane ciało zostałoby w `emp.colonies` —
//      a `heldValue`/`capitalOf` z WP-2 czytają dokładnie tę listę.
//   3. RE-WALIDACJA JEST FAIL-CLOSED (D-WP-9 = ABORT): pada ⇒ ZERO mutacji, ZERO stempla
//      odmowy, wojna trwa. Wzór: gałąź `blocked` z WP-2.
//
// ⚠ IMPORTY NAMESPACE'OWE / DYNAMICZNE — CELOWO (lekcja z WP-2): keeper musi dać się
//   uruchomić na drzewie SPRZED naprawy. Statyczny import nieistniejącego symbolu wywala
//   CAŁY plik na linkowaniu ESM i żaden pin nie dostaje koloru.
//
// Uruchom: node src/testing/smoke/wp_cession_execution_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (window/localStorage/THREE)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

import { GameCore } from '../headless/GameCore.js';
import EntityManager from '../../core/EntityManager.js';
import EventBus from '../../core/EventBus.js';
import { TREATY_TYPES } from '../../data/TreatyData.js';

// Moduł POWSTAJE w tym slice — dynamicznie, żeby fail-first miał kolory.
let CP = null;
try { CP = await import('../../utils/CessionPlan.js'); } catch { /* fail-first */ }

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── Narzędzia pinów źródłowych (lustro `wp_peace_seams_smoke`) ──────────────
// ⚠ CRLF (§270): źródło PO NORMALIZACJI. ⚠ Komentarze zdejmowane.
const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const norm = (s) => s.replace(/\r\n/g, '\n');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const readClean = (...p) => stripComments(norm(readFileSync(join(SRC, ...p), 'utf8')));
const callRe = (name) => new RegExp('\\.\\s*' + name + '\\s*(?:\\?\\.)?\\s*\\(', 'g');

function prodFiles(dir = SRC, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === 'i18n' || e === 'testing' || e === 'node_modules') continue;
      prodFiles(p, out);
    } else if (e.endsWith('.js') || e.endsWith('.mjs')) out.push(p);
  }
  return out;
}
const PROD = prodFiles();
function hitsIn(re) {
  const out = [];
  for (const f of PROD) {
    const n = (stripComments(norm(readFileSync(f, 'utf8'))).match(re) ?? []).length;
    if (n > 0) out.push({ file: basename(f), n });
  }
  return out;
}

// ── Fixture: ŻYWY silnik (GameCore), bo cesja spina cztery systemy naraz ────
const EMP = 'emp_001';

/** Boot. Cztery globale parytetu z `GameScene` montuje od C1 sam `GameCore.boot()`. */
function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization', aiEmpires: true });
  const K = window.KOSMOS;
  return K;
}
/** Wolne ciała w układzie `sysId` (bez kolonii). */
const freeBodies = (cm, sysId, n) => EntityManager.getAll()
  .filter(b => (b.systemId || 'sys_home') === sysId
    && (b.type === 'planet' || b.type === 'moon') && !cm.getColony(b.id))
  .slice(0, n);

/** Dosypuje AI kolonie produkcyjnym API (to samo, którego używa EmpireColonyBootstrap). */
function giveAi(K, n) {
  const cm = K.colonyManager, reg = K.empireRegistry;
  const sys = reg.getColoniesByEmpire(EMP)[0].systemId;
  const ids = [];
  for (const b of freeBodies(cm, sys, n)) { cm.createColony(b.id, { minerals: 100 }, 20, 0, EMP); reg.addColony(EMP, b.id); ids.push(b.id); }
  return ids;
}
/** Dosypuje GRACZOWI kolonie (żeby miał co oddać poza stolicą). */
function givePlayer(K, n) {
  const cm = K.colonyManager;
  const sys = cm.getPlayerColonies()[0].systemId;
  const ids = [];
  for (const b of freeBodies(cm, sys, n)) { cm.createColony(b.id, { minerals: 100 }, 10, 0, null); ids.push(b.id); }
  return ids;
}
/** Wojna + wyczerpanie WPROST w gameState (changeExhaustion(100) odpala auto-pokój). */
function warAt(K, exh = 100) {
  K.diplomacySystem.declareWar(EMP, 'player_action');
  const gs = K.gameState, ws = K.warSystem;
  const w = ws.getWarWith(EMP);
  gs.set('wars.' + w.id, { ...w, exhaustion: { player: exh, [EMP]: exh } }, 'wp3_fixture');
  return ws.getWarWith(EMP);
}
const cede = (bodyId, from, to) => ({ cessions: [{ bodyId, fromEmpireId: from, toEmpireId: to }] });
/** Nasłuch zdarzeń w oknie pomiaru (monkeypatch emit, przywracany). */
function emitsDuring(fn) {
  const real = EventBus.emit.bind(EventBus);
  const seen = [];
  EventBus.emit = (n, p) => { seen.push(n); return real(n, p); };
  let out; try { out = fn(); } finally { EventBus.emit = real; }
  return { out, seen };
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T0 — kontrola narzędzia');
{
  const S = 'a.transferColony(1); b?.transferColony(2); c.transferColony?.(3);';
  assert((S.match(callRe('transferColony')) ?? []).length === 3,
    'T0a: `callRe` łapie wszystkie trzy formy wołania — inaczej piny wołających mierzą ciszę regexu');
  assert(stripComments('const a=1; // cession\n/* cession */').includes('cession') === false,
    'T0b: `stripComments` zdejmuje oba rodzaje komentarzy');
  assert(PROD.length > 100 && !PROD.some(p => p.includes('testing')),
    'T0c: skan produkcyjny widzi drzewo (' + PROD.length + ') i pomija `src/testing`');
  const K = boot();
  assert(!!K.colonyManager && !!K.warSystem && !!K.diplomacySystem && !!K.directorProduction,
    'T0d: fixture stawia ŻYWY silnik ze wszystkimi czterema systemami, które cesja spina');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T1 — przekaz `terms` przez offerPeace (i identyczność bez nich)');
{
  const src = readClean('systems', 'DiplomacySystem.js');
  assert(/offerPeace\s*\(\s*empireId\s*,\s*reason\s*=\s*''\s*,\s*\{[^}]*terms\s*=\s*null[^}]*\}\s*=\s*\{\}\s*\)/.test(src),
    'T1a (pin ŹRÓDŁOWY): `offerPeace` przyjmuje `terms` w OBIEKCIE OPCJI z domyślnym `null` — ' +
    'czwarty parametr pozycyjny zmieniłby sygnaturę wszystkim dzisiejszym wołającym');
  assert(/evaluatePeace\(\s*empireId\s*,\s*terms\s*\)/.test(src),
    'T1b (pin ŹRÓDŁOWY): `offerPeace` podaje `terms` do `evaluatePeace` — jeden kanał, nie drugi');

  const K = boot(); const ids = giveAi(K, 2); warAt(K);
  const ds = K.diplomacySystem;
  const ctx = K.acceptanceEngine.buildContext('player', EMP, { verb: 'offer_peace', terms: cede(ids[0], EMP, 'player') });
  assert(ctx?.terms?.cessions?.length === 1,
    'T1c (KONTROLA PINU): warunki DOJEŻDŻAJĄ do silnika — bez tego T1a/T1b pinowałyby martwy przekaz');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T2 — TAK + cesja AI→gracz: wlasciciel, rejestr, księga, wojna, NAP');
{
  const K = boot(); const ids = giveAi(K, 3); const w = warAt(K);
  const cm = K.colonyManager, reg = K.empireRegistry, ds = K.diplomacySystem, ws = K.warSystem;
  const target = ids[0];
  const before = {
    owner: cm.getColony(target)?.ownerEmpireId,
    inEmpire: reg.getColoniesByEmpire(EMP).some(c => c.planetId === target),
    caps: ws.getCaptures(w.id).length,
    treaties: ds.relations.getTreaties('player', EMP).length,
  };
  const ok = ds.offerPeace(EMP, 'wp3', { terms: cede(target, EMP, 'player') });
  const caps = ws.getWar(w.id)?.captures ?? [];
  assert(ok === true,
    'T2a (INWARIANT, zielony po OBU stronach): `offerPeace` z warunkami zwraca true — ' +
    'pokój ma się ZDARZYĆ; że coś realnie zmieniło ręce, mierzą T2b-T2d');
  assert(cm.getColony(target)?.ownerEmpireId == null,
    'T2b: ciało zmieniło właściciela na GRACZA (`ownerEmpireId` null = kanon gracza)');
  assert(before.inEmpire === true && !reg.getColoniesByEmpire(EMP).some(c => c.planetId === target),
    'T2c: ciało WYPIĘTE z `emp.colonies` — to jest cała różnica między ' +
    '`captureColonyForPlayer` a `transferColony(…, null)` i dlatego kierunek AI→gracz idzie tędy');
  assert(caps.length === before.caps + 1 && caps.at(-1)?.via === 'cession'
    && caps.at(-1)?.bodyId === target && caps.at(-1)?.toEmpireId === 'player',
    'T2d: księga dostała DOKŁADNIE JEDEN wpis `via:\'cession\'` (nie `invasion`) — ' + JSON.stringify(caps.at(-1)));
  assert(ws.getWar(w.id)?.active === false && ds.getStatus(EMP) === 'truce',
    'T2e: wojna zamknięta, status → rozejm');
  assert(ds.relations.getTreaties('player', EMP).some(t => t.id === 'non_aggression'),
    'T2f: wymuszony NAP podpisany przy pokoju (D-WP-10)');
  assert(K.colonyManager.getPlayerColonies().some(c => c.planetId === target),
    'T2g (KONTROLA PINU): `getPlayerColonies` realnie widzi zdobycz — T2b nie mierzy samego pola');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T3 — TAK + cesja gracz→AI (lustro) + D-WP-12 los floty');
{
  const K = boot(); const mine = givePlayer(K, 1); giveAi(K, 1); const w = warAt(K);
  const cm = K.colonyManager, ds = K.diplomacySystem, ws = K.warSystem, vm = K.vesselManager;
  const target = mine[0];
  const col = cm.getColony(target);
  const d1 = vm.createAndRegister('hull_small', target);
  d1.position = { state: 'docked', dockedAt: target, x: 1, y: 1 };
  col.fleet = [d1.id];
  const ok = ds.offerPeace(EMP, 'wp3', { terms: cede(target, 'player', EMP) });
  const caps = ws.getWar(w.id)?.captures ?? [];
  assert(ok === true && cm.getColony(target)?.ownerEmpireId === EMP,
    'T3a: ciało gracza przeszło do AI (`transferColony` — kierunek odwrotny)');
  assert(caps.at(-1)?.via === 'cession' && caps.at(-1)?.fromEmpireId === 'player' && caps.at(-1)?.toEmpireId === EMP,
    'T3b: księga zapisała cesję w drugą stronę — ' + JSON.stringify(caps.at(-1)));
  assert(!!vm.getVessel(d1.id) && vm.getVessel(d1.id).position.state !== 'docked',
    'T3c (D-WP-12): ZADOKOWANY statek gracza PRZEŻYŁ cesję i jest na orbicie — bez ' +
    'wypchnięcia `transferColony` niszczy hangar (ZMIERZONE: 2/2 statki zniszczone)');
  const home = cm.getPlayerColonies()[0]?.planetId;
  assert(vm.getVessel(d1.id)?.colonyId === home,
    'T3d: ocalały statek re-homowany na kolonię gracza (`VesselManager` na `colony:captured`, W3-1)');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T4 — NIE (odmowa OCENIONA): zero transferów, stempel JAK DOTĄD');
{
  const K = boot(); const ids = giveAi(K, 3); const w = warAt(K, 0);   // exh 0 ⇒ war_status ciągnie w dół
  const cm = K.colonyManager, ds = K.diplomacySystem, ws = K.warSystem;
  const r = ds.evaluatePeace(EMP, cede(ids[0], EMP, 'player'));
  const ok = ds.offerPeace(EMP, 'wp3', { terms: cede(ids[0], EMP, 'player') });
  assert(r.blocked === false && r.decision === false && ok === false,
    'T4a (KONTROLA PINU): fixture daje odmowę OCENIONĄ (nie blokadę) — inaczej T4 mierzyłby T5');
  assert(cm.getColony(ids[0])?.ownerEmpireId === EMP && (ws.getWar(w.id)?.captures ?? []).length === 0,
    'T4b: ZERO transferów i ZERO wpisów w księdze po odmowie');
  assert((ds.relations.getMemory('player', EMP, 999) ?? []).some(m => m.type === 'peace_refused')
    && ds.getRefusedYear(EMP, 'offer_peace') != null,
    'T4c: odmowa OCENIONA stempluje jak dotąd — WP-3 nie rusza tej gałęzi');
  assert(ws.getWar(w.id)?.active === true && ds.getStatus(EMP) === 'war',
    'T4d: wojna trwa');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T5 — blocked (ponad sufit): zero transferów, ZERO stempla');
{
  const K = boot(); const ids = giveAi(K, 3); const w = warAt(K);
  const cm = K.colonyManager, ds = K.diplomacySystem, ws = K.warSystem;
  const all = { cessions: ids.map(b => ({ bodyId: b, fromEmpireId: EMP, toEmpireId: 'player' })) };
  const r = ds.evaluatePeace(EMP, all);
  const y0 = ds.getRefusedYear(EMP, 'offer_peace');
  const ok = ds.offerPeace(EMP, 'wp3', { terms: all });
  assert(r.blocked === true && r.reasonKey === 'diplo.reject.territoryNotNegotiable',
    'T5a (KONTROLA PINU): fixture realnie wpada w SUFIT z WP-2 — ' + r.reasonKey +
    ' (zielone po OBU stronach: sufit istnieje od WP-2)');
  assert(ok === false && ids.every(b => cm.getColony(b)?.ownerEmpireId === EMP)
    && (ws.getWar(w.id)?.captures ?? []).length === 0,
    'T5b: blokada ⇒ offerPeace zwraca false, ZERO transferów, ZERO wpisów w księdze');
  assert(ds.getRefusedYear(EMP, 'offer_peace') === y0
    && !(ds.relations.getMemory('player', EMP, 999) ?? []).some(m => m.type === 'peace_refused'),
    'T5c: blokada NIE stempluje (wzór WP-2 T21) — nikt nas nie odrzucił');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T6 — D-WP-9: cel stracił ważność między oceną a wykonaniem ⇒ ABORT');
{
  const K = boot(); const ids = giveAi(K, 3); const w = warAt(K);
  const cm = K.colonyManager, ds = K.diplomacySystem, ws = K.warSystem;
  const target = ids[0];
  // ⚠ DRYF: ciało zmienia ręce PO ocenie, PRZED wykonaniem. Na ścieżce `offerPeace` ocena
  //   i wykonanie są w jednym ticku, więc dryf wstrzykujemy jawnie — dokładnie ten stan
  //   zobaczy WP-4, gdzie między pokazaniem oferty a klikiem gracza mija czas gry.
  cm.captureColonyForPlayer(target, 'invasion');     // ciało JUŻ jest gracza
  const capsBefore = (ws.getWar(w.id)?.captures ?? []).length;
  const y0 = ds.getRefusedYear(EMP, 'offer_peace');
  let rejected = null;
  const h = (p) => { rejected = p; };
  EventBus.on('diplomacy:peaceRejected', h);
  const ok = ds.offerPeace(EMP, 'wp3', { terms: cede(target, EMP, 'player') });
  EventBus.off('diplomacy:peaceRejected', h);
  assert(ok === false, 'T6a: ABORT — `offerPeace` zwraca false');
  assert(rejected?.result?.blocked === true && rejected?.result?.reasonKey === 'diplo.reject.cessionTermsStale',
    'T6b: powód dojechał KANAŁEM BLOKADY (`result.blocked` + `reasonKey`), bo modal odmowy ' +
    'renderuje wyłącznie `result.reasonKey` — inaczej gracz zobaczyłby „nieznany powód"');
  assert(ds.getStatus(EMP) === 'war' && ws.getWar(w.id)?.active === true,
    'T6c: wojna TRWA — ABORT nie podpisuje pokoju „częściowo"');
  assert((ws.getWar(w.id)?.captures ?? []).length === capsBefore,
    'T6d: ZERO nowych wpisów w księdze (transfer z fixture\'u się nie liczy)');
  assert(ds.getRefusedYear(EMP, 'offer_peace') === y0
    && !(ds.relations.getMemory('player', EMP, 999) ?? []).some(m => m.type === 'peace_refused'),
    'T6e: ZERO stempla — re-walidacja to blokada, nie odmowa oceniona (wzór `blocked`)');
  assert(!ds.relations.getTreaties('player', EMP).some(t => t.id === 'non_aggression'),
    'T6f: NAP NIE podpisany — ABORT wraca PRZED wszystkimi mutacjami pokoju');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T7 — D-WP-11: wykonanie PRZED zamknięciem wojny');
{
  const src = readClean('systems', 'DiplomacySystem.js');
  const body = src.slice(src.indexOf('offerPeace('), src.indexOf('offerPeace(') + 3000);
  const iExec = body.indexOf('_executeCessions');
  const iNap = body.indexOf('non_aggression');
  const iEmit = body.indexOf("emit('diplomacy:peaceSigned'");
  assert(iExec > 0 && iEmit > 0 && iExec < iEmit,
    'T7a (pin ŹRÓDŁOWY): wykonanie cesji stoi PRZED `emit(diplomacy:peaceSigned)` — ten emit ' +
    'zamyka wojnę, a księga zapisuje TYLKO przy aktywnej (ZMIERZONE: po zamknięciu 0 wpisów)');
  assert(iNap > 0 && iNap < iEmit,
    'T7b (pin ŹRÓDŁOWY): NAP podpisywany przed emitem — po mutacjach pokoju, jak w podpisie');
  // KONTROLA: ta sama kolejność sprawdzona WYKONANIEM (księga milczy po zamknięciu wojny).
  const K = boot(); const ids = giveAi(K, 1); const w = K.warSystem;
  K.diplomacySystem.declareWar(EMP, 'player_action');
  const war = w.getWarWith(EMP);
  EventBus.emit('diplomacy:peaceSigned', { empireId: EMP, reason: 'x' });   // zamknij wojnę
  K.colonyManager.captureColonyForPlayer(ids[0], 'cession');
  assert((w.getWar(war.id)?.captures ?? []).length === 0,
    'T7c (KONTROLA PINU): cesja PO zamknięciu wojny daje 0 wpisów — to jest cały powód, ' +
    'dla którego T7a nie jest kwestią gustu');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T8 — D-WP-10: NAP podpisany, idempotentny, wiążący dla AI');
{
  const K = boot(); const ids = giveAi(K, 2); warAt(K);
  const ds = K.diplomacySystem;
  ds.signTreaty(EMP, TREATY_TYPES.non_aggression);            // NAP JUŻ istnieje
  const ok = ds.offerPeace(EMP, 'wp3', { terms: cede(ids[0], EMP, 'player') });
  const naps = ds.relations.getTreaties('player', EMP).filter(t => t.id === 'non_aggression');
  assert(ok === true && naps.length === 1,
    'T8a: przy ISTNIEJĄCYM NAP pokój przechodzi i NIE dubluje traktatu (idempotencja `addTreaty`)');
  assert(ds.declareWar(EMP, 'hostility_threshold') === false,
    'T8b: NAP realnie BRAMKUJE wojnę z inicjatywy AI/auto — to jest różnica wobec rozejmu, ' +
    'który dziś nie bramkuje niczego (D-WP-7 → DS-1)');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T9 — ciało domowe KTÓREJKOLWIEK strony nie podlega cesji');
{
  const K = boot(); giveAi(K, 2); givePlayer(K, 1); warAt(K);
  const cm = K.colonyManager, ds = K.diplomacySystem, dp = K.directorProduction;
  const aiHome = dp.capitalOf(EMP)?.planetId;
  const myHome = cm.getPlayerColonies().find(c => c.isHomePlanet)?.planetId;

  // ⚠ KONTROLA NAJPIERW: na drzewie SPRZED WP-3 `offerPeace` IGNORUJE warunki i podpisuje
  //   pokój, co zamyka wojnę i zamienia powód odmowy na `diplo.reject.atWar`. Kontrola musi
  //   więc paść PRZED jakąkolwiek próbą cesji — inaczej jest czerwona z powodu SĄSIADA,
  //   a nie z powodu kodu, który mierzy.
  const rAi = ds.evaluatePeace(EMP, cede(aiHome, EMP, 'player'));
  assert(rAi.blocked === true && rAi.reasonKey === 'diplo.reject.capitalNotNegotiable',
    'T9c (KONTROLA PINU): stolica AI odpada JUŻ w silniku (WP-2) — dwa różne terminy, ' +
    'dwa różne powody; WP-3 dokłada tylko ten brakujący');

  let rej = null; const h = (p) => { rej = p; };
  EventBus.on('diplomacy:peaceRejected', h);
  const okMine = ds.offerPeace(EMP, 'wp3', { terms: cede(myHome, 'player', EMP) });
  EventBus.off('diplomacy:peaceRejected', h);
  assert(okMine === false && rej?.result?.reasonKey === 'diplo.reject.cessionHomeWorld',
    'T9a: STOLICA GRACZA odrzucona przy wykonaniu — pre-warunek `territorial_capital` chroni ' +
    'wyłącznie OCENIAJĄCEGO (tu: AI), więc bez tego terminu gracz mógłby oddać własny dom');
  assert(cm.getColony(myHome)?.ownerEmpireId == null && ds.getStatus(EMP) === 'war',
    'T9b: zero mutacji, wojna trwa');

  const plain = K.empireRegistry.getColoniesByEmpire(EMP).find(c => c.planetId !== aiHome)?.planetId;
  const okPlain = ds.offerPeace(EMP, 'wp3', { terms: cede(plain, EMP, 'player') });
  assert(okPlain === true,
    'T9d (KONTROLA PINU): zwykłe ciało tego samego imperium PRZECHODZI — T9a/T9c mierzą ' +
    'znacznik domu, a nie „cesja w ogóle nie działa"');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T10 — i18n: sześć kluczy w PL i EN');
{
  const pl = norm(readFileSync(join(SRC, 'i18n', 'pl.js'), 'utf8'));
  const en = norm(readFileSync(join(SRC, 'i18n', 'en.js'), 'utf8'));
  const KEYS = ['diplo.reject.cessionTermsStale', 'diplo.reject.cessionHomeWorld',
    'notif.colonyCededTitle', 'notif.colonyCededSubtitle', 'log.cession', 'log.colonyReceivedCession'];
  assert(KEYS.every(k => pl.includes("'" + k + "'") || pl.includes('"' + k + '"')),
    'T10a: wszystkie sześć kluczy jest w PL');
  assert(KEYS.every(k => en.includes("'" + k + "'") || en.includes('"' + k + '"')),
    'T10b: wszystkie sześć kluczy jest w EN (parytet — inaczej `check-i18n` pada)');
  assert(!pl.includes("'diplo.reject.cessionZonk'"),
    'T10c (KONTROLA PINU): klucz, którego nie ma, NIE jest w słowniku');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T11 — narracja cesji: ton dyplomatyczny, nie bitewny');
{
  const gs = readClean('scenes', 'GameScene.js');
  const nc = readClean('systems', 'NotificationCenter.js');
  const um = readClean('scenes', 'UIManager.js');
  assert(/reason\s*===\s*'cession'/.test(gs) && /notif\.colonyCededTitle/.test(gs),
    'T11a (pin ŹRÓDŁOWY): `GameScene` ma gałąź `reason === \'cession\'` z własnym tytułem');
  assert(/reason\s*===\s*'cession'/.test(nc) && /log\.cession/.test(nc),
    'T11b (pin ŹRÓDŁOWY): `NotificationCenter` ma gałąź cesji i pisze do Dziennika `log.cession`');
  assert(/reason\s*===\s*'cession'/.test(um) && /log\.colonyReceivedCession/.test(um),
    'T11c (pin ŹRÓDŁOWY): `UIManager` rozróżnia cesję otrzymaną od zdobyczy z desantu');
  // ⚠ Kotwicą jest DEFINICJA metody, nie pierwsze wystąpienie nazwy: `_handleColonyCaptured`
  //   pada najpierw jako SUBSKRYPCJA (`e => this._handleColonyCaptured(e)`) kilkadziesiąt linii
  //   wyżej, a okno liczone od niej nie sięga ciała metody — pin mierzyłby wtedy ciszę.
  //   (Ta sama pułapka co WP-2 T12d; zapisana, żeby nie kosztowała trzeci raz.)
  const ncAt = nc.indexOf('_handleColonyCaptured({');
  const ncBranch = ncAt < 0 ? '' : nc.slice(ncAt, ncAt + 1400);
  assert(/logChannel:\s*'diplomacy'/.test(ncBranch) && /severity:\s*'info'/.test(ncBranch),
    'T11d: cesja idzie kanałem DYPLOMACJI z severity `info` — nie `combat`/`alert` ' +
    '(ZMIERZONE przed WP-3: cesja dziedziczyła czerwony alarm „Kolonia utracona")');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T12 — D-WP-12: wypchnięcie zadokowanych PRZED przerzutem');
{
  const src = readClean('systems', 'DiplomacySystem.js');
  assert(callRe('undockToOrbit').test(src),
    'T12a (pin ŹRÓDŁOWY): ścieżka cesji woła `undockToOrbit` — istniejące API (3 wołających ' +
    'w UI), instant, bez paliwa');
  const K = boot(); const mine = givePlayer(K, 1); giveAi(K, 1); warAt(K);
  const cm = K.colonyManager, vm = K.vesselManager, ds = K.diplomacySystem;
  const target = mine[0];
  const enemy = vm.createAndRegister('hull_small', target);
  enemy.ownerEmpireId = 'emp_002';                       // CUDZY statek w tym samym hangarze
  enemy.position = { state: 'docked', dockedAt: target, x: 1, y: 1 };
  const own = vm.createAndRegister('hull_small', target);
  own.position = { state: 'docked', dockedAt: target, x: 1, y: 1 };
  cm.getColony(target).fleet = [enemy.id, own.id];
  ds.offerPeace(EMP, 'wp3', { terms: cede(target, 'player', EMP) });
  assert(!!vm.getVessel(own.id),
    'T12b (INWARIANT): statek GRACZA przeżył — na pristine jałowo (brak transferu), ' +
    'czerwony partner to T12a/T12c');
  assert(!vm.getVessel(enemy.id),
    'T12c: CUDZY statek w tym samym hangarze zginął jak dotąd — wypychamy WYŁĄCZNIE flotę ' +
    'GRACZA, a nie „wszystko, co stoi" (pin ZAKRESU, nie kontrola: na pristine nie ma czego ' +
    'wypychać, bo transferu nie ma w ogóle)');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T13 — ścieżka BEZ `cession` nietknięta (kontrola nie-rozlania)');
{
  const K = boot(); const ids = giveAi(K, 2); warAt(K);
  const cm = K.colonyManager, ds = K.diplomacySystem, ws = K.warSystem;
  const w = ws.getWarWith(EMP);
  const { seen } = emitsDuring(() => cm.transferColony(cm.getPlayerColonies()[0].planetId, EMP, 'invasion'));
  const caps = ws.getWar(w.id)?.captures ?? [];
  assert(caps.at(-1)?.via === 'invasion',
    'T13a: desant dalej księguje się jako `invasion` — mapa `CAPTURE_VIA_BY_REASON` nie ' +
    'przejęła wszystkiego');
  assert(seen.includes('colony:captured') && !seen.includes('diplomacy:peaceSigned'),
    'T13b: zwykła zmiana rąk nie odpala niczego z dyplomacji');

  const K2 = boot(); giveAi(K2, 2); warAt(K2);
  const before = K2.diplomacySystem.relations.getTreaties('player', EMP).length;
  const ok = K2.diplomacySystem.offerPeace(EMP, 'wp3');          // BEZ terms
  assert(ok === true && K2.warSystem.getWarWith(EMP) === null,
    'T13c: pokój BEZ warunków działa jak dotąd (wojna zamknięta)');
  assert((K2.warSystem.listAll().find(x => x.captures)?.captures ?? []).length === 0,
    'T13d: pokój bez warunków NIE dopisuje nic do księgi');
  assert(K2.diplomacySystem.relations.getTreaties('player', EMP).length === before + 1,
    'T13e: …ale NAP dostaje KAŻDY pokój (D-WP-1: „NAP w każdym pokoju"), także bez cesji');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
