// ═══════════════════════════════════════════════════════════════
// sweep_guard_smoke.mjs — META-TEST (Slice 5D item 8):
//   dowodzi, że sweep runner (run-all.mjs) FAILUJE gdy suita CRASHUJE.
// Uruch: node src/testing/smoke/sweep_guard_smoke.mjs
// ───────────────────────────────────────────────────────────────
// Testuje `runSuites` na FIKSTURACH (temp dir), NIE na realnym katalogu →
// zero rekurencji (meta-test sam jest suitą w sweepie, ale nie woła main()).
// ═══════════════════════════════════════════════════════════════
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSuites } from './run-all.mjs';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

// ── Fikstury: zdrowa / czysty-fail / crash-przed-summary / silent (exit 0 bez summary) ──
const dir = mkdtempSync(join(tmpdir(), 'kosmos-sweep-guard-'));
const write = (name, body) => { const p = join(dir, name); writeFileSync(p, body); return p; };

const fPass   = write('pass.mjs',   `console.log('=== WYNIK: 2 PASS / 0 FAIL ==='); process.exit(0);`);
const fFail   = write('fail.mjs',   `console.log('=== WYNIK: 1 PASS / 1 FAIL ==='); process.exit(1);`);
const fCrash  = write('crash.mjs',  `console.log('robię coś...'); throw new Error('boom przed podsumowaniem');`);
const fSilent = write('silent.mjs', `console.log('robię coś, ale nie drukuję podsumowania'); process.exit(0);`);

// ── (A) Pojedyncze werdykty ──────────────────────────────────────
const byFile = (res) => Object.fromEntries(res.results.map(r => [r.file, r]));

{
  const res = runSuites([fPass, fFail, fCrash, fSilent], { quiet: true });
  const m = byFile(res);
  ok('(A) zdrowa suita (exit 0 + summary) → ok, bez advisory', m['pass.mjs'].ok === true && m['pass.mjs'].advisory === false);
  ok('(A) czysty FAIL (exit 1 + summary) → !ok, exit 1', m['fail.mjs'].ok === false && m['fail.mjs'].exit === 1);
  // KRYTERIUM = exit code. Crash (uncaught throw) daje exit≠0 → !ok → failuje sweep. Brak summary
  // dodatkowo klasyfikuje go jako „crash" (odróżnia od czystego fail z podsumowaniem).
  ok('(A) CRASH (throw → exit≠0, bez summary) → !ok (failuje sweep)',
     m['crash.mjs'].ok === false && m['crash.mjs'].exit !== 0 && m['crash.mjs'].hadSummary === false);
  // SILENT (exit 0, brak summary) = ADVISORY, NIE fail (exit-code autorytatywne; heurystyka summary
  // przy 5+ formatach dawała false-positive'y → tylko sygnał do ręcznego sprawdzenia).
  ok('(A) SILENT (exit 0 bez summary) → ok=true + advisory=true (NIE hard-fail)',
     m['silent.mjs'].ok === true && m['silent.mjs'].advisory === true && m['silent.mjs'].exit === 0);

  // ── (B) Agregat — crash MUSI failować sweep (rdzeń item 8) ──
  ok('(B) total===4', res.total === 4);
  ok('(B) passed===2 (zdrowa + silent, oba exit 0)', res.passed === 2);
  ok('(B) failed===2 (fail + crash)', res.failed === 2);
  ok('(B) crashed===1 (crash: !ok bez summary)', res.crashed === 1);
  ok('(B) advisories===1 (silent)', res.advisories === 1);
  ok('(B) sweep FAILUJE (failed>0) — crash NIE jest cicho łykany (fix bash-for-loop)', res.failed > 0);
}

// ── (C) Kontrola pozytywna: same zdrowe suity → sweep przechodzi ──
{
  const res = runSuites([fPass, fPass], { quiet: true });
  ok('(C) same zdrowe → failed===0 (sweep PASS)', res.failed === 0 && res.passed === 2);
}

// ── (D) Reason wypełniony dla crashu (diagnostyka w output) ──
{
  const res = runSuites([fCrash], { quiet: true });
  const m = byFile(res);
  ok('(D) crash ma reason (exit + „crash przed podsumowaniem")', !!m['crash.mjs'].reason && /crash/i.test(m['crash.mjs'].reason));
}

rmSync(dir, { recursive: true, force: true });

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
