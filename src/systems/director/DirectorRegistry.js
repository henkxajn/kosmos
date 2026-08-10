// DirectorRegistry — rejestry nazwanych sond, guardów i akcji (workstream C, Slice 1, commit S1).
//
// Reguły w `DirectorRuleData.js` to DANE i odwołują się do zachowań przez NAZWY.
// Ten plik trzyma odwzorowanie nazwa → funkcja. Trzy rozłączne rejestry:
//
//   PROBES  — odczyt świata dla wyzwalaczy `kind:'poll'`.  (ctx) → dowolna wartość
//   GUARDS  — predykaty warunkujące odpalenie.             (ctx) → boolean
//   ACTIONS — skutki (spawn, zamówienie okrętów, beat).     (ctx, params) → void|Promise
//
// ⚠ REGUŁA ARCHITEKTONICZNA (audyt R12 — „silent-degradation"): rozwiązanie NIEZNANEJ
// nazwy RZUCA. Nie zwraca `undefined`, nie loguje ostrzeżenia, nie degraduje do no-op.
// Cały workstream C powstaje dlatego, że `EconAI`/`MilitaryAI` przez wiele wersji
// „działały" jako ciche zera — Director nie ma prawa powtórzyć tego wzorca. Literówka
// w katalogu reguł MUSI wywalić dev-build, a nie zamienić regułę w teatr.
//
// S1 rejestruje WYŁĄCZNIE `noop` (akcja) — reszta dochodzi z konsumentami:
// S2 sondy mapy wpływów, S4 `queueWarships`, S5 `scienceFlyby`, S6 guardy nacisku.

/** @typedef {{ empireId: string, empire: object, year: number, ruleId: string }} DirectorCtx */

const _probes  = new Map();
const _guards  = new Map();
const _actions = new Map();

const _defOf = (kind) => (kind === 'probe' ? _probes : kind === 'guard' ? _guards : _actions);

function _register(kind, name, fn, { allowOverride = false } = {}) {
  if (typeof name !== 'string' || !name) {
    throw new Error(`[DirectorRegistry] nazwa ${kind} musi być niepustym stringiem (dostałem: ${String(name)})`);
  }
  if (typeof fn !== 'function') {
    throw new Error(`[DirectorRegistry] ${kind} "${name}" musi być funkcją (dostałem: ${typeof fn})`);
  }
  const map = _defOf(kind);
  if (map.has(name) && !allowOverride) {
    // Kolizja nazw to zawsze błąd projektu (dwa slice'y nazwały coś tak samo),
    // a nie sytuacja do pogodzenia w locie — ostatni-wygrywa ukryłby jedną z reguł.
    throw new Error(`[DirectorRegistry] ${kind} "${name}" jest już zarejestrowany — kolizja nazw`);
  }
  map.set(name, fn);
}

function _resolve(kind, name) {
  const fn = _defOf(kind).get(name);
  if (!fn) {
    const known = [..._defOf(kind).keys()].sort().join(', ') || '(pusto)';
    throw new Error(`[DirectorRegistry] nieznany ${kind}: "${name}". Zarejestrowane: ${known}`);
  }
  return fn;
}

export const DirectorProbes = {
  register: (name, fn, opts) => _register('probe', name, fn, opts),
  resolve:  (name) => _resolve('probe', name),
  has:      (name) => _probes.has(name),
  names:    () => [..._probes.keys()].sort(),
};

export const DirectorGuards = {
  register: (name, fn, opts) => _register('guard', name, fn, opts),
  resolve:  (name) => _resolve('guard', name),
  has:      (name) => _guards.has(name),
  names:    () => [..._guards.keys()].sort(),
};

export const DirectorActions = {
  register: (name, fn, opts) => _register('action', name, fn, opts),
  resolve:  (name) => _resolve('action', name),
  has:      (name) => _actions.has(name),
  names:    () => [..._actions.keys()].sort(),
};

/** Czyści WSZYSTKIE rejestry. Wyłącznie dla testów (izolacja między suitami). */
export function _resetDirectorRegistries() {
  _probes.clear();
  _guards.clear();
  _actions.clear();
  _registerBuiltins();
}

function _registerBuiltins() {
  // Jedyny wbudowany: jawnie pusta akcja. Pozwala napisać regułę-szkielet i przećwiczyć
  // cały tor decyzyjny (wyzwalacz → guard → rzut → opóźnienie → odpowiedź) BEZ skutków
  // w świecie. Świadomie NIE jest to „fallback dla nieznanej akcji" — nieznana rzuca.
  _actions.set('noop', () => {});
}

_registerBuiltins();
