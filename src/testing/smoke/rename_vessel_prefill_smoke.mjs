// Finding 749 — keeper: pole zmiany nazwy statku startuje z BIEŻĄCĄ nazwą statku (zaznaczoną), nie z etykietą „Zmień nazwę statku”.
//
//   P1  `_renameVessel(id)` otwiera okno, którego <input> ma wartość = nazwa statku (wykonanie handlera na DOM-stubie)
//   P2  statek nie istnieje → etykieta jako wartość awaryjna (bez wyjątku)
//   P3  ModalInput zaznacza cały tekst po otwarciu (`input.select()` w klatce po focusie) — kontrola (zielona przed i po)
//   P4  zatwierdzenie (Enter) emituje `vessel:rename` z wpisaną nazwą — kontrola ścieżki zapisu

import '../headless/env.js';   // MUSI być pierwszy
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import EventBus from '../../core/EventBus.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const { t } = await import('../../i18n/i18n.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; if (process.env.VERBOSE) console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const safe = async (name, fn) => { try { await fn(); } catch (e) { fail++; console.log(`  ✗ FAIL: ${name} rzuciło: ${e.message}`); } };

// DOM-stub z prawdziwym `style`, nasłuchem klawiszy na <input> i rejestrem utworzonych pól
const inputs = [];
const ce = document.createElement;
document.createElement = (tag) => {
  const el = ce(tag);
  el.style = {};
  if (String(tag) === 'input') {
    const handlers = {};
    el.addEventListener = (ev, fn) => { (handlers[ev] ??= []).push(fn); };
    el._fire = (ev, e) => (handlers[ev] ?? []).forEach((fn) => fn(e));
    inputs.push(el);
  }
  return el;
};
const VESSELS = new Map([['v_1', { id: 'v_1', name: 'Fracht III' }]]);
globalThis.window.KOSMOS = globalThis.KOSMOS = { vesselManager: { getVessel: (id) => VESSELS.get(id) ?? null } };
const tick = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 5)); };

console.log('\n── Finding 749: pole zmiany nazwy statku');
await safe('P1', async () => {
  const ov = new FleetManagerOverlay();
  const n0 = inputs.length;
  ov._renameVessel('v_1');
  await tick();
  const el = inputs[inputs.length - 1];
  ok(inputs.length > n0 && !!el, 'P1 świadek — okno otwarte (<input> utworzony)');
  ok(el?.value === 'Fracht III', `P1 wartość pola = nazwa statku („${el?.value}”)`);
  ok(el?.value !== t('fleetPanel.rename'), 'P1 wartość pola ≠ etykieta „Zmień nazwę statku”');
  // P4 — Enter zatwierdza wpisaną nazwę
  const got = [];
  const off = EventBus.on('vessel:rename', (p) => got.push(p));
  if (el) { el.value = 'Kestrel'; el._fire('keydown', { key: 'Enter', preventDefault() {}, stopPropagation() {} }); }
  await tick();
  ok(got.some((p) => p.vesselId === 'v_1' && p.name === 'Kestrel'), 'P4 Enter → `vessel:rename` { v_1, Kestrel }');
  if (typeof off === 'function') off();
});
await safe('P2', async () => {
  const ov = new FleetManagerOverlay();
  const n0 = inputs.length;
  ov._renameVessel('v_missing');
  await tick();
  const el = inputs[inputs.length - 1];
  ok(inputs.length > n0 && el?.value === t('fleetPanel.rename'), 'P2 statku brak → etykieta jako wartość awaryjna');
});
await safe('P3', () => {
  const src = fs.readFileSync(fileURLToPath(new URL('../../ui/ModalInput.js', import.meta.url)), 'utf8').replace(/\r\n/g, '\n').replace(/^\s*\/\/.*$/gm, '');
  ok(/input\.value = currentName;/.test(src), 'P3 ModalInput: wartość pola = przekazana nazwa');
  ok(/requestAnimationFrame\(\(\) => \{\s*input\.focus\(\);\s*input\.select\(\);/.test(src), 'P3 ModalInput: focus + zaznaczenie całego tekstu po otwarciu (kontrola)');
});
for (const o of document.body.children.slice?.() ?? []) document.body.removeChild(o);
console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'} — ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
