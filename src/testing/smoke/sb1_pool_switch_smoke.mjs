// AI STRIKES BACK S1 (domknięcie) — keeper B9 (tylko test): wyłącznik `fleetPoolSystem.enabled` — narzędzie testów
// (zgoda właściciela 2026-10-08 przy R-B2: „domyślnie włączony, nie trafia do zapisu”). Pinuje trzy rzeczy:
//
//   W1  w uruchomionej grze wyłącznik jest WŁĄCZONY (świat `bootWithDirector` — parytet `GameCore` z `GameScene`;
//       świeża instancja też); w `src/` poza testami nic go nie przestawia (jedyny zapis — konstruktor)
//   W2  NIE trafia do zapisu: zapis civ4x (`SaveSystem._serializeCiv4x`, ścieżka produkcyjna) przy wyłączniku
//       wyłączonym = bajt w bajt zapis przy włączonym (świadek: zapis niesie pulę — flagę i kadłuby); `SaveSystem`
//       o puli nie wie, a `FleetPoolSystem` nie ma serializacji
//   W3  NIE wraca z zapisu: wyłącznik wyłączony w jednej sesji, zapis → nowa sesja → wczytanie stanu ⇒ włączony;
//       wczytanie w tej samej sesji go nie przestawia (zostaje taki, jaki ustawił keeper)
//
// ⚠ Fail-first niemożliwy z konstrukcji (keeper pinuje stan zastany od B2) — uczciwy zamiennik: dowód mutacyjny
//   (`p3/tools/mutation_b9.py`: domyślnie wyłączony ⇒ W1 czerwony; wyłącznik w zapisie civ4x ⇒ W2 czerwony; wyłącznik
//   w stanie gry ⇒ W2 i W3 czerwone).

import '../headless/env.js';           // MUSI być pierwszy
import gameState from '../../core/GameState.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import { FleetPoolSystem } from '../../systems/FleetPoolSystem.js';
import { SaveSystem } from '../../systems/SaveSystem.js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC  = path.resolve(here, '../..');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');
const code = (r) => stripComments(readFileSync(path.join(SRC, r), 'utf8').replace(/\r\n/g, '\n'));
const srcFiles = () => {
  const out = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) { if (!p.includes(`${path.sep}testing`)) walk(p); } else if (/\.(m?js)$/.test(n)) out.push(p); } };
  walk(SRC);
  return out;
};
const rel = (f) => path.relative(SRC, f).split(path.sep).join('/');
const quiet = (fn) => { const l = console.log, w = console.warn, tb = console.table; console.log = () => {}; console.warn = () => {}; console.table = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; console.table = tb; } };
const boot = () => { const { core, K, ticker } = quiet(() => bootWithDirector({ quiet: true })); return { core, K, ticker, vm: core.vesselManager, emps: K.empireRegistry.listIds() }; };
const civ4x = () => { const ss = new SaveSystem(); ss._autosaveInterval = 0; return quiet(() => ss._serializeCiv4x()); };

// ── W1 — domyślnie włączony ────────────────────────────────────────────────────────────────────
console.log('\nW1 — w uruchomionej grze wyłącznik puli jest włączony');
{
  const w = boot();
  assert(w.K.fleetPoolSystem instanceof FleetPoolSystem && w.K.fleetPoolSystem.enabled === true && new FleetPoolSystem().enabled === true,
    `W1a: KOSMOS.fleetPoolSystem.enabled === true w uruchomionej grze; świeża instancja — true (${w.K.fleetPoolSystem?.enabled})`);
  const outside = srcFiles().filter((f) => /fleetPoolSystem\??\.enabled\s*=(?!=)/.test(code(rel(f)))).map(rel);
  const own = code('systems/FleetPoolSystem.js').match(/this\.enabled\s*=(?!=)[^;\n]*/g) ?? [];
  assert(outside.length === 0 && own.length === 1 && /^this\.enabled\s*=\s*true$/.test(own[0].trim()),
    `W1b: w src/ poza testami nikt nie przestawia wyłącznika (${JSON.stringify(outside)}); jedyny zapis — konstruktor (${JSON.stringify(own)})`);
}

// ── W2 — nie trafia do zapisu ──────────────────────────────────────────────────────────────────
console.log('\nW2 — wyłącznik nie trafia do zapisu');
{
  const w = boot();
  const [e1] = w.emps;
  quiet(() => w.K.diplomacySystem.declareWar(e1, 'keeper_setup'));
  const on = JSON.stringify(civ4x());
  w.K.fleetPoolSystem.enabled = false;
  const off = JSON.stringify(civ4x());
  w.K.fleetPoolSystem.enabled = true;
  const parsed = JSON.parse(on);
  const flagSaved = parsed?.gameState?.empires?.[e1]?.fleetPool?.mobilized === true;
  const poolSaved = on.includes('"origin":"pool"');
  assert(on.length > 1000 && flagSaved && poolSaved,
    `W2a (świadek): zapis civ4x niesie pulę — flaga empires.${e1}.fleetPool i kadłuby origin 'pool' (${on.length} znaków)`);
  assert(on === off,
    `W2b: zapis przy wyłączniku wyłączonym = zapis przy włączonym, bajt w bajt (${on.length} / ${off.length} znaków)`);
  assert(!/fleetPool/i.test(code('systems/SaveSystem.js')) && !/\b(serialize|restore|toJSON)\s*\(/.test(code('systems/FleetPoolSystem.js')),
    'W2c: SaveSystem nie zna puli; FleetPoolSystem nie ma serializacji (stan puli — wyłącznie gameState i kadłuby)');
}

// ── W3 — nie wraca z zapisu ────────────────────────────────────────────────────────────────────
console.log('\nW3 — wyłącznik nie wraca z zapisu');
{
  const a = boot();
  const [e1] = a.emps;
  quiet(() => a.K.diplomacySystem.declareWar(e1, 'keeper_setup'));
  const poolA = a.K.fleetPoolSystem;                            // `K` to globalny `window.KOSMOS` — nowa sesja go nadpisze
  poolA.enabled = false;
  const saved = JSON.parse(JSON.stringify(civ4x()));
  quiet(() => gameState.restore(saved.gameState));
  const sameSession = poolA.enabled;
  const b = boot();                                              // nowa sesja (świeży GameCore, świeży stan gry)
  quiet(() => gameState.restore(saved.gameState));
  assert(sameSession === false && b.K.fleetPoolSystem !== poolA && b.K.fleetPoolSystem.enabled === true
    && b.K.empireRegistry.isFleetPoolMobilized(e1) === true,
    `W3: wczytanie w tej samej sesji nie przestawia wyłącznika (${sameSession}); nowa sesja po wczytaniu — włączony (${b.K.fleetPoolSystem.enabled}); świadek: flaga puli wróciła`);
}

console.log(`\n[sb1_pool_switch_smoke] PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
