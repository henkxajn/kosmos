// CvBattleStager — powtarzalne starcie do oglądania efektów walki (ARC COMBAT VISUALS, krok CV-2a, Finding 634; §2.10).
// Rozpięte w `KOSMOS.debug` (GameScene). Wszystkie wywołania bez cudzysłowów:
//   cvBattle()                          — 10 na 10 w oglądanym układzie, mieszane kadłuby (fregata / niszczyciel / krążownik)
//                                         i broń (laser / kinetyk / rakieta), ziarno 1; gra na PAUZIE — start: wznowienie czasu
//   cvBattle({nA: 5, nB: 5, seed: 7})   — mniejsze starcie, inne ziarno; to samo ziarno = ta sama bitwa (rundy, strzały, wynik)
//   cvBattle({nA: 4, nB: 4, split: 1})  — ARC CV-3a2 (Finding 638): starcia PARAMI — każda para A_i–B_i zaczyna własne starcie
//                                         (rozkaz „Zaangażuj” przed starciem: ścieżka zamiaru gracza w DSCS), więc w jednym
//                                         miejscu toczy się kilka starć — jedna bitwa na ekranie: jeden wiersz karty, jeden baner
//   cvBattle({atBody: 1})               — ARC CV-3a3 (D-CV-4): bitwa PRZY CIELE — statki gracza na orbicie pierwszej wolnej
//                                         planety oglądanego układu, wróg obok; DSCS przypina wroga do ciała (jak w grze).
//                                         `atBody: 'id_ciała'` — wskazane ciało; `mixed: 1` — przy ciele mniejszość statków
//                                         gracza, wróg wolny (skorupa obraca się w stronę wroga)
//   ARC CV-3a3 (Finding 654) — uzbrojenie LUSTRZANE: statek B_i ma kadłub i broń statku A_i
//   cvBattle({warp: 1})                 — ARC CV-1a: statki testowe z ZAPASEM warp (tylko wygląd: resolver bierze model
//                                         `warp_*` — z `cvIncoming(1)` modele właściciela z pierścieniem rdzenia warp);
//                                         `warp: 2` — tylko strona A. Walka bez zmian (DSCS nie czyta `warpFuel`)
//   cvParade()                          — ARC CV-1a: PARADA 24 slotów modeli (12 klas × bez warp / warp) w oglądanym układzie,
//                                         każdy statek z rozkazem lotu w tym samym kierunku (gra na pauzie — start: wznowienie
//                                         czasu); `cvParade({dir: 90})` — kierunek w stopniach. Do sprawdzenia „dziobem
//                                         naprzód” (także `nonwarp_large_science` — Finding 621), smugi w dyszy, świateł
//   cvBattle({nA: 3, nB: 3, battles: 3}) — ARC CV-6b2: trzy OSOBNE bitwy w oglądanym układzie (osobne klastry, ≥ 1 AU od siebie)
//                                         — pasek walki z kilkoma liniami; `battles: 4` — trzy linie i „+1”
//   cvBattle({warp: 1, star: 1})        — ARC CV-1a (kontrola właściciela): NAJPIERW przełącz widok na wygenerowany układ
//                                         z NAJCIEMNIEJSZĄ gwiazdą (`star: 1`) albo NAJJAŚNIEJSZĄ (`star: 2`), potem starcie tam;
//                                         `star: 0` / brak — oglądany układ jak dotąd. Do oceny czytelności statków pod
//                                         barwną gwiazdą (to samo w `cvParade({star: 1})`); odczyt `star` w wyniku
//   cvBattle({doctrine: /kite/.source}) — ARC CV-3b: strona A (gracz) we flocie z doktryną — `engage` / `kite` / `hold` / `retreat`
//                                         (albo pełne nazwy `engage_in_range`, `hold_position`, `retreat_at_50`); rozkazy „Zaangażuj”
//                                         przez `FleetSystem.applyDoctrine` jak w grze (kite — `preferMaxRange`, hold — bez rozkazów).
//                                         Postać `/kite/.source` — polecenie konsoli bez cudzysłowów. Postawa w choreografii: tylko
//                                         ustawienie i styl ruchu (D-CV-7 — doktryna nie udaje odległości, Finding 631)
//   cvBattle({nA: 2, nB: 2, engage: 0}) — M1: bitwa NAPRAWDĘ lustrzana — bez rozkazów „Zaangażuj” po obu stronach (obie strony
//                                         biją najbliższego wroga); `engage: 2` — pary lustrzane po OBU stronach (B_i → A_i);
//                                         domyślnie 1 — „Zaangażuj” tylko strona A, jak w grze (§3.2-10). Przy 1 strona A rozkłada
//                                         ogień na swoje pary, a AI skupia go na najbliższym — dlatego wygrywa częściej (Finding 694)
//   cvBattle({nA: 3, nB: 3, random: 1}) — Finding 699: floty NIELUSTRZANE — każda strona osobno losuje kadłub i broń główną
//                                         każdego statku z ziarna (to samo `seed` = te same floty i ta sama bitwa); jawne `hulls` /
//                                         `weapons` wygrywają z losowaniem; skład w wyniku (`fleets`). Nazwa nie `mix` — `mixed`
//                                         to już opcja bitwy przy ciele (`atBody`), a `'mixed'` — domyślny cykl kadłubów i broni
//   cvOrbitalBattle()                   — ARC CV-8a: atak AI na kolonię gracza w oglądanym układzie PRAWDZIWĄ ścieżką EnemyAttackHandler
//                                         (5 napastników na orbicie, 5 okrętów gracza — 1 w hangarze, wieża 2 + siatka 1 tylko tej bitwie);
//                                         rozstrzygnięcie po 0,5 s czasu realnego, powtórka na scenie planety po wznowieniu czasu; wygrywa
//                                         gracz. `{lose: 1}` — wygrywa AI (10 na 1, bez budynków obrony), `{big: 1}` — 10 na 10 + wieża 3 + siatka 2,
//                                         `{outOfView: 1}` — widok na inny układ przed rozstrzygnięciem (sam baner), jawne `nA`, `nB`,
//                                         `hangar`, `tower`, `grid`; także `cvBattle({kind: /orbital/.source})`
//   orbitalInfo()                       — ARC CV-8a: powtórki w toku (rundy, runda bieżąca, strzelcy stron, emitery, hangar, zniszczenia
//                                         zaplanowane / pokazane, w widoku) i liczniki (start, odmowy widoku, przerwania)
//   cvOrbital(1) / cvOrbital(0)         — ARC CV-8a: flaga `cvOrbital` ON / OFF (CV-8b: OFF = bez powtórki — wraki, baner i Dziennik od razu;
//                                         burst 16 kresek, modal „BITWA NIEUCHRONNA” i kino BattleView3D wycofane)
//   cvOrbitalBattle({raid: 1})          — ARC CV-8b (#635): RAJD rozstrzygnięty dwa razy — napastnicy na orbicie kolonii, okręty gracza
//                                         na orbicie: po wznowieniu czasu starcie DSCS, w jego trakcie bitwa orbitalna EAH; jeden baner
//                                         i jedna linia Dziennika na rajd (po powtórce)
//   cvOrbitalBattle({raid: 2})          — wariant z lotem: rajderzy na drodze kolonii, podejście DSCS, ocaleli gonią kolonię (na szybkiej
//                                         orbicie dłużej niż sufit czekania 15 s — baner podejścia osobno; `KOSMOS.debug.raidHold(ms)`)
//   battleInfo()                        — M1: aktywne starcia (runda, żywi, uciekający) i ostatnia rozstrzygnięta bitwa DSCS: rundy,
//                                         zwycięzca, odwrót, powód końca (`endReason`), straty i WRAKI uczestników — `wrakiTylkoPrzy0HP:
//                                         true` znaczy, że na wrak poszły wyłącznie okręty zestrzelone (wraki == straty)
//   m1OrbitalCheck()                    — M1: czysta próba ścieżki orbitalnej (`resolveBattle`, bez stanu gry): floty tankowe (> 30 tur),
//                                         bezbronni (pat bez tur), tarcza nie do przebicia (pat), równe floty (bez wygranej obrońcy)
//   cvRetreat(1)                        — ARC CV-3b: rozkaz „Wycofaj się z bitwy” dla statku nr 1 strony A (żywego, w starciu) — ten sam
//                                         rozkaz co PPM; choreografia obraca go od zagrożenia i zapala pełny ciąg; M1 — PRAWDZIWY lot
//                                         na zegarze starcia (~0,03 AU na rundę), starcie kończy się, gdy strona wyjdzie poza 0,5 AU
//   cvChoreo() / cvChoreo2()            — CV-Z: wycofane (choreografia CV-3c na stałe) — zwracają { retired: true }
//   cvFocusDamaged()                    — ARC CV-3c: kamera na najbardziej uszkodzony żywy statek oglądanej bitwy (stan uszkodzeń CV-5:
//                                         3 = krztuszący się silnik ≤ 25 % HP — wylot dysz migocze i sypie iskrami); null, gdy nikt
//                                         nie jest uszkodzony
//   cvStrip(1) / cvStrip(0)             — ARC CV-6b2: flaga `cvStrip` (pasek walki zamiast karty walki) ON / OFF, od następnej klatki
//   cvTactical(1) / cvTactical(0)       — ARC CV-6a: flaga `cvTactical` (warstwa taktyczna: ikony klas, znak bitwy z daleka, linie
//                                         ognia, mikropaski, ramka, pasma zasięgu; uczestnicy bez etykiet, znaczników i pasków HP 3D)
//                                         ON / OFF, od następnej klatki; OFF = etykiety, znaczniki i paski HP 3D jak dziś
//   cvDirector(1) / cvDirector(0)       — ARC CV-7: kamera reżysera WŁĄCZONA / WYŁĄCZONA (jak chip „Reżyser” na pasku walki); prowadzi
//                                         bitwę w oglądanym układzie, każde wejście kamery gracza ją wstrzymuje, chip wznawia
//   directorInfo()                      — ARC CV-7: bieżące ujęcie, następne, bohater (spowolnienie, opóźnienie w R), kto ma kamerę
//   cv916(1) / cv916(0)                 — ARC CV-7: przewodnik 9:16 (kadr rolki, poza nim przyciemnienie); reżyser kadruje w nim
//   cvCapture(1) / cvCapture(0)         — ARC CV-7: tryb nagrywania — bez interfejsu (klawisz F9, wyjście Esc albo F9); z 9:16 —
//                                         cienka ramka poza kadrem; zwolnione tempo: KOSMOS.threeRenderer.cvTuning.FX_TIME_SCALE
//   cvDirectorFlag(1) / cvDirectorFlag(0) — ARC CV-7: flaga `cvDirector` (OFF — bez chipa, bez reżysera, tempo prezentacji 1)
//   cvRecord(1) / cvRecord(0)           — ARC CV-7: nagrywarka rolek (jak F10) — płótno 3D; z 9:16 wycinek 1080 × 1920, 60 kl./s;
//                                         MP4 (H.264) albo WebM VP9; plik kosmos_reel_RRRRMMDD_GGMMSS pobiera się przy stopie
//   tacticalInfo()                      — ARC CV-6a: per bitwa w widoku — stopień zoomu (`zoom`: glyph / icons / handover / cinema),
//                                         px_L, krycie ikon, ikony i mikrostosy, linie ognia teraz i w ostatniej sekundzie, ukryte
//                                         mgłą, najmniejszy odstęp ikon, pasma zasięgu, najechanie
//   cvFx() / cvStage()                  — CV-Z: wycofane (silnik FX z pulami i scena bitwy na stałe) — zwracają { retired: true }
//   cvModels() / cvPresets()            — CV-Z: wycofane (rama kanoniczna, presety jakości i sygnały walki na stałe) — { retired: true }
//   cvIncoming(1) / cvIncoming(0)       — ARC CV-1a: sloty z `hardpoints/incoming/index.json` biorą model z `incoming/` (podgląd
//                                         modeli właściciela PRZED podmianą slotu — CV-1b); zwraca Promise (await w konsoli)
//   cvLightTest(1) / cvLightTest(0)     — ARC CV-1a: testowy wzór punktów świetlnych na slotach bez `lights[]` (do CV-1c)
//   modelInfo()                         — ARC CV-1a: statki w ramie kanonicznej, hardpointy (plik / zapas), pula świateł
//   fxStats()                           — pomiar 300 klatek: czas klatki p50 / p95, wywołania i trójkąty renderera, pule
//   gfx() / gfx(2) / gfx(1) / gfx(0)    — ARC CV-2b: odczyt presetu / High / Medium / Low (zapis na maszynie, jak ☰ „Grafika”)
//   cvLightFlash()                      — ARC CV-2b: błysk światła puli w środku oglądanej bitwy (High 4 / Medium 2 / Low 0 świateł)
//   cueStats() / cueStats(0)            — ARC CV-2b: sygnały walki odebrane przez słuchacza `AudioSystem` / wyzerowanie licznika
//   cvWeapons() / cvDamage() / cvShields() — CV-Z: wycofane (język broni, wybuchy, osłony na stałe) — { retired: true }
//   ledgerInfo()                        — ARC CV-4a: rejestr salw — per starcie liczniki od jego początku (`wTymStarciu`) i ostatnie
//                                         rundy (zdarzenia, opóźnienie startu i rozpiętość trafień w R, zniszczenia, strzały po
//                                         zniszczeniu), HP pokazywane vs logiczne uczestników, liczniki od wczytania strony
//                                         (`odZaladowaniaStrony` — sumy wszystkich starć, F5 zeruje), `legenda` (co liczy każdy licznik)
//   cvExplode(/battleship/.source)      — ARC CV-5: wybuch statku testowego danej klasy (`frigate` / `destroyer` / `battleship`),
//                                         najbliższego celowi kamery — tylko prezentacja (logika go nie zna; F5 bez zapisu); w pauzie
//                                         stoi, zwolnione tempo: `KOSMOS.threeRenderer.cvTuning.FX_TIME_SCALE = 0.25`
//   cvShieldHit(/battleship/.source)    — ARC CV-4b: trafienie w osłonę statku TESTOWEGO danej klasy najbliższego celowi kamery (parada / bitwa
//                                         po końcu) — każde wywołanie zabiera ~42 % osłony, trzecie ją rozbija, kolejne trafiają kadłub (iskry,
//                                         żar, osmalenie na High); tylko prezentacja. Zwolnione tempo: KOSMOS.threeRenderer.cvTuning.FX_TIME_SCALE
//   shieldInfo()                        — ARC CV-4b: osłony (bańka trzyma / opadła, siła, fale, rozpady, regeneracje), pula baniek, osmalenia
//   damageInfo()                        — ARC CV-5: wybuchy (klasy, wtórne, światła), emitery stanów uszkodzeń, wraki (żar, zbieżność),
//                                         zegar efektów, pule
//
// Scena (dlaczego tak, punkt po punkcie — §1 Q9 / Finding 634):
//   · układ = OGLĄDANY (`activeSystemId`) — `teleportVessel` nigdy nie ustawiał `systemId`, a starcie w innym układzie nie
//     rysuje się wcale (Finding 453);
//   · miejsce = pusty punkt układu ≥ 1 AU od każdego innego statku i ≥ 0,5 AU od ciał — skład starcia zbiera statki
//     w promieniu 0,225 AU od środka (team-up), więc obcy statek w pobliżu wszedłby do bitwy;
//   · szyk = dwie linie po 5 na stronę, front 0,06 AU od środka — kinetyk i rakieta w zasięgu od pierwszej rundy, laser
//     dolatuje; wszyscy w promieniu team-up ⇒ całe 10 na 10 wchodzi do starcia naraz;
//   · gra na PAUZIE przed pierwszym tikiem, starcie założone od razu (`vessel:combatRangeEnter` pary ze środka), ziarno
//     starcia stałe (`seedBase` z `seed`), rozkazy `engage` wydane przed pierwszym tikiem — `DirectorRecall` omija statki
//     w aktywnym starciu, więc nie odwoła bezczynnych okrętów AI;
//   · statki są PRAWDZIWE (stan gry): nazwy `CV-A01…` / `CV-B01…`, znacznik `_cvBattle` (tylko w pamięci); autozapis
//     wyłączony do przeładowania strony; ⚠ nie zapisuj gry po teście — F5 bez zapisu wraca do stanu sprzed testu.
//   · ponowne `cvBattle()` po zakończonym starciu zdejmuje statki poprzedniego testu (bez linii w Dzienniku); w trakcie
//     starcia — odmowa `battle_in_progress`.
// Starcia orbitalne — CV-8a: `cvOrbitalBattle()` (także `cvBattle({kind: /orbital/.source})`), odczyt `orbitalInfo()`, flaga `cvOrbital(1|0)`.

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { GAME_CONFIG, STAR_TYPES } from '../config/GameConfig.js';
import { resolveVesselOrbitalRole } from '../data/OrbitalRolesData.js';   // ARC CV-3a3 — `atBody`: rola orbity jak przy przylocie
import { orbitClockSec } from '../utils/SimClock.js';                     // ARC CV-3a3 — `atBody`: kąt orbity z zegara orbit
import gameState from '../core/GameState.js';                                // M1 — `battleInfo()`: rekordy bitew
import { resolveBattle, isStalemate } from '../systems/BattleSystem.js';     // M1 — `m1OrbitalCheck()`: ścieżka orbitalna (czysta)
import { mixSeed } from '../utils/SeedMath.js';                              // Finding 699 — `random`: ziarno strumienia flot
import { vesselSizeClass } from '../renderer/VesselModelResolver.js';        // ARC CV-5 — `cvExplode`: klasa kadłuba
import { explosionClassOf } from '../renderer/combat/ExplosionLogic.js';     // ARC CV-5 — `cvExplode`: klasa wybuchu
import { SHIP_MODULES } from '../data/ShipModulesData.js';                   // ARC CV-4b — `cvShieldHit`: osłona statku z modułów

/**
 * ARC CV-Z — przełącznik flagi wycofanej (flaga na stałe ON, ścieżka OFF usunięta): niczego nie zmienia, mówi to wprost.
 * @param {string} flag — klucz dawnej flagi `FEATURES`
 */
export function retiredFlag(flag) {
  return { retired: true, flag, note: 'CV-Z — flaga na stałe ON, ścieżka OFF usunięta; przełącznik niczego nie zmienia' };
}

export const CV_BATTLE = Object.freeze({
  MAX_PER_SIDE: 10,
  PER_LINE: 5,
  FRONT_AU: 0.06,         // [AU] linia frontu od środka
  LINE_AU: 0.03,          // [AU] odstęp kolejnych linii
  ROW_AU: 0.035,          // [AU] odstęp statków w linii
  CLEAR_VESSEL_AU: 1.0,   // [AU] najbliższy obcy statek od środka
  CLEAR_BODY_AU: 0.5,     // [AU] najbliższe ciało od środka
  RINGS_AU: [2.5, 3.5, 5.0, 7.0, 1.6, 10.0],   // [AU] promienie szukania miejsca wokół gwiazdy
  ANGLES: 16,
  NAME_PREFIX: 'CV-',
  // ARC CV-3a3 — `cvBattle({ atBody })`: wróg w linii po jednej stronie ciała, `mixed` — wolni statki gracza między nimi
  BODY_ENEMY_AU: 0.07,    // [AU] linia wroga od środka ciała
  BODY_FREE_AU: 0.035,    // [AU] wolni statki gracza (`mixed`) od środka ciała, po stronie wroga
  BODY_ROW_AU: 0.02,      // [AU] odstęp w linii
  BODY_LINE_AU: 0.025,    // [AU] odstęp kolejnych linii (> 5 statków)
  WARP_TANK: 10,          // [warp_cores] zapas warp statku testowego `warp` (ARC CV-1a — tylko wybór modelu `warp_*`)
  PARADE_COLS: 6,         // ARC CV-1a — parada: kolumny siatki
  PARADE_STEP_AU: 0.02,   // [AU] odstęp statków parady
  PARADE_RUN_AU: 3.0,     // [AU] cel lotu parady od pozycji startowej
  WARNING: '⚠ cvBattle: statki testowe weszły do stanu gry — nie zapisuj gry po teście (F5 bez zapisu wraca do stanu sprzed testu). Autozapis wyłączony do przeładowania strony.',
});

const HULL_KEYS = Object.freeze({ frigate: 'hull_frigate', destroyer: 'hull_destroyer', battleship: 'hull_cruiser', cruiser: 'hull_cruiser' });
const HULL_CYCLE = ['frigate', 'destroyer', 'battleship'];
const WEAPON_KEYS = Object.freeze({ laser: 'weapon_laser', kinetic: 'weapon_kinetic', missile: 'weapon_missile' });
const WEAPON_CYCLE = ['laser', 'kinetic', 'missile'];
// Sloty użytkowe: fregata 3, niszczyciel 4, krążownik 5 — jeden na obronę, reszta broń (HullsData).
const HULL_LOADOUT = Object.freeze({
  frigate:    { weapons: 2, defence: 'armor_standard' },
  destroyer:  { weapons: 3, defence: 'shield_basic' },
  battleship: { weapons: 4, defence: 'shield_basic' },
});

function pickName(spec, cycle, keys, i) {
  if (Array.isArray(spec) && spec.length) return pickName(spec[i % spec.length], cycle, keys, i);
  if (typeof spec === 'string' && keys[spec]) return spec;
  return cycle[i % cycle.length];
}

/** Broń statku: 2 × broń główna, dalej kolejne typy z cyklu (przy broni „mixed”); stały typ — wszystkie sloty ten sam. */
function weaponModules(hullName, primary, fixed) {
  const n = HULL_LOADOUT[hullName].weapons;
  const out = [];
  const start = WEAPON_CYCLE.indexOf(primary);
  for (let w = 0; w < n; w++) {
    const name = fixed ? primary : WEAPON_CYCLE[(start + Math.max(0, w - 1)) % WEAPON_CYCLE.length];
    out.push(WEAPON_KEYS[name]);
  }
  return out;
}

/**
 * Czysty szyk starcia (bez świata): kadłub, moduły, nazwa i przesunięcie od środka w AU dla każdego statku.
 * Ten sam szyk buduje keeper `cv_fx_results_smoke` — bitwa z keepera to bitwa z konsoli.
 * ARC CV-3a3 (Finding 654, decyzja właściciela §3.2-10 (1)) — uzbrojenie LUSTRZANE: statek strony B o indeksie i ma
 *   kadłub i broń statku strony A o tym samym indeksie (dawniej broń strony B przesunięta o jedną pozycję w cyklu —
 *   fregaty gracza z laserem 0,05 AU przeciw fregatom AI z kinetykiem 0,15 AU przy liniach 0,12 AU od siebie). Asymetrie
 *   DSCS (strona A strzela pierwsza, techy tylko gracza) to mechanika — nietknięte.
 * Finding 699 — `random`: floty NIELUSTRZANE. Kadłub i broń główna każdego statku z JEDNEGO strumienia ziarna, losowane po
 *   kolei (cała strona A, potem B) — strony dostają różne floty, to samo ziarno daje te same. Losowanie zastępuje wyłącznie
 *   cykl domyślny (`'mixed'`): jawne `hulls` / `weapons` wygrywają. Bez `random` szyk co do bitu jak dotąd.
 * @param {{ nA?: number, nB?: number, hulls?: string|string[], weapons?: string|string[], random?: number, seed?: number }} [opts]
 * @returns {{ ships: Array<{side:'A'|'B', index:number, name:string, hull:string, hullName:string, modules:string[], dxAU:number, dyAU:number}>,
 *             trigger: { a: number, b: number } }}  trigger — indeksy (w `ships`) pary ze środka frontu
 */
export function cvBattleLayout({ nA = 10, nB = 10, hulls = 'mixed', weapons = 'mixed', random = 0, seed = 1 } = {}) {
  const clampN = (n) => Math.max(1, Math.min(CV_BATTLE.MAX_PER_SIDE, Math.floor(Number(n) || 0)));
  const fixedWeapon = typeof weapons === 'string' && !!WEAPON_KEYS[weapons];
  const roll = Number(random) ? cvRollStream(seed) : null;
  const rollHull = !!roll && hulls === 'mixed';
  const rollWeapon = !!roll && weapons === 'mixed';
  const ships = [];
  const trigger = { a: -1, b: -1 };
  for (const [side, n, sign, offset] of [['A', clampN(nA), -1, 0], ['B', clampN(nB), 1, 0]]) {
    let best = -1, bestDy = Infinity;
    for (let i = 0; i < n; i++) {
      const hullName = rollHull ? HULL_CYCLE[Math.floor(roll() * HULL_CYCLE.length)] : pickName(hulls, HULL_CYCLE, HULL_KEYS, i);
      const hullKey = hullName === 'cruiser' ? 'battleship' : hullName;
      const primary = rollWeapon ? WEAPON_CYCLE[Math.floor(roll() * WEAPON_CYCLE.length)] : pickName(weapons, WEAPON_CYCLE, WEAPON_KEYS, i + offset);
      const line = Math.floor(i / CV_BATTLE.PER_LINE);
      const k = i % CV_BATTLE.PER_LINE;
      const inLine = Math.min(CV_BATTLE.PER_LINE, n - line * CV_BATTLE.PER_LINE);
      const dxAU = sign * (CV_BATTLE.FRONT_AU + line * CV_BATTLE.LINE_AU);
      const dyAU = (k - (inLine - 1) / 2) * CV_BATTLE.ROW_AU;
      const modules = ['engine_ion', ...weaponModules(hullKey, primary, fixedWeapon), HULL_LOADOUT[hullKey].defence];
      ships.push({ side, index: i, name: `${CV_BATTLE.NAME_PREFIX}${side}${String(i + 1).padStart(2, '0')}`,
        hull: HULL_KEYS[hullKey], hullName: hullKey, modules, dxAU, dyAU });
      if (line === 0 && Math.abs(dyAU) < bestDy - 1e-12) { bestDy = Math.abs(dyAU); best = ships.length - 1; }
    }
    trigger[side === 'A' ? 'a' : 'b'] = best;
  }
  return { ships, trigger };
}

/** Finding 699 — strumień losowań flot `random`: mulberry32 z rozproszonego ziarna, rozgrzany (pierwsze rzuty są najsłabsze). */
function cvRollStream(seed) {
  let s = mixSeed(cvSeedBase(seed) ^ 0x699f1e) | 0;
  const next = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next(); next(); next();
  return next;
}

/** Finding 699 — skład flot do odczytu w konsoli: `kadłub/broń główna` każdego statku, strona po stronie. */
function cvFleetsOf(layout) {
  const out = { A: [], B: [] };
  for (const s of layout?.ships ?? []) out[s.side]?.push(`${s.hullName}/${String(s.modules?.[1] ?? '').replace('weapon_', '')}`);
  return out;
}

/** Ziarno starcia DSCS (`seedBase`) z ziarna konsoli — liczba całkowita w [0, 2³¹). */
export function cvSeedBase(seed) {
  const s = Number.isFinite(Number(seed)) ? Math.floor(Number(seed)) : 1;
  return (Math.imul(s, 7919) >>> 0) & 0x7fffffff;
}

/**
 * Pusty punkt układu dla starcia (gameplay px): pierścienie wokół gwiazdy (0, 0), kąt startu z ziarna; pierwszy punkt
 * dalej niż `CLEAR_VESSEL_AU` od każdego statku i `CLEAR_BODY_AU` od każdego ciała. Brak — punkt najdalszy od statków.
 * @param {{ seed:number, vessels:Array<{x:number,y:number}>, bodies:Array<{x:number,y:number}>, auPx:number }} w
 */
export function cvBattleCenter({ seed = 1, vessels = [], bodies = [], auPx = 110 }) {
  const minD = (pts, x, y) => pts.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.y - y)), Infinity);
  const a0 = ((cvSeedBase(seed) % 360) * Math.PI) / 180;
  let fallback = null;
  for (const rAU of CV_BATTLE.RINGS_AU) {
    for (let k = 0; k < CV_BATTLE.ANGLES; k++) {
      const a = a0 + (k * 2 * Math.PI) / CV_BATTLE.ANGLES;
      const x = Math.cos(a) * rAU * auPx, y = Math.sin(a) * rAU * auPx;
      const dv = minD(vessels, x, y) / auPx, db = minD(bodies, x, y) / auPx;
      if (dv >= CV_BATTLE.CLEAR_VESSEL_AU && db >= CV_BATTLE.CLEAR_BODY_AU) return { x, y, clear: true, dvAU: dv, dbAU: db };
      if (!fallback || dv > fallback.dvAU) fallback = { x, y, clear: false, dvAU: dv, dbAU: db };
    }
  }
  return fallback;
}

/**
 * ARC CV-3a3 — ciało bitwy `cvBattle({ atBody })`: id podane jako tekst (ciało oglądanego układu); inaczej pierwsza planeta
 * (potem księżyc, planetoida) wg id, przy której żaden obcy statek nie stoi bliżej niż `CLEAR_VESSEL_AU` (team-up 0,225 AU
 * wciągnąłby go do bitwy); brak takiej — pierwsza z listy. `vessels` — pozycje obcych statków (px rozgrywki).
 * @returns {object|null}
 */
export function cvBattleBody({ atBody, bodies = [], vessels = [], auPx = 110 }) {
  if (typeof atBody === 'string') return bodies.find((b) => b?.id === atBody) ?? null;
  const order = { planet: 0, moon: 1, planetoid: 2 };
  const cands = bodies.filter((b) => b && order[b.type] != null && Number.isFinite(b.x) && Number.isFinite(b.y))
    .sort((a, b) => (order[a.type] - order[b.type]) || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
  const clear = cands.find((b) => vessels.every((v) => Math.hypot(v.x - b.x, v.y - b.y) / auPx >= CV_BATTLE.CLEAR_VESSEL_AU));
  return clear ?? cands[0] ?? null;
}

/**
 * ARC CV-3a3 — przesunięcie [AU] wroga (`side` 'B') albo wolnego statku gracza (`mixed`, 'Afree') od środka ciała: linie
 * po jednej stronie ciała w kierunku `a0` [rad], rząd w poprzek kierunku.
 */
export function cvBodyOffsetAU(kind, k, n, a0) {
  const dist = kind === 'B' ? CV_BATTLE.BODY_ENEMY_AU : CV_BATTLE.BODY_FREE_AU;
  const line = Math.floor(k / CV_BATTLE.PER_LINE), j = k % CV_BATTLE.PER_LINE;
  const inLine = Math.min(CV_BATTLE.PER_LINE, n - line * CV_BATTLE.PER_LINE);
  const r = dist + line * CV_BATTLE.BODY_LINE_AU, t = (j - (inLine - 1) / 2) * CV_BATTLE.BODY_ROW_AU;
  const ux = Math.cos(a0), uy = Math.sin(a0);
  return { dxAU: ux * r - uy * t, dyAU: uy * r + ux * t };
}

const isCvVessel = (v) => !!v && (v._cvBattle != null || (typeof v.name === 'string' && /^CV-[ABP]\d\d$/.test(v.name)));

/** ARC CV-1a — zapas warp na statku testowym (wyłącznie wybór modelu `warp_*`: resolver czyta `warpFuel.max > 0`). */
function cvApplyWarp(v, on) {
  if (on && v?.warpFuel) v.warpFuel.max = Math.max(v.warpFuel.max || 0, CV_BATTLE.WARP_TANK);
}

// ARC CV-1a — parada: kadłub i moduły, przy których resolver wybiera daną klasę modelu (rola z modułów: habitat → colony,
// science → science, reszta → cargo; klasy bojowe z kadłuba). Silnik w każdym — parada LECI.
const PARADE_CLASSES = Object.freeze([
  ['frigate', 'hull_frigate', 'weapon_laser'], ['destroyer', 'hull_destroyer', 'weapon_laser'], ['battleship', 'hull_cruiser', 'weapon_laser'],
  ['small_science', 'hull_small', 'science_lab'], ['small_cargo', 'hull_small', 'cargo_small'], ['small_colony', 'hull_small', 'habitat_pod'],
  ['medium_science', 'hull_medium', 'science_lab'], ['medium_cargo', 'hull_medium', 'cargo_small'], ['medium_colony', 'hull_medium', 'habitat_pod'],
  ['large_science', 'hull_large', 'science_lab'], ['large_cargo', 'hull_large', 'cargo_small'], ['large_colony', 'hull_large', 'habitat_pod'],
]);

/** ARC CV-1a — siatka parady: 24 wpisy (12 klas × bez warp / warp) z przesunięciem w AU od środka. */
export function cvParadeLayout({ cols = CV_BATTLE.PARADE_COLS, stepAU = CV_BATTLE.PARADE_STEP_AU } = {}) {
  const ships = [];
  for (const warp of [false, true]) {
    for (const [cls, hull, role] of PARADE_CLASSES) {
      const i = ships.length;
      const col = i % cols, row = Math.floor(i / cols);
      const rows = Math.ceil((PARADE_CLASSES.length * 2) / cols);
      ships.push({ i, cls, key: `${warp ? 'warp' : 'nonwarp'}_${cls}`, hull, modules: ['engine_chemical', role], warp,
        name: `${CV_BATTLE.NAME_PREFIX}P${String(i + 1).padStart(2, '0')}`,
        dxAU: (col - (cols - 1) / 2) * stepAU, dyAU: (row - (rows - 1) / 2) * stepAU });
    }
  }
  return ships;
}

/**
 * ARC CV-1a (kontrola właściciela) — układ do oglądania bitwy pod gwiazdą danej jasności: `star` 1 — klasa o NAJMNIEJSZEJ
 * jasności (`STAR_TYPES.luminosity`) wśród wygenerowanych układów, 2 — o NAJWIĘKSZEJ; w klasie oglądany układ, gdy pasuje,
 * inaczej pierwszy wg id. Liczby zamiast nazw — polecenia konsoli bez cudzysłowów.
 * @param {{ star: number, systems: Array<{id:string, cls:string|null}>, activeId?: string|null }} o
 * @returns {{ systemId: string, cls: string, classes: string[] }|null}
 */
export function cvPickStarSystem({ star, systems = [], activeId = null }) {
  const want = Number(star);
  if (want !== 1 && want !== 2) return null;
  const lum = (c) => STAR_TYPES[c]?.luminosity ?? 1;
  const known = systems.filter((s) => s && s.id && s.cls);
  if (!known.length) return null;
  const classes = [...new Set(known.map((s) => s.cls))].sort((a, b) => lum(a) - lum(b));
  const cls = want === 1 ? classes[0] : classes[classes.length - 1];
  const pool = known.filter((s) => s.cls === cls).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const pick = pool.find((s) => s.id === activeId) ?? pool[0];
  return { systemId: pick.id, cls, classes };
}

// ARC CV-3b — doktryna strony A w `cvBattle({doctrine})`: krótkie i pełne nazwy (polecenie bez cudzysłowów: `/kite/.source`).
const CV_DOCTRINES = Object.freeze({
  engage: 'engage_in_range', engage_in_range: 'engage_in_range', kite: 'kite',
  hold: 'hold_position', hold_position: 'hold_position', retreat: 'retreat_at_50', retreat_at_50: 'retreat_at_50',
});

/** ARC CV-3b — nazwa doktryny ze specyfikacji konsoli (null — bez floty, jak dotąd; undefined — nieznana). */
export function cvDoctrineOf(spec) {
  if (spec == null || spec === false || spec === 0 || spec === '') return null;
  const k = String(spec).trim().toLowerCase();
  return CV_DOCTRINES[k];
}

/**
 * ARC CV-3b — rozkazy „Zaangażuj” strony A: bez doktryny wprost (jak dotąd); z doktryną — flota testowa z tą doktryną
 * (znacznik `_cvBattle`, zdejmowana przy następnym teście) i spec przez `FleetSystem.applyDoctrine` (jak rozkaz floty w grze:
 * kite — `preferMaxRange`, hold — rozkaz odrzucony, bez rozkazu).
 * @returns {{ issued: object[], rejected: number, fleet: string|null }}
 */
function cvIssueEngage(K, ships, foes, { doctrine = null, seed = 1, engage = 1 } = {}) {
  const mos = K.movementOrderSystem, fs = K.fleetSystem;
  // M1 — `engage` 0: bez rozkazów po obu stronach (obie strony biją najbliższego — bitwa naprawdę lustrzana); 2: pary lustrzane
  // po OBU stronach (B_i → A_i); 1 (domyślnie, decyzja §3.2-10): „Zaangażuj” tylko strona A, jak w grze.
  if (Number(engage) === 0) return { issued: [], rejected: 0, fleet: null };
  if (Number(engage) === 2) foes.forEach((f, i) => mos.issueOrder(f.id, { type: 'engage', targetEntityId: ships[i % ships.length].id, issuedBy: 'cvBattle' }));
  let fleet = null;
  if (doctrine && fs?.createFleet) {
    fleet = fs.createFleet(`CV-${doctrine}`, { doctrine });
    fleet._cvBattle = seed;
    for (const v of ships) fs.addMember?.(fleet.id, v.id);
  }
  const issued = [];
  let rejected = 0;
  ships.forEach((v, i) => {
    let spec = { type: 'engage', targetEntityId: foes[i % foes.length].id, issuedBy: 'cvBattle' };
    if (fleet) spec = fs.applyDoctrine(fleet, spec);
    if (spec?._rejected) { rejected++; return; }
    issued.push(mos.issueOrder(v.id, spec));
  });
  return { issued, rejected, fleet: fleet?.id ?? null };
}

function pickAiEmpire(K) {
  const all = (K.empireRegistry?.listAll?.() ?? []).filter((e) => e?.id && e.id !== 'player');
  return all.find((e) => K.directorProduction?.capitalOf?.(e.id)) ?? all[0] ?? null;
}

/**
 * Pomocniki konsoli. `getRenderer` / `getSaveSystem` — GameScene podaje własne pola (autozapis: wyłącznie w pamięci).
 * @param {{ getRenderer?: ()=>object|null, getSaveSystem?: ()=>object|null }} [deps]
 */
export function cvBattleDebugHelpers({ getRenderer = () => window.KOSMOS?.threeRenderer ?? null, getSaveSystem = () => null } = {}) {
  // ARC CV-1a (kontrola właściciela) — `star` 1 / 2: widok na wygenerowany układ z najciemniejszą / najjaśniejszą gwiazdą
  // (ta sama droga co chipy układów — `starSystemManager.switchActiveSystem`). Zwraca odczyt albo odmowę.
  const switchToStar = (K, star) => {
    if (!star) return { ok: true, info: null };
    const ss = K.starSystemManager;
    if (!ss?.getAllSystems || !ss.switchActiveSystem) return { ok: false, reason: 'no_star_system_manager' };
    const systems = ss.getAllSystems().map((s) => {
      const st = EntityManager.get?.(s.starEntityId);
      return { id: s.id ?? s.systemId, cls: st?.spectralType ?? null, name: st?.name ?? null };
    });
    const pick = cvPickStarSystem({ star, systems, activeId: K.activeSystemId ?? null });
    if (!pick) return { ok: false, reason: 'no_system_for_star', star };
    const switched = pick.systemId !== K.activeSystemId;
    if (switched && ss.switchActiveSystem(pick.systemId) !== true) return { ok: false, reason: 'switch_failed', systemId: pick.systemId };
    const name = systems.find((s) => s.id === pick.systemId)?.name ?? null;
    return { ok: true, info: { system: pick.systemId, name, cls: pick.cls, switched, classes: pick.classes } };
  };
  return {
    /** Starcie testowe — patrz nagłówek. Zwraca odczyt sceny; ostrzeżenie także w konsoli. */
    cvBattle({ nA = 10, nB = 10, hulls = 'mixed', weapons = 'mixed', kind = 'deep', seed = 1, split = false, atBody = false, mixed = false, battles = 1, warp = 0, star = 0, doctrine = null, engage = 1, random = 0 } = {}) {
      // ARC CV-8a — `kind: 'orbital'` = `cvOrbitalBattle` (atak na kolonię gracza ścieżką EnemyAttackHandler, powtórka na scenie planety)
      if (kind === 'orbital') return this.cvOrbitalBattle({ nA: nA === 10 ? null : nA, nB: nB === 10 ? null : nB, seed });
      const doc = cvDoctrineOf(doctrine);   // ARC CV-3b — doktryna strony A (null — bez floty)
      if (doc === undefined) return { ok: false, reason: 'unknown_doctrine', doctrine, known: Object.keys(CV_DOCTRINES) };
      const K = window.KOSMOS ?? {};
      const vm = K.vesselManager, dscs = K.deepSpaceCombatSystem, mos = K.movementOrderSystem, ts = K.timeSystem;
      const home = K.homePlanet;
      if (!vm || !dscs || !mos || !ts || !home) return { ok: false, reason: 'no_world' };
      if (getRenderer()?._galaxyActive) return { ok: false, reason: 'galaxy_mode' };
      const all = vm.getAllVessels?.() ?? [...(vm._vessels?.values?.() ?? [])];

      // Poprzedni test: w trakcie starcia — odmowa; po starciu — statki zdjęte (rozbiórka bez linii w Dzienniku).
      const old = all.filter(isCvVessel);
      if (old.some((v) => dscs._findActiveEncounterContaining?.(v.id))) return { ok: false, reason: 'battle_in_progress' };
      for (const f of K.fleetSystem?.listFleets?.() ?? []) if (f?._cvBattle != null) K.fleetSystem.disbandFleet(f.id, 'manual');   // ARC CV-3b
      for (const v of old) vm.destroyVessel?.(v.id, { reason: 'dismantled' });
      const sw = switchToStar(K, star);
      if (!sw.ok) return sw;
      const sys = K.activeSystemId ?? 'sys_home';

      const empire = pickAiEmpire(K);
      if (!empire) return { ok: false, reason: 'no_ai_empire' };

      if (!ts.isPaused) ts.pause?.();
      const ss = getSaveSystem();
      if (ss && '_autosaveInterval' in ss) ss._autosaveInterval = 0;   // tylko w pamięci — F5 przywraca ustawienie z menu

      const AU = GAME_CONFIG.AU_TO_PX;
      const others = (vm.getVesselsInSystem?.(sys) ?? []).filter((v) => !v.isWreck && v.position);
      const bodies = ['star', 'planet', 'moon', 'planetoid', 'asteroid', 'comet']
        .flatMap((t) => EntityManager.getByTypeInSystem?.(t, sys) ?? [])
        .filter((b) => Number.isFinite(b?.x) && Number.isFinite(b?.y));
      const c = cvBattleCenter({ seed, vessels: others.map((v) => v.position), bodies, auPx: AU });
      const layout = cvBattleLayout({ nA, nB, hulls, weapons, random, seed });
      const rolled = Number(random) ? { random: 1, fleets: cvFleetsOf(layout) } : {};   // Finding 699 — skład w odczycie
      const warpOf = (s) => Number(warp) === 1 || (Number(warp) === 2 && s.side === 'A');   // ARC CV-1a — model `warp_*`

      // ARC CV-3a3 (D-CV-4, Finding 626) — bitwa PRZY CIELE: statki gracza na slotach orbit ciała (`OrbitalSpaceSystem.assignOrbit`
      // — sama zmiana `position` nie stawia sprite'a na orbicie), wróg w linii obok; starcie zakłada DSCS tak jak w grze: gdy
      // większość strony gracza stoi przy ciele, wróg zostaje do niego PRZYPIĘTY (`_freezeAsStationary` — `dockedAt`, bez orbity;
      // w logice stoi w środku ciała). `mixed` — przy ciele tylko mniejszość statków gracza, reszta wolna: wróg zostaje wolny,
      // skorupa ustawia się w stronę wroga. Statki przy ciele bez rozkazu „Zaangażuj” (rozkaz zdejmuje statek z orbity).
      if (atBody) {
        const oss = K.orbitalSpaceSystem;
        if (!oss) return { ok: false, reason: 'no_orbital_space' };
        const body = cvBattleBody({ atBody, bodies: bodies.filter((b) => b.type !== 'star'), vessels: others.map((v) => v.position), auPx: AU });
        if (!body) return { ok: false, reason: 'no_body', warning: CV_BATTLE.WARNING };
        const nAs = layout.ships.filter((s) => s.side === 'A').length, nBs = layout.ships.length - nAs;
        const nDock = mixed ? Math.max(1, Math.floor((nAs - 1) / 2)) : nAs;
        const a0 = ((cvSeedBase(seed) % 360) * Math.PI) / 180;
        let kFree = 0;
        const made = layout.ships.map((s) => {
          const v = vm.createAndRegister(s.hull, home.id, { name: s.name, modules: s.modules, systemId: sys });
          cvApplyWarp(v, warpOf(s));
          v.systemId = sys;
          v.status = 'idle';
          v.mission = null;
          v.serviceState = 'active';
          if (v.fuel) v.fuel.current = v.fuel.max = 9999;
          v._cvBattle = seed;
          if (s.side === 'B') {
            const o = cvBodyOffsetAU('B', s.index, nBs, a0);
            Object.assign(v.position, { x: body.x + o.dxAU * AU, y: body.y + o.dyAU * AU, state: 'orbiting', dockedAt: null });
            v.ownerEmpireId = empire.id; v.owner = empire.id; v.isEnemy = true;
          } else if (s.index < nDock) {
            Object.assign(v.position, { state: 'orbiting', dockedAt: body.id });
            oss.assignOrbit(body.id, v.id, resolveVesselOrbitalRole(v));
            const p = oss.getPosition(v.id, { x: body.x / 10, z: body.y / 10 }, orbitClockSec());
            v.position.x = p ? p.x * 10 : body.x;
            v.position.y = p ? p.z * 10 : body.y;
          } else {
            const o = cvBodyOffsetAU('Afree', kFree++, nAs - nDock, a0);
            Object.assign(v.position, { x: body.x + o.dxAU * AU, y: body.y + o.dyAU * AU, state: 'orbiting', dockedAt: null });
          }
          return v;
        });
        getRenderer()?._restoreActiveSystemVesselSprites?.();
        const sideA = made.filter((_, i) => layout.ships[i].side === 'A');
        const sideB = made.filter((_, i) => layout.ships[i].side === 'B');
        const ta = sideA[0], tb = sideB[0];
        EventBus.emit('vessel:combatRangeEnter', { vesselAId: ta.id, vesselBId: tb.id, sameFaction: false,
          distanceAU: Math.hypot(ta.position.x - tb.position.x, ta.position.y - tb.position.y) / AU });
        const enc = dscs._findActiveEncounterContaining?.(ta.id) ?? null;
        if (!enc) return { ok: false, reason: 'no_encounter', warning: CV_BATTLE.WARNING };
        for (const v of made) {
          if (enc.vesselStates.has(v.id)) continue;
          const foes = sideA.includes(v) ? sideB : sideA;
          EventBus.emit('vessel:combatRangeEnter', { vesselAId: v.id, vesselBId: foes[0].id, sameFaction: false, distanceAU: 0.1 });
        }
        enc.seedBase = cvSeedBase(seed);
        const free = sideA.filter((v) => v.position?.dockedAt == null);
        const eng = cvIssueEngage(K, free, sideB, { doctrine: doc, seed, engage });   // ARC CV-3b — doktryna strony A
        const orders = eng.issued;
        const members = made.filter((v) => enc.vesselStates.has(v.id)).length;
        console.warn(CV_BATTLE.WARNING);
        return {
          ok: members === made.length, encounter: enc.id, system: sys, star: sw.info, seed, seedBase: enc.seedBase, atBody: true, mixed: !!mixed, ...rolled,
          body: body.id, bodyName: body.name ?? body.id, bodyType: body.type,
          docked: sideA.filter((v) => v.position?.dockedAt === body.id).length,
          enemyPinned: sideB.filter((v) => v.position?.dockedAt === body.id).length,
          sideA: sideA.length, sideB: sideB.length, members, engageOrders: `${orders.filter((o) => o?.ok).length}/${orders.length}`,
          doctrine: doc, doctrineRejected: eng.rejected,
          empire: empire.name ?? empire.id, paused: !!ts.isPaused,
          autosave: ss ? 'off (do F5)' : 'n/a', warning: CV_BATTLE.WARNING,
        };
      }

      // ARC CV-6b2 — `battles: N` (2–5): N OSOBNYCH bitew w oglądanym układzie, każda nA na nB w innym pustym punkcie (≥ 1 AU
      // od statków poprzednich bitew — osobne klastry starć); nazwy kolejne (`CV-A01…` przez wszystkie bitwy), ziarno bitwy k =
      // ziarno + k. Do obejrzenia paska walki z kilkoma liniami i „+N”. Jedna bitwa (domyślnie) — ścieżka niżej bez zmian.
      const nBattles = Math.max(1, Math.min(5, Math.floor(Number(battles) || 1)));
      if (nBattles > 1 && !split) {
        const out = [];
        const placed = others.map((v) => v.position);
        const perSide = { A: layout.ships.filter((s) => s.side === 'A').length, B: layout.ships.filter((s) => s.side === 'B').length };
        let made = [];
        for (let k = 0; k < nBattles; k++) {
          const ck = k === 0 ? c : cvBattleCenter({ seed: seed + k, vessels: placed, bodies, auPx: AU });
          // Finding 699 — przy `random` floty bitwy k z ziarna bitwy (seed + k); szyk (strony, pozycje, para wyzwalająca) ten
          // sam co w `layout`, losowanie zmienia tylko kadłuby i broń — dlatego reszta pętli czyta strony z `layout`
          const lay = Number(random) ? cvBattleLayout({ nA, nB, hulls, weapons, random, seed: seed + k }) : layout;
          const ships = lay.ships.map((s) => {
            const idx = perSide[s.side] * k + s.index + 1;
            const name = `${CV_BATTLE.NAME_PREFIX}${s.side}${String(idx).padStart(2, '0')}`;
            const v = vm.createAndRegister(s.hull, home.id, { name, modules: s.modules, systemId: sys });
            cvApplyWarp(v, warpOf(s));
            Object.assign(v.position, { x: ck.x + s.dxAU * AU, y: ck.y + s.dyAU * AU, state: 'orbiting', dockedAt: null });
            v.systemId = sys; v.status = 'idle'; v.mission = null; v.serviceState = 'active';
            if (v.fuel) v.fuel.current = v.fuel.max = 9999;
            v._cvBattle = seed;
            if (s.side === 'B') { v.ownerEmpireId = empire.id; v.owner = empire.id; v.isEnemy = true; }
            placed.push(v.position);
            return v;
          });
          made = made.concat(ships);
          getRenderer()?._restoreActiveSystemVesselSprites?.();
          const sA = ships.filter((_, i) => layout.ships[i].side === 'A');
          const sB = ships.filter((_, i) => layout.ships[i].side === 'B');
          const ta = ships[layout.trigger.a], tb = ships[layout.trigger.b];
          EventBus.emit('vessel:combatRangeEnter', { vesselAId: ta.id, vesselBId: tb.id, sameFaction: false,
            distanceAU: Math.hypot(ta.position.x - tb.position.x, ta.position.y - tb.position.y) / AU });
          const enc = dscs._findActiveEncounterContaining?.(ta.id) ?? null;
          if (!enc) { out.push({ ok: false, reason: 'no_encounter' }); continue; }
          for (const v of ships) {
            if (enc.vesselStates.has(v.id)) continue;
            const foes = layout.ships[ships.indexOf(v)].side === 'A' ? sB : sA;
            EventBus.emit('vessel:combatRangeEnter', { vesselAId: v.id, vesselBId: foes[0].id, sameFaction: false, distanceAU: 0.1 });
          }
          enc.seedBase = cvSeedBase(seed + k);
          cvIssueEngage(K, sA, sB, { doctrine: doc, seed, engage });   // ARC CV-3b — doktryna strony A
          out.push({ ok: ships.every((v) => enc.vesselStates.has(v.id)), encounter: enc.id,
            centerAU: [Number((ck.x / AU).toFixed(3)), Number((ck.y / AU).toFixed(3))], clear: !!ck.clear,
            ...(Number(random) ? { fleets: cvFleetsOf(lay) } : {}) });
        }
        console.warn(CV_BATTLE.WARNING);
        return {
          ok: out.length === nBattles && out.every((b) => b.ok), battles: out, system: sys, star: sw.info, seed, members: made.length,
          ...(Number(random) ? { random: 1 } : {}),
          empire: empire.name ?? empire.id, paused: !!ts.isPaused, cvStrip: !!GAME_CONFIG.FEATURES?.cvStrip,
          autosave: ss ? 'off (do F5)' : 'n/a', warning: CV_BATTLE.WARNING,
        };
      }

      const made = layout.ships.map((s) => {
        const v = vm.createAndRegister(s.hull, home.id, { name: s.name, modules: s.modules, systemId: sys });
        cvApplyWarp(v, warpOf(s));
        Object.assign(v.position, { x: c.x + s.dxAU * AU, y: c.y + s.dyAU * AU, state: 'orbiting', dockedAt: null });
        v.systemId = sys;
        v.status = 'idle';
        v.mission = null;
        v.serviceState = 'active';
        if (v.fuel) v.fuel.current = v.fuel.max = 9999;
        v._cvBattle = seed;
        if (s.side === 'B') { v.ownerEmpireId = empire.id; v.owner = empire.id; v.isEnemy = true; }
        return v;
      });
      // Sprite'y od razu (gra stoi: bez tiku nie przyjdzie `vessel:positionUpdate`, który dokłada brakujące) — ta sama
      // metoda co powrót do układu; idempotentna.
      getRenderer()?._restoreActiveSystemVesselSprites?.();
      const sideA = made.filter((_, i) => layout.ships[i].side === 'A');
      const sideB = made.filter((_, i) => layout.ships[i].side === 'B');
      const ta = made[layout.trigger.a], tb = made[layout.trigger.b];

      // ARC CV-3a2 (Finding 638) — starcia parami: „Zaangażuj” A_i → B_i PRZED starciem, potem para po parze — DSCS zaczyna
      // starcie od samej pary (pominięcie zbierania przy zamiarze gracza), a statki już walczące w różnych starciach się nie
      // łączą: kilka starć w jednym miejscu. Ziarno starcia k = ziarno + k (ta sama bitwa przy tym samym ziarnie).
      if (split) {
        const pairs = Math.min(sideA.length, sideB.length);
        const orders = cvIssueEngage(K, sideA, sideB, { doctrine: doc, seed, engage }).issued;   // ARC CV-3b — doktryna strony A
        const encs = [];
        for (let i = 0; i < Math.max(sideA.length, sideB.length); i++) {
          const a = sideA[Math.min(i, sideA.length - 1)], b = sideB[Math.min(i, sideB.length - 1)];
          EventBus.emit('vessel:combatRangeEnter', { vesselAId: a.id, vesselBId: b.id, sameFaction: false,
            distanceAU: Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) / AU });
          const e = dscs._findActiveEncounterContaining?.(a.id) ?? dscs._findActiveEncounterContaining?.(b.id);
          if (e && !encs.includes(e)) { e.seedBase = (cvSeedBase(seed) + encs.length) & 0x7fffffff; encs.push(e); }
        }
        const members = made.filter((v) => dscs._findActiveEncounterContaining?.(v.id)).length;
        console.warn(CV_BATTLE.WARNING);
        return {
          ok: members === made.length && encs.length >= Math.min(2, pairs), encounters: encs.map((e) => e.id), split: true, system: sys, star: sw.info, seed, ...rolled,
          centerAU: [Number((c.x / AU).toFixed(3)), Number((c.y / AU).toFixed(3))], clear: c.clear, sideA: sideA.length, sideB: sideB.length, members,
          engageOrders: `${orders.filter((o) => o?.ok).length}/${orders.length}`, empire: empire.name ?? empire.id, paused: !!ts.isPaused,
          autosave: ss ? 'off (do F5)' : 'n/a', warning: CV_BATTLE.WARNING,
        };
      }

      EventBus.emit('vessel:combatRangeEnter', {
        vesselAId: ta.id, vesselBId: tb.id, sameFaction: false,
        distanceAU: Math.hypot(ta.position.x - tb.position.x, ta.position.y - tb.position.y) / AU,
      });
      const enc = dscs._findActiveEncounterContaining?.(ta.id) ?? null;
      if (!enc) return { ok: false, reason: 'no_encounter', warning: CV_BATTLE.WARNING };
      // Statek poza promieniem team-up (nie powinien się zdarzyć przy tym szyku) dołącza parą z najbliższym przeciwnikiem.
      for (const v of made) {
        if (enc.vesselStates.has(v.id)) continue;
        const foes = layout.ships[made.indexOf(v)].side === 'A' ? sideB : sideA;
        const f = foes[0];
        EventBus.emit('vessel:combatRangeEnter', { vesselAId: v.id, vesselBId: f.id, sameFaction: false, distanceAU: 0.1 });
      }
      enc.seedBase = cvSeedBase(seed);
      const eng = cvIssueEngage(K, sideA, sideB, { doctrine: doc, seed, engage });   // ARC CV-3b — doktryna strony A
      const orders = eng.issued;
      const members = made.filter((v) => enc.vesselStates.has(v.id)).length;
      console.warn(CV_BATTLE.WARNING);
      return {
        ok: members === made.length, encounter: enc.id, system: sys, star: sw.info, seed, seedBase: enc.seedBase, ...rolled,
        centerAU: [Number((c.x / AU).toFixed(3)), Number((c.y / AU).toFixed(3))], clear: c.clear,
        sideA: sideA.length, sideB: sideB.length, members, engageOrders: `${orders.filter((o) => o?.ok).length}/${orders.length}`,
        doctrine: doc, doctrineRejected: eng.rejected, engage: Number(engage),
        empire: empire.name ?? empire.id, paused: !!ts.isPaused,
        autosave: ss ? 'off (do F5)' : 'n/a', warning: CV_BATTLE.WARNING,
      };
    },

    /**
     * ARC CV-1a — PARADA 24 slotów modeli (12 klas × bez warp / warp) w pustym punkcie oglądanego układu; każdy statek dostaje
     * rozkaz lotu w tym samym kierunku (`dir` w stopniach, 0 = +X mapy) bez przyciągania do ciała — po wznowieniu czasu
     * wszystkie lecą równolegle, dziobem naprzód. Statki testowe jak w `cvBattle` (znacznik, autozapis wyłączony, zdejmowane
     * przy następnym `cvBattle` / `cvParade`; ⚠ nie zapisuj gry po teście).
     */
    cvParade({ dir = 0, seed = 1, star = 0 } = {}) {
      const K = window.KOSMOS ?? {};
      const vm = K.vesselManager, mos = K.movementOrderSystem, ts = K.timeSystem, dscs = K.deepSpaceCombatSystem;
      const home = K.homePlanet;
      if (!vm || !mos || !ts || !home) return { ok: false, reason: 'no_world' };
      if (getRenderer()?._galaxyActive) return { ok: false, reason: 'galaxy_mode' };
      const all = vm.getAllVessels?.() ?? [...(vm._vessels?.values?.() ?? [])];
      const old = all.filter(isCvVessel);
      if (old.some((v) => dscs?._findActiveEncounterContaining?.(v.id))) return { ok: false, reason: 'battle_in_progress' };
      for (const f of K.fleetSystem?.listFleets?.() ?? []) if (f?._cvBattle != null) K.fleetSystem.disbandFleet(f.id, 'manual');   // ARC CV-3b
      for (const v of old) vm.destroyVessel?.(v.id, { reason: 'dismantled' });
      const sw = switchToStar(K, star);
      if (!sw.ok) return sw;
      const sys = K.activeSystemId ?? 'sys_home';
      if (!ts.isPaused) ts.pause?.();
      const ss = getSaveSystem();
      if (ss && '_autosaveInterval' in ss) ss._autosaveInterval = 0;
      const AU = GAME_CONFIG.AU_TO_PX;
      const others = (vm.getVesselsInSystem?.(sys) ?? []).filter((v) => !v.isWreck && v.position);
      const bodies = ['star', 'planet', 'moon', 'planetoid', 'asteroid', 'comet']
        .flatMap((t) => EntityManager.getByTypeInSystem?.(t, sys) ?? [])
        .filter((b) => Number.isFinite(b?.x) && Number.isFinite(b?.y));
      const c = cvBattleCenter({ seed, vessels: others.map((v) => v.position), bodies, auPx: AU });
      const a = (Number(dir) || 0) * Math.PI / 180;
      const run = { x: Math.cos(a) * CV_BATTLE.PARADE_RUN_AU * AU, y: Math.sin(a) * CV_BATTLE.PARADE_RUN_AU * AU };
      const made = [], orders = [];
      for (const s of cvParadeLayout()) {
        const v = vm.createAndRegister(s.hull, home.id, { name: s.name, modules: s.modules, systemId: sys });
        cvApplyWarp(v, s.warp);
        Object.assign(v.position, { x: c.x + s.dxAU * AU, y: c.y + s.dyAU * AU, state: 'orbiting', dockedAt: null });
        v.systemId = sys; v.status = 'idle'; v.mission = null; v.serviceState = 'active';
        if (v.fuel) v.fuel.current = v.fuel.max = 9999;
        v._cvBattle = 'parade';
        const r = mos.issueOrder(v.id, { type: 'moveToPoint', targetPoint: { x: v.position.x + run.x, y: v.position.y + run.y }, noBodySnap: true, issuedBy: 'cvParade' });
        orders.push(r?.ok ? 'ok' : (r?.reason ?? 'refused'));
        made.push({ name: v.name, key: s.key });
      }
      // Sprite'y PO rozkazach — kurs z misji ustawiony od razu, także na pauzie.
      getRenderer()?._restoreActiveSystemVesselSprites?.();
      console.warn(CV_BATTLE.WARNING);
      return { ok: orders.every((o) => o === 'ok'), ships: made.length, orders: orders.filter((o) => o === 'ok').length + '/' + orders.length,
        refused: [...new Set(orders.filter((o) => o !== 'ok'))], system: sys, star: sw.info, centerAU: [Number((c.x / AU).toFixed(3)), Number((c.y / AU).toFixed(3))],
        dir: Number(dir) || 0, paused: !!ts.isPaused, warning: CV_BATTLE.WARNING };
    },

    /** CV-Z — flaga `cvFxEngine` wycofana (silnik FX z pulami na stałe). */
    cvFx() { return retiredFlag('cvFxEngine'); },

    /** CV-Z — flaga `cvPresets` wycofana (presety jakości i sygnały walki na stałe; poziom — gfx()). */
    cvPresets() { return retiredFlag('cvPresets'); },

    /** CV-Z — flaga `cvWeapons` wycofana (na stałe). */
    cvWeapons() { return retiredFlag('cvWeapons'); },

    /** ARC CV-4a — rejestr salw: liczniki per starcie i od wczytania strony, ostatnie rundy, HP pokazywane vs logiczne (`ThreeRenderer.cvLedgerInfo`). */
    ledgerInfo() {
      const r = getRenderer();
      return r?.cvLedgerInfo ? r.cvLedgerInfo() : { ok: false, reason: 'no_renderer' };
    },

    /** CV-Z — flaga `cvDamage` wycofana (na stałe). */
    cvDamage() { return retiredFlag('cvDamage'); },

    /**
     * ARC CV-5 — wybuch statku TESTOWEGO (parada `cvParade` / bitwa `cvBattle`) danej klasy, najbliższego celowi kamery: cvExplode(/battleship/.source)
     * (bez cudzysłowów — `.source` daje napis), cvExplode() — dowolny. Tylko prezentacja (wybuch i wygląd wraku); statek parady dostaje stop
     * rozkazu ruchu, żeby wrak został w kadrze. Zwolnione tempo: KOSMOS.threeRenderer.cvTuning.FX_TIME_SCALE = 0.25 (pauza zatrzymuje).
     */
    cvExplode(cls = null) {
      const r = getRenderer();
      const K = window.KOSMOS ?? {};
      const vm = K.vesselManager;
      if (!r?.cvExplodeVessel || !vm) return { ok: false, reason: 'no_renderer' };
      let re = null;
      try { re = cls == null || cls === '' ? null : new RegExp(String(cls), 'i'); } catch { return { ok: false, reason: 'bad_pattern' }; }
      const sys = K.activeSystemId ?? 'sys_home';
      const all = vm.getAllVessels?.() ?? [...(vm._vessels?.values?.() ?? [])];
      const cand = all.filter((v) => isCvVessel(v) && v.systemId === sys && !v.isWreck)
        .filter((v) => { const e = r._vessels?.get?.(v.id); return !!e?.sprite?.visible && !e.cvKilled; })
        .filter((v) => { if (!re) return true; const sc = vesselSizeClass(v); return re.test(explosionClassOf(sc)) || re.test(sc) || re.test(v.shipId ?? ''); });
      if (!cand.length) return { ok: false, reason: 'no_ship', hint: 'KOSMOS.debug.cvParade() albo KOSMOS.debug.cvBattle() najpierw' };
      const tgt = r._cameraController?._target ?? null;
      const d2 = (v) => { const p = r._vessels.get(v.id).sprite.position; return tgt ? (p.x - tgt.x) ** 2 + (p.y - tgt.y) ** 2 + (p.z - tgt.z) ** 2 : 0; };
      cand.sort((a, b) => d2(a) - d2(b));
      const v = cand[0];
      if (v._cvBattle === 'parade') K.movementOrderSystem?.cancelOrder?.(v.id, 'cvExplode');
      return r.cvExplodeVessel(v.id);
    },

    /** ARC CV-5 — odczyt: wybuchy, sekwencje w toku, wraki (żar, zbieżność), stany uszkodzeń, pule, rozgrzewka (`ThreeRenderer.cvDamageInfo`). */
    damageInfo() {
      const r = getRenderer();
      return r?.cvDamageInfo ? r.cvDamageInfo() : { ok: false, reason: 'no_renderer' };
    },

    /** CV-Z — flaga `cvShields` wycofana (na stałe). */
    cvShields() { return retiredFlag('cvShields'); },

    /**
     * ARC CV-4b — trafienie w osłonę statku TESTOWEGO (parada `cvParade` / bitwa `cvBattle` po końcu) danej klasy, najbliższego celowi kamery:
     * cvShieldHit(/battleship/.source) (bez cudzysłowów), cvShieldHit() — dowolny. Każde wywołanie zabiera ~42 % osłony (osłona z modułów
     * statku; bez modułu osłony — wirtualna 35), trzecie ją rozbija (rozpad, sygnał `shieldDown`), kolejne trafiają kadłub (iskry, żar,
     * osmalenie na High). Tylko prezentacja; statek parady dostaje stop rozkazu ruchu. Zwolnione tempo: cvTuning.FX_TIME_SCALE = 0.25.
     */
    cvShieldHit(cls = null) {
      const r = getRenderer();
      const K = window.KOSMOS ?? {};
      const vm = K.vesselManager;
      if (!r?.cvShieldHitVessel || !vm) return { ok: false, reason: 'no_renderer' };
      let re = null;
      try { re = cls == null || cls === '' ? null : new RegExp(String(cls), 'i'); } catch { return { ok: false, reason: 'bad_pattern' }; }
      const sys = K.activeSystemId ?? 'sys_home';
      const all = vm.getAllVessels?.() ?? [...(vm._vessels?.values?.() ?? [])];
      const dscs = K.deepSpaceCombatSystem;
      const cand = all.filter((v) => isCvVessel(v) && v.systemId === sys && !v.isWreck && !dscs?._findActiveEncounterContaining?.(v.id))
        .filter((v) => { const e = r._vessels?.get?.(v.id); return !!e?.sprite?.visible && !e.cvKilled; })
        .filter((v) => { if (!re) return true; const sc = vesselSizeClass(v); return re.test(explosionClassOf(sc)) || re.test(sc) || re.test(v.shipId ?? ''); });
      if (!cand.length) return { ok: false, reason: 'no_ship', hint: 'KOSMOS.debug.cvParade() najpierw (albo bitwa po końcu)' };
      const tgt = r._cameraController?._target ?? null;
      const d2 = (v) => { const p = r._vessels.get(v.id).sprite.position; return tgt ? (p.x - tgt.x) ** 2 + (p.y - tgt.y) ** 2 + (p.z - tgt.z) ** 2 : 0; };
      cand.sort((a, b) => d2(a) - d2(b));
      const v = cand[0];
      if (v._cvBattle === 'parade') K.movementOrderSystem?.cancelOrder?.(v.id, 'cvShieldHit');
      const maxHint = (v.modules ?? []).reduce((a, m) => a + (Number(SHIP_MODULES[m]?.stats?.shieldHP) || 0), 0);
      return r.cvShieldHitVessel(v.id, { maxHint });
    },

    /** ARC CV-4b — odczyt osłon: bańka trzyma / opadła, siła, fale, rozpady, regeneracje, pula baniek, osmalenia (`ThreeRenderer.cvShieldInfo`). */
    shieldInfo() {
      const r = getRenderer();
      return r?.cvShieldInfo ? r.cvShieldInfo() : { ok: false, reason: 'no_renderer' };
    },

    /** ARC CV-2b — preset jakości: gfx() — odczyt (poziom, gęstość pikseli, bloom, światła, tekstury, budżety, dławienie, pamięć
     *  tekstur statków); gfx(2) — High, gfx(1) — Medium, gfx(0) — Low (zapis na maszynie, jak ☰ „Grafika”). */
    gfx(level) {
      const r = getRenderer();
      if (!r?.cvGfxInfo) return { ok: false, reason: 'no_renderer' };
      return level === undefined ? r.cvGfxInfo() : r.applyGfxPreset(level);
    },

    /** ARC CV-2b — błysk światła puli w środku oglądanej bitwy (instrument puli: High 4 / Medium 2 / Low 0 świateł). */
    cvLightFlash() {
      const r = getRenderer();
      return r?.cvLightFlash ? r.cvLightFlash() : { ok: false, reason: 'no_renderer' };
    },

    /** ARC CV-2b — sygnały walki: cueStats() — odczyt słuchacza `AudioSystem` (odebrane, scalone, per rodzaj) i szyny renderera;
     *  cueStats(0) — wyzeruj licznik słuchacza przed pomiarem. */
    cueStats(reset) {
      const a = window.KOSMOS?.audioSystem;
      const listener = reset === 0 ? (a?.resetCueStats?.() ?? null) : (a?.cueStats?.() ?? null);
      return { listener, bus: getRenderer()?._cueBus?.stats?.() ?? null };
    },

    /** CV-Z — flaga `cvModels` wycofana (rama kanoniczna na stałe). */
    cvModels() { return retiredFlag('cvModels'); },

    /** ARC CV-1a — modele z `incoming/` dla slotów z indeksu: cvIncoming(1) / cvIncoming(0) / cvIncoming() — przełącz. Promise. */
    cvIncoming(on) {
      const r = getRenderer();
      if (!r?.cvSetIncoming) return { ok: false, reason: 'no_renderer' };
      return r.cvSetIncoming(on === undefined ? !r._cvIncoming : !!on);
    },

    /** ARC CV-1a — testowy wzór punktów świetlnych: cvLightTest(1) / cvLightTest(0) / cvLightTest() — przełącz. */
    cvLightTest(on) {
      const r = getRenderer();
      if (!r?.cvSetLightTest) return { ok: false, reason: 'no_renderer' };
      return r.cvSetLightTest(on === undefined ? !r._cvLightTest : !!on);
    },

    /** ARC CV-1a — odczyt modeli: statki w ramie kanonicznej, hardpointy (plik / zapas), pula punktów świetlnych. */
    modelInfo() {
      const r = getRenderer();
      return r?.cvModelInfo ? r.cvModelInfo() : { ok: false, reason: 'no_renderer' };
    },

    /** CV-Z — flagi `cvStage` (scena bitwy), `cvChoreo` i `cvChoreo2` (choreografia CV-3c) wycofane — na stałe. */
    cvStage() { return retiredFlag('cvStage'); },
    cvChoreo() { return retiredFlag('cvChoreo'); },
    cvChoreo2() { return retiredFlag('cvChoreo2'); },

    /**
     * ARC CV-3c — kamera (`vessel:focus`) na najbardziej uszkodzony żywy statek na scenie bitwy: najwyższy stan uszkodzeń CV-5
     * (1 dym · 2 ogień · 3 krztuszący się silnik), remis — mniejsze HP pokazywane. Tylko odczyt i kamera, stan gry nietknięty.
     */
    cvFocusDamaged() {
      const K = window.KOSMOS ?? {};
      const R = getRenderer();
      const vm = K.vesselManager, dscs = K.deepSpaceCombatSystem;
      if (!R?._vessels || !vm || !dscs) return { ok: false, reason: 'no_world' };
      let best = null;
      for (const [id, e] of R._vessels) {
        if (e.cvKilled || e.isWreck || !(e.cvDmgLevel > 0) || !R._stageMarks?.has?.(id)) continue;
        const enc = dscs._findActiveEncounterContaining?.(id);
        const st = enc?.vesselStates?.get?.(id);
        if (!st || !(st.hp > 0)) continue;
        const pr = R.cvPresentedState?.(id, st);
        const hpPct = Math.round(100 * (pr?.hp ?? st.hp) / Math.max(1, st.hpStart ?? st.hp));
        if (!best || e.cvDmgLevel > best.level || (e.cvDmgLevel === best.level && hpPct < best.hpPct)) best = { id, level: e.cvDmgLevel, hpPct };
      }
      if (!best) return { ok: false, reason: 'no_damaged_ship' };
      K.eventBus?.emit?.('vessel:focus', { vesselId: best.id });
      return { ok: true, vessel: vm.getVessel?.(best.id)?.name ?? best.id, id: best.id, poziom: best.level, hpProcent: best.hpPct };
    },

    /** ARC CV-3b — „Wycofaj się z bitwy” (ten sam rozkaz co PPM) dla statku nr `n` (od 1) żywej strony A testu w aktywnym starciu. */
    cvRetreat(n = 1) {
      const K = window.KOSMOS ?? {};
      const vm = K.vesselManager, mos = K.movementOrderSystem, dscs = K.deepSpaceCombatSystem;
      if (!vm || !mos || !dscs) return { ok: false, reason: 'no_world' };
      const all = vm.getAllVessels?.() ?? [...(vm._vessels?.values?.() ?? [])];
      const mine = all.filter((v) => isCvVessel(v) && !v.isEnemy && !v.isWreck)
        .filter((v) => { const enc = dscs._findActiveEncounterContaining?.(v.id); return !!enc && (enc.vesselStates?.get?.(v.id)?.hp ?? 0) > 0; })
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      const k = Math.max(1, Math.floor(Number(n) || 1));
      const v = mine[k - 1];
      if (!v) return { ok: false, reason: 'no_ship', alive: mine.map((x) => x.name) };
      const r = mos.issueOrder(v.id, { type: 'retreat', issuedBy: 'cvRetreat' });
      return { ok: !!r?.ok, vessel: v.name, id: v.id, reason: r?.reason ?? null };
    },

    /**
     * ARC CV-8a — BITWA ORBITALNA na scenie planety: atak AI na kolonię gracza PRAWDZIWĄ ścieżką `EnemyAttackHandler` (napastnicy
     * z misją `attack` na orbicie ciała kolonii → partia 500 ms czasu realnego → `BattleSystem.resolveBattle` → `battle:resolved`
     * z kluczem `fx` → powtórka). Gra na PAUZIE — start: wznowienie czasu. Domyślnie wygrywa gracz (nA 5 na nB 5 + wieża 2 + siatka 1,
     * jeden okręt gracza w hangarze); `lose: 1` — wygrywa AI (10 na 1, bez budynków obrony); `big: 1` — 10 na 10 + wieża 3 + siatka 2;
     * `outOfView: 1` — przed rozstrzygnięciem widok na INNY zbadany układ (bitwa poza widokiem — sam baner). Bez cudzysłowów:
     *   cvOrbitalBattle() · cvOrbitalBattle({lose: 1}) · cvOrbitalBattle({nA: 3, nB: 2, hangar: 0, tower: 0, grid: 0}) · cvOrbitalBattle({outOfView: 1})
     * ARC CV-8b (#635) — RAJD rozstrzygnięty dwa razy (napastnicy domyślnie 4, okręty gracza 2 na orbicie ciała, bez hangaru, wieża 2 + siatka 1):
     * `raid: 1` — napastnicy na orbicie ciała z misją `attack`; partia EAH rusza dopiero, gdy zacznie się starcie DSCS z ich udziałem
     *   (`vessel:engaged`) — bitwa orbitalna rozstrzyga się W TRAKCIE starcia (kolejność odwrotna, szybka i powtarzalna);
     * `raid: 2` — napastnicy `raidDist` AU od ciała (0,55 — poza promieniem „już przy ciele” #663) NA DRODZE ciała, z rozkazem `attack`
     *   (`MovementOrderSystem`), czas 1 t/s: starcie DSCS w podejściu, ocaleli wznawiają atak (F130) i gonią ciało (planeta szybsza od okrętów).
     * Jedno ogłoszenie na rajd: `KOSMOS.debug.announceInfo().raidGroups`.
     * Poziomy obrony (`tower`, `grid`) dokłada narzędzie WYŁĄCZNIE tej bitwie tego ciała (`WarSystem._cvStagerDefence`, zdejmowane po
     * bitwie). Wojna z imperium AI deklarowana przez EAH, jeśli jej nie ma (jak w grze). ⚠ Statki testowe w stanie gry — nie zapisuj.
     */
    cvOrbitalBattle({ nA = null, nB = null, hangar = 1, tower = null, grid = null, seed = 1, lose = 0, big = 0, outOfView = 0, raid = 0, raidDist = 0.55 } = {}) {
      const K = window.KOSMOS ?? {};
      const vm = K.vesselManager, ts = K.timeSystem, eah = K.enemyAttackHandler, oss = K.orbitalSpaceSystem, cm = K.colonyManager;
      const warSys = K.warSystem, dscs = K.deepSpaceCombatSystem;
      if (!vm || !ts || !eah || !oss || !cm || !warSys) return { ok: false, reason: 'no_world' };
      if (getRenderer()?._galaxyActive) return { ok: false, reason: 'galaxy_mode' };
      if ((getRenderer()?.cvOrbital?.replays?.size ?? 0) > 0) return { ok: false, reason: 'replay_in_progress' };
      // `lose`: 10 napastników na 1 okręt bez obrony budynków — okręty gracza już stojące w układzie (np. w GATE-S4 trzy uzbrojone
      // fregaty w hangarze stolicy) też bronią (EAH: wszystkie okręty gracza w służbie w układzie), więc przewaga musi być duża
      const RAID = Number(raid) === 2 ? 2 : (Number(raid) ? 1 : 0);
      if (RAID && !K.movementOrderSystem) return { ok: false, reason: 'no_world' };
      const preset = RAID ? { nA: 4, nB: 2, tower: 2, grid: 1 }
        : Number(big) ? { nA: 10, nB: 10, tower: 3, grid: 2 } : Number(lose) ? { nA: 10, nB: 1, tower: 0, grid: 0 } : { nA: 5, nB: 5, tower: 2, grid: 1 };
      const NA = Math.max(1, Math.min(10, Math.floor(Number(nA ?? preset.nA) || 1)));
      const NB = Math.max(0, Math.min(10, Math.floor(Number(nB ?? preset.nB) || 0)));
      const TW = Math.max(0, Math.floor(Number(tower ?? preset.tower) || 0)), GR = Math.max(0, Math.floor(Number(grid ?? preset.grid) || 0));
      const NH = RAID ? 0 : Math.max(0, Math.min(NB, Math.floor(Number(Number(lose) && hangar === 1 ? 0 : hangar) || 0)));
      // Poprzedni test — statki zdjęte (bez linii w Dzienniku); w trakcie starcia DSCS — odmowa.
      const all = vm.getAllVessels?.() ?? [...(vm._vessels?.values?.() ?? [])];
      const old = all.filter(isCvVessel);
      if (old.some((v) => dscs?._findActiveEncounterContaining?.(v.id))) return { ok: false, reason: 'battle_in_progress' };
      for (const v of old) vm.destroyVessel?.(v.id, { reason: 'dismantled' });
      const sys = K.activeSystemId ?? 'sys_home';
      const cols = (cm.getPlayerColonies?.() ?? []).filter((c) => (EntityManager.get(c.planetId)?.systemId ?? 'sys_home') === sys && !c.isOutpost);
      const col = cols.find((c) => c.planetId === K.homePlanet?.id) ?? cols[0] ?? null;
      const body = col ? EntityManager.get(col.planetId) : null;
      if (!body) return { ok: false, reason: 'no_player_colony_in_view', system: sys };
      const empire = pickAiEmpire(K);
      if (!empire) return { ok: false, reason: 'no_ai_empire' };
      if (!ts.isPaused) ts.pause?.();
      const ss = getSaveSystem();
      if (ss && '_autosaveInterval' in ss) ss._autosaveInterval = 0;
      const layout = cvBattleLayout({ nA: NA, nB: Math.max(1, NB), seed });
      const home = K.homePlanet ?? body;
      const onOrbit = (v) => {
        Object.assign(v.position, { state: 'orbiting', dockedAt: body.id });
        oss.assignOrbit(body.id, v.id, resolveVesselOrbitalRole(v));
        const p = oss.getPosition(v.id, { x: body.x / 10, z: body.y / 10 }, orbitClockSec());
        v.position.x = p ? p.x * 10 : body.x; v.position.y = p ? p.z * 10 : body.y;
      };
      const made = { A: [], B: [] };
      for (const s of layout.ships) {
        if (s.side === 'B' && s.index >= NB) continue;
        const v = vm.createAndRegister(s.hull, home.id, { name: s.name, modules: s.modules, systemId: sys });
        v.systemId = sys; v.status = 'idle'; v.mission = null; v.serviceState = 'active';
        if (v.fuel) v.fuel.current = v.fuel.max = 9999;
        v._cvBattle = seed;
        if (s.side === 'A' && RAID === 2) {
          // #635 — rajder w wolnej przestrzeni NA DRODZE ciała (tam, gdzie ciało będzie za chwilę — ciało nadlatuje, zbliżenie czołowe; za
          // ciałem pościg trwałby długo), co najmniej `raidDist` AU od ciała (poza promieniem „już przy ciele” #663); rozkaz `attack` niżej
          v.ownerEmpireId = empire.id; v.owner = empire.id; v.isEnemy = true;
          const AU = GAME_CONFIG.AU_TO_PX, minD = Math.max(0.05, Number(raidDist) || 0.55) * AU;
          let ahead = null;
          for (let lead = 0.02; lead <= 0.6 && !ahead; lead += 0.01) {
            const p = vm._predictPosition?.(body.id, ts.gameTime + lead);
            if (p && Math.hypot(p.x - body.x, p.y - body.y) >= minD) ahead = p;
          }
          const d = Math.hypot(body.x, body.y) || 1;
          const base = ahead ?? { x: body.x + (body.x / d) * minD, y: body.y + (body.y / d) * minD };
          const ux = (base.x - body.x) / (Math.hypot(base.x - body.x, base.y - body.y) || 1), uy = (base.y - body.y) / (Math.hypot(base.x - body.x, base.y - body.y) || 1);
          const side = (s.index - (NA - 1) / 2) * 0.04 * AU;
          Object.assign(v.position, { state: 'orbiting', dockedAt: null, x: base.x - uy * side, y: base.y + ux * side });
        } else if (s.side === 'A') {
          v.ownerEmpireId = empire.id; v.owner = empire.id; v.isEnemy = true;
          onOrbit(v);
          v.status = 'on_mission';
          v.mission = { type: 'attack', targetId: body.id, targetName: body.name ?? body.id };
        } else if (s.index < NH) {
          Object.assign(v.position, { state: 'docked', dockedAt: body.id, x: body.x, y: body.y });
          v.colonyId = body.id;
        } else onOrbit(v);
        made[s.side].push(v);
      }
      getRenderer()?._restoreActiveSystemVesselSprites?.();
      warSys._cvStagerDefence = (TW || GR) ? { planetId: body.id, tower: TW, grid: GR } : null;
      let view = null;
      if (Number(outOfView)) {
        const ssm = K.starSystemManager;
        const other = (ssm?.getAllSystems?.() ?? []).map((x) => x.id ?? x.systemId).find((id) => id && id !== sys);
        if (!other || ssm.switchActiveSystem?.(other) !== true) return { ok: false, reason: 'no_other_system', warning: CV_BATTLE.WARNING };
        view = other;
      }
      let raidOrders = null;
      if (RAID === 2) {
        // #635 — prawdziwy lot: rozkaz `attack` (jak `DirectorOffensive`), czas 1 t/s — podejście trwa kilka sekund, starcie zwalnia czas
        raidOrders = made.A.map((v) => K.movementOrderSystem.issueOrder(v.id, { type: 'attack', targetBodyId: body.id, issuedBy: 'cv_stager', bypassFuelCheck: true })?.ok ?? false);
        ts.setMultiplier?.(3);
      } else if (RAID === 1) {
        // #635 — partia EAH dopiero, gdy ruszy starcie DSCS napastników (DSCS zawiesza misję na czas starcia — przylot z ZAPAMIĘTANĄ misją)
        const missions = new Map(made.A.map((v) => [v.id, v.mission]));
        const ids = new Set(missions.keys());
        let fired = false;
        const onEngaged = ({ sideA = [], sideB = [] } = {}) => {
          if (fired || ![...sideA, ...sideB].some((id) => ids.has(id))) return;
          fired = true;
          EventBus.off?.('vessel:engaged', onEngaged);
          for (const v of made.A) if (!v.isWreck) eah._onVesselArrived(v, missions.get(v.id));
        };
        EventBus.on('vessel:engaged', onEngaged);
        raidOrders = 'engaged';
      } else {
        for (const v of made.A) eah._onVesselArrived(v, v.mission);   // partia 500 ms czasu realnego → rozstrzygnięcie (także w pauzie)
      }
      console.warn(CV_BATTLE.WARNING);
      return {
        ok: true, system: sys, body: body.id, bodyName: body.name ?? body.id, empire: empire.name ?? empire.id,
        attackers: made.A.length, defenders: made.B.length, hangar: NH, tower: TW, grid: GR, viewNow: view ?? sys,
        ...(RAID ? { raid: true, raidOrders } : {}),
        flags: { cvOrbital: !!GAME_CONFIG.FEATURES?.cvOrbital },
        note: RAID === 1 ? 'rajd: wznow czas — starcie DSCS na orbicie, w jego trakcie bitwa przy kolonii (powtorka po starciu) — jeden baner'
          : RAID === 2 ? 'rajd z lotem: wznow czas (1 t/s); starcie DSCS w podejsciu, ocaleli gonia kolonie (sufit czekania 15 s)'
          : 'rozstrzygniecie za ~0,5 s czasu realnego; wznow czas, zeby obejrzec powtorke (orbitalInfo())', paused: !!ts.isPaused,
        warning: CV_BATTLE.WARNING,
      };
    },

    /** ARC CV-8a — odczyt powtórek bitew orbitalnych: rundy, strzelcy stron, emitery, hangar, zniszczenia zaplanowane / pokazane, w widoku. */
    orbitalInfo() {
      const o = getRenderer()?.cvOrbital;
      if (!o) return { ok: false, reason: 'no_renderer' };
      const last = Object.values(gameState.get?.('battles') ?? {}).filter((b) => b?.location?.planetId && !b?.location?.point).slice(-1)[0] ?? null;
      return { ok: true, ...o.info(),
        ostatniaBitwaOrbitalna: last ? { bitwa: last.id, tury: last.turns, zwyciezca: last.winner, odwrot: last.retreated ?? null, cialo: last.location?.planetId } : null };
    },

    /**
     * ARC CV-8a — flaga `cvOrbital`: cvOrbital(1) — ON, cvOrbital(0) — OFF, cvOrbital() — przełącz. Czytana przy bitwie. ARC CV-8b — OFF po
     * wycofaniu imitacji, modalu i kina: bez powtórki (wraki od razu), baner i wpisy Dziennika od razu, bitwy rajdu osobno.
     */
    cvOrbital(on) {
      const F = GAME_CONFIG.FEATURES;
      F.cvOrbital = on === undefined ? !F.cvOrbital : !!on;
      return { cvOrbital: F.cvOrbital };
    },

    /**
     * M1 — odczyt bitew (bez cudzysłowów): aktywne starcia i ostatnia rozstrzygnięta bitwa DSCS. `wrakiTylkoPrzy0HP` — liczba wraków
     * wśród uczestników równa stratom obu stron (okręt ginie wyłącznie przy 0 HP; dawniej time-out rozbijał żywych przegranych).
     */
    battleInfo() {
      const K = window.KOSMOS ?? {};
      const dscs = K.deepSpaceCombatSystem, vm = K.vesselManager;
      const fleeing = (v) => v?.movementOrder?._retreatFromCombat === true || v?.movementOrder?.retreatFromBattleId != null;
      const active = (dscs?.listActive?.() ?? []).map((e) => {
        const side = (sd) => [...(sd?.vesselIds ?? []), ...(sd?.joinedVesselIds ?? [])];
        const alive = (ids) => ids.filter((id) => (e.vesselStates?.get?.(id)?.hp ?? 0) > 0);
        const a = alive(side(e.sideA)), b = alive(side(e.sideB));
        return { starcie: e.id, runda: e.currentRound, zywiA: a.length, zywiB: b.length,
          uciekaA: a.filter((id) => fleeing(vm?.getVessel?.(id))).length, uciekaB: b.filter((id) => fleeing(vm?.getVessel?.(id))).length,
          odwrotAI: e.sideB?.retreating === true || e.sideA?.retreating === true };
      });
      const ds = Object.values(gameState.get?.('battles') ?? {}).filter((b) => String(b?.id ?? '').startsWith('battle_ds_'));
      const b = ds[ds.length - 1] ?? null;
      let last = null;
      if (b) {
        const ids = [...(b.participantA?.vesselIds ?? []), ...(b.participantB?.vesselIds ?? [])];
        const known = ids.map((id) => vm?.getVessel?.(id)).filter(Boolean);
        const wraki = known.filter((v) => v.isWreck).length;
        last = { bitwa: b.id, rundy: b.turns ?? null, zwyciezca: b.winner ?? 'remis', odwrot: b.retreated ?? null, koniec: b.endReason ?? null,
          stratyA: b.lossesA, stratyB: b.lossesB, wraki, wrakiTylkoPrzy0HP: known.length === ids.length ? wraki === (b.lossesA ?? 0) + (b.lossesB ?? 0) : null };
      }
      return { aktywne: active, ostatnia: last };
    },

    /** M1 — czysta próba ścieżki orbitalnej (`BattleSystem.resolveBattle`, bez stanu gry): bez limitu 30 tur, pat bez wraków, bez wygranej obrońcy. */
    m1OrbitalCheck() {
      const fleet = (hp, weapons, extra = {}) => ({ hp, shieldHP: 0, armor: 0, evasion: 0.1, techMult: 1, morale: 1, weapons, ...extra });
      const row = (r) => ({ tury: r.turns, zwyciezca: r.winner, odwrot: r.retreated, koniec: r.endReason, pat: isStalemate(r) });
      const gun = [{ damage: 2, tracking: 0.7 }];
      return {
        tankowe: row(resolveBattle(fleet(150, gun), fleet(150, gun), { seed: 7 })),
        bezbronni: row(resolveBattle(fleet(100, []), fleet(100, []), { seed: 1 })),
        tarcza: row(resolveBattle(fleet(100, gun), fleet(100, [], { shieldHP: 100, shieldRegen: 50 }), { seed: 1 })),
        rowne: row(resolveBattle(fleet(120, [{ damage: 8, tracking: 0.7 }]), fleet(120, [{ damage: 8, tracking: 0.7 }]), { seed: 5 })),
      };
    },

    /** ARC CV-6b2 — flaga `cvStrip` (pasek walki zamiast karty): cvStrip(1) — ON, cvStrip(0) — OFF, cvStrip() — przełącz. Czytana co klatkę. */
    cvStrip(on) {
      const F = GAME_CONFIG.FEATURES;
      F.cvStrip = on === undefined ? !F.cvStrip : !!on;
      return { cvStrip: F.cvStrip };
    },

    /** ARC CV-6a — flaga `cvTactical` (warstwa taktyczna bitwy): cvTactical(1) — ON, cvTactical(0) — OFF, cvTactical() — przełącz.
     *  Czytana co klatkę (warstwa HUD, etykiety, znaczniki, paski HP 3D). */
    cvTactical(on) {
      const F = GAME_CONFIG.FEATURES;
      F.cvTactical = on === undefined ? !F.cvTactical : !!on;
      const hud = (typeof window !== 'undefined') ? window.KOSMOS?.hudLayer : null;
      hud?.wake?.();
      return { cvTactical: F.cvTactical };
    },

    /** ARC CV-7 — kamera reżysera: cvDirector(1) — włączona (jak chip), cvDirector(0) — wyłączona, cvDirector() — przełącz. */
    cvDirector(on) {
      const d = getRenderer()?.cvDirector;
      if (!d) return { ok: false, reason: 'no_renderer' };
      const want = on === undefined ? d.chipState === 'off' : !!on;
      d.setArmed(want);
      return { ok: true, flag: d.flag, chip: d.chipState };
    },

    /** ARC CV-7 — odczyt reżysera: ujęcie (typ, podmiot, ile zostało), następne ujęcia, bohater, opóźnienie w R, kto ma kamerę. */
    directorInfo() {
      const d = getRenderer()?.cvDirector;
      return d ? d.info() : { ok: false, reason: 'no_renderer' };
    },

    /** ARC CV-7 — przewodnik 9:16 (kadr rolki): cv916(1) / cv916(0) / cv916() — przełącz. Reżyser kadruje w nim. */
    cv916(on) {
      const d = getRenderer()?.cvDirector;
      if (!d) return { ok: false, reason: 'no_renderer' };
      return { ok: true, promo916: d.setPromo916(on === undefined ? !d.promo916 : !!on) };
    },

    /** ARC CV-7 — tryb nagrywania (bez interfejsu): cvCapture(1) / cvCapture(0) / cvCapture() — przełącz; klawisz F9, wyjście Esc. */
    cvCapture(on) {
      const d = getRenderer()?.cvDirector;
      if (!d) return { ok: false, reason: 'no_renderer' };
      return { ok: true, capture: d.setCapture(on === undefined ? !d.capture : !!on) };
    },

    /**
     * ARC CV-7 — nagrywarka rolek (jak F10): cvRecord(1) — start, cvRecord(0) — stop i pobranie pliku, cvRecord() — przełącz.
     * CV-Z (Finding 722) — zapis kończy się asynchronicznie: tuż po stopie `state: 'saving'` (nazwa pliku i długość już znane,
     * `note: 'zapisywanie…'`); kolejne cvRecord(0) przy zatrzymanej nagrywarce niczego nie robi i zwraca stan końcowy (`state: 'saved'`,
     * `file`, `seconds`, `lastBytes`, `lastError`). Wskaźnik na ekranie: „Zapisywanie…”, potem „Zapisano plik (s, MB)”.
     */
    cvRecord(on) {
      const d = getRenderer()?.cvDirector;
      if (!d) return { ok: false, reason: 'no_renderer' };
      const want = on === undefined ? !d.reel.recording : !!on;
      if (!want && !d.reel.recording) return { ok: true, ...d.reel.info() };
      d.setRecording(want);
      return { ok: true, ...d.reel.info() };
    },

    /** ARC CV-7 — flaga `cvDirector`: cvDirectorFlag(0) — bez chipa i reżysera (tempo prezentacji 1), cvDirectorFlag(1) — z powrotem. */
    cvDirectorFlag(on) {
      const F = GAME_CONFIG.FEATURES;
      F.cvDirector = on === undefined ? !F.cvDirector : !!on;
      const d = getRenderer()?.cvDirector;
      if (!F.cvDirector && d) { if (d.reel?.recording) d.reel.stop(); if (d.capture) d.setCapture(false); d._stopBattle?.('off'); d.setPromo916(false); }
      return { cvDirector: F.cvDirector };
    },

    /** ARC CV-6a — warstwa taktyczna z ostatniej klatki HUD: per bitwa stopień zoomu, ikony, znak, linie ognia, mgła, pasma. */
    tacticalInfo() {
      const hud = (typeof window !== 'undefined') ? window.KOSMOS?.hudLayer : null;
      const layer = hud?._sublayers?.find?.((s) => s?.debug && s.debug()?.id === 'combat') ?? null;
      if (!layer) return { ok: false, reason: 'no_layer' };
      return { ok: true, cvTactical: !!GAME_CONFIG.FEATURES.cvTactical, ...layer.debug() };
    },

    /** ARC CV-3a1 — scena bitwy z tej klatki: klastry, stopień sceny, prowadnica, odstępy strzelec → cel w długościach fregaty. */
    stageInfo() {
      const r = getRenderer();
      if (!r?.stageInfo) return { ok: false, reason: 'no_renderer' };
      return r.stageInfo();
    },

    /** Pomiar 300 klatek (wynik w konsoli po ~5 s) + stan pul teraz. */
    fxStats(frames = 300) {
      const r = getRenderer();
      if (!r?.cvFxStats) return { ok: false, reason: 'no_renderer' };
      return r.cvFxStats(frames);
    },
  };
}
