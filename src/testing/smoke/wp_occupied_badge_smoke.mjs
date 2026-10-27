// WP-4 / C2 — keeper ODZNAKI „OKUPOWANA" (W4-simple, WOJNA I POKÓJ; D-WP-2 = C + A-lite).
//
// PO CO: WP-1 dołożył księgę zdobyczy (`war.captures[]`), ale gracz NIGDZIE nie widział, że
// ciało zmieniło ręce — ani w panelu ciała, ani w tooltipie mapy. C2 czyta księgę i pokazuje
// znacznik. ZERO nowego stanu i ZERO migracji zapisu: cała informacja jest już w wojnie.
//
// ⚠ TRZY RZECZY, KTÓRE SĄ TU KONTRAKTEM (każda ZMIERZONA albo wyprowadzona ze źródła):
//   1. ROZSTRZYGA OSTATNI WPIS, NIE JAKIKOLWIEK. `WarSystem._recordCapture` mówi to wprost:
//      księga jest append-only BEZ deduplikacji i ma być HISTORIĄ. `some()` odpowiedziałoby
//      „zdobyte" także o ciele, które już wróciło do właściciela. To ta sama pułapka, którą
//      WP-2 zamknął w `_captureResolver` (`findLast`, nie `some`).
//   2. ⚠ TERMIN „WRÓCIŁO DO SWOJEGO" — ODSTĘPSTWO OD DOSŁOWNEGO BRZMIENIA PODPISU, zgłoszone
//      właścicielowi w raporcie C2. Sama reguła „ostatni wpis `toEmpireId` == bieżący
//      właściciel" nazywa OKUPOWANYM także ciało, które gracz ODBIŁ (bo odbicie to też
//      zmiana rąk). Odznaka mówiłaby wtedy „okupowana" o własnej, odzyskanej koloni — fałsz
//      dla gracza. Dokładamy więc jeden termin: bieżący właściciel nie może być tym, komu to
//      ciało w tej wojnie zabrano PIERWSZE (`fromEmpireId` pierwszego wpisu).
//   3. KSIĘGA ŻYJE TYLKO W AKTYWNEJ WOJNIE — po pokoju `WarSystem._onPeaceSigned` ustawia
//      `active:false`, więc odznaka gaśnie Z KONSTRUKCJI (czytamy `listActive`), a nie przez
//      osobne sprzątanie.
//
// ⚠ GRANICA DOWODU: `HudLabelLayer` importuje się pod node, a treść rozwinięcia etykiety ciała buduje czysta metoda
//   (`_t1Body(id, F, ctx)`), więc panel ciała pinujemy WYKONANIEM. `ThreeRenderer` NIE
//   importuje się (brak `three/addons/postprocessing/EffectComposer.js` w stubie) ⇒ brak dymka
//   kolonii w rendererze pinujemy ŹRÓDŁOWO i nazywamy to wprost (T5d).
//
// ⚠ ZAKRES TOOLTIPA JEST ZAWĘŻONY ŚWIADOMIE (decyzja właściciela na gate'cie C1+C2, NIE defekt):
//   odznaka wchodzi WYŁĄCZNIE do tooltipa KOLONIJNEGO (`_showColonyTooltip`), czyli nad
//   koloniami GRACZA. Ciało obce (np. kolonia oddana imperium) pokazuje na mapie INNY tooltip —
//   PLANETARNY, osobną ścieżką i z angielskim na sztywno — i ten świadomie zostaje bez wstawki;
//   okupację obcych ciał czyta się z rozwinięcia etykiety ciała (dawniej karta ciała `BottomContext`; sekcja T4).
//   Zapisane w rejestrze
//   obok F-b. Pin T5 celował więc w tooltip kolonijny i tylko w niego — brak odznaki nad obcym
//   ciałem NIE jest regresją tego keepera. (Od REFORMY ZAKŁADEK T4-4 dymka kolonijnego nie ma —
//   patrz przecelowanie niżej.)
//
// ⚠ PRZECELOWANE 2026-10-27 (REFORMA ZAKŁADEK T4, `TABS_REFORM_PLAN.md` §5.10): karta ciała (`BottomContext`) usunięta —
//   jej następcą jest rozwinięcie etykiety ciała na warstwie HUD (najechanie i przypięcie, `HudLabelLayer._t1Body`):
//   T0b — import warstwy; sekcja T4 czyta linie rozwinięcia (odznaka `body.occupiedBy` w `colonyExpansionLines` /
//   `foreignColonyExpansionLines`); T6b — brak polskiego literału odznaki w warstwie i w budowniczych linii.
//   T4-4 (dymki DOM ciała i statku usunięte — decyzja właściciela Q1): dymek KOLONIJNY (`_showColonyTooltip`) zniknął
//   razem z importem kanonu w rendererze — T5 pinuje jego NASTĘPCĘ WYKONANIEM: kolonia zdobyta przez gracza w trwającej
//   wojnie (kolonia GRACZA) pokazuje odznakę w rozwinięciu etykiety (`colonyExpansionLines`), zwykła — nie; T5d (źródłowo)
//   — dymka w rendererze nie ma, kanon okupacji czyta warstwa HUD; T6a — klucz `body.occupied` (wyłącznie dymka) usunięty,
//   `body.occupiedBy` zostaje.
// ⚠ IMPORT DYNAMICZNY modułu POWSTAJĄCEGO w tym slice (lekcja WP-2/WP-3).
// ⚠ ŻADNEGO wywołania funkcji tłumaczącej w tym pliku — `check-i18n` skanuje je w całym `src/`.
//
// Uruchom: node src/testing/smoke/wp_occupied_badge_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (window/localStorage/THREE)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GameCore } from '../headless/GameCore.js';
import EntityManager from '../../core/EntityManager.js';

// Moduł POWSTAJE w tym slice — dynamicznie, żeby fail-first miał kolory.
let OL = null;
try { OL = await import('../../utils/OccupationLedger.js'); } catch { /* fail-first */ }
let HLMod = null;
try { HLMod = await import('../../ui/HudLabelLayer.js'); } catch { /* fail-first */ }

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const norm = (s) => s.replace(/\r\n/g, '\n');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const readRaw   = (...p) => norm(readFileSync(join(SRC, ...p), 'utf8'));
const readClean = (...p) => stripComments(readRaw(...p));

// ── Fixture rdzenia: księgi literałem (term i reguła są CZYSTE) ─────────────
const EMP = 'emp_001', EMP2 = 'emp_002', PL = 'player';
const war = (captures, active = true) => ({ id: 'w1', active, captures });
const cap = (bodyId, from, to, year) => ({ bodyId, fromEmpireId: from, toEmpireId: to, year, via: 'invasion' });
const worldOf = (wars, owner) => ({ activeWars: wars.filter(w => w.active), ownerOf: () => owner });

// ⚠ Wrappery + ŚWIADEK `HAVE`. Bez nich fail-first kłamie w dwie strony: brak modułu
//   kolapsowałby CAŁE sekcje do jednej asercji „brak modułu" (tracimy ziarnistość), a piny
//   oczekujące `null` przechodziłyby JAŁOWO dokładnie tam, gdzie reguły jeszcze nie ma.
const HAVE = !!(OL?.occupierOf && OL?.isOccupiedBody && OL?.latestCaptureOf && OL?.normalizeOwner);
const occ    = (b, w) => { try { return OL?.occupierOf?.(b, w) ?? null; } catch { return null; } };
const isOcc  = (b, w) => { try { return OL?.isOccupiedBody?.(b, w) ?? null; } catch { return null; } };
const latest = (b, ws) => { try { return OL?.latestCaptureOf?.(b, ws) ?? null; } catch { return null; } };
const normO  = (c)     => { try { return OL?.normalizeOwner?.(c) ?? null; } catch { return null; } };

// ════════════════════════════════════════════════════════════════════════════
console.log('T0 — kontrola narzędzia');
{
  assert(!!OL?.occupierOf && !!OL?.isOccupiedBody && !!OL?.latestCaptureOf,
    'T0a: moduł `OccupationLedger` wystawia rodzinę (latestCaptureOf / occupierOf / isOccupiedBody)');
  assert(!!HLMod?.HudLabelLayer,
    'T0b: `HudLabelLayer` importuje się pod node — rozwinięcie etykiety ciała (następca karty ciała) pinujemy WYKONANIEM');
  // ⚠ `readFileSync` RZUCA na brakującym pliku — na kotwicy modułu jeszcze nie ma, a pin
  //   ma DEGRADOWAĆ, nie przerywać całego keepera (lekcja: pin, który wywala przebieg,
  //   zabiera kolor wszystkim niżej).
  let olSrc = null;
  try { olSrc = readClean('utils', 'OccupationLedger.js'); } catch { olSrc = null; }
  assert(olSrc != null && !/^\s*import\s/m.test(olSrc),
    'T0c: rdzeń jest CZYSTY (zero importów) — dlatego da się go pinować literałem, bez stawiania świata');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T1 — OSTATNI wpis, nie jakikolwiek (findLast, nie some)');
{
  // AI zabrało graczowi ciało i je TRZYMA.
  const w1 = war([cap('b1', PL, EMP, 10)]);
  assert(occ('b1', worldOf([w1], EMP)) === EMP,
    'T1a: ciało zabrane graczowi i trzymane przez imperium ⇒ okupowane PRZEZ imperium');
  assert(isOcc('b1', worldOf([w1], EMP)) === true,
    'T1b: predykat „czy okupowane" zgadza się z `occupierOf`');

  // Gracz ODBIŁ swoje ciało — dwa wpisy, właściciel = gracz, origin = gracz.
  const w2 = war([cap('b1', PL, EMP, 10), cap('b1', EMP, PL, 14)]);
  assert(HAVE && occ('b1', worldOf([w2], PL)) === null,
    'T1c: ciało ODBITE przez pierwotnego właściciela NIE jest okupowane — `some()` powiedziałby tu „tak" '
    + '(to jest cały powód, dla którego reguła czyta OSTATNI wpis i zna `origin`)');

  // Gracz zabrał ciało imperium i je trzyma — to ZDOBYCZ gracza, więc znacznik JEST.
  const w3 = war([cap('b2', EMP, PL, 12)]);
  assert(occ('b2', worldOf([w3], PL)) === PL,
    'T1d: ciało zdobyte przez GRACZA jest oznaczone symetrycznie (trzymasz zdobycz, pokój może ją oddać)');

  // Ostatni wpis mówi „u imperium", ale ciało faktycznie trzyma kto inny.
  assert(HAVE && occ('b1', worldOf([w1], EMP2)) === null,
    'T1e: gdy bieżący właściciel NIE jest tym z ostatniego wpisu — brak odznaki (księga nie nadpisuje świata)');
  assert(latest('b1', [w2])?.year === 14,
    'T1f (KONTROLA PINU): `latestCaptureOf` zwraca PÓŹNIEJSZY wpis (' + (latest('b1', [w2])?.year ?? 'n/d') + ')');
  assert(HAVE && latest('nieistnieje', [w2]) === null,
    'T1g: ciało bez historii ⇒ null (nie wyjątek)');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T2 — po POKOJU odznaka gaśnie (bo księga żyje w aktywnej wojnie)');
{
  const captures = [cap('b1', PL, EMP, 10)];
  const live = war(captures, true);
  const ended = war(captures, false);
  assert(occ('b1', worldOf([live], EMP)) === EMP,
    'T2a (KONTROLA PINU): przy AKTYWNEJ wojnie odznaka jest');
  assert(HAVE && occ('b1', worldOf([ended], EMP)) === null,
    'T2b: ta sama księga w wojnie ZAKOŃCZONEJ ⇒ brak odznaki (zero sprzątania — filtr `active`)');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T3 — normalizacja właściciela i wiele wojen');
{
  assert(normO({ ownerEmpireId: null }) === PL && normO({ ownerEmpireId: EMP }) === EMP,
    'T3a: kolonia gracza (`ownerEmpireId` null) normalizuje się do `player` — jedna definicja, nie dwie w UI');
  assert(HAVE && normO(null) === null,
    'T3b: brak kolonii ⇒ null (ciało bez kolonii nie jest okupowane)');

  // Dwie aktywne wojny, ciało zmieniało ręce w obu — liczy się NAJPÓŹNIEJSZY wpis.
  const wa = war([cap('b9', PL, EMP, 10)]);
  const wb = { id: 'w2', active: true, captures: [cap('b9', EMP, EMP2, 20)] };
  assert(occ('b9', { activeWars: [wa, wb], ownerOf: () => EMP2 }) === EMP2,
    'T3c: przy DWÓCH aktywnych wojnach rozstrzyga najpóźniejszy wpis (rok 20, nie 10)');
  assert(HAVE && occ('b9', { activeWars: [wa, wb], ownerOf: () => EMP }) === null,
    'T3d (KONTROLA PINU): stary wpis NIE wygrywa, gdy późniejszy oddał ciało komuś innemu');
  assert(HAVE && occ('b1', { activeWars: null, ownerOf: () => EMP }) === null,
    'T3e: brak wojen ⇒ null (fail-closed, bez wyjątku)');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T4 — PANEL CIAŁA: wiersz odznaki w rozwinięciu etykiety ciała (WYKONANIOWO)');
{
  // Żywy świat: wojna + realne przejęcie kolonii gracza ścieżką produkcyjną.
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization', aiEmpires: true });
  const K = window.KOSMOS;
  const cm = K.colonyManager;

  const psys = cm.getPlayerColonies()[0].systemId;
  const free = EntityManager.getAll().filter(b => (b.systemId || 'sys_home') === psys
    && (b.type === 'planet' || b.type === 'moon') && !cm.getColony(b.id)).slice(0, 2);
  for (const b of free) cm.createColony(b.id, { minerals: 100 }, 10, 0, null);
  K.diplomacySystem.declareWar(EMP, 'player_action');
  // ⚠ WYCZERPANIE OBU STRON NA SUFIT — inaczej `offerPeace` w T4d ODMAWIA (term `war_status`
  //   liczy `min(oba) − peaceCost`), wojna trwa i pin mierzyłby „odznaka jest", zamiast
  //   „odznaka gaśnie po pokoju". Fixture bez tego przechodził przez przypadek na kotwicy.
  {
    const w = K.warSystem.getWarWith(EMP);
    K.gameState.set('wars.' + w.id, { ...w, exhaustion: { player: 100, [EMP]: 100 } }, 'wp4_c2_fixture');
  }
  const victim = free[0];
  const plain  = free[1];
  cm.transferColony(victim.id, EMP, 'ground_invasion');

  // Rozwinięcie etykiety ciała tak, jak buduje je gra (`HudLabelLayer._t1Body`): ta sama treść przy najechaniu i w przypięciu.
  const render = (entity) => {
    try {
      const lay = new HLMod.HudLabelLayer();
      return lay._t1Body(entity.id, { K, now: 0, tactical: false }, { permanent: new Map(), stations: new Map(), pictureCtx: {} }) ?? [];
    } catch (e) { console.log('    (' + e.message + ')'); return []; }
  };
  const occRe = /Okupowan|Occupied|🏴/;
  const onVictim = HLMod?.HudLabelLayer ? render(victim) : [];
  const onPlain  = HLMod?.HudLabelLayer ? render(plain)  : [];
  const badgeOnVictim = onVictim.some(s => occRe.test(s));
  assert(onVictim.length >= 2, 'T4a (KONTROLA PINU): rozwinięcie etykiety ciała REALNIE zbudowane (' + onVictim.length + ' linii: '
    + onVictim.join(' | ') + ')');
  assert(badgeOnVictim,
    'T4b (WYKONANIOWO): rozwinięcie etykiety ciała PRZEJĘTEGO w trwającej wojnie pokazuje odznakę okupacji');
  // ⚠ ŚWIADEK: bez `badgeOnVictim` ten pin przechodzi jałowo wszędzie, gdzie odznaki NIE MA W OGÓLE.
  assert(badgeOnVictim && onPlain.length >= 1 && !onPlain.some(s => occRe.test(s)),
    'T4c: zwykła kolonia gracza odznaki NIE dostaje, choć przejęta ją ma (' + onPlain.length + ' linii)');

  // Po pokoju znacznik gaśnie — ta sama encja, ten sam panel.
  const signed = K.diplomacySystem.offerPeace(EMP, 'wp4_c2_probe', { playerInitiated: false });
  assert(signed === true && K.warSystem.getWarWith(EMP) == null,
    'T4d0 (KONTROLA PINU): pokój REALNIE podpisany i wojna zamknięta — bez tego T4d mierzyłby ' +
    'odznakę w trwającej wojnie i przechodził z niewłaściwego powodu');
  const afterPeace = HLMod?.HudLabelLayer ? render(victim) : [];
  assert(badgeOnVictim && afterPeace.length >= 1 && !afterPeace.some(s => occRe.test(s)),
    'T4d (WYKONANIOWO): po podpisaniu pokoju odznaka znika — bez osobnego sprzątania stanu');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T5 — KOLONIA GRACZA zdobyta w wojnie: odznaka w rozwinięciu etykiety kolonii (WYKONANIOWO; dymek usunięty w T4)');
{
  // Następca dymka kolonijnego (`_showColonyTooltip`, usunięty w REFORMIE ZAKŁADEK T4-4): rozwinięcie etykiety kolonii GRACZA
  // na warstwie HUD (`colonyExpansionLines`) — ta sama księga (`readOccupier`) i ten sam klucz odznaki (`body.occupiedBy`).
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization', aiEmpires: true });
  const K = window.KOSMOS;
  const cm = K.colonyManager;
  K.diplomacySystem.declareWar(EMP, 'player_action');
  const prize = cm.getAllColonies().find((c) => c.ownerEmpireId === EMP) ?? null;
  const home = cm.getPlayerColonies().find((c) => c.planetId !== prize?.planetId) ?? null;
  const captured = !!prize && cm.captureColonyForPlayer(prize.planetId) === true;
  const w = K.warSystem.getWarWith(EMP);
  const booked = !!w && K.warSystem.getCaptures(w.id).some((c) => c.bodyId === prize?.planetId && c.toEmpireId === PL);
  assert(captured && !cm.getColony(prize.planetId)?.ownerEmpireId && booked,
    'T5a (KONTROLA PINU): kolonia imperium REALNIE przejęta przez gracza w trwającej wojnie — jest KOLONIĄ GRACZA i stoi w księdze '
    + 'zdobyczy (bez tego T5b mierzyłby gałąź obcej kolonii albo ciało bez wpisu)');
  const render = (id) => {
    try {
      const lay = new HLMod.HudLabelLayer();
      return lay._t1Body(id, { K, now: 0, tactical: false }, { permanent: new Map(), stations: new Map(), pictureCtx: {} }) ?? [];
    } catch (e) { console.log('    (' + e.message + ')'); return []; }
  };
  const occRe = /Okupowan|Occupied|🏴/;
  const onPrize = (captured && HLMod?.HudLabelLayer) ? render(prize.planetId) : [];
  const onHome  = (home && HLMod?.HudLabelLayer) ? render(home.planetId) : [];
  const badge = onPrize.some((s) => occRe.test(s));
  assert(badge,
    'T5b (WYKONANIOWO): rozwinięcie etykiety kolonii GRACZA zdobytej w trwającej wojnie pokazuje odznakę okupacji ('
    + onPrize.join(' | ') + ')');
  // ⚠ ŚWIADEK: bez `badge` ten pin przechodzi jałowo wszędzie, gdzie odznaki NIE MA W OGÓLE.
  assert(badge && onHome.length >= 1 && !onHome.some((s) => occRe.test(s)),
    'T5c: zwykła kolonia gracza odznaki NIE dostaje, choć zdobyta ją ma (' + onHome.length + ' linii)');
  const tr = readClean('renderer', 'ThreeRenderer.js');
  const hl = readClean('ui', 'HudLabelLayer.js');
  assert(!/_showColonyTooltip\s*\(/.test(tr) && !/from\s+'[^']*OccupationLedger\.js'/.test(tr)
      && /import\s*\{[^}]*\breadOccupier\b[^}]*\}\s*from\s+'[^']*OccupationLedger\.js'/.test(hl),
    'T5d (pin ŹRÓDŁOWY): dymka kolonijnego w rendererze nie ma (T4-4), kanon okupacji (`OccupationLedger`) czyta warstwa HUD — '
    + 'jedna definicja okupacji, jedna powierzchnia');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T6 — i18n: klucze odznaki w OBU słownikach');
{
  const pl = readRaw('i18n', 'pl.js');
  const en = readRaw('i18n', 'en.js');
  const has = (k) => pl.includes("'" + k + "'") && en.includes("'" + k + "'");
  const none = (k) => !pl.includes("'" + k + "'") && !en.includes("'" + k + "'");
  assert(has('body.occupiedBy') && none('body.occupied'),
    'T6a: klucz odznaki `body.occupiedBy` w pl I en; `body.occupied` (wyłącznie usuniętego dymka kolonijnego) — w żadnym (T4-4)');
  const hudSrc = readClean('ui', 'HudLabelLayer.js') + '\n' + readClean('ui', 'LabelHoverLogic.js');
  const literals = (hudSrc.match(/['`][^'`]*Okupowan[^'`]*['`]/g) ?? []);
  assert(hudSrc.length > 1000 && literals.length === 0,
    'T6b: rozwinięcie etykiety ciała (warstwa HUD i budowniczy linii) nie ma polskiego literału odznaki'
    + (literals.length ? ' — ' + literals.join(' | ') : ''));
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T7 — MGŁA WOJNY: tożsamość okupanta za bramką wywiadu');
{
  const dn = (who, opts) => { try { return OL?.occupierDisplayName?.(who, opts) ?? null; } catch { return null; } };
  assert(dn(EMP, { empireName: 'Konsorcjum', intelKnown: true }) === 'Konsorcjum',
    'T7a: przy kontakcie pokazujemy NAZWĘ imperium');
  assert(dn(EMP, { empireName: 'Konsorcjum', intelKnown: false }) === '???',
    'T7b: bez kontaktu pokazujemy maskę — fakt okupacji widzimy zawsze, TOŻSAMOŚĆ dopiero po '
    + 'kontakcie (oś właściciela z Findingu 188, nie oś miejsca)');
  assert(dn(PL, { playerLabel: 'Gracz', intelKnown: false }) === 'Gracz',
    'T7c: własna okupacja nie podlega mgle wojny (etykieta gracza wstrzykiwana — moduł nie zna słownika)');
  assert(HAVE && dn(null, {}) === null,
    'T7d: brak okupanta ⇒ brak etykiety');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
