// ShipAnchorsSchema — schemat v1 plików kotwic modułów modelu statku (ARC KONSOLE, krok K1b; CONSOLES_PLAN.md §2 B3,
// D-K-8 ≤ 6 kotwic ról na model, D-K-9 osobny folder — ścisły schemat hardpointów NIETKNIĘTY).
//
// Plik: `assets/models/ships/anchors/<slot>.json` = { v: 1, slot: '<klucz modelu>', anchors: [{ role, p: [x, y, z] }, …] }.
// Jeden plik na KLUCZ slotu (Finding 728: medium_cargo i large_cargo dzielą jeden GLB — kotwice i tak per klucz).
//
// PRZESTRZEŃ — ta sama co hardpointy (`ShipHardpointsSchema.js`): środek bbox modelu w (0, 0, 0), najdłuższy wymiar bbox = 1,0,
// dziób zwykle −X, góra +Y (rama z pliku hardpointów). Plik niesie TYLKO role postawione przez właściciela (Model Workshop,
// tryb «kotwice»); brakujące role liczy loader (`ShipAnchors.js` — wartości domyślne, nigdy niezapisywane).
//
// Kotwica = punkt, do którego K1c prowadzi linię odnośnika z listą modułów danej roli (kilka modułów → lista na jednej linii).
//
// ⚠ ZERO importów — moduł wykonuje się pod node (keeper `ship_anchors_smoke` sprawdza nim wszystkie pliki z dysku).

export const ANCHORS_VERSION = 1;

// Role w stałej kolejności (kolejność = kolejność zapisu i wyświetlania).
export const ANCHOR_ROLES = Object.freeze(['drive', 'weapons', 'defence', 'hold', 'mission', 'habitat']);

// Moduł → rola wg `slotType` z `ShipModulesData.js` (D-K-8; B5). Każdy typ slotu ma rolę — keeper sprawdza KAŻDY moduł.
//   propulsion → drive · weapon → weapons · armor, shield → defence · cargo, fuel (w tym zbiornik warp) → hold ·
//   science, special, troop → mission · habitat → habitat
export const MODULE_ROLE_BY_SLOT_TYPE = Object.freeze({
  propulsion: 'drive',
  weapon: 'weapons',
  armor: 'defence', shield: 'defence',
  cargo: 'hold', fuel: 'hold',
  science: 'mission', special: 'mission', troop: 'mission',
  habitat: 'habitat',
});

/**
 * Rola kotwicy dla definicji modułu (`SHIP_MODULES[id]`) albo null (nieznany typ slotu — keeper pilnuje, by nie było takich).
 * @param {{ slotType?: string }|null} mod
 * @returns {string|null}
 */
export function moduleAnchorRole(mod) {
  const st = mod && typeof mod.slotType === 'string' ? mod.slotType : null;
  return st && Object.prototype.hasOwnProperty.call(MODULE_ROLE_BY_SLOT_TYPE, st) ? MODULE_ROLE_BY_SLOT_TYPE[st] : null;
}

const COORD_MAX = 1.0;       // |współrzędna| w przestrzeni znormalizowanej (nominalnie ≤ 0,5; zapas jak w hardpointach)
const TOP_KEYS = Object.freeze(['v', 'slot', 'anchors']);
const ANCHOR_KEYS = Object.freeze(['role', 'p']);
const SLOT_RE = /^[a-z0-9_]+$/;

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/**
 * Walidacja dokumentu kotwic (schemat v1). Ścisła: nieznany klucz (na górze i w kotwicy), nieznana rola, powtórzona rola,
 * współrzędna nieskończona / poza zakresem — błąd.
 * @param {object} doc
 * @param {{ slot?: string }} [o] — oczekiwany klucz slotu (np. z nazwy pliku); niezgodność = błąd
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateAnchors(doc, { slot = null } = {}) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!isObj(doc)) return { ok: false, errors: ['dokument nie jest obiektem'] };
  for (const k of Object.keys(doc)) if (!TOP_KEYS.includes(k)) err(`nieznany klucz «${k}»`);
  if (doc.v !== ANCHORS_VERSION) err(`v = ${JSON.stringify(doc.v)} (oczekiwano ${ANCHORS_VERSION})`);
  if (typeof doc.slot !== 'string' || !SLOT_RE.test(doc.slot)) err('slot: wymagany klucz [a-z0-9_]+');
  else if (slot != null && doc.slot !== slot) err(`slot «${doc.slot}» ≠ «${slot}»`);
  if (!Array.isArray(doc.anchors)) err('anchors: wymagana tablica');
  else {
    if (doc.anchors.length > ANCHOR_ROLES.length) err(`anchors: ${doc.anchors.length} > ${ANCHOR_ROLES.length}`);
    const seen = new Set();
    doc.anchors.forEach((a, i) => {
      const at = `anchors[${i}]`;
      if (!isObj(a)) { err(`${at}: nie jest obiektem`); return; }
      for (const k of Object.keys(a)) if (!ANCHOR_KEYS.includes(k)) err(`${at}: nieznany klucz «${k}»`);
      if (!ANCHOR_ROLES.includes(a.role)) err(`${at}: nieznana rola ${JSON.stringify(a.role)}`);
      else if (seen.has(a.role)) err(`${at}: powtórzona rola «${a.role}»`);
      else seen.add(a.role);
      if (!Array.isArray(a.p) || a.p.length !== 3 || !a.p.every(isNum)) err(`${at}.p: wymagane [x, y, z] skończone`);
      else if (!a.p.every((c) => Math.abs(c) <= COORD_MAX)) err(`${at}.p: poza przestrzenią (|c| > ${COORD_MAX})`);
    });
  }
  return { ok: errors.length === 0, errors };
}

/** Tekst pliku: kotwice w kolejności `ANCHOR_ROLES`, punkt w jednej linii (czytelny diff), LF, nowa linia na końcu. */
export function formatAnchorsJson(doc) {
  const order = (r) => ANCHOR_ROLES.indexOf(r);
  const list = [...(doc?.anchors ?? [])].sort((a, b) => order(a.role) - order(b.role));
  const rows = list.map((a) => `    { "role": ${JSON.stringify(a.role)}, "p": [${a.p.map((c) => JSON.stringify(c)).join(', ')}] }`);
  return '{\n'
    + `  "v": ${JSON.stringify(doc?.v)},\n`
    + `  "slot": ${JSON.stringify(doc?.slot)},\n`
    + (rows.length ? `  "anchors": [\n${rows.join(',\n')}\n  ]\n` : '  "anchors": []\n')
    + '}\n';
}
