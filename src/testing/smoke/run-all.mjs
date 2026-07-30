// ═══════════════════════════════════════════════════════════════
// run-all.mjs — sweep runner dla smoke'ów (Slice 5D item 8).
// ───────────────────────────────────────────────────────────────
// Problem: `for f in src/testing/smoke/*.mjs; do node "$f"; done` (README) NIE
//   failuje gdy suita CRASHUJE w środku — pętla leci dalej, a exit code to tylko
//   ostatnia komenda. Crash (throw przed podsumowaniem) był CICHO łykany.
// Ten runner: uruchamia każdą suitę w osobnym procesie, a sweep FAILUJE (exit 1)
//   gdy KTÓRAKOLWIEK suita ma non-zero exit LUB nie wypisała podsumowania
//   (`N PASS / M FAIL` / `=== WYNIK`) — sygnatura crashu przed summary.
//
// Użycie:
//   node src/testing/smoke/run-all.mjs            # wszystkie suity w tym katalogu
//   node src/testing/smoke/run-all.mjs --quiet    # tylko podsumowanie + porażki
// Eksport: `runSuites(files, opts)` — czysta logika (używana przez meta-test).
// ═══════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Podsumowanie zdrowej suity zawiera jedną z tych sygnatur (repo używa RÓŻNYCH formatów:
//   „=== WYNIK: N PASS / M FAIL ===", „29 PASS, 0 FAIL", „PASS: 13   FAIL: 0",
//   „✓ PASS — 15/15", „31 passed, 0 failed"). Brak ŻADNEJ = crash przed podsumowaniem.
const SUMMARY_RE = new RegExp([
  '===\\s*WYNIK',                                   // „=== WYNIK: …"
  '\\bPASS\\b[^\\n]{0,40}\\bFAIL\\b',               // „N PASS, M FAIL" / „PASS: N   FAIL: M" (jedna linia)
  '\\d+\\s*passed[^\\n]{0,20}\\d+\\s*failed',       // „31 passed, 0 failed"
  '\\bPASS\\b\\s*[—\\-–]\\s*\\d+\\s*\\/\\s*\\d+',   // „PASS — 15/15"
].join('|'), 'i');

/**
 * Uruchom listę plików-suit w osobnych procesach.
 *
 * KRYTERIUM FAILU = EXIT CODE (autorytatywne). Każda suita kończy `process.exit(fail?1:0)`;
 * crash (uncaught throw / kill / timeout) też daje non-zero. Bash-for-loop łykał te non-zero,
 * bo NIE agreguje kodów — ten runner agreguje: KTÓRYKOLWIEK non-zero ⇒ sweep FAILUJE.
 *
 * BRAK podsumowania = tylko ADVISORY (nie fail): przy TAK zróżnicowanych formatach summary w
 * repo (5+ wariantów) heurystyka summary-line dawałaby dziesiątki false-positive'ów. Advisory
 * flaguje „exit 0 ale nie rozpoznano podsumowania" (możliwy silent no-op) do RĘCZNEGO sprawdzenia.
 *
 * @returns {{ total, passed, failed, crashed, advisories, results: Array }}
 */
export function runSuites(files, { quiet = false, timeoutMs = 120000 } = {}) {
  const results = [];
  for (const file of files) {
    const r = spawnSync(process.execPath, [file], { encoding: 'utf-8', timeout: timeoutMs });
    const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
    const exit = r.status;                         // null gdy zabity sygnałem/timeout
    const hadSummary = SUMMARY_RE.test(out);
    const ok = exit === 0;                          // AUTORYTATYWNE: exit code
    const advisory = ok && !hadSummary;             // przeszło, ale brak rozpoznanego summary (do sprawdzenia)
    let reason = '';
    if (exit === null) reason = r.signal ? `signal ${r.signal}` : 'timeout/killed';
    else if (exit !== 0) reason = hadSummary ? `exit ${exit}` : `exit ${exit} (crash przed podsumowaniem)`;
    results.push({ file: basename(file), exit, hadSummary, ok, advisory, reason });
    if (!quiet) process.stdout.write(ok ? (advisory ? '?' : '.') : '!');
  }
  if (!quiet) process.stdout.write('\n');
  const passed     = results.filter(r => r.ok).length;
  const failed     = results.filter(r => !r.ok).length;
  // crashed = porażka bez podsumowania (throw/kill/timeout) — klasa cicho łykana przez for-loop.
  const crashed    = results.filter(r => !r.ok && !r.hadSummary).length;
  const advisories = results.filter(r => r.advisory).length;
  return { total: results.length, passed, failed, crashed, advisories, results };
}

/** Odkryj pliki-suity w katalogu smoke (bez tego runnera i nie-.mjs). */
export function discoverSuites(dir = __dirname) {
  return readdirSync(dir)
    .filter(f => f.endsWith('.mjs') && f !== 'run-all.mjs')
    .sort()
    .map(f => resolve(dir, f));
}

function main() {
  const quiet = process.argv.includes('--quiet');
  const files = discoverSuites();
  console.log(`═══ KOSMOS smoke sweep — ${files.length} suit ═══`);
  const { total, passed, failed, advisories, results } = runSuites(files, { quiet });
  const failures = results.filter(r => !r.ok);
  if (failures.length) {
    console.log('\n── PORAŻKI (exit≠0 → sweep FAIL) ──');
    for (const f of failures) console.log(`  FAIL  ${f.file}  (${f.reason})`);
  }
  const adv = results.filter(r => r.advisory);
  if (adv.length) {
    console.log('\n── ADVISORY (exit 0, nie rozpoznano podsumowania — sprawdź czy nie silent no-op) ──');
    for (const a of adv) console.log(`  ?     ${a.file}`);
  }
  console.log(`\n═══ ${passed}/${total} OK, ${failed} FAIL${advisories ? `, ${advisories} advisory` : ''} ═══`);
  process.exit(failed > 0 ? 1 : 0);
}

// Uruchom main tylko gdy plik wywołany bezpośrednio (nie przy imporcie z meta-testu).
if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) main();
