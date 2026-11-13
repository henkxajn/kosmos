// FxEngine — silnik efektów walki na PULACH (ARC COMBAT VISUALS, krok CV-2a, §2.10, flaga `cvFxEngine`).
//
// Co zastępuje (pod flagą): dzisiejszą ścieżkę `_spawnCombatTracer`, która przy KAŻDYM strzale tworzyła geometrię,
// materiał i siatkę (linia 1 px + kula błysku + pierścień + sprite), a po czasie życia je niszczyła; wiek efektu liczyła
// z `performance.now()` (efekty grały w pauzie — Finding 616), a wspólny limit 120 slotów wyrzucał najstarsze, także
// te, które jeszcze nie zdążyły się pokazać (Finding 617).
//
// Kształt:
//   · trzy pule instancji, zbudowane RAZ (rozgrzewka): wiązki laserów, smugi pocisków (kinetyk, rakieta), iskry
//     (błysk trafienia, pierścień osłony, błysk na modelu). Po rozgrzewce silnik NIE tworzy żadnego obiektu THREE —
//     strzał to zapis kilku liczb do tablic atrybutów i przesłanie zakresu [0, aktywne);
//   · wiek efektu liczy shader z `uTime` = zegar PREZENTACJI (PresentationClock): pauza zatrzymuje wszystko,
//     po wznowieniu bez nadrabiania (D-CV-10);
//   · końce wiązek i iskry idą co klatkę za sprite'ami statków (jak dziś — `_followTracerEnds`, `_followFxTarget`);
//   · tempo jak dziś (`combatFxPace`: czasy życia, rozrzut salwy, opóźnienie błysku) — rejestr salw i HP w chwili
//     uderzenia to CV-4. Pudło jak dziś: słabsza smuga do celu, bez błysku.
//
// Pojemności (§2.10: strzałów NIGDY nie gubimy): najgorsza runda 10 na 10 to 20 statków × 5 slotów użytkowych
// (krążownik) = 100 strzałów; przy najkrótszej rundzie strojenia (`combatRoundMs` 50 ms) żywych smug ~11 rund salw
// naraz. Pule mieszczą to z zapasem (keeper `cv_fx_engine_smoke` mierzy szczyt). Gdyby mimo to pula się zapełniła,
// NAJSTARSZY efekt kończy się wcześniej (licznik `steals`), a nowy strzał zawsze się rysuje.
//
// ⚠ THREE wstrzykiwany (`new FxEngine({ THREE })`): pod node goły specyfikator 'three' to atrapa bez instancjonowania,
//   a keepery budują silnik na PRAWDZIWYM Three.js r171 z `src/lib` (§1 Q9). Losowości tu nie ma; gdy dojdzie
//   (CV-4), tylko `rendererRandom` albo RNG z ziarna starcia — nigdy `Math.random` (reguła CV-0b).
// ⚠ Gorąca ścieżka (`spawnShot`, `update`, metody puli) bez `new` — pilnuje tego keeper (licznik konstrukcji THREE
//   i tablic typowanych w oknie 100 salw).

import { buildFxShaders, BOLT_SEGMENTS } from './FxShaders.js';
import { weaponColor } from '../../config/CombatFxConfig.js';
import { HIT_GLOW } from '../../utils/VesselFxLogic.js';
import { CHOREO_TUNING, CHOREO2_TUNING } from './ChoreographyLogic.js';   // ARC CV-3b — pokrętła choreografii; CV-3c — lot wzdłuż kursu
import { LIVE_LIGHT_POOL } from './LightPool.js';          // ARC CV-2b — pokrętła puli świateł (jedno źródło wartości domyślnych)
import { LIVE_CUE } from './CombatCueBus.js';              // ARC CV-2b — pokrętła szyny sygnałów walki
import { LEDGER_TUNING } from './CombatLedgerLogic.js';    // ARC CV-4a — pokrętła harmonogramu salw (rejestr)
import { EXP_TUNING } from './ExplosionLogic.js';          // ARC CV-5 — pokrętła wybuchów, wraków i stanów uszkodzeń
import { SHIELD_TUNING } from './ShieldLogic.js';          // ARC CV-4b — pokrętła osłon (bańka, fale, rozpad) i osmaleń
import { TAC_TUNING } from '../../ui/HudCombatLogic.js';   // ARC CV-6a — pokrętła warstwy taktycznej (`TAC_*`, podwarstwa HUD)
import { DIR_TUNING } from './CameraDirectorLogic.js';      // ARC CV-7 — pokrętła kamery reżysera (`DIR_*`)
import { ORB_TUNING } from './OrbitalReplayLogic.js';       // ARC CV-8a — pokrętła powtórki bitwy orbitalnej (`ORB_*`)

/** Pojemności pul (instancje). Pamięć: 13 / 11 liczb float na instancję — razem ok. 0,5 MB. Iskry ×2 względem szczytu
 *  zmierzonego przy górnej granicy (100 strzałów co 50 ms, wszystkie trafione na osłonie: ~4 070 żywych — keeper T4).
 *  ARC CV-4a — pule języka broni (flaga `cvWeapons`): wiązki laserów z wieżyczek, pociski w locie (kinetyk, rakieta) i punkty
 *  świetlne z ruchem (iskry trafień, żar, błysk wylotu, ładowanie). Najgorsza runda 10 na 10: 100 strzałów × (iskry ≤ 15 + 3)
 *  ≈ 1 800 punktów na rundę, życie ≤ 0,5 R — pojemność z zapasem ×4 przy najkrótszym tempie strojenia. */
export const FX_POOL_CAPACITY = Object.freeze({ beam: 1024, tracer: 1024, spark: 8192, wbeam: 1024, bolt: 1024, mote: 8192,
  // ARC CV-5 — pule uszkodzeń (flaga `cvDamage`): dym (kłęby wybuchów, stanów uszkodzeń i wraków), wybuchy / płomienie / fala /
  // iskry żaru, odłamki. Najgorszy przypadek 10 na 10: 20 okrętów × 3 punkty uszkodzeń (dym co ~170 ms żyje ~2 s, płomień co
  // ~110 ms żyje ~0,4 s) ≈ 700 + 550 cząstek naraz, do tego kilka wybuchów (pancernik ≈ 130 cząstek, 24 odłamki) — zapas ×3.
  smoke: 4096, blast: 6144, debris: 1024 });

/**
 * ARC CV-4a — pokrętła rysunku języka broni (flaga `cvWeapons`) — na żywo (`KOSMOS.threeRenderer.cvTuning.WPN_*`, alias w
 * `LIVE_CV_FX`): szerokość i blask wiązki, długość ogona pocisku, łuk i głowa rakiety, iskry (liczba, prędkość, rozmiar,
 * życie), żar trafienia, błysk wylotu, ładowanie lasera, pudło, wieżyczki, przechył wraku. Bez pinów na wartościach (F11).
 */
export const LIVE_WPN_FX = {
  WPN_BEAM_WIDTH:     0.0012,  // [WU] połowa szerokości wiązki lasera z wieżyczki
  WPN_BEAM_MIN_PX:    2.5,     // [CSS px] najmniejsza pełna szerokość wiązki na ekranie
  WPN_BEAM_CORE:      3.4,     // wzmocnienie HDR rdzenia wiązki (próg bloomu = 1,0)
  WPN_BOLT_WIDTH:     0.0009,  // [WU] połowa szerokości pocisku (rakieta × WPN_MISSILE_WIDTH_MUL)
  WPN_BOLT_MIN_PX:    2.5,     // [CSS px] najmniejsza pełna szerokość pocisku na ekranie
  WPN_BOLT_CORE:      4.0,     // wzmocnienie HDR rdzenia pocisku
  WPN_MISSILE_WIDTH_MUL: 1.25, // rakieta szersza od pocisku kinetycznego
  WPN_TRACER_LEN:     0.08,    // [R] ogon pocisku kinetycznego (czas — długość rośnie z prędkością)
  WPN_KIN_HEAD:       1.2,     // wzmocnienie głowy pocisku kinetycznego
  WPN_MISSILE_TRAIL:  0.18,    // [R] ogon rakiety (czas; pomiar na żywo: 0,3 R — ogon na 1/3–2/3 toru, rakiety czytały się jak lasery)
  WPN_MISSILE_ARC:    0.3,     // odchylenie punktu kontrolnego toru rakiety × długość toru
  WPN_MISSILE_HEAD:   2.5,     // wzmocnienie głowy rakiety
  // ARC CV-3c (decyzja 44 (7), flaga `cvChoreo2`) — rakieta na High: SMAA i bloom w px CSS (CV-5, decyzja 41) zjadały ~⅓ energii cienkiej
  // smugi. Pary klatek z CV-4a (`fe232ac`) w IDENTYCZNYM kadrze: głowa 35,5 tys. wobec 52,8 tys. (ΣY w promieniu 30 px), ogon 44 wobec 50 px;
  // Średnia bez zmian (34,9 / 35,0 tys.). Kompensacja WYŁĄCZNIE przy aktywnym SMAA: głowa × 1,4 (3,5 → 47,4 tys., ogon 50,3 px), szerokość
  // × 1,08 (strojenie: × 1,28 przestrzeliwał do 67 tys.).
  WPN_SMAA_MISSILE_HEAD_K:  1.4,
  WPN_SMAA_MISSILE_WIDTH_K: 1.08,
  // Decyzja właściciela 45 (5) — kompensacja także dla kinetyka (pocisk: głowa, szerokość — per strzał) i lasera (wiązka: rdzeń, szerokość —
  // uniformy puli przy aktywnym SMAA, `update({ smaa })`). Pary klatek CV-4a (`fe232ac`) ↔ teraz w identycznym kadrze (ΣY całej smugi):
  // kinetyk 28,4 tys. wobec 20,4 tys. bez kompensacji (−28 %; × 1,4 / × 1,08 przestrzeliwał do 30,3 tys.) — głowa × 1,3, szerokość × 1,08;
  // laser 351,5 tys. wobec 359,0 tys. bez kompensacji (+2 % — wiązka ma ~2,3 px, SMAA jej nie zjada; × 1,4 / × 1,08 dawało +14 %) — × 1.
  WPN_SMAA_KIN_HEAD_K:      1.3,
  WPN_SMAA_KIN_WIDTH_K:     1.08,
  WPN_SMAA_BEAM_CORE_K:     1.0,
  WPN_SMAA_BEAM_WIDTH_K:    1.0,
  WPN_MOTE_CORE:      2.6,     // wzmocnienie HDR rdzenia punktów (iskry, żar, błysk wylotu, ładowanie)
  WPN_SPARKS:         10,      // iskier na trafienie kadłuba przy budżecie High (Medium / Low — proporcjonalnie do budżetu cząstek)
  WPN_SPARK_SPEED:    3.0,     // [L / R] prędkość iskier
  WPN_SPARK_SIZE:     0.18,    // [L] rozmiar iskry
  WPN_SPARK_LIFE:     0.35,    // [R] życie iskry
  WPN_GLOW_K:         0.8,     // żar trafienia × rozmiar celu
  WPN_GLOW_LIFE:      0.5,     // [R] życie żaru
  WPN_MUZZLE_K:       0.55,    // błysk wylotu × rozmiar strzelca
  WPN_MUZZLE_LIFE:    0.1,     // [R] życie błysku wylotu
  WPN_CHARGE_K:       0.6,     // ładowanie lasera × rozmiar strzelca (rośnie do ×1,8)
  WPN_MISS_OFFSET:    0.9,     // pudło mija cel o × rozmiar celu (nie mniej niż pół długości fregaty)
  WPN_MISS_OVERSHOOT: 0.6,     // i leci dalej za cel o × odstęp strzelec → cel
  WPN_TURRET_TIE:     0.12,    // wieżyczki o namiarach różnych o mniej (cosinus) — równe, strzelają po kolei
  WPN_KILL_TILT_MS:   300,     // [ms] przechył wraku narasta w chwili zniszczenia
};

/** Rodzaje iskier (atrybut `aKind`). */
export const SPARK_KIND = Object.freeze({ flash: 0, ring: 1, glow: 2 });

/**
 * Pokrętła strojenia na żywo — `KOSMOS.threeRenderer.cvTuning.BEAM_CORE = 4` działa od następnej klatki, dla wszystkich
 * żywych efektów (silnik przepisuje je co klatkę do uniformów). ⚠ ALIAS w rendererze, nie kopia (lekcja sunTuning).
 * Bez pinów na wartościach (F11). TRACER_CORE i MIN_PX — strojenie właściciela na bramce CV-2a (2026-11-08; było 2,6 i 2).
 */
export const LIVE_CV_FX = {
  BEAM_WIDTH:   0.0015,  // [WU] połowa szerokości wstęgi lasera (1 L = długość fregaty = 0,016 WU)
  BEAM_CORE:    3.0,     // wzmocnienie HDR rdzenia wiązki (próg bloomu = 1,0)
  TRACER_WIDTH: 0.001,   // [WU] połowa szerokości smugi pocisku (rakieta × 1,4)
  TRACER_CORE:  4.0,     // wzmocnienie HDR rdzenia smugi
  MIN_PX:       3.0,     // [CSS px] najmniejsza PEŁNA szerokość strzału na ekranie — czytelny przy każdym zoomie
  FLASH_K:      3.0,     // średnica błysku trafienia = rozmiar modelu celu × K (rośnie ×1 → ×3)
  FLASH_CORE:   2.4,     // wzmocnienie HDR rdzenia błysku
  FLASH_MIN_PX: 6,       // [CSS px] podłoga / sufit błysku na ekranie
  FLASH_MAX_PX: 48,
  // Finding 663 (dodatek 2) — płaski cyjanowy pierścień osłony przy trafieniu w tarczę: CV-Z — kod usunięty (osłonę pokazuje bańka CV-4b);
  // pokrętło `SHIELD_RING_ENABLED` wycofane.
  RING_K:       4.0,     // średnica pierścienia osłony = rozmiar modelu × K
  RING_MIN_PX:  8,
  RING_MAX_PX:  64,
  GLOW_K:       HIT_GLOW.MODEL_K,   // błysk na modelu = rozmiar modelu × K (jak dziś, CP18)
  GLOW_MIN_PX:  HIT_GLOW.MIN_PX,
  GLOW_MAX_PX:  96,
  FLASH_GROW:   3.0,     // błysk trafienia rośnie w czasie życia ×1 → ×GROW (jak dziś)
  RING_GROW:    3.0,     // pierścień osłony — j.w.
  // ARC CV-3a3 (Finding 653, decyzja właściciela §3.2-11 — ŁATA do CV-4 / CV-4b / CV-5 / CV-6a) — scena bitwy: błysk
  // i pierścień osłony mniejsze i wolniej rosnące (silnik: `update`), kula wybuchu wraku w skali
  // kadłuba i celownik wroga gasnący na scenie (renderer: `_spawnExplosion`, `_syncEnemyAlertMarkers`). Strojenie, bez pinów.
  STAGE_FLASH_K:    1.2,   // średnica błysku = rozmiar modelu × K (bez sceny — FLASH_K)
  STAGE_FLASH_GROW: 1.5,
  STAGE_RING_K:     1.8,   // średnica pierścienia osłony = rozmiar modelu × K (bez sceny — RING_K)
  STAGE_RING_GROW:  1.25,
  STAGE_FIREBALL_K: 1.5,   // promień kuli wybuchu wraku u szczytu = rozmiar kadłuba × K (bez sceny — podłoga 0,2 j. ≈ 5 L i ×3)
  STAGE_RETICLE_FADE_K: 0.25,   // celownik wroga na scenie gaśnie liniowo, gdy stopień sceny statku rośnie od 0 do K
  // ARC CV-6b (decyzja właściciela 20 — D-CV-3 zmienione) — podłoga stopnia sceny bitwy (renderer `_tickBattleStage`,
  // `_stageWatchFit`): 1 — bitwa w widoku na scenie przy KAŻDYM zoomie (domyślnie); 0 — krzywa zoomu semantycznego CV-3a1
  // (skala prawdziwa z daleka) — wyłącznie do porównania z konsoli.
  STAGE_BLEND_FLOOR: 1,
  // ARC CV-3c (decyzja właściciela 44 (2) 2026-11-12 — „statki w bitwie są zbyt blisko siebie”) — ROZSUNIĘCIE sceny bitwy: prawo sceny,
  // podłogi rozsunięcia i kolizji, rozrzut pionu i koperta choreografii × to (`BattleStageLogic.spreadLaw`; renderer `_tickBattleStage`).
  // 1 = scena CV-3a…CV-5 (odstępy par laser ~3,5 L, kinetyk ~8 L, rakiety ~13,5 L); 1,35 — o ~35 % więcej miejsca. Pasma, prowadnica
  // i niezmiennik D-CV-6 niezmiennicze wobec skali. Czytane co klatkę (zmiana — scena przestawia się płynnie w ≤ 1 rundę).
  STAGE_SPREAD: 1.5,
  // ARC CV-3c (flaga `cvChoreo2`, decyzja 44 (4)) — WYLOT DYSZ zamiast stożka smugi (renderer `_nozzleGlowSet`): rozmiary w promieniach
  // dyszy z pliku hardpointów (przestrzeń modelu), jasności — wzmocnienie barwy 0x7ff4ff (rdzeń > 1 = HDR, bloomuje). Czytane co klatkę.
  NOZZLE_R_MUL:     1.0,   // mnożnik promienia dyszy z pliku
  NOZZLE_CORE:      3.2,   // wzmocnienie HDR rdzenia (próg bloomu 1,0) przy pełnym ciągu; jałowy ciąg — 35 %
  NOZZLE_CORE_K:    2.0,   // średnica rdzenia [promienie dyszy]
  NOZZLE_HALO:      0.5,   // jasność poświaty (poniżej progu bloomu)
  NOZZLE_HALO_K:    5.5,   // średnica poświaty [promienie dyszy]
  NOZZLE_FLARE:     0.6,   // jasność krótkiego błysku ciągu
  NOZZLE_FLARE_LEN: 3.2,   // długość błysku przy pełnym ciągu [promienie dyszy] (∝ ciąg² — przy małym ciągu znika)
  NOZZLE_FLARE_W:   1.6,   // szerokość błysku [promienie dyszy]
  // ARC CV-1a (flaga `cvModels`) — statki w ramie kanonicznej (renderer `_addVesselModelCv`, `_applyExhaust`, `_tickCvModels`).
  // Wszystkie czytane CO KLATKĘ — zmiana w konsoli działa od następnej klatki, bez przebudowy statków. Strojenie, bez pinów.
  MODEL_PLUME_LEN:    0.8,   // długość smugi silnika w długościach statku (dawniej podłoga 0,03 WU ≈ 1,9 L — Finding 619)
  MODEL_PLUME_R_MIN:  0.03,  // najmniejszy promień smugi (przestrzeń znormalizowana: długość statku = 1); dysze z pomiaru ≈ 0,02–0,12
  MODEL_PLUME_R_MUL:  1.0,   // mnożnik promienia dyszy z pliku hardpointów
  MODEL_KC_GAIN:      1.0,   // mnożnik wzmocnienia maski koloru-klucza (wszystkie statki — wspólny uniform)
  // Kontrola właściciela CV-1a (2026-11-11) — czytelność pod barwną gwiazdą: sygnałem swój / obcy jest obwódka w kolorze
  // strony, więc tint ciała wroga jest słabszy (1,0 = siła sprzed kontroli: albedo ku 0xff4466 · 0,55 + emisja 0x880022).
  MODEL_ENEMY_TINT:   0.45,  // mnożnik CAŁEGO tintu ciała wroga (albedo i emisja; Finding 620)
  MODEL_WRECK_BURN:   1.0,   // mnożnik żaru wraku (krawędź + poświata — do CV-1a niewidoczny, Finding 620)
  MODEL_FILL:         0.25,  // wypełnienie neutralne względem kamery (albedo × kolor), niezależne od gwiazdy; słabnie na stronie oświetlonej
  MODEL_RIM_GAIN:     0.8,   // obwódka (fresnel) w kolorze strony — swój chłodna biel, wróg rola `alert` motywu
  MODEL_RIM_POWER:    4.0,   // wykładnik obwódki — większy = cieńsza krawędź
  MODEL_LIFT_CEIL:    0.95,  // sufit wypełnienia + obwódki (liniowo); < 1,0 = bez bloomu (próg 1,0), > 1,0 — bloom świadomie
  // ARC CV-4b (pozycja 0 — Finding 707): żywe kadłuby świeciły na biało ku gwieździe — mapa szorstkości MNOŻY `roughness`, więc gładkie
  // panele dawały odblask do 449 × próg bloomu (gwiazda F, pomiar `kosmos-handover/cv-4b/707/`). Podłoga szorstkości (szerszy odblask,
  // metaliczność z mapy nietknięta — metal zostaje metalem) i miękkie kolano najjaśniejszego kanału BEZPOŚREDNIEGO odblasku (nigdy ponad kolano;
  // emisja i światło rozproszone bez zmian). 0 / 0 — wygląd CV-1a co do wyrażeń (kontrola). Strojenie, bez pinów.
  MODEL_ROUGH_MIN:    0.4,   // podłoga szorstkości kadłuba (0 — szorstkość z mapy, jak CV-1a)
  MODEL_SPEC_CAP:     0.7,   // [liniowo] kolano najjaśniejszego kanału bezpośredniego odblasku: cap · (1 − e^(−L / cap)); 0 — bez kolana
  // Finding 684: pomiar w grze (fregata ≈ 31 / 62 px): przy 1,0 czerwone punkty na szarym kadłubie ledwo czytelne, przy 2,0 wyraźne
  // (poświata ≈ 10–12 px), przy 3,0 rozlana plama 25–28 px; ponowna kontrola właściciela (2026-11-11): przy 2,0 światło dziobu za mocne
  // ⇒ 1,4 (w jego pliku dwa cyjanowe punkty dziobu nakładają się i sumują — skutek #685, kliknie je ponownie).
  MODEL_LIGHT_GAIN:   1.4,   // mnożnik wzmocnienia punktów świetlnych (`lights[]` z pliku hardpointów)
  // Finding 684 (kontrola właściciela 2026-11-11): punkt NIGDY mniejszy niż MIN_PX na ekranie; gaśnie wyłącznie z rozmiarem STATKU
  // na ekranie — pełny od FADE_PX px długości statku, zero przy FADE_END_PX (daleki widok). Shader: `ShipLightPoints`. Ponowna
  // kontrola właściciela (2026-11-11): przy oddalaniu światła nie gasły ⇒ 20 → 10 px (było 10 → 5).
  MODEL_LIGHT_MIN_PX: 2.0,   // [CSS px] podłoga średnicy punktu na ekranie (dawniej 1,5 — próg gaśnięcia punktu)
  MODEL_LIGHT_FADE_PX:     20,   // [CSS px] długość statku na ekranie, poniżej której punkty zaczynają gasnąć
  MODEL_LIGHT_FADE_END_PX: 10,   // [CSS px] długość statku na ekranie, przy której punkty znikają
  // ARC CV-3b (flaga `cvChoreo`) — choreografia w kopercie (renderer `_choreoCluster`, `ChoreographyLogic`): koperta klasy [L],
  // okres wzoru [s] (prędkość kątowa = 2π / okres), sufit skrętu [°/s], pion [L], jasność silnika w walce, przechył. Czytane
  // CO KLATKĘ. Strojenie, bez pinów (wartości domyślne — `CHOREO_TUNING`).
  ...CHOREO_TUNING,
  // ARC CV-3c (flaga `cvChoreo2`) — lot wzdłuż kursu (`ChoreographyLogic.stepChoreo2*`): okres pętli klasy [s], głębokość ku celowi,
  // sufit pochylenia płaszczyzny pętli [°], próg prędkości kursu (× szczyt pętli). Czytane CO KLATKĘ. Strojenie, bez pinów.
  ...CHOREO2_TUNING,
  // ARC CV-2b (flaga `cvPresets`) — pula świateł efektów (`LightPool`: jasność, zasięg, obwiednia błysku) i szyna sygnałów walki
  // (`CombatCueBus`: najwyżej sygnałów na klatkę, okno scalania). Czytane co klatkę / przy błysku. Strojenie, bez pinów.
  ...LIVE_LIGHT_POOL,
  ...LIVE_CUE,
  // ARC CV-4a (flaga `cvWeapons`) — harmonogram salw (`CombatLedgerLogic`: okno salw, ładowanie, loty, margines zniszczenia,
  // opóźnienie) i rysunek języka broni (`LIVE_WPN_FX`). Harmonogram czytany przy każdej rundzie, rysunek — co klatkę / przy strzale.
  ...LEDGER_TUNING,
  ...LIVE_WPN_FX,
  // ARC CV-5 (flaga `cvDamage`) — wybuchy warstwowe, stany uszkodzeń, płonące wraki (`ExplosionLogic`: `EXP_*`, `WRECK_*`, `DMG_*`,
  // `FX_TIME_SCALE` — zwolnione tempo efektów, wyłącznie prezentacja). Czytane przy każdym wybuchu i co klatkę. Strojenie, bez pinów.
  ...EXP_TUNING,
  // ARC CV-4b (flaga `cvShields`) — osłony i pancerz (`ShieldLogic`: `SHD_*` — dopasowanie bańki, fale, siła, rozpad, regeneracja;
  // `SCORCH_*` — osmalenia kadłuba). Czytane co klatkę i przy trafieniu. Strojenie, bez pinów.
  ...SHIELD_TUNING,
  // ARC CV-6a (flaga `cvTactical`) — warstwa taktyczna (`HudCombatLogic`: `TAC_*` — przekazanie zoomu ikon, próg znaku bitwy
  // z histerezą, anti-overlap, linie ognia, mikropaski, ramka, pasma). Czytane CO KLATKĘ przez podwarstwę HUD. Strojenie, bez pinów.
  ...TAC_TUNING,
  // ARC CV-7 (flaga `cvDirector`) — kamera reżysera (`CameraDirectorLogic`: `DIR_*` — długości ujęć, kąty, dystanse, przejścia,
  // bohater i spowolnienie, strażnicy, wstrząs, 9:16). Czytane CO KLATKĘ i przy każdym ujęciu. Strojenie, bez pinów.
  ...DIR_TUNING,
  // ARC CV-8a (flaga `cvOrbital`) — powtórka bitwy orbitalnej (`OrbitalReplayLogic`: `ORB_*` — długość powtórki, kadencja broni,
  // podłoga ocalałych, emitery obrony, formacja sceny planety). Czytane przy starcie powtórki i przy każdym rozwiązaniu sceny.
  ...ORB_TUNING,
};

const MISSILE_WIDTH_MUL = 1.4;        // smuga rakiety szersza od kinetyka (atrybut instancji)
const HIT_ALPHA = 0.9, MISS_ALPHA = 0.4;   // jak dziś: trafienie 0,9, pudło 0,4
const FLASH_ALPHA = 0.85, GLOW_ALPHA = 1.0;
const DEFAULT_TARGET_SIZE = 0.016;   // [WU] fregata — gdy rozmiaru celu nie da się ustalić
const DEFAULT_Y = 0.3;               // [WU] wysokość statku w wolnej przestrzeni (gdy punkt bez y)

// Narożniki quada (x, y, z) i indeksy — wspólne dla obu programów (STREAK: x ∈ {0, 1}; SPARK: x ∈ {−1, 1}).
const STREAK_CORNERS = [0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0];
const SPARK_CORNERS = [-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0];
const QUAD_INDEX = [0, 1, 2, 2, 1, 3];

// ARC CV-4a — pasek pocisku (BOLT): BOLT_SEGMENTS odcinków wzdłuż x ∈ [0, 1] (ogon → głowa), y = ±1 w poprzek.
const BOLT_CORNERS = [];
const BOLT_INDEX = [];
for (let s = 0; s <= BOLT_SEGMENTS; s++) BOLT_CORNERS.push(s / BOLT_SEGMENTS, -1, 0, s / BOLT_SEGMENTS, 1, 0);
for (let s = 0; s < BOLT_SEGMENTS; s++) { const a = 2 * s; BOLT_INDEX.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }

/** Jedna pula instancji: tablice atrybutów, liczba aktywnych, zwalnianie przez zamianę z ostatnim. */
class FxPool {
  constructor(THREE, { name, capacity, corners, fields, material, parent, index = QUAD_INDEX, baseGeometry = null }) {
    this.name = name;
    this.capacity = capacity;
    const geo = new THREE.InstancedBufferGeometry();
    if (baseGeometry) {   // ARC CV-5 — geometria bazowa z normalnymi (bryłka odłamka) zamiast narożników quada
      geo.setAttribute('position', baseGeometry.getAttribute('position'));
      const nrm = baseGeometry.getAttribute('normal');
      if (nrm) geo.setAttribute('normal', nrm);
      // ARC CV-3c — atrybuty wierzchołków geometrii bazowej poza położeniem i normalną (wariant odłamka `aVar`, krawędź `aEdge`)
      for (const [k, a] of Object.entries(baseGeometry.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.setAttribute(k, a);
      if (baseGeometry.index) geo.setIndex(baseGeometry.index);
    } else {
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(corners), 3));
      geo.setIndex(index);
    }
    this.fieldList = [];
    this.f = {};
    for (const [key, size] of fields) {
      const array = new Float32Array(capacity * size);
      const attr = new THREE.InstancedBufferAttribute(array, size);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(key, attr);
      const field = { key, size, array, attr };
      this.fieldList.push(field);
      this.f[key] = field;
    }
    geo.instanceCount = 0;
    this.geometry = geo;
    this.material = material;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.name = 'cvFx_' + name;
    this.mesh.frustumCulled = false;   // pozycje w atrybutach — sfera geometrii bazowej nic nie znaczy
    this.mesh.raycast = () => {};      // efekty nie łapią kliku
    this.mesh.visible = false;
    parent.add(this.mesh);
    this.n = 0;
    this.peak = 0;
    this.spawned = 0;
    this.retired = 0;
    this.steals = 0;
    this.death = new Float64Array(capacity);   // [ms prezentacji] koniec życia instancji (bezwzględnie)
    this.followA = new Array(capacity).fill(null);
    this.followB = new Array(capacity).fill(null);
    this.dirty = false;
  }

  /** Slot dla nowego efektu; pełna pula — slot NAJSTARSZEGO (kończy się wcześniej), nowy efekt zawsze dostaje miejsce. */
  alloc() {
    this.spawned++;
    this.dirty = true;
    if (this.n < this.capacity) {
      const s = this.n++;
      if (this.n > this.peak) this.peak = this.n;
      return s;
    }
    let best = 0;
    let bestDeath = this.death[0];
    for (let i = 1; i < this.n; i++) if (this.death[i] < bestDeath) { bestDeath = this.death[i]; best = i; }
    this.steals++;
    this.followA[best] = null;
    this.followB[best] = null;
    return best;
  }

  set3(key, slot, a, b, c) {
    const fl = this.f[key];
    const o = slot * fl.size;
    fl.array[o] = a; fl.array[o + 1] = b; fl.array[o + 2] = c;
  }

  set4(key, slot, a, b, c, d) {
    const fl = this.f[key];
    const o = slot * fl.size;
    fl.array[o] = a; fl.array[o + 1] = b; fl.array[o + 2] = c; fl.array[o + 3] = d;
  }

  set1(key, slot, a) { this.f[key].array[slot] = a; }
  set2(key, slot, a, b) { const f = this.f[key], i = slot * 2; f.array[i] = a; f.array[i + 1] = b; }   // ARC CV-3c — `aShape` odłamka

  /** Zwolnij slot: ostatni aktywny wchodzi na jego miejsce (aktywne zawsze w [0, n)). */
  free(slot) {
    const last = this.n - 1;
    if (slot !== last) {
      for (let k = 0; k < this.fieldList.length; k++) {
        const fl = this.fieldList[k];
        fl.array.copyWithin(slot * fl.size, last * fl.size, last * fl.size + fl.size);
      }
      this.death[slot] = this.death[last];
      this.followA[slot] = this.followA[last];
      this.followB[slot] = this.followB[last];
    }
    this.followA[last] = null;
    this.followB[last] = null;
    this.n = last;
    this.retired++;
    this.dirty = true;
  }

  /** Zdejmij efekty, których życie minęło (od końca — zamiana z ostatnim nie pomija żadnego). */
  retire(nowMs) {
    for (let i = this.n - 1; i >= 0; i--) if (this.death[i] <= nowMs) this.free(i);
  }

  /** Prześlij zakres [0, n) zmienionych atrybutów; pusta pula — nie rysuje się wcale. */
  upload() {
    this.geometry.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    if (!this.dirty || this.n === 0) { this.dirty = false; return; }
    for (let k = 0; k < this.fieldList.length; k++) {
      const fl = this.fieldList[k];
      fl.attr.clearUpdateRanges();
      fl.attr.addUpdateRange(0, this.n * fl.size);
      fl.attr.needsUpdate = true;
    }
    this.dirty = false;
  }

  stats() {
    return { active: this.n, capacity: this.capacity, peak: this.peak, spawned: this.spawned, retired: this.retired, steals: this.steals };
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.geometry.dispose();
  }
}

/**
 * ARC CV-4a — pula języka broni: do tego, co ma `FxPool`, dwa końce śledzone co klatkę z PRZESUNIĘCIEM (tryb 1 — przesunięcie
 * w świecie od środka statku, tryb 2 — punkt w przestrzeni modelu statku: wieżyczka, obraca się ze statkiem), każdy do chwili
 * `until` (pocisk: start śledzi wieżyczkę do wystrzału, koniec — cel do trafienia), i przesunięcie punktu kontrolnego toru
 * od środka odcinka (rakieta). Tablice zbudowane RAZ.
 */
class WpnPool extends FxPool {
  constructor(THREE, opts) {
    super(THREE, opts);
    const c = this.capacity;
    this.idA = new Array(c).fill(null); this.mA = new Uint8Array(c); this.oA = new Float32Array(c * 3); this.untilA = new Float64Array(c);
    this.idB = new Array(c).fill(null); this.mB = new Uint8Array(c); this.oB = new Float32Array(c * 3); this.untilB = new Float64Array(c);
    this.ctrl = new Float32Array(c * 3);
  }

  free(slot) {
    const last = this.n - 1;
    if (slot !== last) {
      this.idA[slot] = this.idA[last]; this.mA[slot] = this.mA[last]; this.untilA[slot] = this.untilA[last];
      this.idB[slot] = this.idB[last]; this.mB[slot] = this.mB[last]; this.untilB[slot] = this.untilB[last];
      this.oA.copyWithin(slot * 3, last * 3, last * 3 + 3);
      this.oB.copyWithin(slot * 3, last * 3, last * 3 + 3);
      this.ctrl.copyWithin(slot * 3, last * 3, last * 3 + 3);
    }
    this.idA[last] = null; this.idB[last] = null; this.mA[last] = 0; this.mB[last] = 0;
    super.free(slot);
  }

  /** Koniec A albo B (`end` 0 / 1): id statku (null — punkt stały), tryb, przesunięcie, śledzenie do chwili `until`. */
  setFollow(slot, end, id, mode, ox, oy, oz, until) {
    const o = slot * 3;
    if (end === 0) { this.idA[slot] = id ?? null; this.mA[slot] = id != null ? mode : 0; this.oA[o] = ox; this.oA[o + 1] = oy; this.oA[o + 2] = oz; this.untilA[slot] = until; }
    else { this.idB[slot] = id ?? null; this.mB[slot] = id != null ? mode : 0; this.oB[o] = ox; this.oB[o + 1] = oy; this.oB[o + 2] = oz; this.untilB[slot] = until; }
  }
}

/**
 * ARC CV-5 — bryłka odłamka: ośmiościan z wierzchołkami przesuniętymi deterministycznie (skrót z położenia — ten sam wierzchołek
 * w każdej ścianie dostaje to samo przesunięcie, bryła zostaje zamknięta), płaskie normalne. Budowana RAZ przy silniku.
 * ARC CV-3c (decyzja właściciela 44 (7) — „odłamki na początku duże i bardzo kwadratowe”) — do tej samej geometrii dochodzą 4 ODŁAMKI
 * BLACHY: nieregularne wypukłe wielokąty (4–6 wierzchołków, wydłużone, ostre rogi) o małej grubości, z lekko pochyloną górą (fasety).
 * Wariant każdego wierzchołka w atrybucie `aVar` (0 — ośmiościan CV-5, 1–4 — odłamki), ściany boczne (krawędź blachy) w `aEdge` = 1;
 * instancja wybiera wariant atrybutem `aShape.x` (shader odrzuca wierzchołki innych wariantów), `aShape.y` = 1 — żar tylko na krawędziach.
 */
function buildDebrisGeometry(THREE) {
  const g = new THREE.OctahedronGeometry(1, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let h = Math.imul(Math.round(x * 7 + 11) * 73856093 ^ Math.round(y * 7 + 13) * 19349663 ^ Math.round(z * 7 + 17) * 83492791, 0x9e3779b1) >>> 0;
    const u = (h & 0xffff) / 65535;
    h = Math.imul(h ^ (h >>> 13), 0x85ebca6b) >>> 0;
    const v = (h & 0xffff) / 65535;
    pos.setXYZ(i, x * (0.62 + 0.55 * u), y * (0.55 + 0.6 * v), z * (0.6 + 0.5 * ((u + v) % 1)));
  }
  // ARC CV-3c — odłamki blachy (warianty 1–4) dopisane za ośmiościanem; niezindeksowane trójkąty jak ośmiościan
  const P = [...pos.array];
  const VAR = new Array(pos.count).fill(0), EDGE = new Array(pos.count).fill(1);
  const hashU = (k) => { let h = Math.imul((k + 1) * 0x27d4eb2d ^ 0x165667b1, 0x9e3779b1) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; };
  const tri = (a, b, c, variant, edge) => { P.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) { VAR.push(variant); EDGE.push(edge); } };
  const SHARDS = [   // [wierzchołki obrysu, wydłużenie (z / x), grubość]
    [4, 0.42, 0.13], [5, 0.55, 0.15], [3, 0.6, 0.14], [6, 0.38, 0.12],
  ];
  SHARDS.forEach(([n, elong, thick], si) => {
    const variant = si + 1;
    const ring = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (hashU(si * 31 + i) - 0.5) * (Math.PI / n) * 0.9;
      const r = 0.62 + 0.5 * hashU(si * 57 + i * 3 + 1);
      const up = (hashU(si * 91 + i * 7 + 2) - 0.5) * thick * 0.7;   // pochylenie górnej ściany (fasety)
      ring.push([Math.cos(a) * r, thick / 2 + up, Math.sin(a) * r * elong]);
    }
    const top = ring, bot = ring.map(([x, , z], i) => [x, -thick / 2 + (hashU(si * 13 + i * 5 + 3) - 0.5) * thick * 0.4, z]);
    const cT = top.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n, s[2] + p[2] / n], [0, 0, 0]);
    const cB = bot.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n, s[2] + p[2] / n], [0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      tri(cT, top[j], top[i], variant, 0);          // góra (odwrotnie do ruchu wskazówek — normalna w +Y)
      tri(cB, bot[i], bot[j], variant, 0);          // dół
      tri(top[i], top[j], bot[j], variant, 1);      // bok — krawędź blachy (żar)
      tri(top[i], bot[j], bot[i], variant, 1);
    }
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('aVar', new THREE.Float32BufferAttribute(VAR, 1));
  out.setAttribute('aEdge', new THREE.Float32BufferAttribute(EDGE, 1));
  out.computeVertexNormals();
  g.dispose();
  return out;
}

export class FxEngine {
  /**
   * @param {{ THREE: object, parent?: object, logDepth?: boolean, resolve?: (id:string)=>({x:number,y:number,z:number}|null),
   *           nowMs?: number, capacity?: { beam?: number, tracer?: number, spark?: number }, tuning?: object }} opts
   *   resolve — pozycja RYSOWANEGO statku (sprite widoczny) albo null: końce wiązek i iskry idą za nią co klatkę.
   */
  constructor({ THREE, parent = null, logDepth = true, resolve = null, resolveLocal = null, nowMs = 0, capacity = {}, tuning = LIVE_CV_FX } = {}) {
    if (!THREE?.InstancedBufferGeometry) throw new Error('[FxEngine] wymagany THREE (r171) z InstancedBufferGeometry');
    this.THREE = THREE;
    this.tuning = tuning;
    this._resolve = typeof resolve === 'function' ? resolve : null;
    // ARC CV-4a — punkt w przestrzeni modelu statku → świat (wieżyczka): (id, x, y, z, out) → boolean (false — statek niewidoczny)
    this._resolveLocal = typeof resolveLocal === 'function' ? resolveLocal : null;
    this._tmpP = { x: 0, y: 0, z: 0 };
    this.nowMs = Number.isFinite(nowMs) ? nowMs : 0;
    this._epoch = this.nowMs;
    this.root = new THREE.Group();
    this.root.name = 'cvFxEngine';
    if (parent) parent.add(this.root);
    this._color = new THREE.Color();

    const src = buildFxShaders({ logDepth });
    const common = { transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };
    const streakMat = (style) => new THREE.ShaderMaterial({
      ...common,
      uniforms: { uTime: { value: 0 }, uWidth: { value: 0.001 }, uMinPx: { value: 2 }, uPxToWorld: { value: 0.001 },
        uCore: { value: 3 }, uStyle: { value: style } },
      vertexShader: src.streak.vertexShader, fragmentShader: src.streak.fragmentShader,
    });
    const sparkMat = new THREE.ShaderMaterial({
      ...common,
      uniforms: { uTime: { value: 0 }, uPxToWorld: { value: 0.001 }, uCore: { value: 2.4 },
        uSizeK: { value: new THREE.Vector3(3, 4, 1.6) }, uMinPx: { value: new THREE.Vector3(6, 8, 12) },
        uMaxPx: { value: new THREE.Vector3(48, 64, 96) }, uGrow: { value: new THREE.Vector3(3, 3, 1) } },
      vertexShader: src.spark.vertexShader, fragmentShader: src.spark.fragmentShader,
    });
    const STREAK_FIELDS = [['aStart', 3], ['aEnd', 3], ['aColor', 3], ['aParams', 4]];
    const SPARK_FIELDS = [['aPos', 3], ['aColor', 3], ['aParams', 4], ['aKind', 1]];
    const cap = { ...FX_POOL_CAPACITY, ...capacity };
    this.beams = new FxPool(THREE, { name: 'beam', capacity: cap.beam, corners: STREAK_CORNERS, fields: STREAK_FIELDS, material: streakMat(0), parent: this.root });
    this.tracers = new FxPool(THREE, { name: 'tracer', capacity: cap.tracer, corners: STREAK_CORNERS, fields: STREAK_FIELDS, material: streakMat(1), parent: this.root });
    this.sparks = new FxPool(THREE, { name: 'spark', capacity: cap.spark, corners: SPARK_CORNERS, fields: SPARK_FIELDS, material: sparkMat, parent: this.root });
    // ARC CV-4a — pule języka broni (flaga `cvWeapons`). Wiązka z wieżyczki: ten sam program STREAK (ten sam tekst — jeden
    // program), własne pokrętła i śledzenie z przesunięciem; pocisk w locie: BOLT; punkty z ruchem: MOTE. Pule puste nie rysują się.
    this.wbeams = new WpnPool(THREE, { name: 'wbeam', capacity: cap.wbeam, corners: STREAK_CORNERS, fields: STREAK_FIELDS, material: streakMat(0), parent: this.root });
    const boltMat = new THREE.ShaderMaterial({
      ...common,
      uniforms: { uTime: { value: 0 }, uWidth: { value: 0.001 }, uMinPx: { value: 2 }, uPxToWorld: { value: 0.001 }, uCore: { value: 4 } },
      vertexShader: src.bolt.vertexShader, fragmentShader: src.bolt.fragmentShader,
    });
    const BOLT_FIELDS = [['aStart', 3], ['aCtrl', 3], ['aEnd', 3], ['aColor', 3], ['aTime', 4], ['aStyle', 4]];
    this.bolts = new WpnPool(THREE, { name: 'bolt', capacity: cap.bolt, corners: BOLT_CORNERS, index: BOLT_INDEX, fields: BOLT_FIELDS, material: boltMat, parent: this.root });
    const moteMat = new THREE.ShaderMaterial({
      ...common,
      uniforms: { uTime: { value: 0 }, uPxToWorld: { value: 0.001 }, uCore: { value: 2.6 } },
      vertexShader: src.mote.vertexShader, fragmentShader: src.mote.fragmentShader,
    });
    const MOTE_FIELDS = [['aPos', 3], ['aVel', 3], ['aColor', 3], ['aParams', 4], ['aShape', 4]];
    this.motes = new WpnPool(THREE, { name: 'mote', capacity: cap.mote, corners: SPARK_CORNERS, fields: MOTE_FIELDS, material: moteMat, parent: this.root });
    this.pools = [this.beams, this.tracers, this.sparks, this.wbeams, this.bolts, this.motes];
    this._streakPools = [this.beams, this.tracers];
    // ARC CV-5 — pule uszkodzeń (flaga `cvDamage`): dym (rysowany PIERWSZY — `renderOrder` 3), wybuchy / płomienie / fala / żar
    // (`renderOrder` 4) — jeden program BLAST z mieszaniem premultiplied (gorące dodaje światło, dym zasłania); odłamki — instancje
    // bryłki, nieprzezroczyste. Zegar efektów uszkodzeń osobny (`dmgNowMs` — zegar prezentacji × `FX_TIME_SCALE`; pauza = pauza).
    const blastMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      uniforms: { uTime: { value: 0 }, uPxToWorld: { value: 0.001 }, uFlashCore: { value: 2.6 }, uFireCore: { value: 2.4 }, uFlameCore: { value: 1.3 }, uRingCore: { value: 1.1 } },
      vertexShader: src.blast.vertexShader, fragmentShader: src.blast.fragmentShader,
    });
    const BLAST_FIELDS = [['aPos', 3], ['aVel', 3], ['aColor', 3], ['aParams', 4], ['aShape', 4], ['aAxis', 3]];
    this.smokes = new WpnPool(THREE, { name: 'smoke', capacity: cap.smoke, corners: SPARK_CORNERS, fields: BLAST_FIELDS, material: blastMat, parent: this.root });
    this.blasts = new WpnPool(THREE, { name: 'blast', capacity: cap.blast, corners: SPARK_CORNERS, fields: BLAST_FIELDS, material: blastMat, parent: this.root });
    this.smokes.mesh.renderOrder = 3;
    this.blasts.mesh.renderOrder = 4;
    this._debrisGeo = buildDebrisGeometry(THREE);
    const debrisMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCore: { value: 2.5 } },
      vertexShader: src.debris.vertexShader, fragmentShader: src.debris.fragmentShader,
    });
    const DEBRIS_FIELDS = [['aP0', 3], ['aVel', 3], ['aAxis', 4], ['aParams', 4], ['aStretch', 3], ['aColor', 3], ['aShape', 2]];   // CV-3c — aShape
    this.debris = new FxPool(THREE, { name: 'debris', capacity: cap.debris, fields: DEBRIS_FIELDS, material: debrisMat, parent: this.root,
      baseGeometry: this._debrisGeo });
    this.dmgPools = [this.smokes, this.blasts, this.debris];
    this.dmgNowMs = this.nowMs;
    this._dmgEpoch = this.dmgNowMs;
    this.dmgSpawned = 0;   // ARC CV-5 — cząstki uszkodzeń przyjęte (wybuchy, dym, płomienie, odłamki)
    this.shots = 0;   // strzały przyjęte (każdy dostaje smugę albo wiązkę — nigdy nie przepada)
    this.wpnShots = 0;   // ARC CV-4a — strzały języka broni (wiązka albo pocisk)
  }

  /** Liczba żywych efektów we wszystkich pulach. */
  activeCount() { return this.beams.n + this.tracers.n + this.sparks.n + this.wbeams.n + this.bolts.n + this.motes.n; }

  /** ARC CV-5 — liczba żywych efektów uszkodzeń (dym, wybuchy, odłamki; osobny zegar i epoka). */
  dmgActive() { return this.smokes.n + this.blasts.n + this.debris.n; }

  hasActive() { return this.activeCount() + this.dmgActive() > 0; }

  /**
   * Jeden strzał salwy (dzisiejsze tempo `combatFxPace`). Punkty `a` / `t` — świat (pozycje RYSOWANYCH statków).
   * @param {{ a:{x:number,y?:number,z:number}, t:{x:number,y?:number,z:number}, category:string, hit:boolean,
   *           blockedByShield?:number, delayMs?:number, pace:{tracerMs:number, flashMs:number, flashDelayMs:number, shieldMs:number},
   *           attackerId?:string|null, targetId?:string|null, targetSize?:number }} shot
   */
  spawnShot(shot) {
    if (this.activeCount() === 0) this._epoch = this.nowMs;   // epoka zostaje mała — float32 w shaderze bez utraty precyzji
    const pace = shot.pace;
    const t0 = this.nowMs + (shot.delayMs > 0 ? shot.delayMs : 0);
    const color = weaponColor(shot.category);
    const pool = shot.category === 'short' ? this.beams : this.tracers;
    const a = shot.a, t = shot.t;
    const s = pool.alloc();
    pool.set3('aStart', s, a.x, a.y ?? DEFAULT_Y, a.z);
    pool.set3('aEnd', s, t.x, t.y ?? DEFAULT_Y, t.z);
    this._color.setHex(color);
    pool.set3('aColor', s, this._color.r, this._color.g, this._color.b);
    pool.set4('aParams', s, shot.hit ? HIT_ALPHA : MISS_ALPHA, t0 - this._epoch, pace.tracerMs,
      shot.category === 'long' ? MISSILE_WIDTH_MUL : 1);
    pool.death[s] = t0 + pace.tracerMs;
    pool.followA[s] = shot.attackerId ?? null;
    pool.followB[s] = shot.targetId ?? null;
    this.shots++;
    if (!shot.hit) return;
    const size = shot.targetSize > 0 ? shot.targetSize : DEFAULT_TARGET_SIZE;
    const ti = t0 + pace.flashDelayMs;
    this._spark(SPARK_KIND.flash, t, color, FLASH_ALPHA, ti, pace.flashMs, size, shot.targetId);
    this._spark(SPARK_KIND.glow, t, HIT_GLOW.COLOR, GLOW_ALPHA, ti, HIT_GLOW.MS, size, shot.targetId);
  }

  _spark(kind, p, hex, alpha, t0, lifeMs, size, followId) {
    const pool = this.sparks;
    const s = pool.alloc();
    pool.set3('aPos', s, p.x, p.y ?? DEFAULT_Y, p.z);
    this._color.setHex(hex);
    pool.set3('aColor', s, this._color.r, this._color.g, this._color.b);
    pool.set4('aParams', s, alpha, t0 - this._epoch, lifeMs, size);
    pool.set1('aKind', s, kind);
    pool.death[s] = t0 + lifeMs;
    pool.followA[s] = followId ?? null;
  }

  // ── ARC CV-4a — język broni (flaga `cvWeapons`): czasy BEZWZGLĘDNE zegara prezentacji z rejestru salw ───────────────────
  // Końce śledzone: `aId`/`bId` (null — punkt stały), tryb 1 — przesunięcie w świecie od środka statku, tryb 2 — punkt
  // w przestrzeni modelu (wieżyczka), śledzenie do `aUntil`/`bUntil` [ms prezentacji]. Bez konstrukcji obiektów — sam zapis liczb.

  /** Kolor szesnastkowy → składowe liniowe (wspólny obiekt `_color`). */
  _rgb(hex) { this._color.setHex(hex); return this._color; }

  _epochFor(t0) { if (this.activeCount() === 0) this._epoch = Math.min(this.nowMs, t0); }

  /**
   * Wiązka lasera z wieżyczki: [t0, t0 + life], start za wieżyczką, koniec za punktem trafienia na celu (albo stały — pudło).
   * @param {{ t0:number, life:number, ax:number, ay:number, az:number, bx:number, by:number, bz:number, color:number, alpha:number,
   *           aId?:string|null, aMode?:number, aox?:number, aoy?:number, aoz?:number,
   *           bId?:string|null, bMode?:number, box?:number, boy?:number, boz?:number }} p
   */
  spawnBeam(p) {
    this._epochFor(p.t0);
    const pool = this.wbeams;
    const s = pool.alloc();
    pool.set3('aStart', s, p.ax, p.ay, p.az);
    pool.set3('aEnd', s, p.bx, p.by, p.bz);
    const c = this._rgb(p.color);
    pool.set3('aColor', s, c.r, c.g, c.b);
    pool.set4('aParams', s, p.alpha, p.t0 - this._epoch, Math.max(1, p.life), 1);
    pool.death[s] = p.t0 + Math.max(1, p.life);
    const end = p.t0 + Math.max(1, p.life);
    pool.setFollow(s, 0, p.aId ?? null, p.aMode ?? 1, p.aox ?? 0, p.aoy ?? 0, p.aoz ?? 0, end);
    pool.setFollow(s, 1, p.bId ?? null, p.bMode ?? 1, p.box ?? 0, p.boy ?? 0, p.boz ?? 0, end);
    this.wpnShots++;
    return s;
  }

  /**
   * Pocisk w locie (kinetyk, rakieta): głowa od startu (t0) do końca toru w czasie `flight`, ogon `trail` ms za nią; tor —
   * krzywa Béziera przez punkt kontrolny = środek odcinka + (cx, cy, cz). Start śledzi wieżyczkę do wystrzału, koniec — cel
   * do trafienia (pudło: punkt za celem, śledzony z przesunięciem). `miss` — leci za cel i gaśnie w drugiej części lotu.
   * @param {{ t0:number, flight:number, trail:number, ax:number, ay:number, az:number, bx:number, by:number, bz:number,
   *           cx?:number, cy?:number, cz?:number, color:number, alpha:number, widthMul?:number, head?:number, miss?:boolean,
   *           aId?:string|null, aMode?:number, aox?:number, aoy?:number, aoz?:number,
   *           bId?:string|null, bMode?:number, box?:number, boy?:number, boz?:number }} p
   */
  spawnBolt(p) {
    this._epochFor(p.t0);
    const pool = this.bolts;
    const s = pool.alloc();
    const cx = p.cx ?? 0, cy = p.cy ?? 0, cz = p.cz ?? 0;
    pool.set3('aStart', s, p.ax, p.ay, p.az);
    pool.set3('aEnd', s, p.bx, p.by, p.bz);
    pool.set3('aCtrl', s, (p.ax + p.bx) * 0.5 + cx, (p.ay + p.by) * 0.5 + cy, (p.az + p.bz) * 0.5 + cz);
    const o = s * 3;
    pool.ctrl[o] = cx; pool.ctrl[o + 1] = cy; pool.ctrl[o + 2] = cz;
    const c = this._rgb(p.color);
    pool.set3('aColor', s, c.r, c.g, c.b);
    const fl = Math.max(1, p.flight);
    pool.set4('aTime', s, p.t0 - this._epoch, fl, Math.max(0, p.trail), p.miss ? 1 : 0);
    pool.set4('aStyle', s, p.alpha, p.widthMul ?? 1, p.head ?? 1, 0);
    pool.death[s] = p.t0 + fl;
    pool.setFollow(s, 0, p.aId ?? null, p.aMode ?? 1, p.aox ?? 0, p.aoy ?? 0, p.aoz ?? 0, p.t0);
    pool.setFollow(s, 1, p.bId ?? null, p.bMode ?? 1, p.box ?? 0, p.boy ?? 0, p.boz ?? 0, p.t0 + fl);
    this.wpnShots++;
    return s;
  }

  /**
   * Punkt świetlny z ruchem: iskra (kind 0), poświata (1), ładowanie (2). Pozycja śledzi statek (`id`, tryb, przesunięcie) przez
   * całe życie; prędkość [WU/ms] dodaje ruch od tej pozycji.
   * @param {{ t0:number, life:number, x:number, y:number, z:number, vx?:number, vy?:number, vz?:number, color:number, alpha:number,
   *           size:number, kind:number, grow?:number, minPx?:number, maxPx?:number,
   *           id?:string|null, mode?:number, ox?:number, oy?:number, oz?:number }} p
   */
  spawnMote(p) {
    this._epochFor(p.t0);
    const pool = this.motes;
    const s = pool.alloc();
    pool.set3('aPos', s, p.x, p.y, p.z);
    pool.set3('aVel', s, p.vx ?? 0, p.vy ?? 0, p.vz ?? 0);
    const c = this._rgb(p.color);
    pool.set3('aColor', s, c.r, c.g, c.b);
    const life = Math.max(1, p.life);
    pool.set4('aParams', s, p.alpha, p.t0 - this._epoch, life, p.size);
    pool.set4('aShape', s, p.kind, p.grow ?? 1, p.minPx ?? 1, p.maxPx ?? 64);
    pool.death[s] = p.t0 + life;
    pool.setFollow(s, 0, p.id ?? null, p.mode ?? 1, p.ox ?? 0, p.oy ?? 0, p.oz ?? 0, p.t0 + life);
    return s;
  }

  // ── ARC CV-5 — wybuchy, dym, płomienie, odłamki (flaga `cvDamage`): czasy BEZWZGLĘDNE zegara efektów uszkodzeń ─────────────
  _dmgEpochFor(t0) { if (this.dmgActive() === 0) this._dmgEpoch = Math.min(this.dmgNowMs, t0); }

  /**
   * Cząstka programu BLAST: rodzaj (`kind` 0 błysk · 1 smuga anamorficzna · 2 płat kuli ognia · 3 iskra żaru · 4 płomień · 5 fala
   * uderzeniowa · 6 dym wybuchu · 7 dym uszkodzeń — dym trafia do puli dymu, rysowanej pierwszej). Pozycja może śledzić statek
   * (`id`, tryb 1 — przesunięcie w świecie, 2 — punkt modelu) do chwili `until` (płomień na kadłubie — przez całe życie).
   * @param {{ t0:number, life:number, kind:number, x:number, y:number, z:number, vx?:number, vy?:number, vz?:number, size:number,
   *           color?:number, alpha?:number, minPx?:number, seed01?:number, aspect?:number, axis?:number[],
   *           id?:string|null, mode?:number, ox?:number, oy?:number, oz?:number, until?:number }} p
   */
  spawnBlast(p) {
    this._dmgEpochFor(p.t0);
    const pool = p.kind >= 5.5 ? this.smokes : this.blasts;
    const s = pool.alloc();
    pool.set3('aPos', s, p.x, p.y, p.z);
    pool.set3('aVel', s, p.vx ?? 0, p.vy ?? 0, p.vz ?? 0);
    const c = this._rgb(p.color ?? 0xffffff);
    pool.set3('aColor', s, c.r, c.g, c.b);
    const life = Math.max(1, p.life);
    pool.set4('aParams', s, p.alpha ?? 1, p.t0 - this._dmgEpoch, life, Math.max(0, p.size));
    pool.set4('aShape', s, p.kind, p.minPx ?? 0, p.seed01 ?? 0, p.aspect ?? 1);
    const ax = p.axis;
    pool.set3('aAxis', s, ax ? ax[0] : 0, ax ? ax[1] : 1, ax ? ax[2] : 0);
    pool.death[s] = p.t0 + life;
    pool.setFollow(s, 0, p.id ?? null, p.mode ?? 1, p.ox ?? 0, p.oy ?? 0, p.oz ?? 0, p.until ?? p.t0);
    this.dmgSpawned++;
    return s;
  }

  /**
   * Odłamek kadłuba: start w punkcie świata, prędkość [WU/ms], oś i prędkość obrotu [rad/ms], rozmiar, rozciągnięcie, jasność, barwa.
   * @param {{ t0:number, life:number, x:number, y:number, z:number, vx:number, vy:number, vz:number, ax:number, ay:number, az:number,
   *           spin:number, size:number, sx?:number, sy?:number, sz?:number, shade?:number, color?:number, shape?:number, edgeHot?:boolean }} p
   *   shape — ARC CV-3c: wariant bryłki (0 — ośmiościan CV-5, 1–4 — odłamki blachy); edgeHot — żar tylko na krawędziach (CV-3c)
   */
  spawnDebris(p) {
    this._dmgEpochFor(p.t0);
    const pool = this.debris;
    const s = pool.alloc();
    pool.set3('aP0', s, p.x, p.y, p.z);
    pool.set3('aVel', s, p.vx, p.vy, p.vz);
    pool.set4('aAxis', s, p.ax, p.ay, p.az, p.spin);
    const life = Math.max(1, p.life);
    pool.set4('aParams', s, p.t0 - this._dmgEpoch, life, Math.max(0, p.size), p.shade ?? 1);
    pool.set3('aStretch', s, p.sx ?? 1, p.sy ?? 1, p.sz ?? 1);
    const c = this._rgb(p.color ?? 0x6a6f78);
    pool.set3('aColor', s, c.r, c.g, c.b);
    pool.set2('aShape', s, Number.isFinite(p.shape) ? p.shape : 0, p.edgeHot ? 1 : 0);
    pool.death[s] = p.t0 + life;
    this.dmgSpawned++;
    return s;
  }

  /** Pozycje cząstek uszkodzeń za statkami (do chwili `until`; płomień na kadłubie — przez całe życie). */
  _followDmg(now) {
    const q = this._tmpP;
    const a = this.smokes, b = this.blasts;
    for (let k = 0; k < 2; k++) {
      const pool = k === 0 ? a : b;
      for (let i = 0; i < pool.n; i++) {
        if (pool.idA[i] == null || now > pool.untilA[i]) continue;
        if (this._wpnEnd(pool.idA[i], pool.mA[i], pool.oA, i * 3, q)) { pool.set3('aPos', i, q.x, q.y, q.z); pool.dirty = true; }
      }
    }
  }

  /**
   * ARC CV-5 (Finding 644) — ROZGRZEWKA: programy wszystkich pul i bufory atrybutów (pełna pojemność) przesłane przed pierwszą
   * salwą i pierwszym wybuchem — jedno rysowanie korzenia silnika (pule chwilowo widoczne, 0 instancji) do celu 1 × 1 px. Bez tego
   * pierwszy strzał i pierwszy wybuch płaciły kompilację programu i przesłanie buforów w klatce gry.
   * @returns {{ ok:boolean, ms:number, programs?:number }}
   */
  prewarm(renderer, camera) {
    if (!renderer?.render || !camera) return { ok: false, ms: 0 };
    const THREE = this.THREE;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const all = [...this.pools, ...this.dmgPools];
    const vis = all.map((p) => p.mesh.visible);
    const rootVis = this.root.visible;
    let rt = null;
    const prevRt = renderer.getRenderTarget?.() ?? null;
    try {
      rt = new THREE.WebGLRenderTarget(1, 1);
      for (const p of all) { p.geometry.instanceCount = 0; p.mesh.visible = true; }
      this.root.visible = true;
      renderer.setRenderTarget(rt);
      renderer.render(this.root, camera);
    } catch (err) {
      return { ok: false, ms: 0, error: String(err?.message ?? err) };
    } finally {
      renderer.setRenderTarget(prevRt);
      all.forEach((p, i) => { p.mesh.visible = vis[i]; p.geometry.instanceCount = p.n; });
      this.root.visible = rootVis;
      rt?.dispose?.();
    }
    const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return { ok: true, ms, programs: renderer.info?.programs?.length ?? null };
  }

  /** Pozycja końca śledzonego (tryb 1 / 2) → `out`; false — statek niewidoczny (koniec zostaje, gdzie był). */
  _wpnEnd(id, mode, arr, o, out) {
    if (mode === 2) return !!this._resolveLocal && this._resolveLocal(id, arr[o], arr[o + 1], arr[o + 2], out);
    const p = this._resolve ? this._resolve(id) : null;
    if (!p) return false;
    out.x = p.x + arr[o]; out.y = p.y + arr[o + 1]; out.z = p.z + arr[o + 2];
    return true;
  }

  /** Końce wiązek, pocisków i punktów języka broni za statkami (do chwili `until` każdego końca); punkt kontrolny toru za środkiem. */
  _followWpn(now) {
    const q = this._tmpP;
    const wb = this.wbeams;
    for (let i = 0; i < wb.n; i++) {
      const o = i * 3;
      if (wb.idA[i] != null && now <= wb.untilA[i] && this._wpnEnd(wb.idA[i], wb.mA[i], wb.oA, o, q)) { wb.set3('aStart', i, q.x, q.y, q.z); wb.dirty = true; }
      if (wb.idB[i] != null && now <= wb.untilB[i] && this._wpnEnd(wb.idB[i], wb.mB[i], wb.oB, o, q)) { wb.set3('aEnd', i, q.x, q.y, q.z); wb.dirty = true; }
    }
    const bo = this.bolts;
    const fs = bo.f.aStart.array, fe = bo.f.aEnd.array;
    for (let i = 0; i < bo.n; i++) {
      const o = i * 3;
      let moved = false;
      if (bo.idA[i] != null && now <= bo.untilA[i] && this._wpnEnd(bo.idA[i], bo.mA[i], bo.oA, o, q)) { bo.set3('aStart', i, q.x, q.y, q.z); moved = true; }
      if (bo.idB[i] != null && now <= bo.untilB[i] && this._wpnEnd(bo.idB[i], bo.mB[i], bo.oB, o, q)) { bo.set3('aEnd', i, q.x, q.y, q.z); moved = true; }
      if (moved) {
        bo.set3('aCtrl', i, (fs[o] + fe[o]) * 0.5 + bo.ctrl[o], (fs[o + 1] + fe[o + 1]) * 0.5 + bo.ctrl[o + 1], (fs[o + 2] + fe[o + 2]) * 0.5 + bo.ctrl[o + 2]);
        bo.dirty = true;
      }
    }
    const mo = this.motes;
    for (let i = 0; i < mo.n; i++) {
      if (mo.idA[i] == null || now > mo.untilA[i]) continue;
      if (this._wpnEnd(mo.idA[i], mo.mA[i], mo.oA, i * 3, q)) { mo.set3('aPos', i, q.x, q.y, q.z); mo.dirty = true; }
    }
  }

  /**
   * Raz na klatkę pętli renderu.
   * @param {{ nowMs:number, camera?:{fov:number}, viewportH?:number, visible?:boolean }} frame
   *   nowMs — czas ZEGARA PREZENTACJI (stoi w pauzie); viewportH — wysokość widoku w CSS px. Błysk i pierścień osłony z pokręteł
   *   `STAGE_*` (ARC CV-3a3 — scena bitwy; CV-Z — jedyna ścieżka, dawne `FLASH_K` / `RING_K` bez sceny usunięte).
   */
  update({ nowMs, dmgNowMs = undefined, camera = null, viewportH = 1, visible = true, smaa = false } = {}) {
    if (Number.isFinite(nowMs)) this.nowMs = nowMs;
    const now = this.nowMs;
    for (let i = 0; i < this.pools.length; i++) this.pools[i].retire(now);
    if (this.activeCount() === 0) this._epoch = now;
    if (this._resolve) this._follow();
    const T = this.tuning;
    const fov = camera?.fov > 0 ? camera.fov : 55;
    const pxToWorld = 2 * Math.tan((fov * Math.PI / 180) / 2) / Math.max(1, viewportH);
    const tRel = now - this._epoch;
    const bu = this.beams.material.uniforms, tu = this.tracers.material.uniforms, su = this.sparks.material.uniforms;
    bu.uTime.value = tRel; bu.uPxToWorld.value = pxToWorld; bu.uWidth.value = T.BEAM_WIDTH; bu.uMinPx.value = T.MIN_PX; bu.uCore.value = T.BEAM_CORE;
    tu.uTime.value = tRel; tu.uPxToWorld.value = pxToWorld; tu.uWidth.value = T.TRACER_WIDTH; tu.uMinPx.value = T.MIN_PX; tu.uCore.value = T.TRACER_CORE;
    su.uTime.value = tRel; su.uPxToWorld.value = pxToWorld; su.uCore.value = T.FLASH_CORE;
    // ARC CV-3a3 (Finding 653 (b)(c)) — błysk i pierścień osłony w skali sceny bitwy
    su.uSizeK.value.set(T.STAGE_FLASH_K, T.STAGE_RING_K, T.GLOW_K);
    su.uMinPx.value.set(T.FLASH_MIN_PX, T.RING_MIN_PX, T.GLOW_MIN_PX);
    su.uMaxPx.value.set(T.FLASH_MAX_PX, T.RING_MAX_PX, T.GLOW_MAX_PX);
    su.uGrow.value.set(T.STAGE_FLASH_GROW, T.STAGE_RING_GROW, 1);
    // ARC CV-4a — pule języka broni: śledzenie końców (gdy coś w nich jest) i pokrętła `WPN_*` co klatkę.
    if ((this.wbeams.n + this.bolts.n + this.motes.n) > 0 && (this._resolve || this._resolveLocal)) this._followWpn(now);
    const wu = this.wbeams.material.uniforms, ou = this.bolts.material.uniforms, mu = this.motes.material.uniforms;
    // ARC CV-3c (decyzja 45 (5)) — wiązka pod SMAA (High; renderer podaje `smaa`): rdzeń i szerokość z kompensacją
    const bk = smaa ? 1 : 0;
    wu.uTime.value = tRel; wu.uPxToWorld.value = pxToWorld; wu.uWidth.value = (T.WPN_BEAM_WIDTH ?? T.BEAM_WIDTH) * (bk ? (T.WPN_SMAA_BEAM_WIDTH_K ?? 1) : 1);
    wu.uMinPx.value = T.WPN_BEAM_MIN_PX ?? T.MIN_PX; wu.uCore.value = (T.WPN_BEAM_CORE ?? T.BEAM_CORE) * (bk ? (T.WPN_SMAA_BEAM_CORE_K ?? 1) : 1);
    ou.uTime.value = tRel; ou.uPxToWorld.value = pxToWorld; ou.uWidth.value = T.WPN_BOLT_WIDTH ?? T.TRACER_WIDTH;
    ou.uMinPx.value = T.WPN_BOLT_MIN_PX ?? T.MIN_PX; ou.uCore.value = T.WPN_BOLT_CORE ?? T.TRACER_CORE;
    mu.uTime.value = tRel; mu.uPxToWorld.value = pxToWorld; mu.uCore.value = T.WPN_MOTE_CORE ?? T.FLASH_CORE;
    for (let i = 0; i < this.pools.length; i++) this.pools[i].upload();
    // ARC CV-5 — pule uszkodzeń na zegarze efektów uszkodzeń (zwolnione tempo `FX_TIME_SCALE`, pauza = pauza)
    if (Number.isFinite(dmgNowMs)) this.dmgNowMs = dmgNowMs;
    const dn = this.dmgNowMs;
    for (let i = 0; i < this.dmgPools.length; i++) this.dmgPools[i].retire(dn);
    if (this.dmgActive() === 0) this._dmgEpoch = dn;
    if ((this.smokes.n + this.blasts.n) > 0 && (this._resolve || this._resolveLocal)) this._followDmg(dn);
    const tD = dn - this._dmgEpoch;
    const xu = this.blasts.material.uniforms, du = this.debris.material.uniforms;
    xu.uTime.value = tD; xu.uPxToWorld.value = pxToWorld;
    xu.uFlashCore.value = T.EXP_FLASH_CORE ?? 2.6; xu.uFireCore.value = T.EXP_FIREBALL_CORE ?? 2.4; xu.uRingCore.value = T.EXP_RING_CORE ?? 1.1;
    xu.uFlameCore.value = T.DMG_FLAME_CORE ?? 1.3;
    du.uTime.value = tD; du.uCore.value = T.EXP_DEBRIS_HOT ?? 1.4;
    for (let i = 0; i < this.dmgPools.length; i++) this.dmgPools[i].upload();
    this.root.visible = visible !== false;
  }

  /** Końce wiązek / smug i pozycje iskier za RYSOWANYMI statkami (niewidoczny albo zniszczony — punkt zostaje). */
  _follow() {
    const R = this._resolve;
    for (let k = 0; k < this._streakPools.length; k++) {
      const pool = this._streakPools[k];
      for (let i = 0; i < pool.n; i++) {
        const ia = pool.followA[i], ib = pool.followB[i];
        if (ia != null) { const p = R(ia); if (p) { pool.set3('aStart', i, p.x, p.y, p.z); pool.dirty = true; } }
        if (ib != null) { const p = R(ib); if (p) { pool.set3('aEnd', i, p.x, p.y, p.z); pool.dirty = true; } }
      }
    }
    const sp = this.sparks;
    for (let i = 0; i < sp.n; i++) {
      const id = sp.followA[i];
      if (id == null) continue;
      const p = R(id);
      if (p) { sp.set3('aPos', i, p.x, p.y, p.z); sp.dirty = true; }
    }
  }

  /** Stan pul do `KOSMOS.debug.fxStats()`. */
  stats() {
    return {
      pools: { beam: this.beams.stats(), tracer: this.tracers.stats(), spark: this.sparks.stats(),
        wbeam: this.wbeams.stats(), bolt: this.bolts.stats(), mote: this.motes.stats(),   // ARC CV-4a — pule języka broni
        smoke: this.smokes.stats(), blast: this.blasts.stats(), debris: this.debris.stats() },   // ARC CV-5 — pule uszkodzeń
      active: this.activeCount(), dmgActive: this.dmgActive(), shots: this.shots, wpnShots: this.wpnShots, dmgSpawned: this.dmgSpawned,
      presMs: this.nowMs, epochMs: this._epoch, dmgMs: this.dmgNowMs,
    };
  }

  dispose() {
    for (const p of this.pools) { p.dispose(); }
    for (const p of this.dmgPools) { p.dispose(); }
    this.beams.material.dispose(); this.tracers.material.dispose(); this.sparks.material.dispose();
    this.wbeams.material.dispose(); this.bolts.material.dispose(); this.motes.material.dispose();
    this.blasts.material.dispose(); this.debris.material.dispose(); this._debrisGeo.dispose();
    this.root.parent?.remove(this.root);
  }
}
