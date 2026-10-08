// AI STRIKES BACK S1 (sesja 2) — keeper odczytu wywiadu FLOTA / LIMIT (SB19, Finding 398).
// Plan: `docs/design/AI_STRIKES_BACK_PLAN.md` §2 (SB19), §6 (398).
//
//   I1  `_reserveReadout`: uzbrojone kadłuby i limit floty imperium = migawka `readEmpireFleetSnapshot` (żywy świat, po
//       wojnie i puli); pola „wolnej załogi” nie ma
//   I2  brak systemu puli ⇒ null / null („nie wiem”, nigdy 0)
//   I3  `advanceIntel` do `detailed` zapisuje oba pola, poniżej `detailed` — nic; `_refreshKnownMilitary` odświeża po
//       zmianie floty (odrastanie), bez zapisu, gdy nic się nie zmieniło
//   I4  panel Wywiadu, blok „Siła wojskowa” (`_drawRight` WYKONANIEM na atrapie ctx): linia „okręty uzbrojone: A / limit
//       floty: L”; napisu „wolna załoga” nie ma; KONTROLA: linia „jednostek bojowych” jest rysowana
//   I5  i18n: `intel.fleetVsLimit` w PL i EN (oba miejsca na liczby), `intel.crewCapacity` usunięty z obu słowników;
//       w `src/` (poza testami) brak `knownCrewCapacity` i `intel.crewCapacity`
//
// ⚠ Fail-first: na kodzie sprzed zmiany piny I1–I5 są czerwone; zielone po obu stronach — świadkowie i KONTROLA.

import '../headless/env.js';           // MUSI być pierwszy
import gameState from '../../core/GameState.js';
import debugLog from '../../core/DebugLog.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import { IntelOverlay } from '../../ui/IntelOverlay.js';
import { t, setLocale, getLocale } from '../../i18n/i18n.js';
import PL from '../../i18n/pl.js';
import EN from '../../i18n/en.js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const FL = await import('../../utils/FleetLimit.js').catch(() => null);
const here = path.dirname(fileURLToPath(import.meta.url));
const SRC  = path.resolve(here, '../..');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');
const quiet = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };

const { K, ticker } = quiet(() => bootWithDirector({ quiet: true }));
const [E1, E2] = K.empireRegistry.listIds();
quiet(() => K.diplomacySystem.declareWar(E1, 'keeper_setup'));
const intel = K.intelSystem;

// ── I1 — odczyt = migawka floty ────────────────────────────────────────────────────────────────
console.log('\nI1 — odczyt wywiadu: flota / limit z migawki');
{
  const snap = FL?.readEmpireFleetSnapshot?.(K, E1);
  const r = intel._reserveReadout(E1);
  assert(snap?.armed === 2 && snap?.limit === 2,
    `I1a (świadek): po wojnie imperium ma 2 uzbrojone kadłuby z puli przy limicie 2 (${snap?.armed} / ${snap?.limit})`);
  assert(r.knownArmedHulls === snap?.armed && r.knownFleetLimit === snap?.limit && !('knownCrewCapacity' in r),
    `I1b: odczyt — okręty ${r.knownArmedHulls} / limit ${r.knownFleetLimit}; pola „wolnej załogi” brak (${JSON.stringify(Object.keys(r))})`);
}

// ── I2 — brak systemu puli ⇒ null ──────────────────────────────────────────────────────────────
console.log('\nI2 — brak kolaboratora ⇒ „nie wiem”');
{
  const fps = K.fleetPoolSystem;
  K.fleetPoolSystem = null;
  const blind = intel._reserveReadout(E1);
  K.fleetPoolSystem = fps;
  assert('knownArmedHulls' in blind && blind.knownArmedHulls === null && blind.knownFleetLimit === null,
    `I2: bez systemu puli — null / null, nie 0 (${JSON.stringify(blind)})`);
}

// ── I3 — zapis za bramką „detailed”, odświeżanie ───────────────────────────────────────────────
console.log('\nI3 — bramka `detailed` i odświeżanie');
{
  quiet(() => intel.advanceIntel(E1, 'contact', 'keeper'));
  const atContact = gameState.get(`intel.${E1}`);
  quiet(() => intel.advanceIntel(E1, 'detailed', 'keeper'));
  const atDetailed = gameState.get(`intel.${E1}`);
  assert(atContact?.level === 'contact' && atContact?.knownArmedHulls == null && atDetailed?.knownArmedHulls === 2 && atDetailed?.knownFleetLimit === 2,
    `I3a: kontakt — brak liczb floty; „detailed” — okręty 2 / limit 2 (${atDetailed?.knownArmedHulls} / ${atDetailed?.knownFleetLimit})`);
  quiet(() => ticker.run(12, { tickSize: 1.0 }));                // granica roku: odrastanie +1 eskorta (minimum z bakiem)
  const atBoundary = FL?.readEmpireFleetSnapshot?.(K, E1)?.armed;
  // Odświeżenie wywiadu biegnie co 1 civY (`_passiveTick`), w tym samym ticku PRZED kontrolą roczną puli (kolejność
  // subskrypcji) — rekord dogania flotę w następnym kroku, czyli najpóźniej miesiąc po granicy roku.
  quiet(() => ticker.run(1, { tickSize: 1.0 }));
  const after = gameState.get(`intel.${E1}`);
  assert(atBoundary === 3 && after?.knownArmedHulls === 3 && after?.knownFleetLimit === 2,
    `I3b: po odrośnięciu kadłuba (flota ${atBoundary}) odczyt odświeżony najpóźniej miesiąc później — okręty ${after?.knownArmedHulls} / limit ${after?.knownFleetLimit}`);
  const writes = () => debugLog.query((e) => e.kind === 'state' && e.data?.path === `intel.${E1}`).length;
  quiet(() => intel._refreshKnownMilitary());
  const w0 = writes();
  quiet(() => intel._refreshKnownMilitary());
  assert(writes() === w0 && w0 > 0 && after?.knownArmedHulls === 3,
    `I3c: odświeżenie bez zmian floty — bez zapisu (${w0} → ${writes()}); świadek: to samo odświeżenie zapisało zmianę floty (I3b)`);
  const e2 = gameState.get(`intel.${E2}`);
  assert(e2?.knownArmedHulls == null && gameState.get(`intel.${E1}`)?.knownArmedHulls === 3,
    `I3d: imperium bez „detailed” — brak liczb floty (${e2?.level ?? 'brak rekordu'}); świadek: imperium z „detailed” je ma`);
}

// ── I4 — panel Wywiadu, blok „Siła wojskowa” ───────────────────────────────────────────────────
console.log('\nI4 — panel Wywiadu rysuje linię flota / limit');
{
  const texts = [];
  const ctx = new Proxy({}, {
    get: (o, k) => {
      if (k === 'fillText') return (s) => texts.push(String(s));
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k in o) return o[k];
      return () => {};
    },
    set: (o, k, v) => { o[k] = v; return true; },
  });
  const ov = new IntelOverlay();
  ov._selectedId = E1;
  quiet(() => ov._drawRight(ctx, 0, 0, 900, 1200));
  const rec = gameState.get(`intel.${E1}`);
  const want = t('intel.fleetVsLimit', rec?.knownArmedHulls, rec?.knownFleetLimit);
  assert(texts.some((s) => s.includes(t('intel.combatUnits', rec?.knownMilitary))),
    `I4a (KONTROLA): blok „Siła wojskowa” jest rysowany (linia „${t('intel.combatUnits', rec?.knownMilitary)}”)`);
  assert(!want.startsWith('intel.') && texts.some((s) => s.includes(want)),
    `I4b: linia „${want}” w bloku „Siła wojskowa”`);
  assert(!texts.some((s) => /wolna załoga|free crew|intel\.crewCapacity/.test(s)), 'I4c: napisu „wolna załoga” nie ma');
}

// ── I5 — i18n i sprzątanie ─────────────────────────────────────────────────────────────────────
console.log('\nI5 — PL / EN i sprzątanie starego odczytu');
{
  const prev = getLocale();
  const both = {};
  for (const loc of ['pl', 'en']) { setLocale(loc); both[loc] = t('intel.fleetVsLimit', 7, 9); }
  setLocale(prev);
  assert(['pl', 'en'].every((l) => both[l].includes('7') && both[l].includes('9') && !both[l].startsWith('intel.'))
    && both.pl !== both.en, `I5a: PL „${both.pl}”; EN „${both.en}”`);
  // Słowniki czytane wprost (bez funkcji tłumaczącej — `check-i18n` liczy jej wywołania w całym `src/`, także w testach).
  const OLD = ['intel', 'crewCapacity'].join('.');
  const inDict = [PL, EN].map((d) => Object.prototype.hasOwnProperty.call(d, OLD));
  assert(inDict.every((x) => x === false) && Object.prototype.hasOwnProperty.call(PL, 'intel.reserveHulls'),
    `I5b: klucz ${OLD} usunięty z obu słowników (pl ${inDict[0]}, en ${inDict[1]}); świadek: sąsiedni klucz jest`);
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) { if (!p.includes(`${path.sep}testing`)) walk(p); } else if (/\.(m?js)$/.test(n)) files.push(p); } };
  walk(SRC);
  const stale = files.filter((f) => /knownCrewCapacity|intel\.crewCapacity/.test(stripComments(readFileSync(f, 'utf8'))))
    .map((f) => path.relative(SRC, f).replace(/\\/g, '/'));
  assert(files.length > 100 && stale.length === 0, `I5c: w src/ (kod, bez komentarzy) brak starego odczytu (${stale.join(', ') || 'brak'})`);
}

console.log(`\n[sb1_intel_fleet_smoke] PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
