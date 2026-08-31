// W3 — keeper MONTAŻU Directora (commit W3-5b, WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: GATE 2 §8 zablokował się na awarii, której 145 zielonych keeperów NIE MOGŁO złapać.
// W3-5 dowiózł regułę `strike_player_target`, keeper udowodnił, że działa, sonda ją zmierzyła —
// a w przeglądarce `KOSMOS.directorOffensive` było `undefined`, bo w bloku lokatora
// (`GameScene`) zabrakło JEDNEGO wiersza. Reguła żyła (DirectorSystem importuje katalog wprost),
// ale system, przez który gate ją ogląda, nie istniał, więc każdy one-liner sekcji 8 wywracał
// się na `undefined`.
//
// ⚠ TO JEST TRZECI CZŁONEK TEJ SAMEJ RODZINY ŚLEPYCH PLAM, i dlatego ten keeper wygląda inaczej
//   niż pozostałe. Poprzednicy: `war_doctrine_smoke` spawnował garnizon JUŻ ZADOKOWANY (więc nie
//   wchodził w kanał rozkazów i przegapił `missing_target_point`); `w3_attack_dispatch_smoke`
//   stawiał okręt W TYM SAMYM układzie (więc przegapił cały defekt cross-system); a sonda
//   ofensywna MONTUJE SOBIE SYSTEM SAMA (więc nie mogła zauważyć, że gra go nie montuje).
//   Wspólny kształt: **test buduje scenę, której produkt nie buduje**. Lekarstwo jest jedno —
//   pinować nie ZACHOWANIE przy gotowej scenie, lecz SPOSÓB, W JAKI GRA SCENĘ SKŁADA.
//
// Dlatego poniżej czytamy ŹRÓDŁO PRAWDZIWEJ ŚCIEŻKI BOOTU (`GameScene.js`), a nie stawiamy
// atrapy. Test celowo NIE uruchamia `GameScene` (wymaga DOM, Three.js i pełnej sceny) — pinuje
// za to MANIFEST: co jest konstruowane, musi być wystawione, a każda nazwa z katalogu musi
// pochodzić z rejestratora, który boot naprawdę importuje.
//
//   T1  ⚠ MANIFEST LOKATORA: każdy `this.directorX = new …` w `GameScene` ma odpowiadający
//       `window.KOSMOS.directorX = …`. To jest DOKŁADNIE ten pin, który zapaliłby się na czerwono
//       przed GATE 2 §8. + KONTROLA PINU: mechanizm wykrywa brak, gdy go sztucznie usuniemy.
//   T2  KATALOG JEST SPÓJNY Z BOOTEM: nazwy wszystkich reguł (probe/guard/action) rozwiązują się
//       po uruchomieniu WYŁĄCZNIE tych rejestratorów, które `GameScene` importuje.
//   T3  `new DirectorSystem()` z PRAWDZIWYM katalogiem nie rzuca przy takim komplecie rejestracji
//       (konstruktor waliduje każdą nazwę — to jest test „gra wstanie", nie „reguła działa").
//   T4  reguła W3-5 jest w katalogu PRODUKCYJNYM, a nie tylko w teście.
//   T5  ⚠ CISZA REGUŁY MA PODPIS: gdy sonda triggera zwraca 0, `tickEmpire` wychodzi PRZED
//       zapisem stanu — więc brak wiersza i zero odmów to POPRAWNY obraz „nie ma celu",
//       nieodróżnialny gołym okiem od „nikt nie podłączył reguły". Pinujemy tę własność, żeby
//       następna sesja nie diagnozowała jej od zera (kosztowała ten gate).

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DIRECTOR_RULES } from '../../data/DirectorRuleData.js';
import { DirectorProbes, DirectorGuards, DirectorActions, _resetDirectorRegistries }
  from '../../systems/director/DirectorRegistry.js';
import { DirectorSystem } from '../../systems/director/DirectorSystem.js';
import { DirectorFirstContact, registerFirstContactBehaviors } from '../../systems/director/DirectorFirstContact.js';
import { DirectorPressure, registerPressureBehaviors } from '../../systems/director/DirectorPressure.js';
import { DirectorDoctrine, registerDoctrineBehaviors } from '../../systems/director/DirectorDoctrine.js';
import { DirectorMobilization, registerMobilizationBehaviors } from '../../systems/director/DirectorMobilization.js';
import { DirectorOffensive, registerOffensiveBehaviors } from '../../systems/director/DirectorOffensive.js';
import { DirectorProduction, registerProductionGuards } from '../../systems/director/DirectorProduction.js';
import { DirectorRecall, registerRecallBehaviors } from '../../systems/director/DirectorRecall.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const gameSceneSrc = stripComments(readFileSync(join(SRC, 'scenes', 'GameScene.js'), 'utf8'));

/** Pola `this.directorX`, którym boot przypisuje NOWĄ instancję. */
function constructedDirectors(src) {
  const out = new Set();
  const re = /this\.(director[A-Za-z0-9_]*)\s*=\s*new\s+/g;
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
}

/** Pola wystawione w lokatorze `window.KOSMOS`. */
function exposedDirectors(src) {
  const out = new Set();
  const re = /window\.KOSMOS\.(director[A-Za-z0-9_]*)\s*=/g;
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
}

// ── T1 — manifest lokatora ──────────────────────────────────────────────────
console.log('T1 — ⚠ MANIFEST: co skonstruowane w boocie, MUSI być wystawione w `window.KOSMOS`');
{
  const built = constructedDirectors(gameSceneSrc);
  const shown = exposedDirectors(gameSceneSrc);

  assert(built.size >= 5,
    `T1: manifest czyta prawdziwy boot — znaleziono ${built.size} systemów Directora ` +
    `(${[...built].join(', ')})`);

  const missing = [...built].filter(n => !shown.has(n));
  assert(missing.length === 0,
    `T1 SEDNO: KAŻDY skonstruowany system jest wystawiony w lokatorze. Brakujące: ` +
    `${missing.join(', ') || '—'}. To jest pin, który zapaliłby się przed GATE 2 §8: ` +
    '`directorOffensive` był konstruowany i rejestrowany, ale nie wystawiony, więc gra go ' +
    'miała, a gracz i gate — nie.');

  assert(shown.has('directorOffensive'),
    'T1: `directorOffensive` konkretnie JEST w lokatorze (to jego brak zablokował §8)');

  // ⚠ KONTROLA PINU — bez niej „zero brakujących" jest nieodróżnialne od zepsutego regeksu.
  const sabotaged = gameSceneSrc.replace(/window\.KOSMOS\.directorOffensive\s*=/, 'const _x =');
  const missingAfter = [...constructedDirectors(sabotaged)].filter(n => !exposedDirectors(sabotaged).has(n));
  assert(missingAfter.includes('directorOffensive'),
    `T1 KONTROLA PINU: po sztucznym usunięciu wiersza lokatora mechanizm ZGŁASZA brak ` +
    `(${missingAfter.join(', ')}) — czyli naprawdę mierzy, a nie zawsze przechodzi`);
}

// ── T2 — katalog spójny z rejestratorami, które boot importuje ──────────────
console.log('T2 — nazwy z katalogu rozwiązują się po rejestratorach, które boot IMPORTUJE');
{
  // Rejestrujemy DOKŁADNIE ten komplet, który `GameScene` sprowadza — nic więcej.
  _resetDirectorRegistries();
  registerFirstContactBehaviors(new DirectorFirstContact(), { allowOverride: true });
  registerPressureBehaviors(new DirectorPressure(), { allowOverride: true });
  registerDoctrineBehaviors(new DirectorDoctrine(), { allowOverride: true });
  registerMobilizationBehaviors(new DirectorMobilization(), { allowOverride: true });
  registerOffensiveBehaviors(new DirectorOffensive(), { allowOverride: true });
  registerRecallBehaviors(new DirectorRecall(), { allowOverride: true });
  registerProductionGuards(new DirectorProduction(), { allowOverride: true });

  const missing = [];
  for (const rule of Object.values(DIRECTOR_RULES)) {
    if (rule.trigger?.probe && !DirectorProbes.has(rule.trigger.probe)) missing.push(`probe:${rule.trigger.probe}`);
    for (const g of (rule.guard ?? [])) if (!DirectorGuards.has(g)) missing.push(`guard:${g}`);
    if (rule.response?.action && !DirectorActions.has(rule.response.action)) missing.push(`action:${rule.response.action}`);
  }
  assert(missing.length === 0,
    `T2: wszystkie nazwy katalogu mają rejestrację (brakujące: ${missing.join(', ') || '—'}) — ` +
    'czyli boot naprawdę potrafi ten katalog obsłużyć, a nie tylko test z własnym kompletem');

  // Każdy rejestrator z listy jest w boocie IMPORTOWANY — inaczej powyższe nic nie dowodzi.
  for (const reg of ['registerFirstContactBehaviors', 'registerPressureBehaviors',
                     'registerDoctrineBehaviors', 'registerMobilizationBehaviors',
                     'registerOffensiveBehaviors', 'registerRecallBehaviors',
                     'registerProductionGuards']) {
    assert(gameSceneSrc.includes(reg), `T2: boot importuje/woła \`${reg}\``);
  }
}

// ── T3 — silnik wstaje z prawdziwym katalogiem ──────────────────────────────
console.log('T3 — `new DirectorSystem()` z PRAWDZIWYM katalogiem nie rzuca');
{
  registerRecallBehaviors(new DirectorRecall(), { allowOverride: true });
  let threw = null;
  try { new DirectorSystem(); } catch (e) { threw = e; }
  assert(threw === null,
    `T3: silnik wstaje przy komplecie rejestracji z bootu (${threw?.message ?? 'ok'}) — ` +
    'to jest test „gra się uruchomi", a nie „reguła działa"');

  // KONTROLA PINU: bez rejestracji ofensywnej konstruktor MUSI rzucić (walidacja nazw).
  _resetDirectorRegistries();
  registerFirstContactBehaviors(new DirectorFirstContact(), { allowOverride: true });
  registerPressureBehaviors(new DirectorPressure(), { allowOverride: true });
  registerDoctrineBehaviors(new DirectorDoctrine(), { allowOverride: true });
  registerMobilizationBehaviors(new DirectorMobilization(), { allowOverride: true });
  registerProductionGuards(new DirectorProduction(), { allowOverride: true });
  let threw2 = null;
  try { new DirectorSystem(); } catch (e) { threw2 = e; }
  assert(threw2 !== null,
    'T3 KONTROLA PINU: BEZ rejestracji ofensywnej konstruktor RZUCA — więc T3 naprawdę ' +
    'sprawdza komplet, a nie przechodzi zawsze');
}

// ── T4 — reguła w katalogu produkcyjnym ─────────────────────────────────────
console.log('T4 — `strike_player_target` w katalogu PRODUKCYJNYM (a nie tylko w teście)');
{
  const rule = DIRECTOR_RULES.strike_player_target;
  assert(!!rule, 'T4: reguła jest w `DIRECTOR_RULES`');
  assert(gameSceneSrc.includes('DirectorOffensive'),
    'T4: boot IMPORTUJE i KONSTRUUJE `DirectorOffensive` — inaczej katalog by się nie zwalidował');
}

// ── T5 — cisza reguły ma podpis ─────────────────────────────────────────────
console.log('T5 — ⚠ „brak wiersza + zero odmów" to POPRAWNY obraz braku celu, nie awaria');
{
  const dsSrc = stripComments(readFileSync(join(SRC, 'systems', 'director', 'DirectorSystem.js'), 'utf8'));
  const tickAt = dsSrc.indexOf('tickEmpire');
  const body = dsSrc.slice(tickAt);
  const triggerAt = body.indexOf('trigger.gte');
  const writeAt   = body.indexOf('_writeRuleState');
  assert(triggerAt >= 0 && writeAt >= 0 && triggerAt < writeAt,
    `T5 SEDNO: sprawdzenie triggera (${triggerAt}) wypada PRZED pierwszym zapisem stanu reguły ` +
    `(${writeAt}) — więc reguła, której sonda zwróci 0, NIE zostawia wiersza w \`director.rules\` ` +
    'ani zdarzenia odmowy. Ten podpis kosztował GATE 2 §8 jedną sesję diagnozy: wyglądał ' +
    'identycznie jak „reguły nikt nie podłączył". Rozróżnia je `KOSMOS.debug.strikeReport`.');

  assert(gameSceneSrc.includes('strikeReport'),
    'T5: boot wystawia `KOSMOS.debug.strikeReport` — narzędzie, które tę różnicę pokazuje');
}

console.log(`\n═══ ${pass} PASS, ${fail} FAIL ═══`);
process.exit(fail === 0 ? 0 : 1);
