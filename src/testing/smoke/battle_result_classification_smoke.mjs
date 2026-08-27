// Finding 157 — keeper: BITWA O STOLICĘ ZWALNIA CZAS, A NARRATOR JEST JEDEN.
// Plan/audyt: docs/audit/BATTLE_RESULT_CLASSIFICATION_AUDIT.md · rejestr: docs/design/VESSEL_ORDERS_PLAN.md §157.
//
// PO CO: `UIManager:1383` rozpoznawał gracza w bitwie po KONIUNKCJI
//     `p?.type === 'vessel_group' && p?.empireId === 'player'`,
// a obrona orbitalna opisuje gracza jako `{ type: 'player', empireId: 'player' }`
// (`EnemyAttackHandler:181`) ⇒ predykat odpadał na `type`. Filtr powstał w M4 P1 (`b2be101`),
// gdy jedynym producentem bitew „z graczem" była rodzina vessel-combat; W3-7 dostemplował
// `empireId`, żeby domknąć klasę S25 — ale ten konsument pyta TEŻ o `type`, więc stempel go
// nie uratował.
//
// ⚠ SKUTEK BYŁ INNY, NIŻ MÓWIŁ TYTUŁ FINDINGU (pomiar w audycie): klasyfikacja wyniku JEST
//   dowożona — pauzującym banerem `showBattleOutcome` i linią `log.battleLine` z `GameScene`.
//   Brakowało WYŁĄCZNIE auto-slow, bo `vessel:engaged` (jedyne inne wejście auto-slow przy walce)
//   ma dokładnie jednego producenta: `DSCS:395`. Bitwa o stolicę nie zwalniała czasu w ŻADNYM
//   punkcie cyklu życia, a po OK gra wracała do prędkości sprzed bitwy — prosto w desant.
//
// PODPIS W3: auto-slow przez kanon `BattleSides` + WYCOFANA gałąź `log.m4.battleResolved*`
// (`GameScene` jedynym narratorem). Poszerzenie filtru odrzucone — rozmnażałoby drugiego,
// gorszego narratora (surowe `battleId`, `TYPE_MAP.combat` → płaskie `warn` NAWET dla zwycięstwa).
//
// ⚠ GRANICA DOWODU: `UIManager.js` NIE IMPORTUJE SIĘ pod node — po podstawieniu `localStorage`
//   przewraca się na `THREE.TextureLoader is not a constructor` (ta sama ściana co `ColonyOverlay`;
//   stub `three` CELOWO nie wystawia `TextureLoader` i NIE WOLNO go podnosić). Dlatego zachowanie
//   `UIManagera` pinujemy ŹRÓDŁOWO (ze zdejmowaniem komentarzy + kontrolą pinu), a matematykę
//   i lekarstwo — WYKONANIEM.
//
//   T1  WYKONANIE — kanon rozpoznaje gracza w kształcie obrony orbitalnej,
//       + KONTROLA PINU: stary predykat UIManagera na TEJ SAMEJ próbce odpada
//   T2  pin ŹRÓDŁOWY — inwentarz kształtów u TRZECH producentów (EAH, WarSystem ×2, DSCS)
//   T3  pin ŹRÓDŁOWY — `UIManager` pyta kanonem, wąska koniunkcja znikła
//   T4  pin ŹRÓDŁOWY — gałąź narracji WYCOFANA (`log.m4.battleResolved*` + polskie literały)
//   T5  KONTROLA PINU / strażnik NAD-usunięcia — auto-slow ZOSTAJE w tym samym handlerze
//   T6  KONTROLA PINU — `GameScene` nadal JEDYNYM narratorem (nie przenieśliśmy dubletu)
//   T7  WYKONANIE — lekarstwo działa: auto-slow zwalnia, NIE rusza pauzy (Z5), jest idempotentny

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isPlayerParticipant, resolveBattleSides } from '../../utils/BattleSides.js';
import { TimeSystem } from '../../systems/TimeSystem.js';
import EventBus from '../../core/EventBus.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (...p) => readFileSync(join(SRC, ...p), 'utf8');

// ⚠ KOMENTARZE ZDEJMOWANE PRZED SZUKANIEM (memory `source-pin-strip-comments`) — inaczej pin łapie
//   własne wyjaśnienie zostawione w kodzie po usunięciu starej gałęzi.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Ciało handlera `EventBus.on('<event>', …)` — od nagłówka do zamknięcia na tym samym wcięciu. */
function handlerBody(src, event) {
  const head = src.indexOf(`EventBus.on('${event}'`);
  if (head < 0) return '';
  const end = src.indexOf('\n    });', head);
  return end < 0 ? src.slice(head) : src.slice(head, end);
}

/** Wszystkie pliki produkcyjne `src/` (bez słowników i testów). */
function prodFiles(dir = SRC, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === 'i18n' || e === 'testing' || e === 'node_modules') continue;
      prodFiles(p, out);
    } else if (e.endsWith('.js') || e.endsWith('.mjs')) out.push(p);
  }
  return out;
}

// ── T1 — WYKONANIE: kanon vs stary predykat na tej samej próbce ──────────────
console.log('T1 — kanon rozpoznaje gracza w bitwie obrony orbitalnej');
{
  // Kształty DOSŁOWNIE takie, jakie stawiają producenci (pinowane w T2).
  const eahBattle = {
    participantA: { type: 'vessel_group', empireId: 'emp_001', vesselIds: ['v_e1'], label: 'Rajderzy' },
    participantB: { type: 'player', empireId: 'player', systemId: 'sys_home' },
    winner: 'A',
  };
  const dscsBattle = {
    participantA: { type: 'vessel_group', empireId: 'player', vesselIds: ['v_p1'], label: 'Gracz' },
    participantB: { type: 'vessel_group', empireId: 'emp_001', vesselIds: ['v_e2'], label: 'Rajderzy' },
    winner: 'A',
  };
  const abstractBattle = {                                  // forceBattle / _fleetArrived
    participantA: { type: 'empire', empireId: 'emp_001', fleetId: 'f_1', strength: 40 },
    participantB: { type: 'player', empireId: 'player', systemId: 'sys_home' },
    winner: 'B',
  };
  const foreignBattle = {                                   // empire ↔ empire, gracz nieobecny
    participantA: { type: 'vessel_group', empireId: 'emp_001', vesselIds: ['v_a'] },
    participantB: { type: 'vessel_group', empireId: 'emp_002', vesselIds: ['v_b'] },
    winner: 'A',
  };

  const canon = (r) => isPlayerParticipant(r.participantA) || isPlayerParticipant(r.participantB);
  // ⚠ STARY predykat UIManagera, odtworzony dosłownie — bez niego fixture niczego nie różnicuje
  //   (lekcja z `battle_sides_smoke` T2: próbka musi rozdzielać naprawę od defektu).
  const legacy = (r) => {
    const isPlayerSide = (p) => p?.type === 'vessel_group' && p?.empireId === 'player';
    return isPlayerSide(r.participantA) || isPlayerSide(r.participantB);
  };

  assert(canon(eahBattle) === true,  'T1: obrona orbitalna (EAH) → kanon widzi gracza');
  assert(legacy(eahBattle) === false,
    'T1: KONTROLA PINU — stary predykat na TEJ SAMEJ próbce NIE widzi gracza (to był defekt)');
  assert(canon(abstractBattle) === true && legacy(abstractBattle) === false,
    'T1: `forceBattle`/`_fleetArrived` (type=empire vs type=player) — ten sam defekt, trzeci producent');
  assert(canon(dscsBattle) === true && legacy(dscsBattle) === true,
    'T1: DSCS działał i DZIAŁA DALEJ — naprawa niczego nie odbiera ścieżce deep-space');
  assert(canon(foreignBattle) === false,
    'T1: empire ↔ empire → gracz nieobecny, auto-slow się NIE odpala');
  assert(canon({}) === false && canon({ participantA: null, participantB: undefined }) === false,
    'T1: pusty/uszkodzony rekord bitwy nie udaje udziału gracza');

  // Naprawa W3 nie potrzebuje `playerSide` (gałąź narracji znikła) — ale gdyby ktoś ją wskrzesił,
  // kanon zwraca stronę uczciwie, a przy niejednoznaczności `null` (REGUŁA BRAKU).
  assert(resolveBattleSides(eahBattle).playerSide === 'B',
    'T1: kanon przypisuje gracza do strony B w bitwie EAH (gdyby narracja kiedyś wróciła)');
}

// ── T2 — pin ŹRÓDŁOWY: inwentarz kształtów u producentów ────────────────────
console.log('T2 — pin ŹRÓDŁOWY: producenci nadal stemplują tak, jak zakłada naprawa');
{
  const eah  = stripComments(read('systems', 'EnemyAttackHandler.js'));
  const war  = stripComments(read('systems', 'WarSystem.js'));
  const dscs = stripComments(read('systems', 'DeepSpaceCombatSystem.js'));

  assert(eah.length > 1000 && war.length > 1000 && dscs.length > 1000,
    'T2: KONTROLA PINU — trzy pliki producentów faktycznie wczytane (nie pusty string)');
  assert(/participantB:\s*\{\s*type:\s*'player'/.test(eah),
    'T2: EAH opisuje gracza jako `type: player` — to jest kształt, który odpadał na starym filtrze');
  assert((war.match(/type:\s*'player',\s*empireId:\s*'player'/g) ?? []).length === 2,
    'T2: WarSystem ma DWA takie stemple (forceBattle + _fleetArrived) — zasięg to trzej producenci');
  assert((dscs.match(/type:\s*'vessel_group'/g) ?? []).length === 2,
    'T2: DSCS stawia OBU uczestników jako `vessel_group` (dlatego stary filtr tam działał)');
  // Jedyne inne wejście auto-slow przy walce — jeśli producentów przybędzie, ten pin ma zapłonąć.
  assert((dscs.match(/emit\('vessel:engaged'/g) ?? []).length === 1,
    'T2: `vessel:engaged` ma DOKŁADNIE JEDNEGO producenta (DSCS) — EAH nie ma czym zwolnić czasu');
}

// ── T3 — pin ŹRÓDŁOWY: UIManager pyta kanonem ───────────────────────────────
console.log('T3 — pin ŹRÓDŁOWY: `UIManager` rozpoznaje gracza kanonem, nie koniunkcją');
{
  const raw = read('scenes', 'UIManager.js');
  const ui  = stripComments(raw);
  // ⚠ Marker kontroli pinu wzięty z komentarza, który istnieje PRZED i PO naprawie — inaczej
  //   „kontrola pinu" mierzyłaby samą naprawę, a nie sprawność strippera.
  assert(raw.includes('Sensor proximity contact') && !ui.includes('Sensor proximity contact'),
    'T3: KONTROLA PINU — stripComments zdejmuje komentarze…');
  assert(ui.includes("EventBus.on('battle:resolved'"),
    'T3: …a treści kodu nie zjada (handler bitwy na miejscu)');

  const body = handlerBody(ui, 'battle:resolved');
  assert(body.length > 0, 'T3: KONTROLA PINU — ciało handlera wyodrębnione');
  assert(/isPlayerParticipant\s*\(/.test(body),
    'T3: udział gracza liczony KANONEM (`isPlayerParticipant`)');
  assert(!/vessel_group/.test(body),
    'T3: wąska koniunkcja `type === vessel_group && empireId === player` ZNIKŁA z handlera');
  assert(/import\s*\{[^}]*isPlayerParticipant[^}]*\}\s*from\s*'\.\.\/utils\/BattleSides\.js'/.test(ui),
    'T3: kanon importowany z `utils/BattleSides.js`, a nie skopiowany na miejscu');
}

// ── T4 — pin ŹRÓDŁOWY: gałąź narracji wycofana ──────────────────────────────
console.log('T4 — pin ŹRÓDŁOWY: drugi narrator wycofany (W3)');
{
  // Przejdź CAŁE `src/` z pominięciem słowników i testów — klucz ma stracić WSZYSTKICH konsumentów.
  const files = prodFiles();
  assert(files.length > 100, `T4: KONTROLA PINU — przeszukano realny zbiór plików (${files.length})`);

  const users = files.filter(f => stripComments(readFileSync(f, 'utf8')).includes('log.m4.battleResolved'));
  assert(users.length === 0,
    `T4: klucze log.m4.battleResolved* nie mają już ANI JEDNEGO konsumenta (znaleziono ${users.length})`);

  const ui = stripComments(read('scenes', 'UIManager.js'));
  const body = handlerBody(ui, 'battle:resolved');
  assert(!/battleResolved/.test(body),
    'T4: handler nie pisze już drugiej linii o bitwie — narratorem jest `GameScene`');
  assert(!/'gracz'|'wróg'/.test(body),
    'T4: Z4 — polskie literały `gracz`/`wróg` wstrzykiwane do klucza i18n ZNIKŁY razem z gałęzią');

  // Słowniki zostają nietknięte (osierocone klucze nie łamią `check-i18n`); pin pilnuje, że
  // wycofanie gałęzi nie przerodziło się w kasowanie i18n bez decyzji.
  const pl = read('i18n', 'pl.js'), en = read('i18n', 'en.js');
  assert(/'log\.m4\.battleResolvedVictory'/.test(pl) && /'log\.m4\.battleResolvedVictory'/.test(en),
    'T4: klucze zostają w OBU słownikach (skasowanie = osobna higiena, poza tym podpisem)');
}

// ── T5 — KONTROLA PINU: auto-slow ZOSTAJE ───────────────────────────────────
console.log('T5 — strażnik NAD-usunięcia: lekarstwo nie wyleciało razem z gałęzią');
{
  const ui = stripComments(read('scenes', 'UIManager.js'));
  const body = handlerBody(ui, 'battle:resolved');
  assert(/_triggerAutoSlowIfTime\s*\(\s*t\(\s*'log\.autoSlowBattle'\s*\)\s*\)/.test(body),
    'T5: handler bitwy NADAL woła auto-slow — to jest cała wartość tego slice’u');
  const pl = read('i18n', 'pl.js'), en = read('i18n', 'en.js');
  assert(/'log\.autoSlowBattle'/.test(pl) && /'log\.autoSlowBattle'/.test(en),
    'T5: powód auto-slow ma klucz w OBU językach');
}

// ── T6 — KONTROLA PINU: GameScene jedynym narratorem ────────────────────────
console.log('T6 — kontrola pinu: narracja nie przeniosła się w inne miejsce');
{
  const scene = stripComments(read('scenes', 'GameScene.js'));
  assert((scene.match(/t\(\s*'log\.battleLine'/g) ?? []).length === 1,
    'T6: `log.battleLine` ma DOKŁADNIE JEDNEGO producenta (nie zdublowaliśmy narratora)');
  assert((scene.match(/resolveBattleSides\s*\(/g) ?? []).length === 2,
    'T6: oba listenery sceny nadal liczą strony kanonem (naprawa 155 nietknięta)');
}

// ── T7 — WYKONANIE: co robi samo lekarstwo ──────────────────────────────────
console.log('T7 — WYKONANIE: auto-slow zwalnia czas i NIE rusza pauzy (Z5)');
{
  EventBus.clear?.();
  const ts = new TimeSystem();
  ts._autoSlowEnabled = true;

  ts.setMultiplier(ts.multipliers.length - 1);
  const fast = ts.multiplierIndex;
  ts.pause();
  assert(ts.isPaused === true && fast > 1, `T7: przygotowanie — gra zapauzowana przy indeksie ${fast}`);

  ts._triggerAutoSlow('test');
  assert(ts.multiplierIndex === 1,
    'T7: auto-slow schodzi na 1 d/s — po zamknięciu banera gra NIE wraca do prędkości sprzed bitwy');
  assert(ts.isPaused === true,
    'T7: Z5 — `setMultiplier` NIE dotyka pauzy, więc kolejność wobec modalu jest nieistotna');

  ts._triggerAutoSlow('test-2');
  assert(ts.multiplierIndex === 1,
    'T7: idempotentne (guard `multiplierIndex <= 1`) — DSCS dostaje je dwukrotnie bez szkody');

  // ⚠ ZASTRZEŻENIE DO NASTĘPNEJ ASERCJI (live-gate 2026-08-27, krok 4 — Finding 164).
  //   Guard `_autoSlowEnabled` DZIAŁA, ale jest to **gałąź BEZ WEJŚCIA W GRZE**: zdarzenie
  //   `time:autoSlowToggle` ma w `TimeSystem:34` handler i **ZERO producentów w całym `src/`**
  //   (pin niżej), a `_autoSlowEnabled` nie jest serializowane ⇒ w normalnej rozgrywce jest
  //   **zawsze `true`** i gracz nie ma jak go zgasić. Ta asercja pinuje więc MODEL, nie wybór
  //   gracza — i dokładnie dlatego NIE WOLNO jej cytować jako „kontroli pinu na żywym silniku"
  //   (mój błąd na gate'cie: krok 4 kazał właścicielowi wyłączyć przełącznik, którego nie ma;
  //   menu ma „Auto-pauza…", czyli INNY system — `AutoPauseSystem`, bez `battle:resolved`).
  ts._autoSlowEnabled = false;
  ts.setMultiplier(fast);
  ts._triggerAutoSlow('test-3');
  assert(ts.multiplierIndex === fast,
    'T7: guard `_autoSlowEnabled` działa NA POZIOMIE MODELU (⚠ gałąź bez wejścia w grze — F164)');
  EventBus.clear?.();

  // Pin samego odkrycia: jeśli ktoś kiedyś podłączy przełącznik, ten pin ma ZAPŁONĄĆ i kazać
  // przenieść asercję wyżej z „modelu" na „wolę gracza" (oraz zamknąć Finding 164).
  const emitters = prodFiles().filter(f =>
    stripComments(readFileSync(f, 'utf8')).includes("emit('time:autoSlowToggle'"));
  assert(emitters.length === 0,
    `T7: F164 — przełącznik auto-slow nie ma ANI JEDNEGO producenta (${emitters.length}); ` +
    'handler w `TimeSystem` czeka na nadawcę, który nie istnieje');
  assert(stripComments(read('systems', 'TimeSystem.js')).includes("EventBus.on('time:autoSlowToggle'"),
    'T7: KONTROLA PINU — handler przełącznika JEST na miejscu (czyli mierzymy brak nadawcy, nie literówkę)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
