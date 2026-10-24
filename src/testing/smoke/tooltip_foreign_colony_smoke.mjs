// tooltip_foreign_colony_smoke.mjs — Finding 531 (REFORMA ZAKŁADEK, drobny krok przed T3 — D-TR-15 (b)).
//
// Podpowiedź mapy (`#kosmos-tooltip`, treść z `TooltipContent._planetContent`) nad KOLONIĄ OBCĄ kłamała o właścicielu
// i zdradzała populację: `colonyManager.getColony` zwraca też kolonie AI, a gałąź kolonii pisała zawsze „Właściciel:
// Imperium gracza” i realną populację, bez terminu właściciela i bez bramki wywiadu. Zmierzone (Polonia gy79): Akhernar h
// (`emp_001`, wywiad `contact`) — „Właściciel: Imperium gracza”, „Populacja: 55”.
// Po poprawce: kolonia obca — właściciel wg wywiadu (oś WŁAŚCICIELA kanonu `SystemReveal`: nazwa od `contact`, „obce
// imperium” od `rumor`, „nieznany” poniżej), populacja wyłącznie od `detailed` (`SystemReveal.js:92`, D-188-5); kolonia
// gracza — bez zmian.
//
//   T1  KONTROLA: kolonia gracza — „Imperium gracza” + populacja; komplet linii jak dziś
//   T2  SEDNO: kolonia obca, wywiad `contact` — właściciel = nazwa imperium, BEZ populacji (przypadek Polonia, Akhernar h)
//   T3  … `detailed` — nazwa imperium (SEDNO) + populacja (strażnik — zielony także przed poprawką)
//   T4  SEDNO: … `rumor` — „obce imperium”, bez nazwy i bez populacji
//   T5  SEDNO: … `unknown` — „nieznany”, bez populacji
//   T6  SEDNO: … brak wywiadu w `deps` — fail-closed (jak `unknown`)
//   T7  KONTROLA: ciało bez kolonii — „Neutralne”, bez populacji
//   T8  KONTROLA: kolonia z `ownerEmpireId: 'player'` — jak kolonia gracza (kanon `isPlayerColony`)
//   T9  teksty PL i EN przez prawdziwe `t()` — bez surowych kluczy; „Imperium gracza” / „Player Empire” nigdy dla obcej
//   T10 ta sama reguła co panel STRATCOM — dla 4 poziomów odczyt podpowiedzi = rekord `resolveSystemReveal`
//   T11 montaż: `GameScene._tooltipDeps` podaje `intelSystem` (pin źródłowy — `GameScene` nie importuje się pod node)
//
// Wywiad — PRAWDZIWY `IntelSystem` (`isAtLeast` na `gameState.intel`), imperium — PRAWDZIWY `EmpireRegistry`.
import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import gameState from '../../core/GameState.js';
import { IntelSystem } from '../../systems/IntelSystem.js';
import { EmpireRegistry } from '../../systems/EmpireRegistry.js';
import { ARCHETYPE_IDS } from '../../data/EmpireData.js';
import { t, setLocale, getLocale } from '../../i18n/i18n.js';
import { getTooltipContent } from '../../utils/TooltipContent.js';
import { resolveSystemReveal } from '../../utils/SystemReveal.js';

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n'));

// ── Świat: prawdziwy rejestr imperiów i wywiad ─────────────────────────────────────────────────────────────────────
const K = globalThis.window.KOSMOS ?? (globalThis.window.KOSMOS = {});
const reg = new EmpireRegistry();
K.empireRegistry = reg;
const EMP = 'emp_001';
const EMP_NAME = 'Liga Trzech Słońc';
reg.createEmpire({ id: EMP, name: EMP_NAME, archetype: ARCHETYPE_IDS[0] });
const intel = new IntelSystem();
K.intelSystem = intel;
const setLevel = (lvl) => gameState.set(`intel.${EMP}`, { ...(gameState.get(`intel.${EMP}`) ?? {}), level: lvl }, 'keeper_531');

// Kolonie: populacja 55,4 — liczba odróżnialna od czegokolwiek innego w treści podpowiedzi.
const COLONIES = {
  p_own:    { planetId: 'p_own', name: 'Nowa Ziemia', civSystem: { population: 12.4 } },
  p_ai:     { planetId: 'p_ai', name: 'Akhernar h', ownerEmpireId: EMP, civSystem: { population: 55.4 } },
  p_player: { planetId: 'p_player', name: 'Kolonia', ownerEmpireId: 'player', civSystem: { population: 7.25 } },
};
const colonyManager = { getColony: (id) => COLONIES[id] ?? null };
const body = (id, name) => ({ id, name, type: 'planet', planetType: 'rocky', explored: true, x: 58.3, y: 0,
  atmosphere: 'breathable', deposits: [{ resourceId: 'C' }, { resourceId: 'Fe' }], temperatureC: 8 });
const deps = (over = {}) => ({ t, colonyManager, empireRegistry: reg, intelSystem: intel, auToPx: 110, ...over });
const lines = (id, name, over) => getTooltipContent('planet', body(id, name), deps(over))?.lines ?? [];
const has = (ls, s) => ls.some((l) => l.includes(s));
const popLine = (ls) => ls.find((l) => l.startsWith(`${t('tooltip.planet.population')}:`)) ?? null;
const ownerLine = (ls) => ls.find((l) => l.startsWith(`${t('tooltip.planet.owner')}:`)
  || l === t('fleet.stratcomEmpireForeign') || l === t('fleet.stratcomEmpireUnknown')) ?? null;

setLocale('pl');

// ═══ T1 ══════════════════════════════════════════════════════════════════════
header('T1  KONTROLA: kolonia gracza — jak dziś');
{
  setLevel('unknown');   // wywiad o obcym imperium nie ma żadnego wpływu na własną kolonię
  const ls = lines('p_own', 'Nowa Ziemia');
  const want = ['Typ: rocky', 'Status: zbadane ✓', 'Odległość: 0.53 AU', 'Atmosfera: Oddychalna ✅',
    'Właściciel: Imperium gracza', 'Populacja: 12.4', 'Zasoby: C, Fe', 'Temperatura: +8°C'];
  ok(JSON.stringify(ls) === JSON.stringify(want), `T1a komplet linii kolonii gracza bez zmian (${ls.length} linii)`);
  if (JSON.stringify(ls) !== JSON.stringify(want)) console.log('     jest:', JSON.stringify(ls));
}

// ═══ T2 ══════════════════════════════════════════════════════════════════════
header('T2  SEDNO: kolonia obca, wywiad `contact` (Polonia — Akhernar h)');
{
  setLevel('contact');
  const ls = lines('p_ai', 'Akhernar h');
  ok(ownerLine(ls) === `Właściciel: ${EMP_NAME}`, `T2a właściciel = nazwa imperium wg wywiadu (jest: ${ownerLine(ls)})`);
  ok(!has(ls, t('tooltip.empire.player')), 'T2b nigdy „Imperium gracza” dla cudzej kolonii');
  ok(popLine(ls) === null && !has(ls, '55'), 'T2c SEDNO: bez populacji przy `contact` (dawniej „Populacja: 55.4”)');
  ok(has(ls, 'Typ: rocky') && has(ls, 'Zasoby: C, Fe'), 'T2d KONTROLA: reszta podpowiedzi (typ, zasoby) bez zmian — świadek, że ciało i kolonia są czytane');
}

// ═══ T3 ══════════════════════════════════════════════════════════════════════
header('T3  kolonia obca, wywiad `detailed` — nazwa (SEDNO) i populacja (strażnik)');
{
  setLevel('detailed');
  const ls = lines('p_ai', 'Akhernar h');
  ok(ownerLine(ls) === `Właściciel: ${EMP_NAME}`, 'T3a SEDNO: właściciel = nazwa imperium (dawniej „Imperium gracza”)');
  ok(popLine(ls) === 'Populacja: 55.4', `T3b STRAŻNIK: populacja od \`detailed\` zostaje — bramka nie wycina liczby za mocno (jest: ${popLine(ls)})`);
}

// ═══ T4 ══════════════════════════════════════════════════════════════════════
header('T4  SEDNO: kolonia obca, wywiad `rumor` — „obce imperium”');
{
  setLevel('rumor');
  const ls = lines('p_ai', 'Akhernar h');
  ok(ownerLine(ls) === 'Właściciel: obce imperium', `T4a sam fakt „obce” bez nazwy (jest: ${ownerLine(ls)})`);
  ok(!has(ls, EMP_NAME) && !has(ls, t('tooltip.empire.player')), 'T4b ani nazwy imperium, ani „Imperium gracza”');
  ok(popLine(ls) === null, 'T4c bez populacji');
}

// ═══ T5 ══════════════════════════════════════════════════════════════════════
header('T5  SEDNO: kolonia obca, wywiad `unknown` — „nieznany”');
{
  setLevel('unknown');
  const ls = lines('p_ai', 'Akhernar h');
  ok(ownerLine(ls) === 'Właściciel: nieznany', `T5a właściciel nieznany (jest: ${ownerLine(ls)})`);
  ok(!has(ls, EMP_NAME) && !has(ls, t('tooltip.empire.player')) && popLine(ls) === null, 'T5b bez nazwy, bez „Imperium gracza”, bez populacji');
}

// ═══ T6 ══════════════════════════════════════════════════════════════════════
header('T6  SEDNO: brak wywiadu w `deps` — fail-closed');
{
  setLevel('detailed');   // wywiad w grze pełny — ale podpowiedź go nie dostała
  const ls = lines('p_ai', 'Akhernar h', { intelSystem: null });
  ok(ownerLine(ls) === 'Właściciel: nieznany' && popLine(ls) === null && !has(ls, t('tooltip.empire.player')),
    `T6a bez wywiadu — „nieznany”, bez populacji (jest: ${ownerLine(ls)} / ${popLine(ls)})`);
  const ls2 = lines('p_ai', 'Akhernar h');
  ok(popLine(ls2) === 'Populacja: 55.4', 'T6b KONTROLA: ten sam świat z wywiadem w `deps` — populacja (fixture rozróżnia)');
}

// ═══ T7 ══════════════════════════════════════════════════════════════════════
header('T7  KONTROLA: ciało bez kolonii — „Neutralne”');
{
  setLevel('detailed');
  const ls = lines('p_none', 'Kamień');
  ok(ownerLine(ls) === 'Właściciel: Neutralne' && popLine(ls) === null, `T7a neutralne, bez populacji (jest: ${ownerLine(ls)})`);
}

// ═══ T8 ══════════════════════════════════════════════════════════════════════
header('T8  KONTROLA: `ownerEmpireId: \'player\'` — kolonia gracza (kanon `isPlayerColony`)');
{
  setLevel('unknown');
  const ls = lines('p_player', 'Kolonia');
  ok(ownerLine(ls) === 'Właściciel: Imperium gracza' && popLine(ls) === 'Populacja: 7.2', `T8a jak kolonia gracza (jest: ${ownerLine(ls)} / ${popLine(ls)})`);
}

// ═══ T9 ══════════════════════════════════════════════════════════════════════
header('T9  teksty PL i EN przez prawdziwe `t()`');
{
  const rows = [];
  for (const lang of ['pl', 'en']) {
    setLocale(lang);
    for (const lvl of ['unknown', 'rumor', 'contact', 'detailed']) {
      setLevel(lvl);
      const ls = lines('p_ai', 'Akhernar h');
      rows.push({ lang, lvl, owner: ownerLine(ls), all: ls });
    }
  }
  setLocale('pl');
  const slug = rows.some((r) => r.all.some((l) => /\b(tooltip|fleet)\.[a-zA-Z.]+/.test(l)));
  ok(!slug, 'T9a żadna linia nie jest surowym kluczem i18n (oba języki, 4 poziomy)');
  ok(rows.every((r) => !r.all.some((l) => l.includes('Imperium gracza') || l.includes('Player Empire'))),
    'T9b „Imperium gracza” / „Player Empire” nigdy dla kolonii obcej (oba języki, 4 poziomy)');
  const en = Object.fromEntries(rows.filter((r) => r.lang === 'en').map((r) => [r.lvl, r.owner]));
  ok(en.unknown === 'Owner: unknown' && en.rumor === 'Owner: foreign empire' && en.contact === `Owner: ${EMP_NAME}`,
    `T9c EN: ${JSON.stringify(en)}`);
  ok(getLocale() === 'pl', 'T9d KONTROLA: język przywrócony');
}

// ═══ T10 ═════════════════════════════════════════════════════════════════════
header('T10 ta sama reguła co panel STRATCOM (`resolveSystemReveal`, oś właściciela)');
{
  const out = [];
  for (const lvl of ['unknown', 'rumor', 'contact', 'detailed']) {
    setLevel(lvl);
    const rv = resolveSystemReveal({ empireId: EMP }, { intelAtLeast: (l) => intel.isAtLeast(EMP, l) });
    const ls = lines('p_ai', 'Akhernar h');
    const shows = { name: has(ls, EMP_NAME), foreign: ls.includes(t('fleet.stratcomEmpireForeign')), pop: popLine(ls) !== null };
    out.push(shows.name === rv.ownerIdentity && shows.foreign === (rv.ownerExists && !rv.ownerIdentity) && shows.pop === rv.population);
  }
  ok(out.every(Boolean), `T10a podpowiedź = rekord kanonu na każdym poziomie (${out.map((b) => (b ? '✓' : '✗')).join(' ')})`);
  ok(intel.isAtLeast(EMP, 'detailed') === true && intel.getLevel(EMP) === 'detailed', 'T10b KONTROLA: prawdziwy `IntelSystem` czyta poziom z `gameState`');
}

// ═══ T11 ═════════════════════════════════════════════════════════════════════
header('T11 montaż: `GameScene._tooltipDeps` podaje wywiad');
{
  const GS = src('../../scenes/GameScene.js');
  const i = GS.indexOf('  _tooltipDeps() {');
  const bodyTxt = i < 0 ? '' : GS.slice(i, GS.indexOf('\n  }\n', i));
  ok(bodyTxt.length > 0 && /colonyManager:\s*window\.KOSMOS\?\.colonyManager/.test(bodyTxt), 'T11-0 KONTROLA: metoda znaleziona (świadek — `colonyManager` w niej jest)');
  ok(/intelSystem:\s*window\.KOSMOS\?\.intelSystem/.test(bodyTxt), 'T11a SEDNO: `intelSystem: window.KOSMOS?.intelSystem` w `deps` podpowiedzi');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
