// Finding 177 — keeper: BRAMKA i18n PYTA TEŻ „czy każdy widoczny napis przechodzi przez t()".
// Narzędzie: tools/check-i18n.mjs · audyt: docs/audit/EVENT_LOG_AUDIT.md §1 i §11.
//
// PO CO TO ISTNIEJE: do 2026-08-27 `check-i18n` odpowiadał WYŁĄCZNIE na pytanie „czy klucz
// użyty w `t()` istnieje w pl i en". Literał w `push({ text: '…' })` albo `fillText('…')` był
// dla niego NIEWIDZIALNY ⇒ bramka świeciła na zielono, gdy Dziennik miał 29 zaszytych napisów
// (26 polskich, u gracza z angielskim UI). Ta sama klasa co Finding 113 (ekran końca gry).
//
// ⚠ ZAPADKA, NIE PRÓG ZEROWY. Dług jest PRE-EXISTING: po naprawie Dziennika zostaje 62 napisy
//   w 11 plikach UI (m.in. ekran końca gry — F113, i legacy `PlanetScene`, który jest w ogóle
//   nieosiągalny). Bramka z progiem 0 byłaby czerwona od pierwszego uruchomienia i przestałaby
//   cokolwiek znaczyć. Baseline zamraża stan zastany: DODANIE literału = FAIL.
//
// ⚠ DLACZEGO KEEPER NIE WSTRZYKUJE LITERAŁU DO `src/`: zapis pliku w `src/` przeładowuje kartę
//   gracza przez Live Server (CLAUDE.md, STANDING LESSON) — przy KAŻDYM przebiegu sweepa.
//   Dlatego narzędzie ma furtkę `KOSMOS_I18N_BASELINE` (tylko-testową), którą tu wykorzystujemy:
//   pusty baseline = „każdy istniejący napis jest nowy" ⇒ musi paść.
//
//   T1  bramka PRZECHODZI na obecnym drzewie (+ kontrola pinu: sekcja naprawdę się wykonała)
//   T2  zapadka PŁONIE, gdy baseline nie pokrywa stanu (dowód, że nie mierzy ciszy)
//   T3  ubytek długu jest RAPORTOWANY (baseline do obniżenia) — zapadka działa w obie strony
//   T4  pin ŹRÓDŁOWY — dev-loggery odsiewane przez WYKRYCIE, nie przez listę plików
//   T5  (Finding 269) sink DOM `.textContent =` / `.innerText =` MIERZY (CargoLoadModal wymieniony jako
//       `dom:`), a CSS przez `style.textContent` jest ODSIANY (`src/main.js` — jedyny jego literał
//       w tym sinku to arkusz — NIE jest wymieniony; licznik „CSS wykluczone" > 0 = odsiew się wykonał)
//   T6  (Finding 269) ADVISORY diakrytyków: sekcja jest, liczy ponad sto literałów w wielu plikach,
//       NIE zawiera `src/i18n/`/`src/data/`/`src/testing/`, i NIE wpływa na wynik (T1 = PASS mimo długu)

import '../headless/env.js';           // MUSI być pierwszy
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const ROOT = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const TOOL = join(ROOT, 'tools', 'check-i18n.mjs');

const run = (env = {}) => {
  const r = spawnSync(process.execPath, [TOOL], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env },
  });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
};

console.log('\nT1 — bramka przechodzi na obecnym drzewie');
{
  const { code, out } = run();
  // KONTROLA PINU: nowa sekcja naprawdę się wykonała. Bez tego T1 przechodziłby też wtedy,
  // gdyby ktoś wyciął detektor — mierzylibyśmy CISZĘ, nie zdrowie.
  assert(/Napisy ZASZYTE w kodzie/.test(out),
    'T1: KONTROLA PINU — sekcja detekcji napisów faktycznie się wykonała');
  assert(code === 0, `T1: exit 0 (dostano ${code})`);
  assert(/WYNIK: PASS/.test(out), 'T1: WYNIK: PASS');
  assert(/Brak NOWYCH napisów zaszytych w kodzie/.test(out),
    'T1: zapadka trzyma — zero napisów ponad baseline');
  // Finding 269: sekcja sinku DOM też się wykonała (bez tego T5 mógłby mierzyć ciszę wyciętego sinku).
  assert(/Sink DOM \(\.textContent\/\.innerText\): \d+ trafień/.test(out),
    'T1: KONTROLA PINU — statystyka sinku DOM obecna w raporcie');
}

console.log('\nT2 — zapadka PŁONIE, gdy baseline nie pokrywa stanu');
{
  const { code, out } = run({ KOSMOS_I18N_BASELINE: '{}' });
  assert(code === 1, `T2: exit 1 przy pustym baseline (dostano ${code})`);
  assert(/\[BŁĄD\] NOWE napisy zaszyte w kodzie/.test(out),
    'T2: raport nazywa problem po imieniu');
  assert(/WYNIK: FAIL — nowy napis zaszyty w kodzie/.test(out),
    'T2: komunikat końcowy rozróżnia TĘ porażkę od „brakującego klucza"');
  // Musi wskazać PLIK i LINIĘ — inaczej nie da się na to zareagować.
  assert(/src\/[\w/]+\.js:\d+ \[T[12] \w+\]/.test(out),
    'T2: raport podaje plik:linię i tier (odpowiedź wykonalna, nie sama liczba)');
}

console.log('\nT3 — ubytek długu jest raportowany (zapadka w obie strony)');
{
  const { out } = run({ KOSMOS_I18N_BASELINE: JSON.stringify({ 'src/ui/WarOverlay.js': 99 }) });
  assert(/Baseline do obniżenia/.test(out) && /WarOverlay\.js: 1 \(baseline 99/.test(out),
    'T3: spłacony dług podpowiada obniżenie progu (baseline nie rośnie po cichu)');
}

console.log('\nT4 — dev-loggery odsiewane przez WYKRYCIE, nie przez listę (pin ŹRÓDŁOWY)');
{
  const tool = readFileSync(TOOL, 'utf8');
  assert(tool.includes('DEV_LOGGER'), 'T4: KONTROLA PINU — detektor dev-loggerów jest w narzędziu');
  assert(/DEV_LOGGER\s*=\s*\/_log[\s\S]{0,140}console\\?\.log/.test(tool),
    'T4: rozpoznanie po CIELE funkcji (`_log` z `console.log`), nie po nazwie pliku');

  // ⚠ Lista plików zgniłaby przy pierwszym nowym systemie z własnym `_log`. Pin sprawdza KOD
  //   bez komentarzy — nazwy systemów WOLNO wymieniać w wyjaśnieniu, nie wolno ich używać
  //   jako filtra. (Pierwsza wersja pinu czytała plik Z komentarzami i padała na własnym
  //   opisie — ta sama klasa co `source-pin-strip-comments`.)
  const toolCode = tool.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  assert(!/EmpireLogisticsSystem|EmpireStrategySystem|ColonyAutoExpander/.test(toolCode),
    'T4: KOD narzędzia nie wymienia dev-loggerów z nazwy (lista by zgniła)');

  // Kontrola merytoryczna: te cztery pliki NADAL mają `_log` = console.log, i to TĄ SAMĄ
  // regułą, której używa narzędzie — inaczej pin mierzyłby inny predykat niż produkcja.
  const DEV = /_log\s*\([^)]*\)\s*\{[\s\S]{0,300}?console\.log/;
  const devs = ['systems/EmpireLogisticsSystem.js', 'systems/EmpireStrategySystem.js',
                'systems/EmpireResearchSystem.js', 'systems/ColonyAutoExpander.js'];
  const stillDev = devs.filter(f => DEV.test(readFileSync(join(ROOT, 'src', f), 'utf8')));
  assert(stillDev.length === devs.length,
    `T4: KONTROLA PINU — wszystkie 4 dev-loggery nadal są console.log (${stillDev.length}/${devs.length})`);

  // ⚠ KONTROLA ODWROTNA: prawdziwy logger UI (`UIManager._log` → `eventLogSystem`) NIE MOŻE
  //   wpaść w odsiew, bo wtedy bramka przestałaby patrzeć na najważniejszy plik.
  assert(!DEV.test(readFileSync(join(ROOT, 'src/scenes/UIManager.js'), 'utf8')),
    'T4: KONTROLA ODWROTNA — UIManager NIE jest uznany za dev-logger (jego `_log` pisze do Dziennika)');
}

console.log('\nT5 — (269) sink DOM mierzy, CSS przez style.textContent odsiany');
{
  const { out } = run({ KOSMOS_I18N_BASELINE: '{}' });
  assert(/src\/ui\/CargoLoadModal\.js: \d+ \(baseline 0, \+\d+\) — [^\n]*dom:\d+/.test(out),
    'T5: CargoLoadModal wymieniony ponad baseline z RODZAJEM sinku `dom:` (sink DOM naprawdę mierzy)');
  assert(/\[T[12] dom\]/.test(out),
    'T5: próbka podaje plik:linię z rodzajem `dom` (odpowiedź wykonalna)');
  const css = /CSS wykluczone: (\d+)/.exec(out);
  assert(!!css && Number(css[1]) > 0,
    `T5: KONTROLA — odsiew CSS wykonał się na realnych arkuszach (wykluczone: ${css?.[1] ?? 'brak'})`);
  // `src/main.js` ma w sinku DOM WYŁĄCZNIE arkusz (`#loading-screen { … }` przez style.textContent) —
  // gdyby odsiew nie działał, przy pustym baseline stałby na liście NOWYCH.
  assert(!/src\/main\.js: \d+ \(baseline/.test(out),
    'T5: src/main.js NIE jest wymieniony — arkusz CSS przez textContent to nie napis dla gracza');
}

console.log('\nT6 — (269) ADVISORY diakrytyków: jest, liczy, nie bramkuje, nie liczy data/i18n/testing');
{
  const { code, out } = run();
  const m = /ADVISORY \(bez zapadki\)[^\n]*: (\d+) w (\d+) plikach/.exec(out);
  assert(!!m, 'T6: sekcja ADVISORY obecna w raporcie');
  assert(!!m && Number(m[1]) >= 100 && Number(m[2]) >= 10,
    `T6: advisory liczy REALNY dług (≥100 literałów w ≥10 plikach; jest ${m?.[1]} w ${m?.[2]})`);
  const adv = out.slice(out.indexOf('ADVISORY (bez zapadki)'));
  assert(!/src\/(i18n|data|testing)\//.test(adv.split('WYNIK:')[0]),
    'T6: advisory NIE liczy src/i18n/, src/data/ ani src/testing/ (dane i słowniki to nie dług UI)');
  assert(/src\/ui\/ColonyOverlay\.js: \d+/.test(adv) && /src\/scenes\/GameScene\.js: \d+/.test(adv),
    'T6: KONTROLA — ColonyOverlay i GameScene (znane z pomiaru 2026-09-17) są na liście');
  assert(code === 0, `T6: advisory NIE bramkuje — exit 0 mimo długu (dostano ${code})`);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
