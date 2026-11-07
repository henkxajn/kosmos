// Finding 188 — keeper: MGLA WOJNY MA DWIE OSIE, NIE JEDNA FLAGE (kanon `SystemReveal`).
// Plan + podpisane decyzje D-188-1..8 (wariant W1): docs/design/STRATCOM_REVEAL_PLAN.md.
//
// PO CO: dawny panel detalu Stratcomu liczyl `known = isHome || explored || isAtLeast(empireId,'rumor')` i pod ta JEDNA flaga
// wydawal fakty z DWOCH niezaleznych osi wiedzy:
//   os MIEJSCA     (isSystemExplored / skan) — nazwa, ciala, zycie, infrastruktura
//   os WLASCICIELA (intel: rumor -> contact -> detailed) — tozsamosc, wrogosc, liczby
// Suma dwoch osi wydaje KAZDY fakt przy SLABSZYM z warunkow. Kanon `resolveSystemReveal` rozdziela osie; czytaja go dzis
// przypiecie i rozwiniecie gwiazdy trybu galaktyki, wiersze outlinerow, etykiety nieba (przez `SystemRevealWorld`).
//
// ⚠ PRZENIESIONE 2026-11-07 (ARC GALAXY G5-B — zakladka Stratcom usunieta, D-GX-21): dawny `stratcom_reveal_smoke` czytal fakty
//   z NAPISOW panelu detalu Stratcomu (`_drawStratcomDetail`), ktory zniknal razem z zakladka. Macierz reweali (T1), rdzen 188 (T2),
//   kontrola pinu (T3) i regresja gracza (T7) czytaja teraz rekord kanonu — to samo zrodlo, z ktorego rysuja nastepcy panelu.
//   Wycofane: T4 (anty-lustro mapa↔panel Stratcomu; nastepca — `galaxy_chrome_smoke` H5: etykieta ≡ przypiecie ≡ wiersz outlinera
//   na 16 stanach, wykonujac prawdziwa podwarstwe nazw płyty) i T6 (wysokosci panelu — panelu nie ma). T5 bez zmian.
//
//   T1  macierz reweali: 4 szczeble intelu x {zbadany, niezbadany}
//   T2  rdzen 188 — `rumor` + niezbadany nie wydaje tozsamosci/wrogosci/populacji/zycia
//   T3  KONTROLA PINU — contact wraca tozsamosc, detailed wraca populacje, explored wraca zycie
//   T5  PIN LIMITU — `IntelSystem` nietkniety (archetyp na contact, liczby na detailed)
//   T7  REGRESJA GRACZA — uklad BEZ obcego wlasciciela (wlasna kolonia / dom)

import '../headless/env.js';           // MUSI byc pierwszy
import { resolveSystemReveal } from '../../utils/SystemReveal.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const AI_SYS = 'sys_036';
const AI_EMP = 'emp_001';
const RANK = { unknown: 0, rumor: 1, contact: 2, detailed: 3 };

const mkSys = (explored, extra = {}) => ({ id: AI_SYS, name: 'Wezen', empireId: AI_EMP, isHome: false, explored, ...extra });
/** Rekord kanonu dla stanu: `intel` = poziom wywiadu o AI_EMP; `explored` i `scanned` = os miejsca. */
const reveal = ({ intel = 'unknown', explored = false, scanned = false, sys = mkSys(explored) } = {}) =>
  resolveSystemReveal(sys, { explored, scanned, intelAtLeast: (lvl) => RANK[intel] >= RANK[lvl] });

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
    const r = reveal({ intel, explored });
    const tag = `${intel}/${explored ? 'zbadany' : 'niezbadany'}`;
    assert(r.name === eName,          `T1 ${tag}: nazwa ukladu = ${eName}`);
    assert(r.ownerIdentity === eIdent, `T1 ${tag}: tozsamosc imperium = ${eIdent}`);
    assert(r.hostility === eHost,      `T1 ${tag}: wrogosc = ${eHost}`);
    assert(r.population === ePop,      `T1 ${tag}: populacja = ${ePop}`);
    assert(r.life === eLife,           `T1 ${tag}: zycie = ${eLife}`);
  }
}

// ── T2 — rdzen 188 ──────────────────────────────────────────────────────────
console.log('T2 — rdzen 188: `rumor` + niezbadany nie wydaje nic z osi wlasciciela poza faktem binarnym');
{
  const r = reveal({ intel: 'rumor', explored: false });
  assert(r.ownerIdentity === false, 'T2: BRAK nazwy imperium na rumor (D-188-3)');
  assert(r.hostility === false,     'T2: BRAK wrogosci na rumor (D-188-4)');
  assert(r.population === false,    'T2: BRAK populacji na rumor (D-188-5)');
  assert(r.life === false,          'T2: BRAK zycia na rumor bez wizyty (D-188-6)');
  assert(r.name === true,           'T2: nazwa ukladu JEST na rumor (D-188-1 — podpisane)');
  assert(r.ownerExists === true,    'T2: fakt „to czyjes” JEST na rumor (D-188-2) — wiersz wlasciciela to NIE „nieznany”');
  assert(r.place === false,         'T2: os miejsca zamknieta — rumor nie jest wizyta ani skanem');
}

// ── T3 — KONTROLA PINU ──────────────────────────────────────────────────────
console.log('T3 — kontrola pinu: wyzszy szczebel PRZYWRACA to, co rumor odebral');
{
  const c = reveal({ intel: 'contact', explored: false });
  assert(c.ownerIdentity && c.hostility, 'T3: contact przywraca tozsamosc + wrogosc');
  assert(c.population === false, 'T3: ...ale NIE populacje (ta jest na detailed)');

  const d = reveal({ intel: 'detailed', explored: false });
  assert(d.population === true, 'T3: detailed przywraca populacje');

  const e = reveal({ intel: 'unknown', explored: true });
  assert(e.life === true, 'T3: explored przywraca zycie (os MIEJSCA, niezalezna od wywiadu)');
  assert(e.ownerIdentity === false, 'T3: ...i NIE ujawnia tozsamosci (osie sa rozdzielone)');

  const s = reveal({ intel: 'unknown', explored: false, scanned: true });
  assert(s.name === true && s.place === true && s.ownerIdentity === false, 'T3: skan otwiera os miejsca (nazwa), nie os wlasciciela');
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

// ── T7 — regresja po stronie GRACZA ─────────────────────────────────────────
// ⚠ To jedyne miejsce, w ktorym zwezenie mgly moglo uderzyc w GRACZA zamiast w AI: uklad skolonizowany przez gracza NIE MA
//   `empireId`, wiec bramka „populacja = detailed" bez galezi `!hasOwner` zabralaby graczowi widok populacji WLASNEJ kolonii.
console.log('T7 — uklad bez obcego wlasciciela: populacja jedzie osia MIEJSCA, nie wywiadu');
{
  const ownless = ({ explored = false, isHome = false } = {}) =>
    reveal({ explored, sys: mkSys(explored, { empireId: null, isHome }) });
  assert(ownless({ explored: true }).population === true,
    'T7: zbadany uklad BEZ obcego wlasciciela pokazuje populacje (regresja gracza)');
  assert(ownless({ isHome: true }).population === true, 'T7: uklad DOMOWY pokazuje populacje');
  // kontrola pinu — to nie jest „zawsze prawda": niezbadany i niczyj dalej milczy
  assert(ownless({}).population === false, 'T7 kontrola pinu: niezbadany i niczyj NIE pokazuje populacji');
}

console.log(`\n${fail === 0 ? 'OK' : 'FAIL'} — ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
