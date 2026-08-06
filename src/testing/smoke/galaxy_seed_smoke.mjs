// GALAXY_SEED (WOJNA I POKÓJ 1.0, mini-stream między D1 a D2) — smoke: losowy seed
// galaktyki przy „Nowa gra", utrwalany w zapisie.
// Uruchom: node src/testing/smoke/galaxy_seed_smoke.mjs
//
// Pokrywa: kontrakt `GalaxyGenerator.generate(seed, …)` (jawny seed, nie star.id),
// `mintSeed()`, determinizm PRZY DANYM seedzie, round-trip przez kształt zapisu,
// niezmienniki (72 układy, id `sys_NNN`), pin harnessu (HEADLESS_GALAXY_SEED) oraz
// dwa niezmienniki STRUKTURALNE czytane wprost ze źródeł: mint tylko pod `isNewGame`
// (R2) i brak mintowania w headless (R1).
//
// ⚠ Kontrakt determinizmu brzmi „deterministyczne PRZY DANYM seedzie", NIE „identyczne
// między nowymi grami". Dlatego T4 wymaga RÓŻNIC dla różnych seedów, a T3/T6 wymagają
// IDENTYCZNOŚCI dla tego samego seeda. Jedno bez drugiego nie jest testem.
//
// ⚠ KOLORY I ARCHETYPY imperiów NIE pochodzą z seeda (kolor z archetypu,
// `AI_ARCHETYPE_SEQUENCE[i]` po indeksie pętli) — T7 pinuje to WPROST, żeby
// „kolory się nie zmieniły" nigdy więcej nie trafiło do zgłoszeń jako defekt.

import '../headless/env.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

const fs   = await import('node:fs');
const path = await import('node:path');
const { fileURLToPath } = await import('node:url');

// Ścieżki liczone od TEGO pliku, nie od CWD — suita ma działać uruchomiona z dowolnego
// katalogu (run-all.mjs dziedziczy CWD wywołującego; `path.resolve('src')` dawałoby ENOENT).
const REPO_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const { GalaxyGenerator } = await import('../../generators/GalaxyGenerator.js');
const { EmpireGenerator } = await import('../../generators/EmpireGenerator.js');
const { HEADLESS_GALAXY_SEED } = await import('../headless/GameCore.js');

const SYSTEM_COUNT = 72;
const hashString = (str) => { let h = 0; for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0; return h; };

// ── T1: mintSeed — entropia + int32 (R4) ────────────────────────────────────
console.log('--- T1: mintSeed (entropia wchodzi RAZ, int32) ---');
{
  const N = 200;
  const seeds = Array.from({ length: N }, () => GalaxyGenerator.mintSeed());

  ok('mintSeed zwraca liczby całkowite', seeds.every(s => Number.isInteger(s)));
  ok('każdy seed mieści się w int32 (s | 0 === s)', seeds.every(s => (s | 0) === s));
  ok('zakres int32 ze znakiem', seeds.every(s => s >= -2147483648 && s <= 2147483647));

  // Sedno defektu: seed NIE MOŻE być stały. Przy 2^32 możliwości 200 losowań powinno
  // dać ~200 unikatów; próg 190 zostawia zapas na kolizje, ale łapie degenerację.
  ok(`seed NIE jest stały — ${new Set(seeds).size}/${N} unikatów`, new Set(seeds).size >= 190);
  ok('żaden zmintowany seed nie jest starym stałym −2102099243',
    seeds.every(s => s !== -2102099243));

  // Ujemne seedy są POPRAWNE i muszą się zdarzać (mulberry32 robi `seed | 0`).
  // Brak ujemnych = mint gubi znak → połowa przestrzeni seedów nieosiągalna.
  ok('mint pokrywa obie połowy przestrzeni (są i dodatnie, i ujemne)',
    seeds.some(s => s < 0) && seeds.some(s => s > 0));

  // ⚠ SZEROKOŚĆ entropii, nie tylko „niestałość". Same unikaty NIE odróżniają 2^32 od
  // 2^16: mint 16-bitowy też dałby ~200 unikatów i oba znaki. Rozróżnia dopiero GÓRNA
  // połówka słowa — dla mintu 16-bitowego `s >>> 16` przyjmuje raptem 2 wartości
  // (0 dla dodatnich, 0xFFFF dla ujemnych), a dla pełnego 32-bitowego ~wszystkie różne.
  const hi16 = new Set(seeds.map(s => s >>> 16));
  ok(`entropia obejmuje GÓRNE 16 bitów — ${hi16.size} różnych wartości s>>>16 na ${N} (mint 16-bitowy dałby 2)`,
    hi16.size >= 100);
  const lo16 = new Set(seeds.map(s => s & 0xffff));
  ok(`…i dolne 16 bitów — ${lo16.size} różnych wartości`, lo16.size >= 100);
}

// ── T2: kontrakt — jawny seed, loud-fail na star.id ─────────────────────────
console.log('--- T2: kontrakt generate(seed, …) — loud-fail zamiast cichej degeneracji ---');
{
  // ⚠ `didThrow` ODDZIELNIE od typu błędu. Gdyby jedno pole zwracało „false" i przy
  // braku rzutu, i przy rzucie innego typu, asercje NEGATYWNE („nie rzuca") przechodziłyby
  // na implementacji, która rzuca RangeError na legalnym seedzie — a seed ujemny to tu
  // przypadek NORMALNY (mintSeed zwraca int32 ze znakiem).
  const call = (arg) => {
    try { GalaxyGenerator.generate(arg, 'Sol', 'G'); return { didThrow: false, isTypeError: false }; }
    catch (e) { return { didThrow: true, isTypeError: e instanceof TypeError }; }
  };
  const throwsTypeError = (arg) => { const r = call(arg); return r.didThrow && r.isTypeError; };
  const doesNotThrow    = (arg) => call(arg).didThrow === false;

  ok('generate("entity_1") RZUCA TypeError (stary sposób wywołania nie przechodzi po cichu)', throwsTypeError('entity_1'));
  ok('generate(undefined) RZUCA TypeError', throwsTypeError(undefined));
  ok('generate(null) RZUCA TypeError', throwsTypeError(null));
  ok('generate(NaN) RZUCA TypeError', throwsTypeError(NaN));
  ok('generate(Infinity) RZUCA TypeError', throwsTypeError(Infinity));
  ok('generate(0) NIE rzuca NICZEGO (0 to legalny seed, nie „brak seeda")', doesNotThrow(0));
  ok('seed ujemny NIE rzuca NICZEGO (to normalny przypadek, nie błąd)', doesNotThrow(-2102099243));

  // Normalizacja do int32: utrwalony seed = ten UŻYTY przez PRNG, nie surowy argument.
  const g = GalaxyGenerator.generate(12345.9, 'Sol', 'G');
  ok('float jest normalizowany do int32 w ZWROTCE', g.seed === 12345);
  ok('galaktyka z float === galaktyka z jego int32 (ta sama wartość zjedzona przez PRNG)',
    JSON.stringify(g) === JSON.stringify(GalaxyGenerator.generate(12345, 'Sol', 'G')));
}

// ── T3: ten sam seed ⇒ identyczna galaktyka ─────────────────────────────────
console.log('--- T3: determinizm PRZY DANYM seedzie ---');
{
  for (const seed of [12345, -2102099243, 0, 999999, 2147483647]) {
    const a = GalaxyGenerator.generate(seed, 'Sol', 'G');
    const b = GalaxyGenerator.generate(seed, 'Sol', 'G');
    ok(`seed ${seed}: dwa wywołania dają IDENTYCZNĄ galaktykę`, JSON.stringify(a) === JSON.stringify(b));
  }
  ok('zwrócony seed === seed podany', GalaxyGenerator.generate(4242, 'Sol', 'G').seed === 4242);
  ok('pole `seed` jest częścią zwrotki (bez niego nie ma czego utrwalić)',
    Object.prototype.hasOwnProperty.call(GalaxyGenerator.generate(1, 'Sol', 'G'), 'seed'));
}

// ── T4: różne seedy ⇒ różne galaktyki ───────────────────────────────────────
console.log('--- T4: różne seedy ⇒ różne nazwy/pozycje gwiazd ---');
{
  const SEEDS = [12345, 777, 999999, 4242, -2102099243, 31337, 1, 20260806];
  const galaxies = SEEDS.map(s => GalaxyGenerator.generate(s, 'Sol', 'G'));

  const nameSigs = galaxies.map(g => g.systems.filter(s => !s.isHome).map(s => s.name).join('|'));
  ok(`nazwy gwiazd różnią się między seedami — ${new Set(nameSigs).size}/${SEEDS.length} unikatowych układów nazw`,
    new Set(nameSigs).size === SEEDS.length);

  const posSigs = galaxies.map(g => g.systems.filter(s => !s.isHome).map(s => `${s.x},${s.y},${s.z}`).join('|'));
  ok('pozycje gwiazd różnią się między seedami', new Set(posSigs).size === SEEDS.length);

  const specSigs = galaxies.map(g => g.systems.filter(s => !s.isHome).map(s => s.spectralType).join(''));
  ok('typy spektralne różnią się między seedami', new Set(specSigs).size > 1);

  // Home system gracza NIE zależy od seeda galaktyki (nazwa/typ z argumentów).
  ok('home system pozostaje tym samym wpisem niezależnie od seeda',
    galaxies.every(g => { const h = g.systems.find(s => s.isHome); return h.id === 'sys_home' && h.name === 'Sol' && h.spectralType === 'G'; }));
}

// ── T5: niezmienniki — 72 układy, id pozycyjne `sys_NNN` (Korekta 3) ────────
console.log('--- T5: niezmienniki galaktyki (liczba układów + id pozycyjne) ---');
{
  const SEEDS = [12345, 777, 0, -1, 999999, 2147483647, -2147483648, 31337];
  const galaxies = SEEDS.map(s => GalaxyGenerator.generate(s, 'Sol', 'G'));

  ok(`ZAWSZE ${SYSTEM_COUNT} układów, niezależnie od seeda`,
    galaxies.every(g => g.systems.length === SYSTEM_COUNT));

  const expectedIds = ['sys_home', ...Array.from({ length: SYSTEM_COUNT - 1 }, (_, i) => `sys_${String(i + 1).padStart(3, '0')}`)];
  ok('id układów są POZYCYJNE i identyczne dla każdego seeda (kontrakt save/restore)',
    galaxies.every(g => g.systems.map(s => s.id).join(',') === expectedIds.join(',')));

  // Losowy mint też musi trzymać niezmienniki (nie tylko ręcznie dobrane seedy).
  const minted = Array.from({ length: 25 }, () => GalaxyGenerator.generate(GalaxyGenerator.mintSeed(), 'Sol', 'G'));
  ok('25 losowo zmintowanych galaktyk: każda ma 72 układy i te same id',
    minted.every(g => g.systems.length === SYSTEM_COUNT && g.systems.map(s => s.id).join(',') === expectedIds.join(',')));
}

// ── T6: round-trip przez kształt zapisu + R2 (mint RAZ, potem stabilnie) ────
console.log('--- T6: round-trip zapisu — seed przeżywa i NIE jest derywowany ponownie ---');
{
  // Odwzorowanie ścieżki produkcyjnej: SaveSystem serializuje CAŁE galaxyData
  // (`galaxyData: window.KOSMOS.galaxyData ?? null`), GameScene przypisuje je z powrotem.
  const fresh = GalaxyGenerator.generate(GalaxyGenerator.mintSeed(), 'Sol', 'G');
  const saved = JSON.parse(JSON.stringify({ civ4x: { galaxyData: fresh } }));

  ok('seed przeżywa serializację JSON', saved.civ4x.galaxyData.seed === fresh.seed);
  ok('cała galaktyka przeżywa round-trip', JSON.stringify(saved.civ4x.galaxyData) === JSON.stringify(fresh));

  // Gałąź wczytania z GameScene — dosłownie: `isNewGame` false ⇒ bierzemy z pliku.
  const loadGalaxy = (savedData) => {
    const isNewGame = !savedData?.civ4x?.galaxyData;
    return isNewGame
      ? GalaxyGenerator.generate(GalaxyGenerator.mintSeed(), 'Sol', 'G')
      : savedData.civ4x.galaxyData;
  };
  const load1 = loadGalaxy(saved);
  const load2 = loadGalaxy(JSON.parse(JSON.stringify(saved)));
  ok('wczytanie tego samego pliku DWA RAZY daje identyczną galaktykę (R2)',
    JSON.stringify(load1) === JSON.stringify(load2) && load1.seed === fresh.seed);

  // Decyzja 6 — zapis BEZ galaxyData (spoza trybu 4X / sprzed v20): mint RAZ, a
  // po utrwaleniu plik jest już powtarzalny.
  const legacy = { civ4x: null };
  const firstLoad = loadGalaxy(legacy);
  ok('zapis bez galaxyData dostaje ŚWIEŻĄ galaktykę (Decyzja 6)', typeof firstLoad.seed === 'number');
  const persisted = JSON.parse(JSON.stringify({ civ4x: { galaxyData: firstLoad } }));
  ok('…a po utrwaleniu kolejne wczytania są już STABILNE',
    JSON.stringify(loadGalaxy(persisted)) === JSON.stringify(firstLoad));

  // Odtworzenie z samego zapisanego seeda musi dać tę samą galaktykę — to jest
  // dowód, że nic w galaxyData nie zależy od źródła entropii poza seedem.
  ok('regeneracja z ZAPISANEGO seeda odtwarza galaktykę bit w bit',
    JSON.stringify(GalaxyGenerator.generate(saved.civ4x.galaxyData.seed, 'Sol', 'G')) === JSON.stringify(fresh));
}

// ── T7: konsument seeda — imperia AI (home-systemy TAK, kolory NIE) ────────
console.log('--- T7: EmpireGenerator — co seed zmienia, a czego NIE (Korekta 1) ---');
{
  const gameState = (await import('../../core/GameState.js')).default;
  const runEmpires = (seed) => {
    gameState.reset();
    const captured = [];
    const registryStub = { createEmpire: (p) => { captured.push({ ...p }); return p; } };
    EmpireGenerator.generate(GalaxyGenerator.generate(seed, 'Sol', 'G'), registryStub);
    return captured;
  };

  const SEEDS = [12345, 777, 999999, 4242, 31337, 20260806, 1, 2026];
  const runs = SEEDS.map(runEmpires);
  ok('każdy seed spawnuje imperia', runs.every(r => r.length >= 2));

  // ⚠ Progi ŚCISŁE, nie `> 1`. „Choć dwie różne wartości na 8 seedów" przepuściłoby
  // częściową re-degenerację (7 z 8 seedów zwinięte do jednej wartości) — a to jest
  // dokładnie defekt, który ta zmiana naprawia. Zmierzone: 8/8 dla home i nazw.
  const homeSigs = runs.map(r => r.map(e => e.homeSystemId).join('|'));
  ok(`home-systemy AI RÓŻNIĄ SIĘ dla KAŻDEGO seeda — ${new Set(homeSigs).size}/${SEEDS.length} unikatów`,
    new Set(homeSigs).size === SEEDS.length);

  const nameSigs = runs.map(r => r.map(e => e.name).join('|'));
  ok(`nazwy imperiów RÓŻNIĄ SIĘ dla KAŻDEGO seeda — ${new Set(nameSigs).size}/${SEEDS.length} unikatów`,
    new Set(nameSigs).size === SEEDS.length);

  // objective: tylko 6 wartości w katalogu, więc kolizja pary jest NORMALNA i próg musi
  // ją tolerować (jakość samego rzutu pinuje blok G3 w `empire_objective_smoke` na 120
  // seedach). Zmierzone 8/8; próg 6 wyklucza zwinięcie, nie karząc za przypadek.
  const objSigs = runs.map(r => r.map(e => e.objective).join('|'));
  ok(`objective RÓŻNI SIĘ między seedami — ${new Set(objSigs).size}/${SEEDS.length} unikatów `
    + '(defekt z live-gate D1 zamknięty u ŹRÓDŁA)', new Set(objSigs).size >= 6);

  // ⚠ NIE-defekt: kolory i archetypy pochodzą z ARCHETYPU (indeks pętli), nie z seeda.
  // Ten pin jest po to, żeby „kolory się nie zmieniły" nie było zgłaszane jako błąd.
  const colorSigs = runs.map(r => r.map(e => e.color).join('|'));
  ok(`KOLORY imperiów są IDENTYCZNE dla wszystkich seedów — to NIE jest defekt (${colorSigs[0]})`,
    new Set(colorSigs).size === 1);
  const archSigs = runs.map(r => r.map(e => e.archetype).join('|'));
  ok('ARCHETYPY imperiów są IDENTYCZNE dla wszystkich seedów — to NIE jest defekt',
    new Set(archSigs).size === 1);
  const idSigs = runs.map(r => r.map(e => e.id).join('|'));
  ok('id imperiów (emp_001, emp_002…) są IDENTYCZNE — pozycyjne, nie z seeda',
    new Set(idSigs).size === 1);

  ok('ten sam seed → te same imperia (determinizm konsumenta)',
    JSON.stringify(runEmpires(12345).map(e => [e.id, e.name, e.homeSystemId, e.objective]))
    === JSON.stringify(runs[0].map(e => [e.id, e.name, e.homeSystemId, e.objective])));
}

// ── T8: pin harnessu (R1/R3) ────────────────────────────────────────────────
console.log('--- T8: HEADLESS_GALAXY_SEED — reprodukowalność headless ---');
{
  ok('HEADLESS_GALAXY_SEED jest liczbą int32', Number.isInteger(HEADLESS_GALAXY_SEED) && (HEADLESS_GALAXY_SEED | 0) === HEADLESS_GALAXY_SEED);
  // R3: pin = DOKŁADNIE seed sprzed GALAXY_SEED, więc baseline'y BALANS zostają bit w bit.
  ok('pin === hashString("entity_1") — headless dostaje tę samą galaktykę co przed zmianą',
    HEADLESS_GALAXY_SEED === hashString('entity_1'));
  ok('…czyli −2102099243', HEADLESS_GALAXY_SEED === -2102099243);
}

// ── T9: niezmienniki STRUKTURALNE czytane ze źródeł (R1/R2) ────────────────
// Tego nie da się sprawdzić wywołaniem: „mint tylko pod isNewGame" to własność
// KSZTAŁTU kodu, nie wyniku funkcji. Czytamy więc źródła — wzór z `empire_objective_smoke`
// (blok D3), który tak samo skanuje `src/` w poszukiwaniu naruszeń kontraktu.
console.log('--- T9: niezmienniki strukturalne (mint tylko pod isNewGame; headless nie mintuje) ---');
{
  const read = (...rel) => fs.readFileSync(path.join(REPO_SRC, ...rel), 'utf8');

  // Wytnij blok `{ … }` zaczynający się na podanym indeksie, licząc nawiasy klamrowe.
  // Okno o STAŁEJ długości (np. 400 znaków) przecinałoby blok w przypadkowym miejscu:
  // raz przepuszczając regresję za granicą okna, raz failując przez niewinny komentarz.
  const blockAt = (src, iBrace) => {
    if (iBrace < 0 || src[iBrace] !== '{') return '';
    let depth = 0;
    for (let i = iBrace; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) return src.slice(iBrace, i + 1);
    }
    return '';
  };

  const gameScene = read('scenes', 'GameScene.js');
  const mintHits = (gameScene.match(/GalaxyGenerator\.mintSeed\(/g) ?? []).length;
  ok('GameScene mintuje DOKŁADNIE raz', mintHits === 1);

  const iIf   = gameScene.indexOf('if (isNewGame) {', gameScene.indexOf('const isNewGame = !savedData?.civ4x?.galaxyData;'));
  const newBranch  = blockAt(gameScene, gameScene.indexOf('{', iIf));
  const iElse = iIf >= 0 ? gameScene.indexOf('} else {', iIf) : -1;
  const loadBranch = blockAt(gameScene, iElse >= 0 ? iElse + '} else '.length : -1);

  ok('gałąź isNewGame istnieje i daje się wyciąć po nawiasach', newBranch.length > 0);
  ok('gałąź wczytania istnieje i daje się wyciąć po nawiasach', loadBranch.length > 0);
  ok('mint leży WEWNĄTRZ gałęzi isNewGame (R2)', newBranch.includes('GalaxyGenerator.mintSeed('));
  // Sam mint nie wystarcza — wynik MUSI trafić do galaxyData, inaczej nie ma czego utrwalić.
  ok('gałąź isNewGame PRZYPISUJE wynik do window.KOSMOS.galaxyData',
    /window\.KOSMOS\.galaxyData\s*=\s*GalaxyGenerator\.generate\(/.test(newBranch));
  ok('gałąź wczytania NIE woła generatora ani mintu (zero re-derywacji)',
    !loadBranch.includes('GalaxyGenerator.'));
  ok('gałąź wczytania bierze galaktykę WPROST z zapisu',
    /window\.KOSMOS\.galaxyData\s*=\s*savedData\.civ4x\.galaxyData/.test(loadBranch));

  // ⚠ DRUGA POŁOWA mitygacji R2: „mint tylko raz" jest nic nie warte, jeśli wynik nie
  // JEDZIE DO ZAPISU. Plan wymienia `SaveSystem.js:218` jako świadomie NIETKNIĘTY — i
  // właśnie dlatego wymaga pinu: gdyby serializacja kiedyś zgubiła `galaxyData` (albo
  // dostała whitelistę pól), KAŻDE wczytanie wracałoby do gałęzi isNewGame i mintowało
  // od nowa, a ta suita bez tej asercji dalej świeciłaby na zielono.
  const saveSystem = read('systems', 'SaveSystem.js');
  ok('SaveSystem serializuje CAŁE galaxyData (persystencja seeda — druga połowa R2)',
    /galaxyData:\s*window\.KOSMOS\.galaxyData/.test(saveSystem));

  // ⚠ ZNANE OGRANICZENIE, spinowane celowo, żeby nie było cichym założeniem:
  // `galaxyData` mieszka WEWNĄTRZ bloku `civ4x`, a `_serializeCiv4x()` zwraca `null`
  // przy `civMode === false`. Zapis zrobiony POZA trybem 4X (i zapis sprzed v20, który
  // `_migrateV19toV20` zeruje) NIE utrwala więc seeda — taki plik mintuje przy każdym
  // wczytaniu, dopóki gracz nie wejdzie w tryb 4X. To jest WĘŻSZE niż Decyzja 6.
  // Gdy ten pin padnie, znaczy to, że ograniczenie zniknęło → zaktualizuj komentarz
  // w GameScene i Decyzję 6 w GALAXY_SEED_PLAN.
  ok('ZNANE: persystencja galaxyData jest bramkowana civMode (`_serializeCiv4x` → null)',
    /_serializeCiv4x\(\)\s*\{\s*\n\s*if\s*\(!window\.KOSMOS\?\.civMode\)\s*return null;/.test(saveSystem));

  const gameCore = read('testing', 'headless', 'GameCore.js');
  ok('headless NIGDY nie mintuje (R1 — brak mintSeed w GameCore)', !gameCore.includes('mintSeed'));
  ok('headless podaje seed jawnym parametrem boot({ galaxySeed })', gameCore.includes('galaxySeed = HEADLESS_GALAXY_SEED'));

  // Decyzja 3: pin ma być JAWNY w każdym wejściu BALANS/botów, nie odziedziczony po domyślce.
  const single = read('testing', 'runner', 'SingleGame.js');
  ok('runner botów (SingleGame) PINUJE seed galaktyki jawnie (Decyzja 3, R3)',
    single.includes('galaxySeed: HEADLESS_GALAXY_SEED'));
  // Spread bootOptions MUSI iść po pinie, inaczej panel nie mógłby go nadpisać.
  ok('…a `...bootOptions` idzie PO pinie (panel może nadpisać)',
    single.indexOf('galaxySeed: HEADLESS_GALAXY_SEED') < single.indexOf('...bootOptions'));
  for (const driver of ['balans-driver.mjs', 'balans-gate2-report.mjs']) {
    ok(`panel BALANS ${driver} PINUJE seed galaktyki jawnie (Decyzja 3)`,
      read('testing', 'headless', driver).includes('galaxySeed: HEADLESS_GALAXY_SEED'));
  }

  // Regresja na powrót starego defektu: generator nie może znów derywować z id gwiazdy.
  const generator = read('generators', 'GalaxyGenerator.js');
  ok('GalaxyGenerator nie ma już derywacji hashString (stary defekt nie wróci)',
    !/function\s+hashString|hashString\s*=/.test(generator));
  ok('…i nie przyjmuje `starId` jako pierwszego argumentu', !/static generate\(\s*star/.test(generator));
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
