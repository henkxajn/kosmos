// OpinionMath — czysta matematyka relacji dyplomatycznych (WOJNA I POKÓJ 1.0, D1).
//
// ZERO stanu, ZERO efektów ubocznych, ZERO gameState/EventBus/DOM — moduł da się
// odpalić w gołym Node (smoke: src/testing/smoke/diplomacy_opinion_smoke.mjs).
// Wzór: src/utils/StationGroup.js — czyste funkcje + lookupy wstrzykiwane argumentem.
//
// Podział odpowiedzialności całej fazy:
//   OpinionModifierData.js  → dane (wartości, tempo zanikania, etykiety)
//   OpinionMath.js          → matematyka (TEN plik)
//   RelationsModel.js       → stan (jedyny pisarz gameState.diplomacy.relations)
//   DiplomacySystem.js      → polityka + eventy (drabina eskalacji, wojna, traktaty)
//
// Katalog modyfikatorów jest WSTRZYKIWANY tam, gdzie jest potrzebny (buildBreakdown,
// rampModifiers) — testy podają własny. Importujemy z danych wyłącznie stałe skali,
// żeby te same liczby nie żyły w dwóch miejscach.

import { OPINION_MIN, OPINION_MAX, MODIFIER_EPSILON, COMBINE } from '../data/OpinionModifierData.js';

// Separator klucza pary. Podwójny myślnik podkreślnikowy, bo id imperiów same
// zawierają pojedyncze podkreślenia ('emp_001') — pojedynczy byłby niejednoznaczny.
const PAIR_SEP = '__';

// Progi drabiny eskalacji napięcia (dawne progi hostility — port 1:1).
export const TENSION_THRESHOLDS = { warning: 40, ultimatum: 60, war: 80 };

// ── Klucze par ──────────────────────────────────────────────────────────────

/**
 * Waliduje identyfikator strony relacji ('player' albo id imperium).
 * Rzuca — świadomie głośno (audyt R12): przeoczony rewire ma wywalić dev-build,
 * nie po cichu zwrócić wartość domyślną.
 *
 * Łapie w szczególności KLUCZ podany zamiast id ('player_emp_001', 'a__b') —
 * dokładną sygnaturę kodu, który został przy starym formacie.
 */
export function assertRelationId(id) {
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`[OpinionMath] Niepoprawne id relacji: ${JSON.stringify(id)}`);
  }
  if (id.startsWith('player_')) {
    throw new Error(`[OpinionMath] Podano STARY klucz relacji zamiast id: '${id}' (oczekiwano 'player' lub 'emp_XXX')`);
  }
  if (id.includes(PAIR_SEP)) {
    throw new Error(`[OpinionMath] Podano klucz pary zamiast id: '${id}'`);
  }
  return id;
}

/** Kanoniczny klucz pary — id posortowane leksykalnie, gracz jako dosłowne 'player'. */
export function pairKey(idA, idB) {
  assertRelationId(idA);
  assertRelationId(idB);
  if (idA === idB) throw new Error(`[OpinionMath] Relacja sama ze sobą: '${idA}'`);
  const [lo, hi] = idA < idB ? [idA, idB] : [idB, idA];
  return `${lo}${PAIR_SEP}${hi}`;
}

export function isPairKey(key)   { return typeof key === 'string' && key.includes(PAIR_SEP); }
export function isLegacyKey(key) { return typeof key === 'string' && key.startsWith('player_') && !key.includes(PAIR_SEP); }

/** Po której stronie rekordu siedzi dane id: 'a' | 'b' | null. */
export function sideOf(rel, id) {
  if (!rel) return null;
  if (rel.a === id) return 'a';
  if (rel.b === id) return 'b';
  return null;
}

/** Druga strona pary (albo null gdy id nie należy do relacji). */
export function otherId(rel, id) {
  const side = sideOf(rel, id);
  if (side === 'a') return rel.b;
  if (side === 'b') return rel.a;
  return null;
}

// ── Opinia ──────────────────────────────────────────────────────────────────

function clampOpinion(v) {
  return Math.max(OPINION_MIN, Math.min(OPINION_MAX, v));
}

/**
 * Opinia strony `ofId` o drugiej stronie = Σ modyfikatorów, których WŁAŚCICIELEM
 * jest ta strona. Modyfikatory są kierunkowe: getOpinion(a→b) ≠ getOpinion(b→a).
 * Brak relacji / obce id → 0 (neutralnie). Nic nie zapisuje.
 */
export function opinionOf(rel, ofId) {
  const side = sideOf(rel, ofId);
  if (!side) return 0;
  let sum = 0;
  for (const m of (rel.opinionModifiers ?? [])) {
    if (m?.owner === side) sum += (Number(m.value) || 0);
  }
  return clampOpinion(sum);
}

/**
 * Ile lat WYŚWIETLANYCH zostało modyfikatorowi do zaniknięcia (Infinity = nie zanika).
 *
 * ⚠ D2/E6 — TU MIESZKAŁA JEDYNA REALNA WADA ETYKIETY „(zanika za N l.)". Liczba była
 * poprawna, ale w latach CYWILIZACYJNYCH, więc panel obiecywał 5 lat czegoś, co gracz
 * przeżywał w 5 miesiącach swojego zegara. Po unifikacji `decayPerYear` jest „na rok
 * wyświetlany", więc ta sama arytmetyka zwraca lata, w których gracz myśli.
 * Zaokrąglenie W GÓRĘ zostaje: `ceil` zawyża o obcięcie epsilonem (envoy pokazuje 5,
 * faktycznie gaśnie po 4,58) — tak samo jak przed E6 (pokazywał 3 przy 2,5).
 */
export function modifierYearsLeft(m) {
  if (!m) return 0;
  const rate = Number(m.decayPerYear) || 0;
  if (m.persistent || rate <= 0) return Infinity;
  return Math.ceil(Math.abs(Number(m.value) || 0) / rate);
}

/**
 * Rozbicie opinii do UI: [{ id, labelKey, value, yearsLeft, persistent }],
 * posortowane malejąco po |value| (remis → po id, żeby kolejność była stabilna).
 * Nieznane id degraduje się do surowego id — brak etykiety nie może wywalić panelu.
 * @param {Object} catalog — wstrzyknięty OPINION_MODIFIERS (albo atrapa w teście)
 */
export function buildBreakdown(rel, ofId, catalog = {}) {
  const side = sideOf(rel, ofId);
  if (!side) return [];
  return (rel.opinionModifiers ?? [])
    .filter(m => m?.owner === side)
    .map(m => ({
      id:         m.id,
      labelKey:   catalog[m.id]?.labelKey ?? m.id,
      value:      Number(m.value) || 0,
      yearsLeft:  modifierYearsLeft(m),
      persistent: !!m.persistent,
    }))
    .sort((x, y) => (Math.abs(y.value) - Math.abs(x.value)) || String(x.id).localeCompare(String(y.id)));
}

// ── Mutacje listy modyfikatorów (czyste: zwracają NOWĄ tablicę) ─────────────

/**
 * Dodaje/odświeża modyfikator. Klucz unikalności: (id, owner) — w OBU trybach
 * powstaje najwyżej JEDEN wpis, więc tablica w save nie rośnie z liczbą zdarzeń.
 *   REFRESH    → value podmienione
 *   ACCUMULATE → value zsumowane (parytet ze starym changeTrust)
 * W obu przypadkach rok jest resetowany (licznik zanikania startuje od nowa).
 *
 * Wartość pojedynczego wpisu clampowana do ±OPINION_MAX — jedna przyczyna nie może
 * przerosnąć całej skali i „zamrozić" opinii poza zasięgiem innych modyfikatorów.
 *
 * @returns {Array} NOWA tablica (wejściowa nietknięta).
 */
export function upsertModifier(mods, entry, combine = COMBINE.REFRESH) {
  const list = Array.isArray(mods) ? mods : [];
  const idx  = list.findIndex(m => m?.id === entry.id && m?.owner === entry.owner);
  const next = list.slice();
  if (idx < 0) {
    next.push({ ...entry, value: clampOpinion(Number(entry.value) || 0) });
    return next;
  }
  const prevValue = Number(list[idx].value) || 0;
  const addValue  = Number(entry.value) || 0;
  const value     = combine === COMBINE.ACCUMULATE
    ? clampOpinion(prevValue + addValue)
    : clampOpinion(addValue);
  next[idx] = { ...list[idx], ...entry, value };
  return next;
}

/** Usuwa modyfikator (id, owner). Zwraca TĘ SAMĄ tablicę gdy nie było czego usuwać. */
export function removeModifier(mods, id, owner) {
  const list = Array.isArray(mods) ? mods : [];
  const next = list.filter(m => !(m?.id === id && m?.owner === owner));
  return next.length === list.length ? list : next;
}

/**
 * Starzenie: wartości nietrwałych modyfikatorów pełzną KU ZERU o decayPerYear × dy,
 * a wpisy poniżej epsilon znikają. Trwałe (persistent) i decayPerYear ≤ 0 nietknięte.
 *
 * @param {number} dy — upływ czasu w latach WYŚWIETLANYCH (D2/E6; przed E6 były to lata
 *   cywilizacyjne). Funkcja jest jednostkowo-agnostyczna: liczy `rate × dy`, a jednostkę
 *   ustala wołający — dlatego jedyna konwersja siedzi w ticku `DiplomacySystem`.
 *
 * Zwraca TĘ SAMĄ referencję gdy nic się nie zmieniło — dzięki temu warstwa stanu
 * testuje zmianę przez `!==` i nie zapisuje do gameState co tik dla każdej pary.
 */
export function decayModifiers(mods, dy) {
  const list = Array.isArray(mods) ? mods : [];
  if (!(dy > 0) || list.length === 0) return list;
  const out = [];
  let changed = false;
  for (const m of list) {
    const rate = Number(m?.decayPerYear) || 0;
    if (!m || m.persistent || rate <= 0) { out.push(m); continue; }
    const value = Number(m.value) || 0;
    const step  = rate * dy;
    const next  = value > 0 ? Math.max(0, value - step) : Math.min(0, value + step);
    if (Math.abs(next) < MODIFIER_EPSILON) { changed = true; continue; }   // wygasł
    if (next !== value) changed = true;
    out.push(next === value ? m : { ...m, value: next });
  }
  return changed ? out : list;
}

/**
 * Narastanie (obecnie: trade_partner). Wartość pełznie KU rampMax o rampPerYear × dy,
 * bez przestrzelenia. Modyfikatory bez rampPerYear w katalogu nietknięte.
 * `dy` w latach WYŚWIETLANYCH (D2/E6) — jak w decayModifiers.
 * Tak samo jak decayModifiers: ta sama referencja gdy bez zmian.
 *
 * ⚠ Ramp NIE jest bramkowany flagą decayu — zastępuje istniejące
 * `_tickTreaties` (+1 trust/rok cyw.), czyli zachowanie, które D1 ma zachować.
 *
 * @param {Object} catalog — wstrzyknięty OPINION_MODIFIERS (albo atrapa w teście)
 */
export function rampModifiers(mods, dy, catalog = {}) {
  const list = Array.isArray(mods) ? mods : [];
  if (!(dy > 0) || list.length === 0) return list;
  const out = [];
  let changed = false;
  for (const m of list) {
    const def  = catalog[m?.id];
    const rate = Number(def?.rampPerYear) || 0;
    if (!m || rate === 0) { out.push(m); continue; }
    const target = Number(def.rampMax ?? 0);
    const value  = Number(m.value) || 0;
    const step   = Math.abs(rate) * dy;
    const next   = target > value ? Math.min(target, value + step) : Math.max(target, value - step);
    if (next === value) { out.push(m); continue; }
    changed = true;
    out.push({ ...m, value: clampOpinion(next) });
  }
  return changed ? out : list;
}

// ── Napięcie / rozejm ───────────────────────────────────────────────────────

/** Napięcie po decayu (nigdy poniżej 0). `dy`/`ratePerYear` w latach WYŚWIETLANYCH (E6). */
export function tensionAfterDecay(tension, dy, ratePerYear) {
  const t = Number(tension) || 0;
  if (!(dy > 0)) return t;
  return Math.max(0, t - (Number(ratePerYear) || 0) * dy);
}

/** Czy wartość przekroczyła próg W GÓRĘ (drabina eskalacji reaguje tylko na wzrost). */
export function crossedUp(oldV, newV, threshold) {
  return (Number(oldV) || 0) < threshold && (Number(newV) || 0) >= threshold;
}

/** Czy rozejm wygasł. null = brak licznika (stan nieograniczony w czasie). */
export function truceExpired(truceUntilYear, year) {
  if (truceUntilYear == null) return false;
  return (Number(year) || 0) >= Number(truceUntilYear);
}
