// DirectorRuleMath — czysta matematyka reguł ReactionDirectora (workstream C, Slice 1, commit S1).
//
// ZERO zależności od `window`, Three, EventBus i `Math.random` — w pełni node-testowalny
// (wzór: `WarpRoutePlanner.js`, `OpinionMath.js`, `AcceptanceMath.js`). Cały stan siedzi
// w `DirectorSystem`, cały balans w `DirectorRuleData.js`; tutaj są WYŁĄCZNIE funkcje.
//
// ⚠ JEDNOSTKA CZASU: KAŻDY parametr i zwrot oznaczony `*Years` jest w latach
// WYŚWIETLANYCH (zegar gracza, `timeSystem.gameTime`) — NIGDY w latach cywilizacyjnych.
// To jest podpisana decyzja 2 planu i ta sama dyscyplina, którą wymusiło D2/E6 po tym,
// jak jego przegląd znalazł TRZY komentarze kłamiące o własnej jednostce.
// Tick Directora leci w latach cyw. (`AlienCivSystem._tickAll`, 1 krok = 1/12 roku
// wyświetlanego) — przeliczenie robi WOŁAJĄCY, nie ten moduł.

import { mixSeed, hashStringToInt } from './SeedMath.js';

/** Domyślne parametry rzutu kumulatywnego (master plan §C: 10%/20%/30%…→100%). */
export const DEFAULT_ROLL = Object.freeze({ startPct: 10, stepPct: 10, capPct: 100 });

/** Dozwolone rodzaje wyzwalacza. Nowy rodzaj = wpis TUTAJ + gałąź w DirectorSystem. */
export const TRIGGER_KINDS = Object.freeze(['poll', 'event']);

// ── Rzut kumulatywny ────────────────────────────────────────────────────────

/**
 * Szansa (w procentach) przy N-tej próbie rzutu kumulatywnego.
 * Próby liczone od 1: 1→10%, 2→20%, … clamp do `capPct`.
 *
 * @param {number} attempt — numer próby, 1-based
 * @param {{startPct?:number, stepPct?:number, capPct?:number}} [cfg]
 * @returns {number} 0..capPct
 */
export function rollChancePct(attempt, cfg = DEFAULT_ROLL) {
  const n = Math.floor(Number(attempt) || 0);
  if (n < 1) return 0;
  const start = Number(cfg?.startPct ?? DEFAULT_ROLL.startPct);
  const step  = Number(cfg?.stepPct  ?? DEFAULT_ROLL.stepPct);
  const cap   = Number(cfg?.capPct   ?? DEFAULT_ROLL.capPct);
  return Math.max(0, Math.min(cap, start + step * (n - 1)));
}

/**
 * Krzywa przeżycia rzutu kumulatywnego: `S[n]` = prawdopodobieństwo, że po n próbach
 * reguła NADAL nie odpaliła. Czysta arytmetyka — służy testom i planowaniu tempa
 * (wartość oczekiwana liczby prób = Σ S[n] dla n = 0..∞).
 *
 * @param {{startPct?:number, stepPct?:number, capPct?:number}} [cfg]
 * @param {number} [maxAttempts] — twardy bezpiecznik pętli
 * @returns {number[]} S[0]=1, S[1], S[2], … aż do pierwszego zera
 */
export function rollSurvivalCurve(cfg = DEFAULT_ROLL, maxAttempts = 1000) {
  const out = [1];
  let s = 1;
  for (let n = 1; n <= maxAttempts && s > 0; n++) {
    s *= 1 - rollChancePct(n, cfg) / 100;
    out.push(s);
    if (s <= 0) break;
  }
  return out;
}

/** Oczekiwana liczba prób do odpalenia (Σ krzywej przeżycia). */
export function expectedAttemptsToFire(cfg = DEFAULT_ROLL, maxAttempts = 1000) {
  return rollSurvivalCurve(cfg, maxAttempts).reduce((a, b) => a + b, 0);
}

// ── Deterministyczny rzut ───────────────────────────────────────────────────

/**
 * Liczba z [0,1) wyprowadzona deterministycznie z klucza tekstowego.
 *
 * ⚠ Bierzemy WYJŚCIE finalizera `mixSeed`, nigdy pierwszego rzutu generatora zasianego
 * surową liczbą — to jest lekcja z `0b15d95` (D1): seedy Directora są STRUKTURALNE
 * (`ruleId:empireId:attempt`), więc sąsiednie próby dają prawie kolejne hashe, a te
 * bez rozproszenia kolidują częściej niż losowo.
 *
 * Determinizm jest tu wymogiem, nie wygodą: rzut MUSI dać ten sam wynik po zapisie
 * i wczytaniu gry, inaczej gracz przeładowaniem przewija los.
 *
 * @param {string} key
 * @returns {number} [0,1)
 */
export function unitFromKey(key) {
  return mixSeed(hashStringToInt(key)) / 4294967296;
}

/** Klucz rzutu — jedno miejsce, żeby format nie rozjechał się między systemem a testem. */
export function rollKey(ruleId, empireId, attempt, salt = '') {
  return `dir:${ruleId}:${empireId}:${attempt}${salt ? ':' + salt : ''}`;
}

/**
 * Czy N-ta próba reguły odpala? Deterministycznie z (reguła, imperium, próba).
 *
 * @param {string} ruleId
 * @param {string} empireId
 * @param {number} attempt — 1-based
 * @param {{startPct?:number, stepPct?:number, capPct?:number}} [cfg]
 * @param {number} [chanceMult] — mnożnik z osobowości (patrz personalityMultiplier)
 * @returns {boolean}
 */
export function rollFires(ruleId, empireId, attempt, cfg = DEFAULT_ROLL, chanceMult = 1, salt = '') {
  const pct = rollChancePct(attempt, cfg) * (Number(chanceMult) || 0);
  if (pct <= 0) return false;
  if (pct >= 100) return true;
  // ⚠ `salt` (W3-5) — sól galaktyki dla reguł, które o nią proszą (`roll.saltGalaxySeed`).
  // Domyślnie PUSTA, więc klucze wszystkich dotychczasowych reguł są BIT W BIT te same:
  // dosypanie soli globalnie byłoby zmianą balansu (inne lata pierwszego kontaktu, nacisku,
  // mobilizacji) przemyconą w slice o czym innym.
  return unitFromKey(rollKey(ruleId, empireId, attempt, salt)) < pct / 100;
}

// ── Osobowość ───────────────────────────────────────────────────────────────

/**
 * Mnożnik z JEDNEJ osi osobowości, liniowo między `at0` (oś = 0) a `at1` (oś = 1).
 * Slice 1 świadomie NIE wprowadza tabel `archetyp × reguła` — jedna oś, jedna prosta.
 *
 * @param {number} axisValue — wartość osi z `empire.personality` (0..1)
 * @param {{at0?:number, at1?:number}} [mod]
 * @returns {number} mnożnik ≥ 0
 */
export function personalityMultiplier(axisValue, mod) {
  if (!mod) return 1;
  const a0 = Number(mod.at0 ?? 1);
  const a1 = Number(mod.at1 ?? 1);
  const t  = Math.max(0, Math.min(1, Number(axisValue) || 0));
  return Math.max(0, a0 + (a1 - a0) * t);
}

// ── Cooldown / okno eskalacji ───────────────────────────────────────────────
// ⚠ Wszystkie porównania są `>=` po stronie „minęło" — reguła z cooldownem 5 lat
// jest znów gotowa DOKŁADNIE w roku `last + 5`, nie rok później. Granica jest pinowana
// testem, bo to klasyczne miejsce na cichy błąd o jeden.

/** Ile lat WYŚWIETLANYCH zostało cooldownu (0 = gotowe). */
export function cooldownRemainingYears(lastFiredYear, nowYear, cooldownYears) {
  if (lastFiredYear == null) return 0;
  const left = (Number(lastFiredYear) + (Number(cooldownYears) || 0)) - Number(nowYear);
  return left > 0 ? left : 0;
}

/** Czy reguła jest jeszcze na cooldownie? */
export function isOnCooldown(lastFiredYear, nowYear, cooldownYears) {
  return cooldownRemainingYears(lastFiredYear, nowYear, cooldownYears) > 0;
}

/** Czy `nowYear` mieści się w oknie eskalacji od ostatniego odpalenia? */
export function isWithinEscalationWindow(lastFiredYear, nowYear, windowYears) {
  if (lastFiredYear == null) return false;
  const w = Number(windowYears) || 0;
  if (w <= 0) return false;
  return (Number(nowYear) - Number(lastFiredYear)) <= w;
}

// ── Walidacja katalogu ──────────────────────────────────────────────────────

/**
 * Waliduje wpis katalogu reguł. Zwraca listę PROBLEMÓW (pusta = wpis poprawny).
 *
 * ⚠ To jest kontrakt dla S5/S6 i dla przyszłych slice'ów: nowa reguła musi tędy przejść.
 * Walidator jest CZYSTY i celowo nie zna rejestrów akcji/guardów (te żyją w systemie) —
 * sprawdza KSZTAŁT. Osiągalność nazw sprawdza `DirectorSystem` przy rejestracji, głośno.
 *
 * @param {object} rule
 * @param {string} [key] — klucz w mapie katalogu (musi równać się `rule.id`)
 * @returns {string[]}
 */
export function validateRule(rule, key = null) {
  const problems = [];
  if (!rule || typeof rule !== 'object') return ['reguła nie jest obiektem'];

  if (!rule.id || typeof rule.id !== 'string') problems.push('brak `id` (string)');
  if (key != null && rule.id !== key) problems.push(`\`id\` (${rule.id}) ≠ klucz w katalogu (${key})`);

  const trig = rule.trigger;
  if (!trig || typeof trig !== 'object') problems.push('brak `trigger`');
  else if (!TRIGGER_KINDS.includes(trig.kind)) problems.push(`\`trigger.kind\` musi być jednym z ${TRIGGER_KINDS.join('|')}`);
  else if (trig.kind === 'poll'  && !trig.probe) problems.push('trigger `poll` wymaga `probe`');
  else if (trig.kind === 'event' && !trig.on)    problems.push('trigger `event` wymaga `on`');

  if (rule.guard != null && !Array.isArray(rule.guard)) problems.push('`guard` musi być tablicą nazw');

  if (!rule.response || typeof rule.response !== 'object' || !rule.response.action) {
    problems.push('brak `response.action`');
  }

  if (rule.delay != null && (!Number.isFinite(Number(rule.delay)) || Number(rule.delay) < 0)) {
    problems.push('`delay` musi być liczbą ≥ 0 (lata WYŚWIETLANE)');
  }

  if (rule.roll != null) {
    const r = rule.roll;
    if (typeof r !== 'object') problems.push('`roll` musi być obiektem');
    else {
      if (!(Number(r.startPct) > 0))  problems.push('`roll.startPct` musi być > 0');
      if (!(Number(r.stepPct) >= 0))  problems.push('`roll.stepPct` musi być ≥ 0');
      if (!(Number(r.capPct) > 0))    problems.push('`roll.capPct` musi być > 0');
      // Jednostka MUSI być jawna — to jest bezpiecznik na dokładnie ten błąd,
      // za który D2/E6 płaciło przeglądem wszystkich stałych czasowych fazy.
      if (r.unit !== 'displayedYear') problems.push("`roll.unit` musi być dosłownie 'displayedYear'");
    }
  }

  const cd = rule.cooldown;
  if (cd != null) {
    if (typeof cd !== 'object') problems.push('`cooldown` musi być obiektem');
    else if (cd.once !== true && !(Number(cd.years) > 0)) {
      problems.push('`cooldown` wymaga `once:true` albo `years` > 0 (lata WYŚWIETLANE)');
    }
  }

  if (rule.personalityMod != null) {
    const pm = rule.personalityMod;
    if (typeof pm !== 'object' || !pm.axis) problems.push('`personalityMod` wymaga `axis`');
  }

  if (rule.escalatesTo != null && !(Number(rule.escalationWindowYears) > 0)) {
    problems.push('`escalatesTo` wymaga `escalationWindowYears` > 0 (lata WYŚWIETLANE)');
  }

  return problems;
}

/** Waliduje CAŁY katalog. Zwraca `{ ruleId: problems[] }` tylko dla wpisów wadliwych. */
export function validateCatalog(catalog) {
  const out = {};
  for (const [key, rule] of Object.entries(catalog ?? {})) {
    const p = validateRule(rule, key);
    if (p.length) out[key] = p;
  }
  return out;
}
