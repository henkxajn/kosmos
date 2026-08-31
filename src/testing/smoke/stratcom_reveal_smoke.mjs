// Finding 188 — keeper: MGLA WOJNY W STRATCOM MA DWIE OSIE, NIE JEDNA FLAGE.
// Plan + podpisane decyzje D-188-1..8 (wariant W1): docs/design/STRATCOM_REVEAL_PLAN.md.
//
// PO CO: `_drawStratcomDetail` liczylo `known = isHome || explored || isAtLeast(empireId,'rumor')`
// i pod ta JEDNA flaga wydawalo fakty z DWOCH niezaleznych osi wiedzy:
//   os MIEJSCA     (isSystemExplored / skan STRATCOM) — nazwa, cziala, zycie, infrastruktura
//   os WLASCICIELA (intel: rumor -> contact -> detailed) — tozsamosc, wrogosc, liczby
// Suma dwoch osi wydaje KAZDY fakt przy SLABSZYM z warunkow, wiec jeden przelot cudzej sondy
// (najnizszy szczebel osi wlasciciela) otwieral wszystkie fakty o miejscu dla KAZDEGO ukladu
// tego imperium. ZMIERZONE w zywej grze i sonda: panel wydawal na `rumor` nazwe imperium,
// wrogosc 72/100 i realna populacje 55, przy statusie „Niezbadany".
//
// ⚠ REJESTR POLICZYL TRZY REWEALE, A JEST ICH SZESC. Nazwa w PANELU byla juz bramkowana
//   poprawnie (`_systemDisplayName`), a wyciekala na MAPIE (`_stratcomVisibleSystems`) — inna
//   funkcja. Za to tozsamosc imperium i wrogosc (nie policzone w rejestrze) szly na `rumor`
//   w panelu I jako kolorowy pierscien na mapie. Dlatego T4 pinuje ROWNOSC obu powierzchni.
//
// ⚠ PIN JALOWY = FALSZYWA ZIELEN. Kazda asercja o BRAKU wiersza wymaga, zeby panel w ogole
//   cos narysowal (`lines.length > 0`). Bez tego „brak populacji" przechodzilby takze dla
//   panelu, ktory nie rysuje NICZEGO — czyli swiecilby zielono dokladnie tam, gdzie defekt.
//
//   T1  macierz reweali: 4 szczeble intelu x {zbadany, niezbadany}
//   T2  rdzen 188 — `rumor` + niezbadany nie wydaje tozsamosci/wrogosci/populacji/zycia
//   T3  KONTROLA PINU — contact wraca tozsamosc, detailed wraca populacje, explored wraca zycie
//   T4  ANTY-LUSTRO (tripwire) — nazwa w panelu i nazwa na mapie z JEDNEGO predykatu
//   T5  PIN LIMITU — `IntelSystem` nietkniety (archetyp na contact, liczby na detailed)
//   T6  layout — trojstan wiersza wlasciciela ma trzy wysokosci panelu
//   T7  REGRESJA GRACZA — uklad BEZ obcego wlasciciela (wlasna kolonia / dom)
//   T7  REGRESJA GRACZA — uklad BEZ obcego wlasciciela (wlasna kolonia / dom)

import '../headless/env.js';           // MUSI byc pierwszy
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import EntityManager from '../../core/EntityManager.js';
import { t } from '../../i18n/i18n.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const AI_SYS = 'sys_036';
const AI_EMP = 'emp_001';
const POP    = 55;
const HOST   = 72;

// ── Atrapa ctx: zbiera fillText i fillRect (wzor `zero_colony_panels`) ─────────
function mkCtx() {
  const lines = [], rects = [];
  const ctx = new Proxy({}, {
    get: (_, p) => {
      if (p === 'fillText')  return (s) => lines.push(String(s));
      if (p === 'fillRect')  return (x, y, w, h) => rects.push({ x, y, w, h });
      if (p === 'measureText') return () => ({ width: 40 });
      if (p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (p === 'canvas') return { width: 1280, height: 720 };
      return () => {};
    },
    set: () => true,
  });
  return { ctx, lines, rects };
}

const RANK = { unknown: 0, rumor: 1, contact: 2, detailed: 3 };

/** Swiat gry dla jednego stanu. `intel` = poziom wywiadu o AI_EMP. */
function mkWorld({ intel = 'unknown', scanned = false } = {}) {
  window.KOSMOS = {
    intelSystem: {
      isAtLeast: (id, lvl) => id === AI_EMP && RANK[intel] >= RANK[lvl],
      getLevel: () => intel,
    },
    empireRegistry:   { get: () => ({ id: AI_EMP, name: 'Krolestwo Wezen', archetype: 'militarist' }) },
    diplomacySystem:  { getTension: () => HOST },
    territoryService: { getSystemOwner: () => null, getEmpireColor: () => '#ffffff' },
    observatorySystem: {
      getSystemScanResult:   () => (scanned ? { tier: 1, counts: { planets: 3 } } : null),
      getSystemScanProgress: () => null,
      getMaxSystemScanTier:  () => 0,
    },
    galaxyData: { systems: [] },   // uzupelniane w T4
  };
}

function mkSys(explored) {
  return { id: AI_SYS, name: 'Wezen', empireId: AI_EMP, isHome: false, explored, colorHex: 0x88aaff };
}

// Kolonia AI + planeta z zyciem — zrodla populacji i zycia w panelu.
EntityManager.add({ id: 'p_ai', type: 'planet', systemId: AI_SYS, lifeScore: 80 });
const colMgr = {
  activePlanetId: 'p_home',
  getAllColonies: () => [{ planetId: 'p_ai', civSystem: { population: POP } }],
};

/** Rysuje panel dla zadanego stanu i zwraca { lines, rects }. */
function drawPanel({ intel = 'unknown', explored = false, scanned = false } = {}) {
  mkWorld({ intel, scanned });
  const { ctx, lines, rects } = mkCtx();
  const o = Object.create(FleetManagerOverlay.prototype);
  o._hitZones = [];
  o._drawStratcomDetail(ctx, 0, 0, 400, 600, mkSys(explored),
    { getSystem: () => null }, { getAvailable: () => [] }, colMgr);
  return { lines, rects };
}

const has  = (lines, s) => lines.some(l => l.includes(s));
// Nazwa ukladu jest w naglowku „⭐ <nazwa>”; „???” = ukryta.
const showsName = (lines) => has(lines, '⭐ Wezen');

const L_EMPIRE  = t('fleet.stratcomEmpire', 'Krolestwo Wezen');
const L_FOREIGN = 'fleet.stratcomEmpireForeign';  // klucz — wartosc dochodzi w implementacji
const L_UNKNOWN = t('fleet.stratcomEmpireUnknown');
const L_HOST    = t('fleet.stratcomHostility', HOST);
const L_POP     = t('fleet.stratcomPopulation', POP);
const L_POP_Q   = t('fleet.stratcomPopUnknown');
const L_LIFE    = t('fleet.stratcomLifeYes');
const L_LIFE_Q  = t('fleet.stratcomLifeUnknown');

// ── T1 — macierz reweali ────────────────────────────────────────────────────
console.log('T1 — macierz reweali: 4 szczeble intelu x {zbadany, niezbadany}');
{
  // [intel, explored, nazwa, tozsamosc, wrogosc, populacja, zycie]
  const M = [
    ['unknown',  false, false, false, false, false, false],
    ['unknown',  true,  true,  false, false, false, true ],
    ['rumor',    false, true,  false, false, false, false],
    ['rumor',    true,  true,  false, false, false, true ],
    ['contact',  false, true,  true,  true,  false, false],
    ['contact',  true,  true,  true,  true,  false, true ],
    ['detailed', false, true,  true,  true,  true,  false],
    ['detailed', true,  true,  true,  true,  true,  true ],
  ];
  for (const [intel, explored, eName, eIdent, eHost, ePop, eLife] of M) {
    const { lines } = drawPanel({ intel, explored });
    const tag = `${intel}/${explored ? 'zbadany' : 'niezbadany'}`;
    // ⚠ warunek nie-jalowosci: panel MUSI cos narysowac, inaczej kazdy „brak” przechodzi za darmo
    assert(lines.length > 0, `T1 ${tag}: panel realnie rysuje (${lines.length} wierszy)`);
    assert(showsName(lines) === eName,        `T1 ${tag}: nazwa ukladu = ${eName}`);
    assert(has(lines, L_EMPIRE) === eIdent,   `T1 ${tag}: tozsamosc imperium = ${eIdent}`);
    assert(has(lines, L_HOST) === eHost,      `T1 ${tag}: wrogosc = ${eHost}`);
    assert(has(lines, L_POP) === ePop,        `T1 ${tag}: populacja = ${ePop}`);
    assert(has(lines, L_LIFE) === eLife,      `T1 ${tag}: zycie = ${eLife}`);
  }
}

// ── T2 — rdzen 188 ──────────────────────────────────────────────────────────
console.log('T2 — rdzen 188: `rumor` + niezbadany nie wydaje nic z osi wlasciciela poza faktem binarnym');
{
  const { lines } = drawPanel({ intel: 'rumor', explored: false });
  assert(lines.length > 0, 'T2: panel realnie rysuje (warunek nie-jalowosci)');
  assert(!has(lines, L_EMPIRE), 'T2: BRAK nazwy imperium na rumor (D-188-3)');
  assert(!has(lines, L_HOST),   'T2: BRAK wrogosci na rumor (D-188-4)');
  assert(!has(lines, L_POP),    'T2: BRAK populacji na rumor (D-188-5)');
  assert(has(lines, L_POP_Q),   'T2: populacja pokazana jako „?”');
  assert(!has(lines, L_LIFE),   'T2: BRAK zycia na rumor bez wizyty (D-188-6)');
  assert(has(lines, L_LIFE_Q),  'T2: zycie pokazane jako „?”');
  assert(showsName(lines),      'T2: nazwa ukladu JEST na rumor (D-188-1 — podpisane)');
  assert(!has(lines, L_UNKNOWN),'T2: wiersz wlasciciela to NIE „nieznany” — cos tam jest');
}

// ── T3 — KONTROLA PINU ──────────────────────────────────────────────────────
console.log('T3 — kontrola pinu: wyzszy szczebel PRZYWRACA to, co rumor odebral');
{
  const c = drawPanel({ intel: 'contact',  explored: false }).lines;
  assert(has(c, L_EMPIRE) && has(c, L_HOST), 'T3: contact przywraca tozsamosc + wrogosc');
  assert(!has(c, L_POP), 'T3: ...ale NIE populacje (ta jest na detailed)');

  const d = drawPanel({ intel: 'detailed', explored: false }).lines;
  assert(has(d, L_POP), 'T3: detailed przywraca populacje');

  const e = drawPanel({ intel: 'unknown', explored: true }).lines;
  assert(has(e, L_LIFE), 'T3: explored przywraca zycie (os MIEJSCA, niezalezna od wywiadu)');
  assert(!has(e, L_EMPIRE), 'T3: ...i NIE ujawnia tozsamosci (osie sa rozdzielone)');
}

// ── T4 — ANTY-LUSTRO (tripwire klasy 186) ───────────────────────────────────
console.log('T4 — tripwire: nazwa w PANELU i nazwa na MAPIE pochodza z jednego predykatu');
{
  let mismatch = 0, checked = 0;
  for (const intel of ['unknown', 'rumor', 'contact', 'detailed']) {
    for (const explored of [false, true]) {
      for (const scanned of [false, true]) {
        mkWorld({ intel, scanned });
        const sys = mkSys(explored);
        window.KOSMOS.galaxyData = {
          systems: [{ id: 'sys_home', isHome: true, x: 0, y: 0, explored: true }, sys],
        };
        const o = Object.create(FleetManagerOverlay.prototype);
        const vis = o._stratcomVisibleSystems();
        const entry = vis.list.find(e => e.s.id === AI_SYS);
        // Mapa: czy etykieta gwiazdy pokaze nazwe. Panel: czy naglowek pokaze nazwe.
        const onMap   = !!(entry?.nameKnown ?? entry?.reveal?.name);
        const onPanel = showsName(drawPanel({ intel, explored, scanned }).lines);
        checked++;
        if (onMap !== onPanel) {
          mismatch++;
          console.log(`     rozjazd: intel=${intel} explored=${explored} scanned=${scanned} → mapa=${onMap} panel=${onPanel}`);
        }
      }
    }
  }
  assert(checked === 16, `T4: sprawdzono komplet 16 stanow (warunek nie-jalowosci, jest ${checked})`);
  assert(mismatch === 0,
    'T4: ZERO rozjazdow mapa↔panel. Jesli to padlo — ktos rozdzielil predykat nazwy na dwa. ' +
    'Nazwa ma JEDNO zrodlo (SystemReveal.name); lustro predykatow to klasa Findingu 186.');
}

// ── T5 — PIN LIMITU: IntelSystem NIETKNIETY ─────────────────────────────────
console.log('T5 — pin limitu: drabina wywiadu bez zmian (naprawa jest czysto prezentacyjna)');
{
  // Pin ZRODLOWY na kodzie BEZ komentarzy (regula `source-pin-strip-comments`).
  const src = readFileSync(new URL('../../systems/IntelSystem.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert(/newRank\s*>=\s*LEVEL_RANK\.contact/.test(src),
    'T5: archetyp/knownColonies nadal bramkowane na `contact`');
  assert(/newRank\s*>=\s*LEVEL_RANK\.detailed/.test(src),
    'T5: knownMilitary/knownReserve nadal bramkowane na `detailed`');
  assert(!/SystemReveal/.test(src),
    'T5: IntelSystem NIE importuje kanonu prezentacji (kierunek zaleznosci: UI → wywiad)');
  // kontrola pinu — regexy trafiaja w cos, co istnieje
  assert(/LEVEL_RANK/.test(src), 'T5 kontrola pinu: `LEVEL_RANK` istnieje w zrodle');
}

// ── T6 — layout: trojstan wiersza wlasciciela ───────────────────────────────
console.log('T6 — layout: wiersz wlasciciela ma TRZY stany, wiec panel ma trzy wysokosci');
{
  const hOf = (o) => drawPanel(o).rects[0]?.h ?? -1;
  const hUnknown = hOf({ intel: 'unknown'  });   // „Wlasciciel: nieznany”      — 1 wiersz
  const hForeign = hOf({ intel: 'rumor'    });   // „Wlasciciel: obce imperium” — 1 wiersz
  const hNamed   = hOf({ intel: 'contact'  });   // nazwa + wrogosc             — 2 wiersze
  assert(hUnknown > 0 && hNamed > 0, `T6: panel ma realna wysokosc (warunek nie-jalowosci: ${hUnknown}/${hNamed})`);
  assert(hUnknown === hForeign,
    `T6: „nieznany” i „obce imperium” to po jednym wierszu → ta sama wysokosc (${hUnknown} vs ${hForeign})`);
  assert(hNamed === hUnknown + 14,
    `T6: contact dokłada wiersz wrogosci → +14 px (${hUnknown} → ${hNamed})`);
}

// ── T7 — regresja po stronie GRACZA ──────────────────────────
// ⚠ To jedyne miejsce, w ktorym zwezenie mgly moglo uderzyc w GRACZA zamiast w AI: uklad
//   skolonizowany przez gracza NIE MA `empireId`, wiec bramka „populacja = detailed" bez
//   galezi `!hasOwner` zabralaby graczowi widok populacji WLASNEJ kolonii poza domem.
console.log('T7 — uklad bez obcego wlasciciela: populacja jedzie osia MIEJSCA, nie wywiadu');
{
  const drawOwnless = ({ explored = false, isHome = false } = {}) => {
    mkWorld({ intel: 'unknown' });
    const { ctx, lines } = mkCtx();
    const o = Object.create(FleetManagerOverlay.prototype);
    o._hitZones = [];
    // Kolonia GRACZA: brak `empireId` na gwiezdzie (gracz nie jest imperium w galaxyData).
    const sys = { id: AI_SYS, name: 'Wezen', empireId: null, isHome, explored, colorHex: 0x88aaff };
    o._drawStratcomDetail(ctx, 0, 0, 400, 600, sys,
      { getSystem: () => null }, { getAvailable: () => [] }, colMgr);
    return lines;
  };
  const vis = drawOwnless({ explored: true });
  assert(vis.length > 0, 'T7: panel realnie rysuje (warunek nie-jalowosci)');
  assert(has(vis, L_POP), 'T7: zbadany uklad BEZ obcego wlasciciela pokazuje populacje (regresja gracza)');
  assert(has(drawOwnless({ isHome: true }), L_POP), 'T7: uklad DOMOWY pokazuje populacje');
  // kontrola pinu — to nie jest „zawsze prawda": niezbadany i niczyj dalej milczy
  assert(!has(drawOwnless({}), L_POP), 'T7 kontrola pinu: niezbadany i niczyj NIE pokazuje populacji');
}

console.log(`\n${fail === 0 ? 'OK' : 'FAIL'} — ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
