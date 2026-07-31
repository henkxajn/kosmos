// Predykat modala pełnoekranowego ColonyOverlay (globe toggle) — czysta logika boolowska.
// Dowodzi PRZECIW prawdziwemu importowi anyFullBoundsModalOpen: pełna tabela prawdy 3 flag (OR),
// null-safety (undefined/null → false), tolerancja pól nadmiarowych. Konsument = _syncGlobe:
// display 'none' gdy true (schowaj globus z-3), '' gdy false (pokaż) — mapping trywialny, w call-site.
// Uruchom: node src/testing/smoke/colony_modal_logic_smoke.mjs

import { anyFullBoundsModalOpen, closeFullBoundsModals } from '../../ui/ColonyModalLogic.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

// ── T1: pełna tabela prawdy — OR trzech flag (stationPicker | stationShipPicker | draft) ──
console.log('--- T1: truth table (3 flagi → OR) ---');
const KEYS = ['stationPickerOpen', 'stationShipPickerOpen', 'draftOpen'];
for (let m = 0; m < 8; m++) {
  const flags = { stationPickerOpen: !!(m & 1), stationShipPickerOpen: !!(m & 2), draftOpen: !!(m & 4) };
  const expected = flags.stationPickerOpen || flags.stationShipPickerOpen || flags.draftOpen;
  const on = KEYS.filter(k => flags[k]).map(k => k.replace('Open', '')).join('+') || '(żadna)';
  ok(`${on.padEnd(38)} → ${expected}`, anyFullBoundsModalOpen(flags) === expected);
}

// ── T2: każda flaga z osobna wystarcza (single-source: dodanie/usunięcie flagi = tu, nie w call-site) ──
console.log('--- T2: pojedyncza flaga wystarcza ---');
ok('tylko stationPickerOpen → true (module picker)', anyFullBoundsModalOpen({ stationPickerOpen: true }) === true);
ok('tylko stationShipPickerOpen → true (ship picker)', anyFullBoundsModalOpen({ stationShipPickerOpen: true }) === true);
ok('tylko draftOpen → true (rekrutacja)', anyFullBoundsModalOpen({ draftOpen: true }) === true);
ok('brak flag → false (globus widoczny)', anyFullBoundsModalOpen({}) === false);

// ── T3: null-safety — undefined/null/brak argumentu → false (nie rzuca) ──
console.log('--- T3: null-safety ---');
ok('undefined → false', anyFullBoundsModalOpen(undefined) === false);
ok('null → false', anyFullBoundsModalOpen(null) === false);
ok('brak argumentu → false', anyFullBoundsModalOpen() === false);

// ── T4: pola nadmiarowe ignorowane; wartości truthy/falsy koercjonowane do boolean ──
console.log('--- T4: tolerancja / koercja ---');
ok('nieistotne pola ignorowane', anyFullBoundsModalOpen({ somethingElse: true, draftOpen: false }) === false);
ok('truthy nie-bool (1) → true', anyFullBoundsModalOpen({ stationPickerOpen: 1 }) === true);
ok('zwraca ZAWSZE boolean (nie truthy 1)', anyFullBoundsModalOpen({ stationShipPickerOpen: 1 }) === true && typeof anyFullBoundsModalOpen({ stationShipPickerOpen: 1 }) === 'boolean');

// ── T5: closeFullBoundsModals — reset wszystkich flag + hide draftu (symulacja show() na zmianie kolonii) ──
console.log('--- T5: closeFullBoundsModals resetuje flagi (show()-path fix) ---');
{
  let hidden = 0;
  const ov = {
    _stationPickerOpen: true, _stationShipPickerOpen: true, _draftOpen: true,
    _draftPanel: { hide: () => { hidden++; } },
  };
  closeFullBoundsModals(ov);
  ok('_stationPickerOpen true → false', ov._stationPickerOpen === false);
  ok('_stationShipPickerOpen true → false', ov._stationShipPickerOpen === false);
  ok('_draftOpen true → false', ov._draftOpen === false);
  ok('_draftPanel.hide() wywołane raz', hidden === 1);
  // Predykat po reset = false (spójność query↔command: to samo źródło flag).
  ok('anyFullBoundsModalOpen po reset = false (globus wróci)', anyFullBoundsModalOpen({
    stationPickerOpen: ov._stationPickerOpen, stationShipPickerOpen: ov._stationShipPickerOpen, draftOpen: ov._draftOpen,
  }) === false);
}

// ── T6: idempotencja + brak zakłócenia gdy nic nie otwarte (normalne otwarcie bez modala) ──
console.log('--- T6: idempotencja / brak modala ---');
{
  const ov = { _stationPickerOpen: false, _stationShipPickerOpen: false, _draftOpen: false, _draftPanel: { hide: () => {} } };
  closeFullBoundsModals(ov);
  ok('wszystkie false zostają false (idempotentne)', ov._stationPickerOpen === false && ov._stationShipPickerOpen === false && ov._draftOpen === false);
  // Częściowy stan (tylko ship picker) — reset tylko go dotyka, inne bez zmian.
  const ov2 = { _stationPickerOpen: false, _stationShipPickerOpen: true, _draftOpen: false, _draftPanel: { hide: () => {} } };
  closeFullBoundsModals(ov2);
  ok('częściowy: stationShipPickerOpen true → false', ov2._stationShipPickerOpen === false);
}

// ── T7: null-safety — brak _draftPanel / null overlay nie rzuca ──
console.log('--- T7: null-safety ---');
{
  let threw = false;
  try {
    closeFullBoundsModals({ _stationPickerOpen: true, _stationShipPickerOpen: true, _draftOpen: true });   // brak _draftPanel
    closeFullBoundsModals(null);
    closeFullBoundsModals(undefined);
  } catch (e) { threw = true; console.error('    RZUCIŁ: ' + e.message); }
  ok('brak _draftPanel / null / undefined → nie rzuca', !threw);
  const ov = { _stationShipPickerOpen: true };
  closeFullBoundsModals(ov);
  ok('brak _draftPanel: flaga i tak zresetowana', ov._stationShipPickerOpen === false);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
