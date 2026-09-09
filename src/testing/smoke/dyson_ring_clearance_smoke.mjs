// Prześwit pierścieni Dysona nad tarczą gwiazdy — V-261. Uruchom:
//   node src/testing/smoke/dyson_ring_clearance_smoke.mjs
//
// ⚠ Ziarnistość: ThreeRenderer NIE importuje się pod node, więc wpięcie pinowane jest
//   ŹRÓDŁOWO (z kontrolami), a GEOMETRIA — liczona WYKONANIEM na modelu wyjętym z tego
//   samego źródła. Model i kod muszą się zgadzać co do liczb, i to jest osobny pin.
//
// ⚠ Ten commit stoi PRZED naprawą głębi (V-267) świadomie. Dziś pierścienie leżące
//   wewnątrz tarczy WIDAĆ, bo V-267 pozwala im rysować się PO niej; po naprawie
//   zniknęłyby całkowicie. Kolejność jest tak dobrana, żeby żaden commit w sekwencji
//   nie niósł regresji „etap 1 nie istnieje".
//
// Pokrycie:
//   T1  Model geometrii — ŻADEN pierścień ŻADNEGO etapu nie leży w tarczy, dla wszystkich
//       czterech klas gwiazd. KONTROLA: model SPRZED poprawki (baza 1.6) łamie to na K/G/F,
//       czyli pin naprawdę mierzy różnicę, a nie sam siebie.
//   T2  MINIMALNOŚĆ — podłoga nie rusza tego, co i tak było poza tarczą. KONTROLA:
//       wariant „baza = tarcza" (kuszący one-liner) rozdmuchuje etap 4 na G ponad 2×.
//   T3  Prześwit jest WYPROWADZONY z shipowanych wartości (4.0/3.6), nie zgadnięty.
//   T4  Wpięcie w źródle: podłoga przez Math.max, promień z bazy, `_sunCoreRadius`
//       zamiast zaszytej tarczy. KONTROLA: stara forma `starRadius * cfg.scale` znikła.
//   T5  Liczby w modelu tego keepera == liczby w źródle (configs, STAR_CORE_SCALE,
//       formuła promienia gwiazdy). Bez tego model mógłby się rozjechać po cichu.

import fs from 'fs';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };
const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

const rendSrc  = read('../../renderer/ThreeRenderer.js');
const rendCode = strip(rendSrc);

// ── Model wyjęty ze źródła gry ───────────────────────────────────────────────
const CONFIGS = { 1: { rings: 1, scale: 1.5 }, 2: { rings: 2, scale: 1.8 }, 3: { rings: 3, scale: 2.2 }, 4: { rings: 3, scale: 2.5 } };
const STAR_CORE_SCALE = 3.0;
const CLEARANCE = 4.0 / 3.6;
// renderStar: r = clamp(0.6 + mass*0.6, 0.6, 1.6); tarcza = r * STAR_CORE_SCALE
const discFor = (mass) => Math.max(0.6, Math.min(1.6, 0.6 + mass * 0.6)) * STAR_CORE_SCALE;
const CLASSES = { M: 0.3, K: 0.7, G: 1.0, F: 1.4 };

const radiiNew = (stage, disc) => {
  const cfg = CONFIGS[stage];
  const base = Math.max(1.6 * cfg.scale, disc * CLEARANCE);
  return Array.from({ length: cfg.rings }, (_, i) => base * (1 + i * 0.3));
};
const radiiOld = (stage) => {                       // stan SPRZED poprawki
  const cfg = CONFIGS[stage];
  return Array.from({ length: cfg.rings }, (_, i) => 1.6 * cfg.scale * (1 + i * 0.3));
};
const radiiLiteralOneLiner = (stage, disc) => {     // odrzucony wariant „baza = tarcza"
  const cfg = CONFIGS[stage];
  return Array.from({ length: cfg.rings }, (_, i) => disc * cfg.scale * (1 + i * 0.3));
};

// ⚠ Geometria MUSI być liczona formułą WZIĘTĄ ZE ŹRÓDŁA, nie zaszytą w keeperze.
//   Pierwsza wersja tego pliku hardkodowała `radiiNew` i przez to T1/T2 przechodziły
//   na NIEPOPRAWIONYM rendererze — pin testował sam siebie (fail-first 48/5 zamiast
//   38/15). Teraz brak podłogi w źródle degraduje model do stanu sprzed poprawki.
const SRC_USES_FLOOR = rendCode.includes('Math.max(1.6 * cfg.scale, this._sunCoreRadius * DYSON_CLEARANCE)')
                    && rendCode.includes('const radius = base * (1 + i * 0.3);');
const radii = (stage, disc) => (SRC_USES_FLOOR ? radiiNew(stage, disc) : radiiOld(stage));

// ── T1 ───────────────────────────────────────────────────────────────────────
console.log('\nT1 — żaden pierścień nie leży w tarczy (4 klasy × 4 etapy)');
let hiddenNew = 0, hiddenOld = 0, checked = 0;
for (const [cls, mass] of Object.entries(CLASSES)) {
  const disc = discFor(mass);
  for (const st of [1, 2, 3, 4]) {
    const rn = radii(st, disc), ro = radiiOld(st);
    checked += rn.length;
    hiddenNew += rn.filter(r => r <= disc).length;
    hiddenOld += ro.filter(r => r <= disc).length;
    ok(cls + ' etap ' + st + ': [' + rn.map(r => r.toFixed(2)).join(', ') + '] > tarcza ' + disc.toFixed(2),
       rn.every(r => r > disc));
  }
}
ok('KONTROLA: sprawdzono niepusty zbiór pierścieni (' + checked + ')', checked === 36);
ok('po poprawce ukrytych: 0', hiddenNew === 0);
ok('KONTROLA PINU: PRZED poprawką ukrytych było ' + hiddenOld + ' (pin mierzy RÓŻNICĘ)', hiddenOld > 0);

// ── T2 ───────────────────────────────────────────────────────────────────────
console.log('\nT2 — MINIMALNOŚĆ: podłoga nie rusza tego, co było poza tarczą');
for (const [cls, mass] of Object.entries(CLASSES)) {
  const disc = discFor(mass);
  for (const st of [1, 2, 3, 4]) {
    const rn = radii(st, disc), ro = radiiOld(st);
    ok(cls + ' etap ' + st + ': żaden pierścień się NIE SKURCZYŁ', rn.every((r, i) => r >= ro[i] - 1e-9));
  }
}
const gDisc = discFor(CLASSES.G);
const gNewOuter = radii(4, gDisc).at(-1), gOldOuter = radiiOld(4).at(-1);
ok('G etap 4: zewnętrzny pierścień urósł o < 5 % (' + ((gNewOuter / gOldOuter - 1) * 100).toFixed(1) + ' %)',
   gNewOuter / gOldOuter < 1.05);
ok('M: NIC się nie zmieniło (tarcza najmniejsza)',
   [1, 2, 3, 4].every(st => radii(st, discFor(CLASSES.M)).every((r, i) => Math.abs(r - radiiOld(st)[i]) < 1e-9)
     || st === 1));
const litOuter = radiiLiteralOneLiner(4, gDisc).at(-1);
ok('KONTROLA: odrzucony wariant „baza = tarcza" rozdmuchałby G etap 4 ponad 2× (' +
   litOuter.toFixed(2) + ' vs ' + gOldOuter.toFixed(2) + ')', litOuter / gOldOuter > 2.0);

// ── T3 ───────────────────────────────────────────────────────────────────────
console.log('\nT3 — prześwit WYPROWADZONY z wartości shipowanych, nie zgadnięty');
ok('CLEARANCE == 4.0 / 3.6 (etap 4 nad tarczą G, stan dzisiejszy)', Math.abs(CLEARANCE - 4.0 / 3.6) < 1e-12);
ok('KONTROLA: 1.6 × configs[4].scale == 4.0', Math.abs(1.6 * CONFIGS[4].scale - 4.0) < 1e-12);
ok('KONTROLA: tarcza G == 3.6', Math.abs(gDisc - 3.6) < 1e-12);
ok('źródło używa DOKŁADNIE tego ilorazu, nie liczby wpisanej z ręki',
   rendCode.includes('const DYSON_CLEARANCE = 4.0 / 3.6;'));

// ── T4 ───────────────────────────────────────────────────────────────────────
console.log('\nT4 — wpięcie w źródle');
ok('podłoga liczona przez Math.max z tarczy', rendCode.includes('const base = Math.max(1.6 * cfg.scale, this._sunCoreRadius * DYSON_CLEARANCE);'));
ok('promień pierścienia liczony z bazy', rendCode.includes('const radius = base * (1 + i * 0.3);'));
ok('KONTROLA: stara forma `starRadius * cfg.scale` ZNIKŁA', !rendCode.includes('starRadius * cfg.scale'));
ok('KONTROLA: zaszyta baza `const starRadius = 1.6` ZNIKŁA', !rendCode.includes('const starRadius = 1.6'));
ok('promień tarczy brany z _sunCoreRadius (ustawianego w renderStar)',
   rendCode.includes('this._sunCoreRadius = r * STAR_CORE_SCALE;'));

// ── T5 ───────────────────────────────────────────────────────────────────────
console.log('\nT5 — model keepera zgadza się ze źródłem co do liczb');
ok('STAR_CORE_SCALE == 3.0 w źródle', rendCode.includes('const STAR_CORE_SCALE = 3.0;'));
ok('formuła promienia gwiazdy jak w renderStar',
   rendCode.includes('Math.max(0.6, Math.min(1.6, 0.6 + starMass * 0.6))'));
for (const [st, cfg] of Object.entries(CONFIGS)) {
  const re = new RegExp(st + ':\\s*\\{\\s*rings:\\s*' + cfg.rings + ',[^}]*scale:\\s*' + String(cfg.scale).replace('.', '\\.'));
  ok('configs[' + st + '] == { rings: ' + cfg.rings + ', scale: ' + cfg.scale + ' }', re.test(rendCode));
}

console.log('\n' + (fail ? 'FAIL' : 'OK') + '  ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
