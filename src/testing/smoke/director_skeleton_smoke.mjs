// DIRECTOR SLICE 1 — keeper szkieletu (commit S1, workstream C).
//
// Chroni KONTRAKT, na którym staną S2-S6, i trzy własności, których złamanie byłoby
// ciche: brak migracji save'a, głośna awaria przy nieznanej nazwie, determinizm rzutu.
//
//   T1  matematyka rzutu kumulatywnego (10/20/…/100, nasycenie, wartość oczekiwana)
//   T2  determinizm rzutu — ten sam wynik po „przeładowaniu"; różne imperia ≠ ten sam los
//   T3  osobowość jako mnożnik jednej osi
//   T4  cooldown i okno eskalacji — GRANICE (klasyczne miejsce na błąd o jeden)
//   T5  walidator katalogu: kształt, jawna jednostka czasu, przykład referencyjny
//   T6  rejestry: GŁOŚNA awaria przy nieznanej nazwie i przy kolizji (audyt R12)
//   T7  gameState.director — round-trip BEZ migracji + fail-first na braku deklaracji
//   T8  DirectorSystem: pusty katalog, kill-switch, walidacja przy starcie

import '../headless/env.js';
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { DIRECTOR_RULES, EXAMPLE_RULE } from '../../data/DirectorRuleData.js';
import {
  rollChancePct, rollSurvivalCurve, expectedAttemptsToFire, rollFires, unitFromKey,
  personalityMultiplier, isOnCooldown, cooldownRemainingYears, isWithinEscalationWindow,
  validateRule, validateCatalog,
} from '../../utils/DirectorRuleMath.js';
import {
  DirectorProbes, DirectorGuards, DirectorActions, _resetDirectorRegistries,
} from '../../systems/director/DirectorRegistry.js';
import { DirectorFirstContact, registerFirstContactBehaviors } from '../../systems/director/DirectorFirstContact.js';
import { DirectorPressure, registerPressureBehaviors } from '../../systems/director/DirectorPressure.js';
import { DirectorDoctrine, registerDoctrineBehaviors } from '../../systems/director/DirectorDoctrine.js';
import { DirectorSystem } from '../../systems/director/DirectorSystem.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

// ── T1 — rzut kumulatywny ───────────────────────────────────────────────────
console.log('T1 — rzut kumulatywny 10/20/…/100');
{
  assert(rollChancePct(1) === 10, 'próba 1 → 10%');
  assert(rollChancePct(3) === 30, 'próba 3 → 30%');
  assert(rollChancePct(10) === 100, 'próba 10 → 100% (nasycenie)');
  assert(rollChancePct(25) === 100, 'próba 25 → wciąż 100% (clamp do capPct)');
  assert(rollChancePct(0) === 0 && rollChancePct(-3) === 0, 'próba < 1 → 0% (brak ujemnych szans)');

  const curve = rollSurvivalCurve();
  assert(curve[0] === 1, 'krzywa przeżycia startuje z 1');
  assert(curve[curve.length - 1] === 0, 'krzywa przeżycia dochodzi do 0 (odpalenie GWARANTOWANE)');
  // Pin liczbowy — chroni tempo pierwszego kontaktu przed cichą zmianą krzywej.
  const exp = expectedAttemptsToFire();
  assert(Math.abs(exp - 3.6602) < 0.001, `wartość oczekiwana ≈ 3,66 próby (jest ${exp.toFixed(4)})`);
}

// ── T2 — determinizm ────────────────────────────────────────────────────────
console.log('T2 — determinizm rzutu (przeładowanie zapisu NIE przewija losu)');
{
  const a = rollFires('first_contact', 'emp_001', 3);
  const b = rollFires('first_contact', 'emp_001', 3);
  assert(a === b, 'ten sam (reguła, imperium, próba) → ten sam wynik');

  const u = unitFromKey('dir:x:emp_001:1');
  assert(u >= 0 && u < 1, 'unitFromKey daje liczbę z [0,1)');
  assert(unitFromKey('dir:x:emp_001:1') === u, 'unitFromKey jest czyste');

  // Lekcja z 0b31... (D1): STRUKTURALNE, prawie kolejne seedy nie mogą dawać
  // skorelowanych wyników. Sprawdzamy rozrzut, nie pojedynczą wartość.
  const vals = [];
  for (let i = 1; i <= 200; i++) vals.push(unitFromKey(`dir:r:emp_001:${i}`));
  const mean = vals.reduce((x, y) => x + y, 0) / vals.length;
  assert(Math.abs(mean - 0.5) < 0.07, `średnia 200 kolejnych prób ≈ 0,5 (jest ${mean.toFixed(3)})`);
  const distinct = new Set(vals).size;
  assert(distinct === vals.length, 'brak kolizji na 200 kolejnych strukturalnych seedach');

  const empA = [], empB = [];
  for (let i = 1; i <= 40; i++) { empA.push(rollFires('r', 'emp_001', i)); empB.push(rollFires('r', 'emp_002', i)); }
  assert(empA.join() !== empB.join(), 'dwa imperia NIE dostają identycznego ciągu losów');
}

// ── T3 — osobowość ──────────────────────────────────────────────────────────
console.log('T3 — personalityMultiplier: jedna oś, liniowo');
{
  const mod = { axis: 'aggression', at0: 0.5, at1: 1.5 };
  assert(personalityMultiplier(0, mod) === 0.5, 'oś = 0 → at0');
  assert(personalityMultiplier(1, mod) === 1.5, 'oś = 1 → at1');
  assert(Math.abs(personalityMultiplier(0.5, mod) - 1.0) < 1e-9, 'oś = 0,5 → środek');
  assert(personalityMultiplier(undefined, mod) === 0.5, 'brak osi → traktowane jak 0 (nie NaN)');
  assert(personalityMultiplier(0.5, null) === 1, 'brak modyfikatora → mnożnik 1');
  assert(personalityMultiplier(5, mod) === 1.5, 'oś poza [0,1] clampowana');
}

// ── T4 — cooldown / eskalacja: GRANICE ──────────────────────────────────────
console.log('T4 — cooldown i okno eskalacji na granicy');
{
  assert(isOnCooldown(10, 14.9, 5) === true,  'rok 14,9 przy cooldownie 5 od roku 10 → JESZCZE na cooldownie');
  assert(isOnCooldown(10, 15, 5) === false,   'rok 15 → cooldown minął DOKŁADNIE (>=, nie >)');
  assert(isOnCooldown(null, 100, 5) === false, 'brak ostatniego odpalenia → nie ma cooldownu');
  assert(cooldownRemainingYears(10, 12, 5) === 3, 'pozostało 3 lata');
  assert(cooldownRemainingYears(10, 99, 5) === 0, 'po czasie → 0, nigdy ujemne');

  assert(isWithinEscalationWindow(10, 20, 10) === true,  'rok 20 przy oknie 10 od roku 10 → WEWNĄTRZ (granica)');
  assert(isWithinEscalationWindow(10, 20.1, 10) === false, 'rok 20,1 → poza oknem');
  assert(isWithinEscalationWindow(null, 15, 10) === false, 'brak odpalenia → brak eskalacji');
  assert(isWithinEscalationWindow(10, 12, 0) === false, 'okno 0 → eskalacja wyłączona');
}

// ── T5 — walidator katalogu ─────────────────────────────────────────────────
console.log('T5 — walidator: kształt reguły i JAWNA jednostka czasu');
{
  assert(validateRule(EXAMPLE_RULE, EXAMPLE_RULE.id).length === 0,
    'przykład referencyjny z katalogu PRZECHODZI walidator (kontrakt jest sprawdzalny wykonaniem)');
  assert(Object.keys(validateCatalog(DIRECTOR_RULES)).length === 0,
    'katalog produkcyjny w CAŁOŚCI przechodzi walidator');
  // S1 pinował tu „katalog jest pusty" — to była własność ZAKRESU S1 („kontrakt najpierw,
  // konsumenci potem"), a nie inwariant produktu. S5 świadomie dokłada pierwszą regułę,
  // więc pin zmienia się w mocniejszy: KAŻDY wpis katalogu musi być poprawny i mieć `id`
  // równe kluczowi (to jest ta własność, która realnie chroni przed literówką).
  for (const [key, rule] of Object.entries(DIRECTOR_RULES)) {
    assert(rule.id === key, `reguła "${key}" ma id równe kluczowi`);
    assert(validateRule(rule, key).length === 0, `reguła "${key}" przechodzi walidator`);
  }

  const bad = (patch) => validateRule({ ...EXAMPLE_RULE, ...patch }, EXAMPLE_RULE.id);
  assert(bad({ id: 'inne' }).some(p => p.includes('klucz')), 'id ≠ klucz → problem');
  assert(bad({ trigger: { kind: 'wat' } }).length > 0, 'nieznany trigger.kind → problem');
  assert(bad({ trigger: { kind: 'poll' } }).some(p => p.includes('probe')), 'poll bez probe → problem');
  assert(bad({ trigger: { kind: 'event' } }).some(p => p.includes('on')), 'event bez on → problem');
  assert(bad({ response: {} }).some(p => p.includes('response.action')), 'brak response.action → problem');
  assert(bad({ delay: -1 }).some(p => p.includes('delay')), 'ujemny delay → problem');
  assert(bad({ cooldown: { years: 0 } }).length > 0, 'cooldown bez once i bez dodatnich years → problem');
  assert(bad({ escalatesTo: 'x', escalationWindowYears: 0 }).length > 0, 'eskalacja bez okna → problem');
  // Bezpiecznik jednostki — to jest pin postawiony PO tym, jak przegląd D2/E6 znalazł
  // trzy komentarze kłamiące o własnej jednostce czasu.
  assert(bad({ roll: { startPct: 10, stepPct: 10, capPct: 100 } }).some(p => p.includes('displayedYear')),
    'roll BEZ jawnej jednostki `displayedYear` → problem (bezpiecznik jednostki czasu)');
  assert(bad({ roll: { ...EXAMPLE_RULE.roll, unit: 'civYear' } }).some(p => p.includes('displayedYear')),
    'roll w latach CYWILIZACYJNYCH → problem (decyzja 2: lata WYŚWIETLANE)');
}

// ── T6 — rejestry: GŁOŚNA awaria (audyt R12) ────────────────────────────────
console.log('T6 — rejestry rzucają zamiast po cichu degradować');
{
  _resetDirectorRegistries();
  assert(throws(() => DirectorActions.resolve('nie_ma_takiej')), 'nieznana AKCJA → rzuca (nie no-op)');
  assert(throws(() => DirectorGuards.resolve('nie_ma_takiego')), 'nieznany GUARD → rzuca');
  assert(throws(() => DirectorProbes.resolve('nie_ma_takiej')), 'nieznana SONDA → rzuca');

  DirectorGuards.register('zawsze', () => true);
  assert(DirectorGuards.resolve('zawsze')() === true, 'zarejestrowany guard rozwiązuje się');
  assert(throws(() => DirectorGuards.register('zawsze', () => false)), 'kolizja nazw → rzuca (nie „ostatni wygrywa")');
  assert(throws(() => DirectorActions.register('x', 'nie-funkcja')), 'nie-funkcja → rzuca');

  assert(DirectorActions.has('noop'), 'wbudowany `noop` istnieje (szkielet reguły bez skutków)');
  _resetDirectorRegistries();
}

// ── T7 — save v100 BEZ migracji ─────────────────────────────────────────────
console.log('T7 — gameState.director: round-trip bez migracji');
{
  gameState.reset();
  DirectorSystem.initSubdomain();
  gameState.set('director.rules.r|emp_001', { attempts: 3, lastFiredYear: 12, firedOnce: true }, 'test');
  gameState.set('director.pending.r|emp_002', { action: 'noop', params: {}, fireAtYear: 20 }, 'test');

  const dumped = JSON.parse(JSON.stringify(gameState.serialize()));
  gameState.reset();
  gameState.restore(dumped);
  assert(gameState.get('director.rules.r|emp_001')?.attempts === 3, 'liczniki reguł przeżywają round-trip');
  assert(gameState.get('director.pending.r|emp_002')?.fireAtYear === 20, 'odroczona odpowiedź przeżywa round-trip');

  // Stary zapis (v100 sprzed tego commita) NIE MA klucza `director`.
  const legacy = { ...dumped };
  delete legacy.director;
  gameState.reset();
  gameState.restore(legacy);
  const d = gameState.get('director');
  assert(!!d && typeof d === 'object', 'zapis BEZ klucza `director` wczytuje się (brak migracji)');
  assert(Object.keys(d.rules ?? {}).length === 0 && Object.keys(d.pending ?? {}).length === 0,
    'domyślne wartości są PUSTE — „brak w zapisie" nieodróżnialny od poprawnego defaultu');

  // ⚠ FAIL-FIRST na klasie błędu, która DZIŚ zjada `orbitalDominance`: domena spoza
  // createDefaultState jest przy wczytaniu po cichu WYRZUCANA. Ten test dowodzi
  // mechanizmu WYKONANIEM, żeby nikt nie skasował deklaracji `director` jako zbędnej.
  const withGhost = { ...dumped, nieZadeklarowanaDomena: { x: 1 } };
  gameState.reset();
  gameState.restore(withGhost);
  assert(gameState.get('nieZadeklarowanaDomena') == null,
    'FAIL-FIRST: domena NIEzadeklarowana w createDefaultState jest wyrzucana — dlatego `director` MUSI tam być');
  gameState.reset();
}

// ── T8 — DirectorSystem ─────────────────────────────────────────────────────
console.log('T8 — DirectorSystem: kill-switch, walidacja przy starcie, katalog produkcyjny');
{
  _resetDirectorRegistries();
  gameState.reset();

  // ⚠ Katalog produkcyjny NIE jest już pusty — S5 dołożył `first_contact`. Właściwości
  // SILNIKA testujemy więc na jawnie pustym katalogu, żeby test nie zależał od tego, co
  // akurat wiezie katalog; osobna asercja niżej pilnuje samego katalogu produkcyjnego.
  const sys = new DirectorSystem({ catalog: {} });
  assert(!!sys, 'konstruuje się na pustym katalogu');

  // Walidacja katalogu przy STARCIE, nie przy pierwszym odpaleniu reguły.
  assert(throws(() => new DirectorSystem({ catalog: { zly: { id: 'zly' } } })),
    'wadliwy katalog → rzuca PRZY STARCIE (nie po godzinie gry)');
  assert(throws(() => new DirectorSystem({
    catalog: { r: { ...EXAMPLE_RULE, id: 'r', response: { action: 'nie_ma' } } },
  })), 'reguła wskazująca nieistniejącą akcję → rzuca PRZY STARCIE');
  assert(throws(() => new DirectorSystem({
    catalog: { r: { ...EXAMPLE_RULE, id: 'r', response: { action: 'noop' }, escalatesTo: 'nie_ma', escalationWindowYears: 5 } },
  })), 'eskalacja do nieistniejącej reguły → rzuca PRZY STARCIE');

  // Kill-switch: OFF ⇒ tickEmpire wraca natychmiast, nie dotykając kolaboratorów
  // (gdyby ich szukał, rzuciłby — w tym teście nie ma window.KOSMOS.timeSystem).
  const orig = GAME_CONFIG.FEATURES.reactionDirector;
  GAME_CONFIG.FEATURES.reactionDirector = false;
  let threw = false;
  try { sys.tickEmpire('emp_001', {}); } catch { threw = true; }
  assert(!threw, 'kill-switch OFF → tickEmpire jest natychmiastowym no-opem');
  GAME_CONFIG.FEATURES.reactionDirector = orig;

  // Katalog PRODUKCYJNY: od S5 niesie regułę, więc konstrukcja WYMAGA wcześniejszej
  // rejestracji jej nazw. To nie jest niedogodność testu, tylko kontrakt (audyt R12):
  // reguła wskazująca niezarejestrowaną nazwę ma wywalić start, a nie zamienić się w teatr.
  assert(throws(() => new DirectorSystem()),
    'katalog produkcyjny BEZ zarejestrowanych zachowań → rzuca (kolejność: rejestracja przed silnikiem)');
  registerFirstContactBehaviors(new DirectorFirstContact(), { allowOverride: true });
  registerPressureBehaviors(new DirectorPressure(), { allowOverride: true });
    // W1-5 — katalog ma teraz reguły doktryn, a konstruktor DirectorSystem waliduje KAŻDĄ
  // nazwę i RZUCA na nieznanej (decyzja 7). Bez tej rejestracji keeper wywala się na starcie —
  // i to jest zachowanie ZAMIERZONE, nie kruchość testu.
  registerDoctrineBehaviors(new DirectorDoctrine(), { allowOverride: true });
  assert(!throws(() => new DirectorSystem()),
    '…a PO rejestracji katalog produkcyjny konstruuje się normalnie');

  // ...a przy ON brak kolaboratora ma być GŁOŚNY, nie cichy (audyt R12).
  const prevKosmos = globalThis.window.KOSMOS;
  globalThis.window.KOSMOS = {};
  assert(throws(() => sys._year()), 'brak window.KOSMOS.timeSystem → RZUCA (zero cichej degradacji)');
  globalThis.window.KOSMOS = prevKosmos;

  sys.dispose();
  assert(true, 'dispose() nie wywala się na czystym systemie');
}

// ── T9 — PEŁNY tor decyzyjny na regule syntetycznej ─────────────────────────
// Bez tego T1-T8 dowodzą części, a nie MECHANIZMU. Reguła przechodzi całą drogę:
// wyzwalacz → guard → rzut → opóźnienie → odpowiedź, w obu wariantach wyzwalacza.
console.log('T9 — pełny tor decyzyjny (trigger → guard → roll → delay → response)');
{
  _resetDirectorRegistries();
  gameState.reset();

  let now = 0;
  const empire = { id: 'emp_001', personality: { science: 1.0, aggression: 1.0 } };
  globalThis.window.KOSMOS = {
    timeSystem:     { get gameTime() { return now; } },
    empireRegistry: { get: (id) => (id === 'emp_001' ? empire : null) },
  };

  let obsLevel = 0;
  let guardOpen = true;
  const fired = [];
  DirectorProbes.register('obsLevel', () => obsLevel);
  DirectorGuards.register('otwarty', () => guardOpen);
  DirectorActions.register('zapisz', (ctx, params) => fired.push({ year: ctx.year, ...params }));

  const catalog = {
    natychmiast: {
      id: 'natychmiast', trigger: { kind: 'poll', probe: 'obsLevel', gte: 5 },
      guard: ['otwarty'], delay: 0,
      response: { action: 'zapisz', params: { tag: 'now' } }, cooldown: { once: true },
    },
    odroczona: {
      id: 'odroczona', trigger: { kind: 'event', on: 'test:fakt', where: { armed: true } },
      delay: 2.0, response: { action: 'zapisz', params: { tag: 'later' } }, cooldown: { years: 5 },
    },
  };
  const sys = new DirectorSystem({ catalog });

  // (a) wyzwalacz `poll` — próg NIE spełniony ⇒ cisza
  sys.tickEmpire('emp_001', empire);
  assert(fired.length === 0, '(a) próg wyzwalacza niespełniony → reguła milczy');

  // (b) próg spełniony, ale guard zamknięty ⇒ nadal cisza
  obsLevel = 5; guardOpen = false;
  sys.tickEmpire('emp_001', empire);
  assert(fired.length === 0, '(b) guard zamknięty → reguła milczy mimo spełnionego progu');

  // (c) guard otwarty ⇒ odpalenie natychmiastowe (reguła bez `roll`)
  guardOpen = true;
  sys.tickEmpire('emp_001', empire);
  assert(fired.length === 1 && fired[0].tag === 'now', '(c) trigger+guard spełnione → akcja WYKONANA');
  assert(gameState.get('director.rules.natychmiast|emp_001')?.firedOnce === true,
    '(c) stan reguły zapisany do gameState');

  // (d) `cooldown.once` naprawdę znaczy RAZ — także po wielu tickach
  for (let i = 0; i < 5; i++) sys.tickEmpire('emp_001', empire);
  assert(fired.length === 1, '(d) cooldown {once:true} → dokładnie jedno odpalenie na zawsze');

  // (e) ...i przeżywa round-trip zapisu (inaczej przeładowanie przewijałoby beat)
  const dump = JSON.parse(JSON.stringify(gameState.serialize()));
  gameState.restore(dump);
  sys.tickEmpire('emp_001', empire);
  assert(fired.length === 1, '(e) „raz na zawsze" przeżywa zapis/wczytanie');

  // (f) wyzwalacz `event` z filtrem `where` — niepasujący payload jest ignorowany
  EventBus.emit('test:fakt', { empireId: 'emp_001', armed: false });
  sys.tickEmpire('emp_001', empire);
  assert(fired.length === 1, '(f) zdarzenie niepasujące do `where` → brak reakcji');

  // (g) pasujący payload ⇒ odpowiedź ODROCZONA, nie natychmiastowa
  EventBus.emit('test:fakt', { empireId: 'emp_001', armed: true });
  sys.tickEmpire('emp_001', empire);
  assert(fired.length === 1, '(g) delay > 0 → akcja NIE wykonuje się od razu');
  assert(!!gameState.get('director.pending.odroczona|emp_001'), '(g) odpowiedź czeka w director.pending');

  // (h) czas płynie — odroczona odpowiedź wystrzeliwuje DOKŁADNIE po `delay`
  now = 1.5; sys.tickEmpire('emp_001', empire);
  assert(fired.length === 1, '(h) przed upływem delay → nadal cisza');
  now = 2.0; sys.tickEmpire('emp_001', empire);
  assert(fired.length === 2 && fired[1].tag === 'later', '(h) po upływie delay → akcja WYKONANA');
  assert(!gameState.get('director.pending.odroczona|emp_001'), '(h) wpis pending posprzątany po odpaleniu');

  // (i) izolacja imperiów — stan jednego nie blokuje drugiego
  obsLevel = 5;
  const empB = { id: 'emp_002', personality: { science: 1.0 } };
  sys.tickEmpire('emp_002', empB);
  assert(fired.length === 3, '(i) drugie imperium ma WŁASNY stan reguły (cooldown się nie przecieka)');

  sys.dispose();
  _resetDirectorRegistries();
  gameState.reset();
  globalThis.window.KOSMOS = {};
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
