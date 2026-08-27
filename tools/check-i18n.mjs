// check-i18n.mjs — weryfikacja spójności kluczy tłumaczeń KOSMOS
//
// Bez zależności zewnętrznych (czysty Node ESM). Uruchomienie:
//   node tools/check-i18n.mjs
//
// Co robi:
//   (a) skanuje src/ w poszukiwaniu WSZYSTKICH wywołań t('...') i klasyfikuje je:
//       - STATYCZNE  → pierwszy argument to czysty literał string ('...' / "..." /
//                      `...` bez ${}) → klucz sprawdzalny.
//       - DYNAMICZNE → zmienna, konkatenacja ('a.'+x) lub template z ${} → NIE-
//                      sprawdzalne (wypisywane osobno). Dla konkatenacji/template
//                      zapisujemy prefiks literału (do wyciszania fałszywych "nieużyte").
//       Dodatkowo rodziny getName/getDesc/getShort budują klucze
//       `${prefix}.${id}.name|.desc` i `commodity.${id}.short` — też dynamiczne.
//   (b) porównuje klucze STATYCZNE z kluczami zdefiniowanymi w pl.js i en.js.
//   (d) NOWE (Finding 177) — odpowiada na DRUGIE pytanie: „czy każdy widoczny napis
//       przechodzi przez t()?". Do 2026-08-27 narzędzie pytało WYŁĄCZNIE „czy klucz użyty
//       w t() istnieje w pl i en", więc literał w `push({text:'…'})` albo `fillText('…')`
//       był dla niego NIEWIDZIALNY — bramka świeciła na zielono, gdy Dziennik miał 29
//       zaszytych napisów (26 polskich). Ta sama klasa co Finding 113 (ekran końca gry).
//       Skan sinków napisów + ZAPADKA na baseline: nowy literał = FAIL, ubytek = podpowiedź
//       obniżenia progu. Szczegóły przy `HARDCODED_BASELINE` niżej.
//   (c) raportuje:
//       - [BŁĄD]  użyte-a-niezdefiniowane (w pl i/lub en) — to blokuje (exit 1)
//       - [i]     zdefiniowane-a-nieużyte (informacyjnie; NIC nie kasujemy)
//       - [i]     różnice pl vs en (klucz tylko w jednym słowniku)
//       - [i]     dynamiczne wywołania t() + rodziny getName/getDesc/getShort
//
// Warunek zaliczenia (exit 0): zero kluczy użytych-a-niezdefiniowanych w pl I en
//                               ORAZ zero NOWYCH napisów zaszytych w kodzie (ponad baseline).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const SRC       = path.join(ROOT, 'src');
const PL_PATH   = path.join(SRC, 'i18n', 'pl.js');
const EN_PATH   = path.join(SRC, 'i18n', 'en.js');

// Pliki wykluczone ze skanu UŻYĆ (definicje słowników + sam moduł i18n z przykładami w JSDoc)
const EXCLUDE_USAGE = new Set([PL_PATH, EN_PATH, path.join(SRC, 'i18n', 'i18n.js')]);

// ── 1. Klucze zdefiniowane (import default export — node dekoduje \uXXXX poprawnie) ──
async function loadKeys(p) {
  const mod = await import(pathToFileURL(p).href);
  return new Set(Object.keys(mod.default ?? {}));
}

// ── 2. Rekurencyjny spis plików .js/.mjs w src/ ──
function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full));
    else if (/\.(js|mjs)$/.test(ent.name)) out.push(full);
  }
  return out;
}

// Offsety początków linii → numer linii z indeksu znaku
function lineAt(lineStarts, idx) {
  let lo = 0, hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= idx) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}

// Wyciąga pierwszy argument wywołania zaczynającego się tuż po '(' (index i0).
// Zwraca { kind:'static', key } | { kind:'dynamic', prefix? }.
function extractFirstArg(text, i0) {
  let i = i0;
  while (i < text.length && /\s/.test(text[i])) i++;
  const c = text[i];
  if (c === "'" || c === '"') {
    let j = i + 1, buf = '';
    while (j < text.length) {
      const ch = text[j];
      if (ch === '\\') { buf += ch + (text[j + 1] ?? ''); j += 2; continue; }
      if (ch === c) break;
      buf += ch; j++;
    }
    // literał = buf (z surowymi escape'ami); klucze i18n są ASCII-dotted, więc escape'y nie występują
    let k = j + 1;
    while (k < text.length && /\s/.test(text[k])) k++;
    if (text[k] === '+') return { kind: 'dynamic', prefix: buf };      // 'a.' + x
    return { kind: 'static', key: buf };                                // ',' lub ')'
  }
  if (c === '`') {
    let j = i + 1, raw = '';
    while (j < text.length) {
      const ch = text[j];
      if (ch === '\\') { raw += ch + (text[j + 1] ?? ''); j += 2; continue; }
      if (ch === '`') break;
      raw += ch; j++;
    }
    if (raw.includes('${')) return { kind: 'dynamic', prefix: raw.slice(0, raw.indexOf('${')) };
    return { kind: 'static', key: raw };
  }
  return { kind: 'dynamic' };  // zmienna / wyrażenie
}

const T_CALL = /(?<![\w$.])t\s*\(/g;                 // wywołanie i18n t( — nie .at(/format(/parseInt(
const GET_NAMEDESC = /\bget(Name|Desc)\s*\(\s*[^,]+,\s*['"`]([^'"`]+)['"`]/g;
const GET_SHORT    = /\bgetShort\s*\(/g;

const staticKeys   = new Map();   // key → 'file:line' (pierwsze wystąpienie)
const dynamicCalls = [];          // { loc, snippet }
const dynamicPrefixes = new Set();// prefiksy literałów z konkatenacji/template (do wyciszania "nieużyte")
const nameDescPrefixes = new Set(); // np. 'building' (→ building.*.name / .desc)
let usesGetShort = false;

for (const file of walk(SRC)) {
  if (EXCLUDE_USAGE.has(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const rel  = path.relative(ROOT, file).replace(/\\/g, '/');
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);

  for (const m of text.matchAll(T_CALL)) {
    const openParen = m.index + m[0].length;       // index tuż za '('
    const arg = extractFirstArg(text, openParen);
    const loc = `${rel}:${lineAt(lineStarts, m.index)}`;
    if (arg.kind === 'static') {
      if (!staticKeys.has(arg.key)) staticKeys.set(arg.key, loc);
    } else {
      if (arg.prefix) dynamicPrefixes.add(arg.prefix);
      const lineEnd = text.indexOf('\n', m.index);
      dynamicCalls.push({ loc, snippet: text.slice(m.index, lineEnd < 0 ? m.index + 60 : Math.min(lineEnd, m.index + 80)).trim() });
    }
  }
  for (const m of text.matchAll(GET_NAMEDESC)) nameDescPrefixes.add(m[2]);
  if (GET_SHORT.test(text)) usesGetShort = true;
}

const plKeys = await loadKeys(PL_PATH);
const enKeys = await loadKeys(EN_PATH);

// ── 3. Analiza ──
const usedUndefinedPL = [];
const usedUndefinedEN = [];
for (const [key, loc] of staticKeys) {
  if (!plKeys.has(key)) usedUndefinedPL.push(`${key}   (${loc})`);
  if (!enKeys.has(key)) usedUndefinedEN.push(`${key}   (${loc})`);
}

// Czy zdefiniowany klucz jest osiągalny dynamicznie? (rodziny name/desc/short + prefiksy konkatenacji)
function reachableDynamically(key) {
  if (usesGetShort && key.startsWith('commodity.') && key.endsWith('.short')) return true;
  for (const p of nameDescPrefixes) {
    if (key.startsWith(p + '.') && (key.endsWith('.name') || key.endsWith('.desc'))) return true;
  }
  for (const p of dynamicPrefixes) if (p && key.startsWith(p)) return true;
  return false;
}

const definedUnusedPL = [...plKeys].filter(k => !staticKeys.has(k) && !reachableDynamically(k));
const onlyInPL = [...plKeys].filter(k => !enKeys.has(k));
const onlyInEN = [...enKeys].filter(k => !plKeys.has(k));

// ══ 3b. Napisy ZASZYTE w kodzie — sinki tekstu poza t() (Finding 177) ══════════════
//
// ⚠ CO TO MIERZY: literał ze słowami, który trafia do miejsca WYŚWIETLAJĄCEGO tekst graczowi.
//    Nie „każdy string w src/" — tylko taki, który realnie ląduje na ekranie.
//
// ⚠ DWA TIERY, bo mają różną pewność:
//    T1 — literał z POLSKIM diakrytykiem. Praktycznie zero fałszywek: identyfikatory
//         techniczne ich nie mają, więc to zawsze zaszyty polski napis.
//    T2 — „zdanie" (2+ słowa po 2+ litery) bez diakrytyków. Łapie polski bez ogonków
//         („Stocznia: budowa") ORAZ angielski w polskiej grze („Fleet order rejected").
//    T3 (pojedyncze słowo / format typu „Hex: ( , )") ŚWIADOMIE POMIJANY — 116 trafień
//         przy pomiarze, w większości jednostki i skróty (`AU`, `POP`, `Kr`). Blokowanie
//         na tym poziomie zamieniłoby bramkę w czerwoną lampkę, którą się ignoruje.
//
// ⚠ DEV-LOGGERY ODSIEWANE PRZEZ WYKRYCIE, NIE PRZEZ LISTĘ: `_log` w `EmpireLogisticsSystem`,
//    `EmpireStrategySystem`, `EmpireResearchSystem` i `ColonyAutoExpander` to opakowania
//    `console.log` (wyjście deweloperskie, nie UI). Zamiast listy plików — która zgniłaby
//    przy pierwszym nowym systemie — sprawdzamy, czy plik DEFINIUJE `_log` z `console.log`
//    w ciele; wtedy `_log` przestaje być sinkiem W TYM pliku.

const TEXT_SINKS = [
  { re: /\.(?:fillText|strokeText)\s*\(/g, kind: 'fillText' },
  { re: /\b(?:_log|_addNotification|addInfo|_pushLog)\s*\(/g, kind: 'log' },
  { re: /\b(?:text|headline|title|subtitle|label|msg|tooltip|placeholder)\s*:\s*/g, kind: 'prop' },
];
const PL_DIACRITIC = /[ĄĆĘŁŃÓŚŹŻąćęłńóśźż]/;
const TWO_WORDS    = /[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]{2,}\s+[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]{2,}/;
const DOTTED_KEY   = /^[a-zA-Z_]\w*(\.\w+)+$/;
// ⚠ `[\s\S]`, NIE `[^}]`: ciało dev-loggera zwykle zawiera `${…}` w template'cie, czyli `}`
//    PRZED `console.log` — wariant `[^}]` przepuszczał `ColonyAutoExpander` (zmierzone keeperem).
//    Okno 300 znaków wystarcza na każdy z czterech loggerów i nie sięga sąsiednich metod;
//    kontrolę merytoryczną (że te cztery NADAL są `console.log`) trzyma keeper T4.
const DEV_LOGGER   = /_log\s*\([^)]*\)\s*\{[\s\S]{0,300}?console\.log/;

// Literał zaczynający się na pozycji i (po białych znakach); `${…}` wycinane ze środka
// template'a, bo interpolacja nie jest tekstem do tłumaczenia.
function readStringLiteral(s, i) {
  while (i < s.length && /\s/.test(s[i])) i++;
  const q = s[i];
  if (q !== "'" && q !== '"' && q !== '`') return null;
  let j = i + 1, buf = '';
  while (j < s.length) {
    const c = s[j];
    if (c === '\\') { buf += c + (s[j + 1] ?? ''); j += 2; continue; }
    if (c === q) break;
    if (q === '`' && c === '$' && s[j + 1] === '{') {
      let depth = 1; j += 2;
      while (j < s.length && depth > 0) { if (s[j] === '{') depth++; else if (s[j] === '}') depth--; j++; }
      buf += ' ';
      continue;
    }
    buf += c; j++;
  }
  return buf;
}

const hardcoded = [];   // { rel, line, kind, tier, sample }
for (const file of walk(SRC)) {
  if (EXCLUDE_USAGE.has(file)) continue;
  const rel  = path.relative(ROOT, file).replace(/\\/g, '/');
  // ⚠ Test-harness, telemetria i raporty analityczne NIE są UI gracza — wypisują po angielsku
  //    do konsoli i to jest poprawne. Skan `t()` ich świadomie NIE wyklucza (patrz memory
  //    `i18n-checker-reads-t-calls-in-tests`), ale skan NAPISÓW musi: inaczej baseline
  //    utonąłby w 79 trafieniach z `src/testing/`, a bramka przestałaby mierzyć UI.
  if (rel.startsWith('src/testing/')) continue;
  const text = fs.readFileSync(file, 'utf8');
  const isDevLogger = DEV_LOGGER.test(text);
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);

  for (const { re, kind } of TEXT_SINKS) {
    if (kind === 'log' && isDevLogger) continue;          // console.log, nie UI
    for (const m of text.matchAll(re)) {
      const raw = readStringLiteral(text, m.index + m[0].length);
      if (raw == null) continue;                           // zmienna / t(...) / wyrażenie
      const s = raw.trim();
      if (!/[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]{3,}/.test(s)) continue;   // symbole, emoji, liczby
      if (DOTTED_KEY.test(s)) continue;                    // to klucz i18n, nie napis
      const tier = PL_DIACRITIC.test(s) ? 1 : (TWO_WORDS.test(s) ? 2 : 3);
      if (tier === 3) continue;
      hardcoded.push({ rel, line: lineAt(lineStarts, m.index), kind, tier, sample: s.slice(0, 64) });
    }
  }
}

const hardcodedByFile = new Map();
for (const h of hardcoded) hardcodedByFile.set(h.rel, (hardcodedByFile.get(h.rel) ?? 0) + 1);

// ⚠ ZAPADKA, NIE PRÓG ZEROWY. Dług jest PRE-EXISTING (~50 napisów w 12 plikach po naprawie
//    Dziennika), a bramka z progiem 0 byłaby czerwona od pierwszego uruchomienia i przestałaby
//    cokolwiek znaczyć. Baseline zamraża stan zastany: DODANIE literału = FAIL, USUNIĘCIE =
//    podpowiedź obniżenia liczby. Plik spoza tabeli z choćby jednym trafieniem też jest FAIL.
// ⚠ Baseline jest per PLIK — przeniesienie kodu między plikami zapali bramkę. To celowe:
//    ma wtedy zapłonąć i kazać człowiekowi zaktualizować obie liczby.
// ⚠ `PlanetScene.js` to LEGACY (instancjonowany, ale `.open`/`.show` nigdy nie wołane —
//    patrz CLAUDE.md). Jego napisy są NIEOSIĄGALNE; siedzą w baseline, żeby nie blokować,
//    i znikną razem z plikiem.
// ⚠ `KOSMOS_I18N_BASELINE` istnieje WYŁĄCZNIE po to, żeby keeper mógł UDOWODNIĆ, że zapadka
//    realnie płonie — bez zapisywania pliku do `src/`. Zapis do `src/` przeładowałby kartę
//    gracza przez Live Server przy KAŻDYM przebiegu sweepa (patrz CLAUDE.md, STANDING LESSON).
//    W normalnym uruchomieniu zmiennej nie ma i obowiązuje tabela niżej.
const HARDCODED_BASELINE = process.env.KOSMOS_I18N_BASELINE
  ? JSON.parse(process.env.KOSMOS_I18N_BASELINE)
  : {
  // Zmierzone 2026-08-27, PO naprawie Dziennika. Suma 62 (T1 32 + T2 30) w 11 plikach UI.
  'src/scenes/PlanetScene.js':       9,  // ⚠ LEGACY — `.open`/`.show` NIGDY nie wołane (CLAUDE.md).
                                         //    Napisy NIEOSIĄGALNE; znikną razem z plikiem.
  'src/scenes/TitleScene.js':        5,  // nazwy presetów motywu („AMBER NOIR", „COLD BLUE") —
                                         //    nazwy własne, świadomie nietłumaczone.
  'src/scenes/UIManager.js':        16,  // ⚠ w tym EKRAN KOŃCA GRY — Finding 113, otwarty.
  'src/ui/ColonyOverlay.js':        17,  // ⚠ w tym 3 flashe budowy — znane z arca BRAMKA WŁASNOŚCI.
  'src/ui/EconomyOverlay.js':        1,
  'src/ui/FleetManagerOverlay.js':   5,
  'src/ui/GroundUnitPanel.js':       1,
  'src/ui/IntelOverlay.js':          2,
  'src/ui/PopulationOverlay.js':     1,
  'src/ui/UnitCardPanel.js':         4,
  'src/ui/WarOverlay.js':            1,
};

const hardcodedNew = [];
for (const [rel, n] of [...hardcodedByFile].sort()) {
  const base = HARDCODED_BASELINE[rel] ?? 0;
  if (n > base) hardcodedNew.push(`${rel}: ${n} (baseline ${base}, +${n - base})`);
}
const hardcodedDropped = [];
for (const [rel, base] of Object.entries(HARDCODED_BASELINE)) {
  const n = hardcodedByFile.get(rel) ?? 0;
  if (n < base) hardcodedDropped.push(`${rel}: ${n} (baseline ${base}, −${base - n}) → obniż baseline`);
}

// ── 4. Raport ──
const sep = '─'.repeat(64);
console.log(sep);
console.log('KOSMOS — weryfikacja i18n (t / getName / getDesc / getShort)');
console.log(sep);
console.log(`Zdefiniowane klucze:   pl=${plKeys.size}  en=${enKeys.size}`);
console.log(`Wywołania t():         statyczne=${staticKeys.size} unikalnych, dynamiczne=${dynamicCalls.length} (niesprawdzalne)`);
console.log(`Rodziny dynamiczne:    getName/getDesc prefiksy=[${[...nameDescPrefixes].sort().join(', ') || '—'}]  getShort=${usesGetShort ? 'tak (commodity.*.short)' : 'nie'}`);
console.log('');

const fail = usedUndefinedPL.length > 0 || usedUndefinedEN.length > 0 || hardcodedNew.length > 0;

function block(title, arr, limit = 0) {
  console.log(title.replace('{n}', arr.length));
  const list = limit > 0 ? arr.slice(0, limit) : arr;
  for (const x of list) console.log('   ' + x);
  if (limit > 0 && arr.length > limit) console.log(`   … (+${arr.length - limit} więcej)`);
  console.log('');
}

if (usedUndefinedPL.length) block('[BŁĄD] Użyte-a-NIEZDEFINIOWANE w pl ({n}):', usedUndefinedPL);
else console.log('[OK] Brak kluczy użytych-a-niezdefiniowanych w pl.\n');
if (usedUndefinedEN.length) block('[BŁĄD] Użyte-a-NIEZDEFINIOWANE w en ({n}):', usedUndefinedEN);
else console.log('[OK] Brak kluczy użytych-a-niezdefiniowanych w en.\n');

block('[i] Różnice pl↔en — tylko w pl ({n}):', onlyInPL, 40);
block('[i] Różnice pl↔en — tylko w en ({n}):', onlyInEN, 40);
block('[i] Zdefiniowane-a-nieużyte (informacyjnie, po odfiltrowaniu dynamicznych) ({n}):', definedUnusedPL.sort(), 40);
block('[i] Dynamiczne wywołania t() — niesprawdzalne ({n}):', dynamicCalls.map(d => `${d.loc}  ${d.snippet}`), 25);

// ── Napisy zaszyte w kodzie (Finding 177) ──
const t1 = hardcoded.filter(h => h.tier === 1).length;
const t2 = hardcoded.filter(h => h.tier === 2).length;
console.log(`Napisy ZASZYTE w kodzie (poza t()):  ${hardcoded.length}  (T1 polskie: ${t1}, T2 zdania: ${t2})`);
console.log(`Pliki: ${hardcodedByFile.size}  ·  baseline: ${Object.keys(HARDCODED_BASELINE).length}\n`);
if (hardcodedNew.length) {
  block('[BŁĄD] NOWE napisy zaszyte w kodzie — przenieś do t() albo podnieś baseline świadomie ({n}):', hardcodedNew);
  const worst = hardcoded.filter(h => hardcodedNew.some(n => n.startsWith(h.rel + ':')));
  block('   ↳ próbka z tych plików ({n}):', worst.slice(0, 12).map(h => `${h.rel}:${h.line} [T${h.tier} ${h.kind}] "${h.sample}"`));
} else {
  console.log('[OK] Brak NOWYCH napisów zaszytych w kodzie (zapadka trzyma).\n');
}
if (hardcodedDropped.length) block('[i] Baseline do obniżenia — dług spłacony ({n}):', hardcodedDropped, 20);

console.log(sep);
console.log(fail
  ? (hardcodedNew.length && !usedUndefinedPL.length && !usedUndefinedEN.length
      ? 'WYNIK: FAIL — nowy napis zaszyty w kodzie (przenieś do t())'
      : 'WYNIK: FAIL — napraw klucze użyte-a-niezdefiniowane')
  : 'WYNIK: PASS');
console.log(sep);
process.exit(fail ? 1 : 0);
