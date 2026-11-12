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

import { buildFxShaders } from './FxShaders.js';
import { weaponColor, FX_SHIELD_COLOR } from '../../config/CombatFxConfig.js';
import { HIT_GLOW } from '../../utils/VesselFxLogic.js';
import { CHOREO_TUNING } from './ChoreographyLogic.js';   // ARC CV-3b — pokrętła choreografii (jedno źródło wartości domyślnych)
import { LIVE_LIGHT_POOL } from './LightPool.js';          // ARC CV-2b — pokrętła puli świateł (jedno źródło wartości domyślnych)
import { LIVE_CUE } from './CombatCueBus.js';              // ARC CV-2b — pokrętła szyny sygnałów walki

/** Pojemności pul (instancje). Pamięć: 13 / 11 liczb float na instancję — razem ok. 0,5 MB. Iskry ×2 względem szczytu
 *  zmierzonego przy górnej granicy (100 strzałów co 50 ms, wszystkie trafione na osłonie: ~4 070 żywych — keeper T4). */
export const FX_POOL_CAPACITY = Object.freeze({ beam: 1024, tracer: 1024, spark: 8192 });

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
  // Finding 663 (dodatek 2, decyzja właściciela 2026-11-11: „wygląda sztucznie”) — płaski cyjanowy pierścień osłony przy trafieniu
  // w tarczę (iskra `SPARK_KIND.ring`) WYŁĄCZONY do CV-4b (bańka osłony z falą). `true` z konsoli przywraca go od następnego strzału.
  SHIELD_RING_ENABLED: false,
  RING_K:       4.0,     // średnica pierścienia osłony = rozmiar modelu × K
  RING_MIN_PX:  8,
  RING_MAX_PX:  64,
  GLOW_K:       HIT_GLOW.MODEL_K,   // błysk na modelu = rozmiar modelu × K (jak dziś, CP18)
  GLOW_MIN_PX:  HIT_GLOW.MIN_PX,
  GLOW_MAX_PX:  96,
  FLASH_GROW:   3.0,     // błysk trafienia rośnie w czasie życia ×1 → ×GROW (jak dziś)
  RING_GROW:    3.0,     // pierścień osłony — j.w.
  // ARC CV-3a3 (Finding 653, decyzja właściciela §3.2-11 — ŁATA do CV-4 / CV-4b / CV-5 / CV-6a) — pod flagą `cvStage` (scena
  // bitwy): błysk i pierścień osłony mniejsze i wolniej rosnące (silnik: `update({ stage })`), kula wybuchu wraku w skali
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
  // ARC CV-2b (flaga `cvPresets`) — pula świateł efektów (`LightPool`: jasność, zasięg, obwiednia błysku) i szyna sygnałów walki
  // (`CombatCueBus`: najwyżej sygnałów na klatkę, okno scalania). Czytane co klatkę / przy błysku. Strojenie, bez pinów.
  ...LIVE_LIGHT_POOL,
  ...LIVE_CUE,
};

const MISSILE_WIDTH_MUL = 1.4;        // smuga rakiety szersza od kinetyka (atrybut instancji)
const HIT_ALPHA = 0.9, MISS_ALPHA = 0.4;   // jak dziś: trafienie 0,9, pudło 0,4
const FLASH_ALPHA = 0.85, RING_ALPHA = 0.8, GLOW_ALPHA = 1.0;
const DEFAULT_TARGET_SIZE = 0.016;   // [WU] fregata — gdy rozmiaru celu nie da się ustalić
const DEFAULT_Y = 0.3;               // [WU] wysokość statku w wolnej przestrzeni (gdy punkt bez y)

// Narożniki quada (x, y, z) i indeksy — wspólne dla obu programów (STREAK: x ∈ {0, 1}; SPARK: x ∈ {−1, 1}).
const STREAK_CORNERS = [0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0];
const SPARK_CORNERS = [-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0];
const QUAD_INDEX = [0, 1, 2, 2, 1, 3];

/** Jedna pula instancji: tablice atrybutów, liczba aktywnych, zwalnianie przez zamianę z ostatnim. */
class FxPool {
  constructor(THREE, { name, capacity, corners, fields, material, parent }) {
    this.name = name;
    this.capacity = capacity;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(corners), 3));
    geo.setIndex(QUAD_INDEX);
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

export class FxEngine {
  /**
   * @param {{ THREE: object, parent?: object, logDepth?: boolean, resolve?: (id:string)=>({x:number,y:number,z:number}|null),
   *           nowMs?: number, capacity?: { beam?: number, tracer?: number, spark?: number }, tuning?: object }} opts
   *   resolve — pozycja RYSOWANEGO statku (sprite widoczny) albo null: końce wiązek i iskry idą za nią co klatkę.
   */
  constructor({ THREE, parent = null, logDepth = true, resolve = null, nowMs = 0, capacity = {}, tuning = LIVE_CV_FX } = {}) {
    if (!THREE?.InstancedBufferGeometry) throw new Error('[FxEngine] wymagany THREE (r171) z InstancedBufferGeometry');
    this.THREE = THREE;
    this.tuning = tuning;
    this._resolve = typeof resolve === 'function' ? resolve : null;
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
    this.pools = [this.beams, this.tracers, this.sparks];
    this._streakPools = [this.beams, this.tracers];
    this.shots = 0;   // strzały przyjęte (każdy dostaje smugę albo wiązkę — nigdy nie przepada)
  }

  /** Liczba żywych efektów we wszystkich pulach. */
  activeCount() { return this.beams.n + this.tracers.n + this.sparks.n; }

  hasActive() { return this.activeCount() > 0; }

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
    if (shot.blockedByShield > 0 && this.tuning.SHIELD_RING_ENABLED === true) {   // dodatek 2 — pierścień osłony do CV-4b wyłączony
      this._spark(SPARK_KIND.ring, t, FX_SHIELD_COLOR, RING_ALPHA, ti, pace.shieldMs, size, shot.targetId);
    }
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

  /**
   * Raz na klatkę pętli renderu.
   * @param {{ nowMs:number, camera?:{fov:number}, viewportH?:number, visible?:boolean, stage?:boolean }} frame
   *   nowMs — czas ZEGARA PREZENTACJI (stoi w pauzie); viewportH — wysokość widoku w CSS px; stage — scena bitwy (flaga
   *   `cvStage`, ARC CV-3a3): błysk i pierścień osłony z pokręteł `STAGE_*` (bez sceny — dzisiejsze, co do bitu).
   */
  update({ nowMs, camera = null, viewportH = 1, visible = true, stage = false } = {}) {
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
    const st = stage === true;   // ARC CV-3a3 (Finding 653 (b)(c)) — łata sceny bitwy
    su.uSizeK.value.set(st ? T.STAGE_FLASH_K : T.FLASH_K, st ? T.STAGE_RING_K : T.RING_K, T.GLOW_K);
    su.uMinPx.value.set(T.FLASH_MIN_PX, T.RING_MIN_PX, T.GLOW_MIN_PX);
    su.uMaxPx.value.set(T.FLASH_MAX_PX, T.RING_MAX_PX, T.GLOW_MAX_PX);
    su.uGrow.value.set(st ? T.STAGE_FLASH_GROW : T.FLASH_GROW, st ? T.STAGE_RING_GROW : T.RING_GROW, 1);
    for (let i = 0; i < this.pools.length; i++) this.pools[i].upload();
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
      pools: { beam: this.beams.stats(), tracer: this.tracers.stats(), spark: this.sparks.stats() },
      active: this.activeCount(), shots: this.shots, presMs: this.nowMs, epochMs: this._epoch,
    };
  }

  dispose() {
    for (const p of this.pools) { p.dispose(); }
    this.beams.material.dispose(); this.tracers.material.dispose(); this.sparks.material.dispose();
    this.root.parent?.remove(this.root);
  }
}
