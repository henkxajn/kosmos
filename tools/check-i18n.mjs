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
//   (c) raportuje:
//       - [BŁĄD]  użyte-a-niezdefiniowane (w pl i/lub en) — to blokuje (exit 1)
//       - [i]     zdefiniowane-a-nieużyte (informacyjnie; NIC nie kasujemy)
//       - [i]     różnice pl vs en (klucz tylko w jednym słowniku)
//       - [i]     dynamiczne wywołania t() + rodziny getName/getDesc/getShort
//
// Warunek zaliczenia (exit 0): zero kluczy użytych-a-niezdefiniowanych w pl I en.

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

// ── 4. Raport ──
const sep = '─'.repeat(64);
console.log(sep);
console.log('KOSMOS — weryfikacja i18n (t / getName / getDesc / getShort)');
console.log(sep);
console.log(`Zdefiniowane klucze:   pl=${plKeys.size}  en=${enKeys.size}`);
console.log(`Wywołania t():         statyczne=${staticKeys.size} unikalnych, dynamiczne=${dynamicCalls.length} (niesprawdzalne)`);
console.log(`Rodziny dynamiczne:    getName/getDesc prefiksy=[${[...nameDescPrefixes].sort().join(', ') || '—'}]  getShort=${usesGetShort ? 'tak (commodity.*.short)' : 'nie'}`);
console.log('');

const fail = usedUndefinedPL.length > 0 || usedUndefinedEN.length > 0;

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

console.log(sep);
console.log(fail ? 'WYNIK: FAIL — napraw klucze użyte-a-niezdefiniowane' : 'WYNIK: PASS');
console.log(sep);
process.exit(fail ? 1 : 0);
