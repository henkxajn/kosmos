// AI STRIKES BACK (SB9, SB16) — TABELA STROJENIA: odczyt, zmiana, reset, zapis. Liczby: `src/data/StrikesBackData.js`.
//
// Odpowiada na trzy pytania: „ile wynosi teraz pokrętło X”, „ustaw X na wartość v” (z konsoli, w trakcie gry) i „co
// różni się od domyślnych”. Kod arca czyta wartości WYŁĄCZNIE przez `getTuning` / `readTuningValues` — W CHWILI UŻYCIA,
// nic nie jest buforowane przy starcie, więc zmiana z konsoli działa od następnego odczytu.
//
// ⚠ STAN: `gameState.strikesBackTuning` — mapa klucz → wartość, wyłącznie wartości ZMIENIONE (brak wpisu = domyślna).
//   Klucz najwyższego poziomu jest zadeklarowany w `GameState.createDefaultState` z pustą mapą, więc przeżywa zapis
//   i wczytanie bez migracji (save v101); zapis sprzed S1 nie ma klucza ⇒ wszystkie wartości domyślne.
// ⚠ MUTACJE wyłącznie przez `setTuning` / `resetTuning` (intencje właściciela stanu). Każda zmiana idzie jednym
//   `gameState.set` całej mapy — `gameState:changed` daje wpis audytu w `DebugLog` (rodzaj `state`).
// ⚠ ODMOWA niczego nie zmienia: walidacja PRZED zapisem; odmowa zwraca powód i listę kluczy albo zakres.
// ⚠ PO WCZYTANIU (`sanitizeTuningAfterRestore`, wołane z bloku wczytania `GameScene` zaraz po `gameState.restore`):
//   nieznany klucz albo wartość spoza typu/zakresu jest pomijana i zdejmowana z mapy, a każde takie pominięcie
//   zostawia wpis `sbTuning:storedValueIgnored` w `DebugLog.TRACKED_EVENTS`.
// ⚠ Napisy konsoli bez polskich znaków (konwencja odczytu `printGarrisonPlans`).

import gameState from '../core/GameState.js';
import EventBus from '../core/EventBus.js';
import { SB_TUNING } from '../data/StrikesBackData.js';
import { armedTemplateIds } from './FleetPoolPlanner.js';

/** Klucz najwyższego poziomu w `gameState` (deklaracja: `GameState.createDefaultState`). */
export const SB_TUNING_STATE_KEY = 'strikesBackTuning';

/** Klucze tabeli w kolejności deklaracji. */
export function tuningKeys() {
  return Object.keys(SB_TUNING);
}

const copyValue = (v) => (Array.isArray(v) ? [...v] : v);
const sameValue = (a, b) => (Array.isArray(a) || Array.isArray(b))
  ? (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]))
  : a === b;

/** Wartość domyślna klucza (kopia — wołający może ją zmieniać). `undefined` dla nieznanego klucza. */
export function tuningDefault(key) {
  const def = SB_TUNING[key];
  return def ? copyValue(def.default) : undefined;
}

/**
 * Walidacja wartości dla klucza. Nie zmienia niczego.
 * @returns {{ok:true, value:any} | {ok:false, key:string, reason:'unknown_key'|'wrong_type'|'out_of_range'|'unknown_template',
 *           validKeys?:string[], expected?:string, range?:[number,number], index?:number, template?:string,
 *           validTemplates?:string[]}}
 */
export function validateTuning(key, value) {
  const def = SB_TUNING[key];
  if (!def) return { ok: false, key, reason: 'unknown_key', validKeys: tuningKeys() };
  if (def.type === 'int') {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      return { ok: false, key, reason: 'wrong_type', expected: 'int', range: [def.min, def.max] };
    }
    if (value < def.min || value > def.max) return { ok: false, key, reason: 'out_of_range', range: [def.min, def.max] };
    return { ok: true, value };
  }
  if (def.type === 'numberList') {
    const expected = `lista ${def.length} liczb`;
    if (!Array.isArray(value) || value.length !== def.length) {
      return { ok: false, key, reason: 'wrong_type', expected, range: [def.min, def.max] };
    }
    for (let i = 0; i < value.length; i++) {
      const x = value[i];
      if (typeof x !== 'number' || !Number.isFinite(x)) return { ok: false, key, reason: 'wrong_type', expected, range: [def.min, def.max], index: i };
      if (x < def.min || x > def.max) return { ok: false, key, reason: 'out_of_range', range: [def.min, def.max], index: i };
    }
    return { ok: true, value: [...value] };
  }
  if (def.type === 'templateList') {
    // AI STRIKES BACK S1 (SB20) — wzorzec puli: wyłącznie ZNANE i UZBROJONE szablony (rozwiązane „wszystko zbadane”).
    const expected = `lista ${def.minLength}..${def.maxLength} szablonow`;
    if (!Array.isArray(value) || value.length < def.minLength || value.length > def.maxLength) {
      return { ok: false, key, reason: 'wrong_type', expected };
    }
    const valid = armedTemplateIds();
    for (let i = 0; i < value.length; i++) {
      const x = value[i];
      if (typeof x !== 'string') return { ok: false, key, reason: 'wrong_type', expected, index: i };
      if (!valid.includes(x)) return { ok: false, key, reason: 'unknown_template', index: i, template: x, validTemplates: valid };
    }
    return { ok: true, value: [...value] };
  }
  return { ok: false, key, reason: 'wrong_type', expected: String(def.type) };
}

/** Mapa wartości zmienionych (kopia płytka; brak stanu = pusta). */
function overrides() {
  const m = gameState.get(SB_TUNING_STATE_KEY);
  return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
}

/**
 * Bieżąca wartość pokrętła — ZMIENIONA, jeśli zapis ją niesie i przechodzi walidację, inaczej domyślna.
 * Czytane w chwili użycia (żadnego bufora). Nieznany klucz ⇒ `undefined`.
 */
export function getTuning(key) {
  const def = SB_TUNING[key];
  if (!def) return undefined;
  const ov = overrides();
  if (Object.prototype.hasOwnProperty.call(ov, key)) {
    const v = validateTuning(key, ov[key]);
    if (v.ok) return v.value;
  }
  return copyValue(def.default);
}

/** Wszystkie bieżące wartości: klucz → wartość (świeży odczyt). */
export function readTuningValues() {
  const out = {};
  for (const key of tuningKeys()) out[key] = getTuning(key);
  return out;
}

/**
 * Ustaw jedną wartość. Odmowa nie zmienia niczego.
 * @returns {{ok:true, key:string, value:any, previous:any, default:any} | ReturnType<validateTuning>}
 */
export function setTuning(key, value) {
  const v = validateTuning(key, value);
  if (!v.ok) return v;
  const previous = getTuning(key);
  const next = { ...overrides() };
  if (sameValue(v.value, tuningDefault(key))) delete next[key];   // wartość domyślna = brak wpisu (bez fałszywego znacznika)
  else next[key] = v.value;
  gameState.set(SB_TUNING_STATE_KEY, next, 'sb_tuning_set');
  return { ok: true, key, value: getTuning(key), previous, default: tuningDefault(key) };
}

/**
 * Reset jednego klucza do domyślnej (z kluczem) albo całej tabeli (bez argumentu).
 * @returns {{ok:true, reset:string[]} | {ok:false, key:string, reason:'unknown_key', validKeys:string[]}}
 */
export function resetTuning(key = undefined) {
  if (key === undefined) {
    const was = Object.keys(overrides());
    gameState.set(SB_TUNING_STATE_KEY, {}, 'sb_tuning_reset_all');
    return { ok: true, reset: was };
  }
  if (!SB_TUNING[key]) return { ok: false, key, reason: 'unknown_key', validKeys: tuningKeys() };
  const next = { ...overrides() };
  const had = Object.prototype.hasOwnProperty.call(next, key);
  delete next[key];
  gameState.set(SB_TUNING_STATE_KEY, next, 'sb_tuning_reset');
  return { ok: true, reset: had ? [key] : [] };
}

/** Wiersze odczytu: klucz, wartość domyślna, bieżąca, znacznik zmiany, jednostka. */
export function tuningRows() {
  return tuningKeys().map((key) => {
    const def = SB_TUNING[key];
    const cur = getTuning(key);
    const changed = !sameValue(cur, def.default);
    return { klucz: key, domyslna: copyValue(def.default), biezaca: cur, zmiana: changed ? '*' : '', jednostka: def.unit };
  });
}

/**
 * PO WCZYTANIU: zdejmij z mapy wpisy, których tabela nie zna albo nie przyjmuje (typ/zakres) — każdy z wpisem
 * `sbTuning:storedValueIgnored` w audycie. Brak klucza w zapisie (np. fixture sprzed S1) — nic do zrobienia.
 * @returns {{ignored: Array<{key:string, reason:string}>}}
 */
export function sanitizeTuningAfterRestore() {
  const raw = gameState.get(SB_TUNING_STATE_KEY);
  if (raw == null) return { ignored: [] };
  const ignored = [];
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    EventBus.emit('sbTuning:storedValueIgnored', { key: null, value: raw, reason: 'not_a_map' });
    gameState.set(SB_TUNING_STATE_KEY, {}, 'sb_tuning_sanitize');
    return { ignored: [{ key: null, reason: 'not_a_map' }] };
  }
  const kept = {};
  for (const [key, value] of Object.entries(raw)) {
    const v = validateTuning(key, value);
    if (v.ok) { kept[key] = v.value; continue; }
    const reason = v.reason === 'unknown_key' ? 'unknown_key' : 'invalid_value';
    ignored.push({ key, reason });
    EventBus.emit('sbTuning:storedValueIgnored', { key, value, reason, detail: v.reason });
  }
  if (ignored.length > 0) gameState.set(SB_TUNING_STATE_KEY, kept, 'sb_tuning_sanitize');
  return { ignored };
}

// ── Konsola (`KOSMOS.debug.sbTuning()` / `sbSet(klucz, wartość)` / `sbReset(klucz?)`) ───────────────────────────

const fmt = (v) => (Array.isArray(v) ? `[${v.join(', ')}]` : String(v));

/** Linia odmowy z listą kluczy albo zakresem. */
export function describeRefusal(r) {
  if (r.reason === 'unknown_key') return `[sb] odmowa: nieznany klucz "${r.key}". Klucze: ${r.validKeys.join(', ')}`;
  if (r.reason === 'wrong_type') {
    return `[sb] odmowa: ${r.key} wymaga typu ${r.expected}${r.range ? ` w zakresie ${r.range[0]}..${r.range[1]}` : ''}${r.index != null ? ` (pozycja ${r.index})` : ''}`;
  }
  if (r.reason === 'out_of_range') {
    return `[sb] odmowa: ${r.key} poza zakresem ${r.range[0]}..${r.range[1]}${r.index != null ? ` (pozycja ${r.index})` : ''}`;
  }
  if (r.reason === 'unknown_template') {
    return `[sb] odmowa: ${r.key} — "${r.template}" (pozycja ${r.index}) nie jest znanym uzbrojonym szablonem. Szablony: ${r.validTemplates.join(', ')}`;
  }
  return `[sb] odmowa: ${r.key} (${r.reason})`;
}

/** Tabela strojenia w konsoli; zwraca wiersze. */
export function printTuningTable() {
  const rows = tuningRows().map((r) => ({ ...r, domyslna: fmt(r.domyslna), biezaca: fmt(r.biezaca) }));
  console.table(rows);
  return rows;
}

/** `sbSet` — zmiana jednej wartości; wypisuje wynik, zwraca obiekt wyniku. */
export function consoleSetTuning(key, value) {
  const r = setTuning(key, value);
  if (r.ok) console.log(`[sb] ${key}: ${fmt(r.previous)} -> ${fmt(r.value)} (domyslna ${fmt(r.default)})`);
  else console.warn(describeRefusal(r));
  return r;
}

/** `sbReset` — reset jednego klucza albo całej tabeli; wypisuje wynik, zwraca obiekt wyniku. */
export function consoleResetTuning(key = undefined) {
  const r = resetTuning(key);
  if (r.ok) console.log(`[sb] reset ${key === undefined ? 'wszystkich kluczy' : key}: ${r.reset.length ? r.reset.join(', ') : 'nic nie bylo zmienione'}`);
  else console.warn(describeRefusal(r));
  return r;
}
