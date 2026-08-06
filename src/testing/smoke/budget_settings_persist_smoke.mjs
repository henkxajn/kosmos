// Ustawienia budżetu (stawka podatkowa) przeżywają zapis→wczytanie.
// Uruchom: node src/testing/smoke/budget_settings_persist_smoke.mjs
//
// Regresja realnego buga: SaveSystem._serializeCiv4x ręcznie przepisywał 5 z 8 pól
// zwracanych przez ColonyManager.serialize() i GUBIŁ taxRate/taxAccum/taxProtestAccum.
// Strona odczytu (restore z `?? 0.08`) była poprawna → po każdym wczytaniu suwak
// w zakładce BUDŻET wracał do domyślnych 8%.
//
// Test jedzie PRODUKCYJNĄ ścieżką zapisu (prawdziwe SaveSystem._serializeCiv4x),
// nie kopią bloku — kopia przeszłaby nawet po ponownym usunięciu pól z SaveSystem.
//
// Pokrywa:
//   T1 ColonyManager.serialize() niesie ustawienia budżetu
//   T2 SaveSystem._serializeCiv4x NIE gubi ich po drodze (rdzeń regresji)
//   T3 round-trip przez JSON (realny plik / localStorage) + restore
//   T4 stary save bez pól → defaults (brak migracji, zachowanie jak dotąd)
//   T5 clamp settera (0–0.25) przeżywa round-trip

import '../headless/env.js'; // MUST be first
import { SaveSystem } from '../../systems/SaveSystem.js';
import { ColonyManager } from '../../systems/ColonyManager.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

// Zapis przez PRAWDZIWY SaveSystem — colonyManager wstrzyknięty przez service locator.
function saveWith(colonyManager) {
  window.KOSMOS = { civMode: true, colonyManager, timeSystem: { gameTime: 0 } };
  return new SaveSystem()._serializeCiv4x();
}

// ── T1: ColonyManager.serialize() niesie ustawienia budżetu ───────────────────
console.log('--- T1: ColonyManager.serialize() niesie ustawienia budżetu ---');
const cm = new ColonyManager(null);
cm.taxRate = 0.19;              // gracz przesunął suwak w zakładce BUDŻET
cm._taxAccum = 0.037;
cm._taxProtestAccum = 1.5;
const raw = cm.serialize();
ok('serialize().taxRate === 0.19',        raw.taxRate === 0.19);
ok('serialize().taxAccum === 0.037',      raw.taxAccum === 0.037);
ok('serialize().taxProtestAccum === 1.5', raw.taxProtestAccum === 1.5);

// ── T2: produkcyjna ścieżka zapisu nie gubi pól (RDZEŃ REGRESJI) ──────────────
console.log('--- T2: SaveSystem._serializeCiv4x nie gubi pól budżetu ---');
const c4x = saveWith(cm);
ok('c4x niepusty (civMode aktywny)',    !!c4x);
ok('c4x.taxRate === 0.19',              c4x.taxRate === 0.19);
ok('c4x.taxAccum === 0.037',            c4x.taxAccum === 0.037);
ok('c4x.taxProtestAccum === 1.5',       c4x.taxProtestAccum === 1.5);

// ── T3: round-trip przez JSON (realny plik / localStorage) + restore ──────────
console.log('--- T3: JSON round-trip + restore ---');
const fromDisk = JSON.parse(JSON.stringify(c4x));
const cm2 = new ColonyManager(null);
cm2.restore(fromDisk, null);
ok('po wczytaniu taxRate === 0.19 (NIE default 0.08)', cm2.taxRate === 0.19);
ok('po wczytaniu taxAccum === 0.037',                  cm2._taxAccum === 0.037);
ok('po wczytaniu taxProtestAccum === 1.5',             cm2._taxProtestAccum === 1.5);

// ── T4: stary save bez pól → defaults (brak migracji) ─────────────────────────
console.log('--- T4: stary save bez pól → defaults ---');
const cm3 = new ColonyManager(null);
cm3.restore({ colonies: [] }, null);
ok('brak taxRate w save → 0.08', cm3.taxRate === 0.08);
ok('brak taxAccum w save → 0',   cm3._taxAccum === 0);

// ── T5: clamp settera (0–0.25) przeżywa round-trip ────────────────────────────
console.log('--- T5: clamp settera przeżywa round-trip ---');
const cm4 = new ColonyManager(null);
cm4.taxRate = 0.99;
ok('setter clampuje do 0.25', cm4.taxRate === 0.25);
const cm5 = new ColonyManager(null);
cm5.restore(JSON.parse(JSON.stringify(saveWith(cm4))), null);
ok('restore odtwarza 0.25', cm5.taxRate === 0.25);

console.log(`\n${pass}/${pass + fail} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
