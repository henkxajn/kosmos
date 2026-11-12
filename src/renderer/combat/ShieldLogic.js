// ShieldLogic — OSŁONY I PANCERZ walki (ARC COMBAT VISUALS, krok CV-4b; plan §2.4, §2.10; Finding 653 (b); flaga `cvShields`).
//
// ⚠ ZERO IMPORTÓW. Czysta logika: wykonuje się pod node (keeper `cv_shields_logic_smoke` — wykonaniem, nie lekturą).
//
// Po co. Do CV-4a trafienie w osłonę było kilkoma cyjanowymi iskrami (łata), a płaski pierścień osłony (#653 (b)) — wyłączony.
// Tu osłona dostaje WŁASNY rysunek, sterowany OSŁONĄ POKAZYWANĄ z rejestru salw (CV-4a: stan logiczny + trafienia jeszcze nie
// pokazane; regeneracja rundy w chwili jej nadejścia — decyzja 5 CV-4a):
//   · BAŃKA — elipsoida dopasowana do rysowanego kadłuba (półwymiary bbox modelu × SHD_FIT + zapas), NIEWIDOCZNA, dopóki nic w nią
//     nie trafi; przy trafieniu fala rozchodzi się po bańce od punktu, w którym strzał naprawdę spotyka bańkę (koniec wiązki /
//     pocisku przenosi się z kadłuba na bańkę, dopóki osłona trzyma), krawędź (fresnel) i komórki rozbłyskują, potem gasną;
//   · SIŁA osłony z ułamka pokazywanego: silna — fala ostra i jasna; słaba — migotanie, przygaszenie;
//   · ROZPAD — trafienie, które zbija osłonę do 0 (pole ładunku D-CV-8 `shieldAfter` ≤ ε przy `blocked` > 0): błysk, bańka pęka na
//     gasnące komórki, DOKŁADNIE RAZ na spadek do zera i tylko wtedy; od tej chwili strzały lądują na kadłubie (iskry i żar CV-4a);
//     bańka wraca, gdy osłona pokazywana odrośnie do SHD_REUP_FRAC maks. (histereza — reszta regeneracji 0,3–0,9 / rundę, zjadana
//     przez kolejne trafienia, nie zapala bańki co rundę);
//   · REGENERACJA w chwili nadejścia rundy (prawdziwy WZROST osłony pokazywanej, bez trafień, które wylądowały w tej klatce) — słaba
//     fala przesuwająca się po bańce;
//   · PANCERZ (High) — osmalenia kadłuba w punktach trafień (pula na statek, najstarsza zastępowana), żar świeżej plamy stygnie.
//
// Dwa etapy (deterministyczne): PLANOWANIE w chwili nadejścia rundy (`planRound` — wpisy rejestru w kolejności TRAFIEŃ: czy strzał
// kończy się na bańce, czy rozbija osłonę; od tego zależy punkt końcowy wiązki i sygnał `shieldDown`) i POKAZ w chwili trafienia
// (`impact` — fala / rozpad wg planu) oraz co klatkę (`sample` — regeneracja, powrót bańki). Losowość wyłącznie z ziarna — nigdy
// `Math` losujący (reguła CV-0b).

/** Pokrętła — na żywo (`KOSMOS.threeRenderer.cvTuning.SHD_*` / `SCORCH_*`, alias w `LIVE_CV_FX`). Bez pinów na wartościach (F11). */
export const SHIELD_TUNING = {
  SHD_FIT:            1.22,   // półosie bańki = półwymiary kadłuba (bbox modelu) × FIT + PAD × najdłuższa półoś kadłuba
  SHD_PAD:            0.12,
  SHD_MIN_RATIO:      0.36,   // najkrótsza półoś bańki ≥ tyle × najdłuższa (bańka, nie płaska tarcza)
  SHD_HULL_K:         0.92,   // punkt trafienia KADŁUBA na elipsoidzie wpisanej w bbox × K (iskry przy poszyciu, pod bańką)
  SHD_FADE_MS:        650,    // [ms efektów] bańka gaśnie tyle po ostatnim trafieniu (0,4–0,8 s — §2.4)
  SHD_RIPPLE_MS:      720,    // [ms] życie fali
  SHD_RIPPLE_SPEED:   2.6,    // [rad / s] prędkość czoła fali po bańce (kąt na sferze jednostkowej bańki)
  SHD_RIPPLE_WIDTH:   0.085,  // [rad] szerokość czoła fali (sfera bańki — przy kadrze z boku 0,2 rad zalewało pół bańki)
  SHD_AMP_MIN:        0.45,   // fala najmniejszego trafienia (× fala trafienia zabierającego całą osłonę)
  SHD_CORE:           1.5,    // wzmocnienie HDR czoła fali i błysku trafienia (próg bloomu 1,0 — lekki bloom)
  SHD_RIM:            2.0,    // krawędź (fresnel) bańki tuż po trafieniu — × kolor osłony (sam brzeg ponad progiem — lekki bloom)
  SHD_RIM_POW:        6.0,    // wykładnik fresnela krawędzi — większy = cieńsza krawędź
  SHD_BACK:           0.35,   // tylna ścianka bańki (widziana przez przednią) × jasność przedniej
  SHD_SHELL:          0,      // poświata całej bańki tuż po trafieniu (liniowo — sRGB podnosi 0,01 do widocznego odcienia; domyślnie 0)
  SHD_CELL:           6.5,    // gęstość komórek na sferze bańki
  SHD_CELL_GAIN:      0.55,   // jasność krawędzi komórek przy fali / krawędzi
  SHD_WEAK_FRAC:      0.35,   // poniżej tego ułamka osłona „słaba” — migotanie i przygaszenie rosną liniowo do zera
  SHD_FLICKER_HZ:     11,     // migotanie słabej osłony
  SHD_COLLAPSE_MS:    900,    // [ms] rozpad bańki: błysk, komórki gasnące w różnych chwilach, lekkie rozszerzenie
  SHD_COLLAPSE_FLASH: 1.8,    // błysk rozpadu (× kolor osłony)
  SHD_COLLAPSE_GROW:  0.14,   // rozszerzenie bańki w trakcie rozpadu (× półosie)
  SHD_SHIMMER_MS:     650,    // [ms] fala regeneracji (pas przesuwający się wzdłuż bańki)
  SHD_SHIMMER_GAIN:   0.28,   // jasność fali regeneracji (słaba — bez bloomu)
  SHD_REFORM_GAIN:    0.8,    // jasność fali POWROTU bańki po rozpadzie (osłona odrosła do SHD_REUP_FRAC) — jaśniejsza od regeneracji
  SHD_REUP_FRAC:      0.25,   // po rozpadzie bańka wraca, gdy osłona pokazywana ≥ tyle × maks.
  SHD_REGEN_MIN_FRAC: 0.002,  // wzrost osłony pokazywanej ≥ tyle × maks. = regeneracja (mniej — szum zmiennoprzecinkowy)
  SHD_HULL_DELAY:     0.035,  // [R] iskry kadłuba przy trafieniu rozbijającym osłonę — tyle po błysku rozpadu (nadmiar przebija)
  SCORCH_R:           0.085,  // promień plamy osmalenia (przestrzeń modelu — długość statku = 1)
  SCORCH_COOL_MS:     1800,   // [ms efektów] żar brzegu świeżej plamy gaśnie
  SCORCH_DARK:        0.72,   // przyciemnienie albedo w plamie
  SCORCH_GLOW:        2.2,    // żar brzegu świeżej plamy (HDR)
};

/** Najwięcej fal na bańkę (rozmiar tablicy uniformów; preset — High 8 / Medium 4 / Low 1, §2.10). */
export const SHIELD_RIPPLES_MAX = 8;
/** Najwięcej plam osmalenia na statek (= `KC_SCORCH_MAX` wstawki koloru-klucza; keeper pilnuje zgodności). */
export const SCORCH_MAX = 6;
/** Osłona ≤ tyle = zero (trafienie rozbijające: `shieldAfter` z ładunku po odjęciu `blocked`). */
export const SHIELD_EPS = 1e-6;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Półosie bańki (przestrzeń modelu — najdłuższy wymiar kadłuba = 1) z półwymiarów kadłuba (bbox modelu / 2).
 * @param {number[]} half — [hx, hy, hz]
 * @returns {number[]} [ax, ay, az]
 */
export function bubbleAxes(half, T = SHIELD_TUNING) {
  const h = [0, 1, 2].map((i) => Math.max(1e-4, Number(half?.[i]) || 0.25));
  const hm = Math.max(h[0], h[1], h[2]);
  const a = h.map((v) => v * (T.SHD_FIT ?? 1.3) + (T.SHD_PAD ?? 0.16) * hm);
  const am = Math.max(a[0], a[1], a[2]);
  return a.map((v) => Math.max(v, clamp(T.SHD_MIN_RATIO ?? 0.36, 0, 1) * am));
}

/**
 * Punkt na elipsoidzie (półosie `ax`) w kierunku `u` od środka (przestrzeń modelu) i kierunek na SFERZE JEDNOSTKOWEJ bańki
 * (`sx, sy, sz` — przestrzeń, w której shader liczy fale). Kierunek zerowy — „w górę”.
 */
export function ellipsoidPoint(ax, ux, uy, uz, out = {}) {
  let l = Math.hypot(ux, uy, uz);
  if (!(l > 1e-12)) { ux = 0; uy = 1; uz = 0; l = 1; }
  ux /= l; uy /= l; uz /= l;
  const a0 = Math.max(1e-6, ax[0]), a1 = Math.max(1e-6, ax[1]), a2 = Math.max(1e-6, ax[2]);
  const k = 1 / Math.sqrt((ux / a0) ** 2 + (uy / a1) ** 2 + (uz / a2) ** 2);
  out.x = ux * k; out.y = uy * k; out.z = uz * k;
  let sx = out.x / a0, sy = out.y / a1, sz = out.z / a2;
  const sl = Math.hypot(sx, sy, sz) || 1;
  out.sx = sx / sl; out.sy = sy / sl; out.sz = sz / sl;
  return out;
}

/** Punkt trafienia KADŁUBA: elipsoida wpisana w bbox kadłuba × SHD_HULL_K, w kierunku `u` (iskry przy poszyciu, zawsze pod bańką). */
export function hullPoint(half, ux, uy, uz, T = SHIELD_TUNING, out = {}) {
  const k = clamp(T.SHD_HULL_K ?? 0.92, 0.05, 1);
  const ax = [0, 1, 2].map((i) => Math.max(1e-4, Number(half?.[i]) || 0.25) * k);
  return ellipsoidPoint(ax, ux, uy, uz, out);
}

/** Siła fali [SHD_AMP_MIN, 1]: część osłony zabrana trafieniem (`blocked / maks.`), pierwiastek — małe trafienia nie giną. */
export function rippleAmp(blocked, max, T = SHIELD_TUNING) {
  const f = max > 0 ? clamp((Number(blocked) || 0) / max, 0, 1) : 0;
  const lo = clamp(T.SHD_AMP_MIN ?? 0.45, 0, 1);
  return lo + (1 - lo) * Math.sqrt(f);
}

/**
 * Wygląd z ułamka osłony POKAZYWANEJ: `bright` (silna — 1, słaba — do 0,45), `flicker` (silna — 0, przy zerze — 1), `crisp`
 * (ostrość czoła fali — silna 1).
 */
export function shieldLook(frac, T = SHIELD_TUNING) {
  const w = clamp(clamp(Number(frac) || 0, 0, 1) / Math.max(1e-6, T.SHD_WEAK_FRAC ?? 0.35), 0, 1);
  return { bright: 0.45 + 0.55 * w, flicker: 1 - w, crisp: w };
}

/**
 * Slot fali: pierwszy WOLNY w zakresie [0, count) (nigdy nieużyty albo fala wygasła), inaczej NAJSTARSZY. `count` = budżet presetu
 * (High 8 / Medium 4 / Low 1) — slot nigdy poza nim.
 * @param {Array<{t0:number}>} slots
 */
export function allocRipple(slots, count, now, lifeMs) {
  const n = Math.max(1, Math.min(slots.length, Math.floor(Number(count) || 1)));
  let best = 0, bestT = Infinity;
  for (let i = 0; i < n; i++) {
    const t0 = slots[i]?.t0;
    if (!Number.isFinite(t0) || now - t0 >= lifeMs) return i;
    if (t0 < bestT) { bestT = t0; best = i; }
  }
  return best;
}

/** Osmalenia włączone wyłącznie na High (presety wyłączone = rysunek High, jak budżety CV-2b / CV-5). */
export function scorchEnabled(eff) {
  return !eff || eff.scorch === true || (eff.scorch === undefined && eff.level === 'high');
}

/**
 * Plama osmalenia statku: dopisz do listy (≤ `max`), pełna — zastąp NAJSTARSZĄ. Zwraca indeks slotu.
 * @param {Array<{t0:number}>} list
 */
export function allocScorch(list, max, now) {
  const m = Math.max(1, Math.floor(Number(max) || SCORCH_MAX));
  if (list.length < m) { list.push({ t0: now, p: [0, 0, 0] }); return list.length - 1; }
  let best = 0;
  for (let i = 1; i < m; i++) if (list[i].t0 < list[best].t0) best = i;
  list[best].t0 = now;
  return best;
}

/** Żar brzegu plamy [0, 1] po `ageMs` (liniowo do zera w SCORCH_COOL_MS, kwadrat — szybki spadek jasności). */
export function scorchHeat(ageMs, T = SHIELD_TUNING) {
  const k = clamp(1 - (Number(ageMs) || 0) / Math.max(1, T.SCORCH_COOL_MS ?? 1800), 0, 1);
  return k * k;
}

const newShip = (id) => ({
  id, max: 0, planUp: null, dispUp: null, prev: null, frac: 1,
  ripples: Array.from({ length: SHIELD_RIPPLES_MAX }, () => ({ t0: -Infinity, sx: 0, sy: 1, sz: 0, amp: 0 })),
  lastHit: -Infinity, collapseT0: -Infinity, shimmerT0: -Infinity, shimmerGain: 0,
  stats: { planned: 0, onBubble: 0, collapsesPlanned: 0, ripples: 0, collapses: 0, regens: 0, reforms: 0 },
});

/**
 * Stan osłon wszystkich śledzonych statków (planowanie + pokaz). Czasy pokazu w ms ZEGARA EFEKTÓW (prezentacja × FX_TIME_SCALE),
 * czasy planowania — ms zegara prezentacji (z rejestru).
 */
export class ShieldStates {
  constructor({ tuning = SHIELD_TUNING } = {}) {
    this.tuning = tuning;
    this.ships = new Map();
    this.stats = { planned: 0, onBubble: 0, collapsesPlanned: 0, ripples: 0, collapses: 0, regens: 0, reforms: 0 };
  }

  ship(id) {
    let s = this.ships.get(id);
    if (!s) { s = newShip(id); this.ships.set(id, s); }
    return s;
  }

  /** Pierwsze spojrzenie na statek: bańka „podniesiona”, gdy statek MA osłonę i osłona pokazywana > 0 (planowanie i pokaz zgodnie). */
  _first(s, presented, max) {
    if (s.planUp !== null) return;
    s.max = max > 0 ? max : 0;
    const up = s.max > 0 && presented > SHIELD_EPS;
    s.planUp = up;
    s.dispUp = up;
  }

  /**
   * PLANOWANIE rundy (chwila nadejścia): trafienia W KOLEJNOŚCI TRAFIEŃ (rejestr: `impactAt`) — `x.shd = { onBubble, collapse, hull }`.
   *   onBubble — statek ma osłonę, bańka (planowana) trzyma i osłona przyjęła część trafienia (`blocked` > 0) — koniec strzału NA BAŃCE;
   *   collapse — to trafienie zbija osłonę do zera (`shieldAfter` ≤ ε) — rozpad, sygnał `shieldDown`; bańka planowana opada (raz);
   *   hull     — iskry i żar na kadłubie: trafienie po rozpadzie / bez osłony albo nadmiar trafienia rozbijającego (`dmg` > 0).
   * Pudła — `x.shd = null`. Wpisy wcześniejszych rund (pociski w locie) mają plan z własnej rundy — bez zmian.
   * @param {object[]} entries — wpisy rundy z rejestru (`CombatLedger.addRound`), z polem `shieldAfter` (ładunek D-CV-8)
   * @param {(id:string)=>({presented:number, max:number}|null)} info — osłona pokazywana i maks. celu w chwili planowania
   */
  planRound(entries, info) {
    const hits = [];
    for (const x of entries ?? []) { if (x?.hit) hits.push(x); else if (x) x.shd = null; }
    hits.sort((a, b) => (a.impactAt - b.impactAt) || ((a.index ?? 0) - (b.index ?? 0)));
    for (const x of hits) {
      const s = this.ship(x.target);
      const inf = info?.(x.target) ?? null;
      const max = Math.max(0, Number(inf?.max) || 0);
      this._first(s, Number(inf?.presented) || 0, max);
      if (max > 0) s.max = max;
      const onBubble = s.max > 0 && s.planUp === true && (Number(x.blocked) || 0) > 0;
      const collapse = onBubble && !((Number(x.shieldAfter) || 0) > SHIELD_EPS);
      if (collapse) s.planUp = false;
      x.shd = { onBubble, collapse, hull: !onBubble || (Number(x.dmg) || 0) > 0 };
      for (const st of [this.stats, s.stats]) {
        st.planned++; if (onBubble) st.onBubble++; if (collapse) st.collapsesPlanned++;
      }
    }
  }

  /**
   * POKAZ trafienia (chwila trafienia nadeszła): fala na bańce (slot z budżetu presetu, najstarsza zastępowana), rozpad wg planu
   * (dokładnie raz — bańka pokazywana musi być podniesiona). `dir` — kierunek na sferze bańki (`ellipsoidPoint`), `now` — zegar efektów.
   * @returns {{ ripple:number, collapse:boolean }|null}
   */
  impact(x, dir, now, { ripples = SHIELD_RIPPLES_MAX } = {}) {
    const s = this.ships.get(x?.target);
    if (!s || !x?.shd?.onBubble || s.dispUp !== true) return { ripple: -1, collapse: false };
    const T = this.tuning;
    const slot = allocRipple(s.ripples, ripples, now, T.SHD_RIPPLE_MS ?? 720);
    const r = s.ripples[slot];
    r.t0 = now; r.sx = dir?.sx ?? 0; r.sy = dir?.sy ?? 1; r.sz = dir?.sz ?? 0;
    r.amp = rippleAmp(x.blocked, s.max, T);
    s.lastHit = now;
    s.stats.ripples++; this.stats.ripples++;
    if (!x.shd.collapse) return { ripple: slot, collapse: false };
    s.dispUp = false;
    s.collapseT0 = now;
    s.stats.collapses++; this.stats.collapses++;
    return { ripple: slot, collapse: true };
  }

  /**
   * Próbka osłony POKAZYWANEJ (raz na klatkę): ułamek (siła), regeneracja (prawdziwy wzrost: przyrost + osłona zabrana przez trafienia
   * pokazane w tej klatce > SHD_REGEN_MIN_FRAC maks.) — fala, gdy bańka trzyma; po rozpadzie — powrót bańki, gdy osłona ≥ SHD_REUP_FRAC.
   * @returns {{ regen:number, reform:boolean, shimmer:boolean }|null} — null: brak wzrostu (albo pierwsza próbka / brak osłony)
   */
  sample(id, { presented = 0, max = 0, landed = 0, now = 0 } = {}) {
    const s = this.ship(id);
    const T = this.tuning;
    const p = Math.max(0, Number(presented) || 0);
    this._first(s, p, max);
    if (max > 0) s.max = max;
    const prev = s.prev;
    s.prev = p;
    s.frac = s.max > 0 ? clamp(p / s.max, 0, 1) : 0;
    if (prev == null || !(s.max > 0)) return null;
    const inc = p - prev + Math.max(0, Number(landed) || 0);
    if (!(inc > Math.max(1e-9, (T.SHD_REGEN_MIN_FRAC ?? 0.002) * s.max))) return null;
    if (s.dispUp === true) {
      // rozpad już zaplanowany (trafienie tej rundy w locie — `planUp` opadło przy nadejściu): regeneracja tej rundy bez fali — osłona
      // za chwilę pęka, a w logice regeneracja przychodzi PO ogniu rundy
      if (s.planUp === false) return { regen: inc, reform: false, shimmer: false };
      s.shimmerT0 = now; s.shimmerGain = T.SHD_SHIMMER_GAIN ?? 0.28;
      s.stats.regens++; this.stats.regens++;
      return { regen: inc, reform: false, shimmer: true };
    }
    if (p >= (T.SHD_REUP_FRAC ?? 0.25) * s.max) {
      s.dispUp = true; s.planUp = true;
      s.shimmerT0 = now; s.shimmerGain = T.SHD_REFORM_GAIN ?? 0.8;
      s.stats.reforms++; this.stats.reforms++;
      return { regen: inc, reform: true, shimmer: true };
    }
    return { regen: inc, reform: false, shimmer: false };
  }

  /**
   * Stan rysunku bańki w chwili `now` (zegar efektów): widoczna? jasność wygasania, siła, migotanie, wiek rozpadu i fali regeneracji.
   * Bańka bez osłony (maks. 0) — nigdy; opadła — tylko w trakcie rozpadu.
   */
  visual(id, now) {
    const s = this.ships.get(id);
    const T = this.tuning;
    if (!s || !(s.max > 0)) return null;
    const look = shieldLook(s.frac, T);
    const fadeMs = Math.max(1, T.SHD_FADE_MS ?? 650), ripMs = Math.max(1, T.SHD_RIPPLE_MS ?? 720);
    const colMs = Math.max(1, T.SHD_COLLAPSE_MS ?? 900), shMs = Math.max(1, T.SHD_SHIMMER_MS ?? 650);
    const hitK = clamp(1 - (now - s.lastHit) / fadeMs, 0, 1);
    const fade = hitK * hitK * (3 - 2 * hitK);
    const colAge = now - s.collapseT0, shAge = now - s.shimmerT0;
    const collapsing = colAge >= 0 && colAge < colMs;
    const shimmering = s.dispUp === true && shAge >= 0 && shAge < shMs;
    let rip = false;
    for (const r of s.ripples) if (now - r.t0 >= 0 && now - r.t0 < ripMs) { rip = true; break; }
    const visible = collapsing || (s.dispUp === true && (fade > 1e-3 || rip || shimmering));
    return { visible, fade: s.dispUp === true || collapsing ? fade : 0, frac: s.frac, bright: look.bright, flicker: look.flicker,
      crisp: look.crisp, collapseAge: collapsing ? colAge : -1, shimmerAge: shimmering ? shAge : -1, shimmerGain: s.shimmerGain,
      up: s.dispUp === true };
  }

  /** Zapomnij statek (zniszczony, poza widokiem po animacji). */
  drop(id) { this.ships.delete(id); }

  clear() { this.ships.clear(); }
}
