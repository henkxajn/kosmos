// AI STRIKES BACK S1 (sesja 2) — keeper odczytu wywiadu FLOTA / LIMIT (SB19, Finding 398).
// Plan: `docs/design/AI_STRIKES_BACK_PLAN.md` §2 (SB19), §6 (398).
//
//   I1  `_reserveReadout`: uzbrojone kadłuby i limit floty imperium = migawka `readEmpireFleetSnapshot` (żywy świat, po
//       wojnie i puli); pola „wolnej załogi” nie ma
//   I2  brak systemu puli ⇒ null / null („nie wiem”, nigdy 0)
//   I3  `advanceIntel` do `detailed` zapisuje oba pola, poniżej `detailed` — nic; `_refreshKnownMilitary` odświeża po
//       zmianie floty (odrastanie), bez zapisu, gdy nic się nie zmieniło
//   I4  konsola Wywiadu (KZ: ścieżka jedyna; `draw()` WYKONANIEM na atrapie ctx), inspektor „Siła wojskowa”: wiersz
//       `intel.console.armedLimit` = „A / L” z rekordu wywiadu; napisu „wolna załoga” nie ma; MGŁA: ten sam rekord przy
//       „contact” — wiersz „???”, liczby nie wyciekają; świadek: strefy konsoli ('tab', 'select_empire') i nagłówek sekcji
//   I5  i18n: etykieta wiersza w PL i EN; `intel.crewCapacity` oraz klucze dawnej strony (fleetVsLimit, combatUnits,
//       reserveHulls — usunięte w KZ) nieobecne w obu słownikach; w `src/` (poza testami) brak `knownCrewCapacity` i
//       `intel.crewCapacity`
//
// KZ (ARC KONSOLE): dawne I4 (`_drawRight`, linia „jednostek bojowych” jako KONTROLA) przecelowane na konsolę — strona
// 2-kolumnowa i jej klucze usunięte; I5a pinuje etykietę konsoli zamiast klucza z miejscami na liczby.
// ⚠ Fail-first: na kodzie sprzed zmiany piny I1–I5 są czerwone; zielone po obu stronach — świadkowie i KONTROLA.

import '../headless/env.js';           // MUSI być pierwszy
import gameState from '../../core/GameState.js';
import debugLog from '../../core/DebugLog.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import { IntelOverlay } from '../../ui/IntelOverlay.js';
import { t } from '../../i18n/i18n.js';
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
  // ⚠ SB27 (przecelowanie R-B6 za zgodą właściciela) — pula D, E, E od razu: 3 kadłuby przy limicie 2.
  assert(snap?.armed === 3 && snap?.limit === 2,
    `I1a (świadek): po wojnie imperium ma 3 uzbrojone kadłuby z puli przy limicie 2 (${snap?.armed} / ${snap?.limit})`);
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
  assert(atContact?.level === 'contact' && atContact?.knownArmedHulls == null && atDetailed?.knownArmedHulls === 3 && atDetailed?.knownFleetLimit === 2,
    `I3a: kontakt — brak liczb floty; „detailed” — okręty 3 / limit 2 (${atDetailed?.knownArmedHulls} / ${atDetailed?.knownFleetLimit})`);
  // SB27 (R-B6) — minimum z bakiem od chwili utworzenia: odrastanie potrzebuje STRATY. Eskorta z puli zniszczona przed
  // granicą roku — odczyt najpierw schodzi do 2 (świadek odświeżenia po stracie), po odrośnięciu wraca do 3.
  const lost = K.vesselManager.getAllVessels().find((v) => (v.ownerEmpireId ?? v.owner) === E1 && v.origin === 'pool' && (v.warpFuel?.max ?? 0) > 0);
  if (lost) lost.isWreck = true;
  quiet(() => ticker.run(1, { tickSize: 1.0 }));
  const afterLoss = gameState.get(`intel.${E1}`)?.knownArmedHulls;
  quiet(() => ticker.run(11, { tickSize: 1.0 }));                // granica roku: odrastanie +1 eskorta (minimum z bakiem)
  const atBoundary = FL?.readEmpireFleetSnapshot?.(K, E1)?.armed;
  // Odświeżenie wywiadu biegnie co 1 civY (`_passiveTick`), w tym samym ticku PRZED kontrolą roczną puli (kolejność
  // subskrypcji) — rekord dogania flotę w następnym kroku, czyli najpóźniej miesiąc po granicy roku.
  quiet(() => ticker.run(1, { tickSize: 1.0 }));
  const after = gameState.get(`intel.${E1}`);
  assert(!!lost && afterLoss === 2 && atBoundary === 3 && after?.knownArmedHulls === 3 && after?.knownFleetLimit === 2,
    `I3b: po stracie odczyt ${afterLoss}; po odrośnięciu kadłuba (flota ${atBoundary}) odczyt odświeżony najpóźniej miesiąc później — okręty ${after?.knownArmedHulls} / limit ${after?.knownFleetLimit}`);
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

// ── I4 — konsola Wywiadu, inspektor „Siła wojskowa” ───────────────────────────────────────────
// KZ: dawna strona 2-kolumnowa (`_drawRight`) usunięta — ta sama treść (okręty uzbrojone / limit floty z rekordu wywiadu)
// żyje w inspektorze konsoli: wiersz klucz–wartość `intel.console.armedLimit` z wartością „A / L”. Rysunek przez publiczne
// `draw()` na atrapie ctx; cyfry w kratce (`drawTabular`) idą po glifie — wywołania na tej samej linii bazowej sklejane w
// jedną linię (wiersz kv rysuje najpierw wartość, potem klucz: linia = „A / L” + etykieta).
console.log('\nI4 — konsola Wywiadu rysuje wiersz flota / limit (inspektor)');
const drawConsole = (kosmos) => {
  const lines = [];
  let lastY = null;
  const ctx = new Proxy({}, {
    get: (o, k) => {
      if (k === 'fillText') return (s, x, y) => {
        if (lastY !== null && y === lastY && lines.length) lines[lines.length - 1] += String(s); else lines.push(String(s));
        lastY = y;
      };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k in o) return o[k];
      return () => {};
    },
    set: (o, k, v) => { o[k] = v; return true; },
  });
  const saved = window.KOSMOS;
  window.KOSMOS = kosmos;
  const ov = new IntelOverlay();
  try {
    ov.show();
    ov._selectedId = E1;
    quiet(() => ov.draw(ctx, 1600, 1041));
  } finally { window.KOSMOS = saved; }
  return { ov, lines };
};
{
  const rec = gameState.get(`intel.${E1}`);
  const LBL = t('intel.console.armedLimit');
  const A = rec?.knownArmedHulls, L = rec?.knownFleetLimit;
  const det = drawConsole(K);
  const isKit = det.ov._hitZones.some((z) => z.type === 'tab') && det.ov._hitZones.some((z) => z.type === 'select_empire' && z.data?.empireId === E1);
  const milHdr = det.lines.includes(t('intel.militaryStrength').toUpperCase());
  assert(isKit && milHdr && rec?.level === 'detailed',
    `I4a (świadek): konsola Wywiadu (strefy 'tab' + wiersz ${E1}) rysuje sekcję „${t('intel.militaryStrength')}” dla rekordu „${rec?.level}”`);
  assert(A === 3 && L === 2 && det.lines.includes(`${A} / ${L}${LBL}`),
    `I4b: wiersz „${LBL}: ${A} / ${L}” w inspektorze (z rekordu wywiadu)`);
  assert(det.lines.length > 10 && !det.lines.some((s) => /wolna załoga|free crew|intel\.crewCapacity/i.test(s)), 'I4c: napisu „wolna załoga” nie ma (świadek: konsola narysowała tekst)');
  // MGŁA: ten sam rekord (liczby floty zostają w rekordzie) poniżej `detailed` — wiersz pokazuje maskę, liczby nie wyciekają.
  const fogged = { ...K, gameState: { get: (p) => (p === 'intel' ? { [E1]: { ...rec, level: 'contact' } } : K.gameState.get(p)) } };
  const con = drawConsole(fogged);
  assert(con.lines.includes(`???${LBL}`) && !con.lines.some((s) => s.includes(`${A} / ${L}`)),
    'I4d: MGŁA — przy „contact” wiersz floty to „???”, liczb A / L nie ma (te same dane w rekordzie)');
}

// ── I5 — i18n i sprzątanie ─────────────────────────────────────────────────────────────────────
console.log('\nI5 — PL / EN i sprzątanie starego odczytu');
{
  // KZ: dawny klucz z miejscami na liczby (strona sprzed konsoli) zastąpiony etykietą wiersza konsoli; liczby formatuje kod.
  const KEY = 'intel.console.armedLimit';
  const both = { pl: PL[KEY], en: EN[KEY] };
  assert(['pl', 'en'].every((l) => typeof both[l] === 'string' && both[l].length > 0) && both.pl !== both.en,
    `I5a: etykieta wiersza floty — PL „${both.pl}”; EN „${both.en}”`);
  // Słowniki czytane wprost (bez funkcji tłumaczącej — `check-i18n` liczy jej wywołania w całym `src/`, także w testach).
  // KZ: klucze dawnego bloku „Siła wojskowa” (tylko strona sprzed konsoli) usunięte z obu słowników razem z nią.
  const OLD = [['intel', 'crewCapacity'], ['intel', 'fleetVsLimit'], ['intel', 'combatUnits'], ['intel', 'reserveHulls']].map((p) => p.join('.'));
  const inDict = OLD.filter((k) => [PL, EN].some((d) => Object.prototype.hasOwnProperty.call(d, k)));
  const witness = ['intel.console.reserve', 'intel.militaryStrength'].every((k) => [PL, EN].every((d) => Object.prototype.hasOwnProperty.call(d, k)));
  assert(inDict.length === 0 && witness,
    `I5b: klucze ${OLD.join(', ')} nieobecne w obu słownikach (zostały: [${inDict.join(', ')}]); świadek: klucze konsoli są`);
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) { if (!p.includes(`${path.sep}testing`)) walk(p); } else if (/\.(m?js)$/.test(n)) files.push(p); } };
  walk(SRC);
  const stale = files.filter((f) => /knownCrewCapacity|intel\.crewCapacity/.test(stripComments(readFileSync(f, 'utf8'))))
    .map((f) => path.relative(SRC, f).replace(/\\/g, '/'));
  assert(files.length > 100 && stale.length === 0, `I5c: w src/ (kod, bez komentarzy) brak starego odczytu (${stale.join(', ') || 'brak'})`);
}

console.log(`\n[sb1_intel_fleet_smoke] PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
