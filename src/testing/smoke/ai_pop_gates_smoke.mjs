// 215 — BRAMKI `freePops` NA SCIEZCE AI. Plan + decyzje D-215-1..3:
//   docs/design/AI_POP_GATES_PLAN.md.  STAN: COMMIT 1 z dwoch (predykaty).
//
// PO CO: `freePops = population − (employedPops − syntheticJobs) − lockedPops`, przy czym
//   `_employedPops` liczy ETATY zarejestrowane przez budynki, NIE pracownikow. `ColonyAutoExpander`
//   stawia u AI wiecej etatow niz jest POPow ⇒ `freePops` klamruje sie do 0 NA STALE. Population 2.0
//   Faza 2 (FIX A, `d95d9b8`) zdjela z tego powodu gate'y POP z budowy budynkow — ale SWEEP NIE
//   OBJAL SCIEZKI AI. Zostaly DWIE martwe bramki:
//     `EmpireStrategySystem` minFreePops 8      → pelna kolonia AI NIE POWSTAJE NIGDY
//     `EmpireLogisticsSystem` minFreePopsForCourier 0.05 → kurier NIE JEST NIGDY ZAMAWIANY
//   Placowka NIE jest bramkowana `freePops` — i dlatego placowki istnieja, a kolonie i kurierzy nie.
//
// ⚠ TO NIE SA TE SAME BRAMKI CO W FIX A — i dlatego naprawa jest ROZNA dla kazdej polowy:
//   • KOLONIA to bramka KOSZTU ZLE ZMIERZONA: `civ.removePop('laborer', popTransferSize)` NAPRAWDE
//     zabiera POPy, a prog 8 jest DOKLADNIE rowny `popTransferSize` — napisano „czy stac mnie na
//     osmiu", zmierzono wzgledem zlej puli. USUNIECIE puscilo by `removePop` wobec matki, ktora
//     osmiu robotnikow miec nie musi ⇒ populacja z niczego. Stad ZASTAPIENIE predykatu.
//   • KURIER to bramka kosztu, ale prawdziwy straznik stoi NIZEJ i jest MOCNIEJSZY: `deployVessel`
//     pobiera `crewCost` przez `commitCrew`, ktorego pojemnosc to `_unemployed` + hostable
//     ZATRUDNIENI — wiec placi nawet przy `freePops = 0`. Pre-check zadal 0.05 z puli zerowej
//     przed straznikiem, ktorego stac na 0.2. Stad USUNIECIE.
//
//   T1  KOLONIA: predykat mierzy TE SAMA pule, z ktorej `removePop` placi
//   T2  KOLONIA: rezerwa matki (D-215-1b = 4) — nie wolno zejsc do zera robotnikow
//   T3  KURIER: pre-check zniknal, a prawdziwy straznik (commitCrew) PLACI przy freePops = 0
//   T4  MARTWE KNOBY usuniete razem z czytelnikami (D-215-3)
//   T5  kill-switch `aiPopGates` — OBIE polowy wracaja pod JEDNA flaga (D-215-2)

import '../headless/env.js';           // MUSI byc pierwszy
import { CivilizationSystem } from '../../systems/CivilizationSystem.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf-8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ESS  = src('../../systems/EmpireStrategySystem.js');
const ELS  = src('../../systems/EmpireLogisticsSystem.js');

/** Kolonia-atrapa z ZADANYM skladem warstw — `freePops` wychodzi z modelu, nie z podstawienia. */
function mkColony({ laborer = 0, jobs = 0 } = {}) {
  const civ = new CivilizationSystem({}, null);
  civ.strata.laborer.count = laborer;
  civ._unemployed = 0;
  // `_employedPops` liczy ETATY — modelujemy je wprost, tak jak robi to ColonyAutoExpander.
  Object.defineProperty(civ, '_employedPops', { get: () => jobs, configurable: true });
  return civ;
}

// ── T1 — KOLONIA: predykat mierzy pule, z ktorej sie placi ──────────────────────────────────
console.log('T1 — KOLONIA: predykat pyta o `laborer`, czyli o pule, z ktorej `removePop` NAPRAWDE placi');
{
  // NIEJALOWOSC: kolonia ma robotnikow, a `freePops` mimo to = 0 (etatow wiecej niz POPow).
  const civ = mkColony({ laborer: 20, jobs: 999 });
  assert(civ.strata.laborer.count === 20 && (civ.freePops ?? 0) <= 0,
    `T1 NIEJALOWOSC: 20 robotnikow, a freePops = ${(civ.freePops ?? 0).toFixed(2)} — to jest ` +
    'dokladnie stan AI, w ktorym stary predykat klamal');

  assert(/laborer/.test(ESS) && /^.*popTransferSize.*\+.*MOTHER_RESERVE.*$/m.test(ESS),
    'T1: `_canAffordFullColony` odwoluje sie do `laborer` i do `popTransferSize + rezerwa`');
  assert(!/freePops\s*<\s*cfg\.minFreePops/.test(ESS),
    'T1 SEDNO: stary predykat `freePops < cfg.minFreePops` ZNIKNAL — mierzyl inna pule ' +
    'niz ta, z ktorej `removePop(\'laborer\', …)` pobiera');
  assert(/removePop\('laborer'/.test(ESS),
    'T1 KONTROLA PINU: `removePop(\'laborer\', …)` DALEJ jest w kodzie — czyli koszt istnieje ' +
    'i predykat ma czego pilnowac (gdyby zniknal, T1 pinowalby nieistniejacy wydatek)');
}

// ── T2 — KOLONIA: rezerwa matki ─────────────────────────────────────────────────────────────
console.log('T2 — KOLONIA: rezerwa matki (D-215-1b = 4) — kolonizacja nie schodzi do zera robotnikow');
{
  const m = ESS.match(/MOTHER_RESERVE\s*=\s*(\d+)/);
  assert(!!m, 'T2: rezerwa jest NAZWANA STALA, nie literalem we wzorze');
  assert(m && Number(m[1]) === 4,
    `T2: rezerwa = 4 (podpisane D-215-1b; zmierzone: matka 4/8 zamiast 0/3, koszt 3,8 roku zwloki). Jest: ${m?.[1]}`);
  assert(/^.*popTransferSize.*\+.*MOTHER_RESERVE.*$/m.test(ESS),
    'T2: prog to `popTransferSize + MOTHER_RESERVE`, a nie sam transfer — inaczej AI drenuje ' +
    'matke do zera robotnikow, a metryka guard zobaczylaby to dopiero po fakcie');
}

// ── T3 — KURIER: pre-check zniknal, prawdziwy straznik placi ────────────────────────────────
console.log('T3 — KURIER: pre-check usuniety, a `commitCrew` PLACI przy freePops = 0');
{
  assert(!/_enoughFreePops/.test(ELS),
    'T3 SEDNO: `_enoughFreePops` ZNIKNAL z `EmpireLogisticsSystem` — zadal 0.05 z puli ' +
    'strukturalnie zerowej, stojac przed straznikiem, ktorego stac na 0.2');

  // KONTROLA: prawdziwy straznik NAPRAWDE placi przy freePops = 0 (inaczej usuniecie byloby
  // przeniesieniem defektu nizej, a nie naprawa).
  const civ = mkColony({ laborer: 10, jobs: 999 });
  assert((civ.freePops ?? 0) <= 0,
    `T3 NIEJALOWOSC: freePops = ${(civ.freePops ?? 0).toFixed(2)} — mierzymy dokladnie ten stan`);
  const res = civ.commitCrew(0.2);
  assert(res?.ok === true && res.taken > 0,
    `T3 KONTROLA PINU: \`commitCrew(0.2)\` PRZECHODZI przy freePops = 0 (taken=${res?.taken}) — ` +
    'pojemnosc to `_unemployed` + hostable ZATRUDNIENI, wiec usuniecie pre-checku nie zostawia ' +
    'kuriera bez zadnego straznika');
}

// ── T4 — martwe knoby ───────────────────────────────────────────────────────────────────────
console.log('T4 — martwe knoby usuniete razem z czytelnikami (D-215-3)');
{
  assert(!/minFreePopsForCourier/.test(ELS),
    'T4: `minFreePopsForCourier` zniknal z konfiguracji — martwy knob to knob, ktory klamie');
  assert(!/minFreePops\s*:/.test(ESS),
    'T4: `minFreePops` zniknal z DEFAULTS `EmpireStrategySystem`');
  const arch = src('../../data/EmpireArchetypeIndustrialist.js');
  assert(!/minFreePops\s*:/.test(arch),
    'T4: i z archetypu Industrialist — inaczej zostalby knob bez czytelnika, ktory wyglada na dzialajacy');
  assert(/popTransferSize/.test(ESS),
    'T4 KONTROLA PINU: `popTransferSize` ZOSTAJE (to realny koszt, nie knob) — pin mierzy ' +
    'usuniecie MARTWYCH pol, a nie wyczyszczenie konfiguracji');
}

// ── T5 — kill-switch ────────────────────────────────────────────────────────────────────────
console.log('T5 — kill-switch `aiPopGates`: OBIE polowy pod JEDNA flaga (D-215-2)');
{
  assert(GAME_CONFIG.FEATURES?.aiPopGates === true,
    'T5: flaga istnieje i jest domyslnie ON');
  assert(/aiPopGates/.test(ESS) && /aiPopGates/.test(ELS),
    'T5 SEDNO: OBIE polowy czytaja TE SAMA flage — dwie flagi dalyby stan, ktorego nikt nie ' +
    'wypuscil: AI z koloniami bez logistyki albo kurierzy do kolonii, ktore nie powstaja');
}

console.log(`\n${fail === 0 ? 'OK' : 'FAIL'} — ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
