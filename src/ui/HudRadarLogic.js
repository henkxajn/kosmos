// HudRadarLogic — ARKUSZ HUD H1 (D-HUD-3, D-HUD-4, D-HUD-12, D-HUD-18, D-HUD-b; HUD_PLAN.md §4.2): czysta logika radaru
// warstwy HUD 2D — kto ma radar, jaki promień, kiedy ping i kiedy stoi, kąty podziałki, styl z ról motywu.
// Czysty: bez three i bez DOM; ZERO kolorów na sztywno — barwy wyłącznie z ról `HudPalette.resolveHudRoles` (podaje wołający).
//   • promień: statek — zasięg WYKRYCIA (`vesselDetectionRangeAU` — ta sama funkcja, której używa `ProximitySystem`;
//     Finding 505: dawniej stałe 0,3 AU sensor-locku); kolonia — zasięg obserwatorium
//     (`ObservatorySystem.getVesselDetectionRangeAU`); ∞ (obserwatorium Lv4+) — bez okręgu (znak „∞” przy etykiecie — H2);
//     zasięg ujawnienia (sensor-lock 0,3 × tech) w H1 nierysowany (druga linia etykiety — H2);
//   • kto (D-HUD-4): statki gracza W SŁUŻBIE w oglądanym układzie — bez rezerwy (Finding 507), zadokowany wyłącznie
//     zaznaczony (okrąg w środku ciała, przy którym stoi), statek w skoku (`systemId` null) — nigdy (Finding 516); kolonie
//     gracza, pełne i placówki — nigdy AI (Finding 506). Poza trybem Y — WYŁĄCZNIE zaznaczone: statek wiodący
//     (`readClickSelection.leadId`, inaczej pierwszy z `vesselIds`) i ciało z kolonią gracza (`entityId`); w trybie Y —
//     wszystkie (D-HUD-18), ping tylko zaznaczonych;
//   • ping (D-HUD-b, D-HUD-12): pierwszy w chwili zaznaczenia — czas REALNY (działa w pauzie); kolejne co 6 s na zegarze
//     klatek symulacji `simClockMs` (stoją w pauzie; przed pierwszym tikiem po wczytaniu — brak, bez zapasu na czas realny);
//     ping stoi (zostaje statyczna granica + podziałka), gdy pierścień na ekranie jest większy niż kadr mapy (promień
//     > 0,6 × min(szer., wys.) obszaru mapy z `MapInsets`) albo tarcza ciała pod środkiem radaru ≥ 40 px;
//   • granica (korekta 1b — bramka H1 2026-10-23: kropki 2 / 8 px α 0,2 w barwie akcentu zlewały się z orbitami):
//     kropki 1,5 px (okrągłe końce) co 6 px α 0,35, podziałka co 30° — kreski 10 px, główne (0°, 90°, 180°, 270°) 16 px,
//     α 0,55 — i odczyt zasięgu („11,5 AU”, jedno miejsce po przecinku, separator wg języka) α 0,6 przy NAJWYŻSZEJ na
//     ekranie kresce głównej, na zewnątrz granicy (decyzja właściciela 2026-10-23); granica, podziałka i odczyt w roli
//     `BOUNDARY_ROLE` = `primary` (wybór właściciela na bramce H1 — `dim` w 4 z 5 motywów to akcent × 0,32 i zlewał się
//     z orbitami), ping — `primary`; ∞ — bez okręgu, bez odczytu; kropki tylko w oknie (`clipRunsToRect`);
//   • kąty w ramce UKŁADU: 0 = oś x układu (oś X świata), rosnąco ku osi y układu (oś Z świata) — nie kamera (D-HUD-11);
//   • obcy w zasięgu (D-HUD-4): statek — para `vessel:proximityEnter` z graczem (`!sameFaction`, `proximityFlashPair`),
//     kolonia — `vessel:detectionChanged { detected: true }` + najbliższa kolonia gracza, w której zasięgu jest obcy
//     (`nearestCoveringColony`); alert, błysk na granicy i treść — paczka B (`HudAlertLogic`; dawny błysk H1 0,8 s czasu
//     realnego — ścieżka OFF — usunięty w B-Z);
//   • wielkości w px LOGICZNYCH UI (skala jak `#ui-canvas`).
import { isEnemyVessel, isInService } from '../entities/Vessel.js';
import { isPlayerColony } from '../utils/ColonyOwnership.js';
import { systemIdOf } from '../utils/SystemScope.js';
import { vesselDetectionRangeAU } from '../utils/DetectionRange.js';
import { fmtDec } from './NumberFormatLogic.js';   // korekta 1b — odczyt zasięgu (separator dziesiętny wg języka)

// Ta sama funkcja zasięgu co `ProximitySystem._getDetectionRangeAU` (keeper `hud_radar_smoke` pinuje tożsamość).
export { vesselDetectionRangeAU };

// Rysunek i harmonogram (px logiczne, ms). Strojenie na bramce — wartości ze specyfikacji właściciela (artboard
// „Kombinacja — szlif”).
export const HUD_RADAR = Object.freeze({
  // Granica, podziałka i odczyt zasięgu — korekta 1b (bramka H1 2026-10-23: granica α 0,2, kropki [2, 8] w barwie akcentu
  // zlewała się z orbitami).
  BOUNDARY_ROLE: 'primary',                      // rola granicy, podziałki i odczytu — wybór właściciela (bramka H1); ping — primary
  BOUNDARY_ALPHA: 0.35,                          // granica zasięgu — kropki
  BOUNDARY_WIDTH: 1.5,                           // średnica kropki
  BOUNDARY_CAP: 'round',                         // okrągły koniec — kreska zerowej długości rysuje kropkę
  BOUNDARY_DASH: Object.freeze([0, 6]),          // kropka co 6 px
  TICK_COUNT: 12,                                // podziałka co 30°
  TICK_MAJOR_EVERY: 3,                           // co trzecia — kreski główne 0°, 90°, 180°, 270°
  TICK_LEN: 10,                                  // do wewnątrz
  TICK_MAJOR_LEN: 16,
  TICK_ALPHA: 0.55,
  TICK_WIDTH: 1,
  READOUT_ALPHA: 0.6,                            // odczyt zasięgu („11,5 AU”) — bez tła
  READOUT_GAP: 4,                                // odstęp tekstu od granicy, na zewnątrz
  BOUNDARY_CLIP_PX: 4,                           // granica rysowana tylko w oknie + margines (px) — `clipRunsToRect`
  PING_MS: 2400,                                 // czas pingu (ease-out), gaśnie na granicy
  PING_PERIOD_MS: 6000,                          // odstęp kolejnych pingów (zegar symulacji)
  PING_LINE_WIDTH: 1.2, PING_LINE_ALPHA: 0.70,   // ostra linia
  PING_GLOW_WIDTHS: Object.freeze([7, 4.5, 2.5]), PING_GLOW_ALPHA: 0.22,   // miękka poświata (szczyt krycia nałożonych warstw)
  PING_ECHO_WIDTH: 0.6, PING_ECHO_ALPHA: 0.25, PING_ECHO_GAP: 4,           // echo tuż za linią
  PING_FADE_FROM: 0.6,                           // od tej części czasu ping gaśnie (do zera na granicy)
  PING_STOP_FRAME_FRAC: 0.6,                     // ping stoi: promień > 0,6 × min(szer., wys.) obszaru mapy
  PING_STOP_DISC_PX: 40,                         // ping stoi: tarcza ciała pod środkiem radaru ≥ 40 px
  SEG_PX: 6, SEG_MIN: 48, SEG_MAX: 512,          // próbkowanie okręgu: ~6 px na odcinek
});

/** Zaznaczone obiekty z radarem: statek wiodący (inaczej pierwszy z `vesselIds`) i ciało z karty. */
export function radarSelection(sel) {
  const ids = Array.isArray(sel?.vesselIds) ? sel.vesselIds : [];
  return { vesselId: sel?.leadId ?? ids[0] ?? null, bodyId: sel?.entityId ?? null };
}

/** Układ kolonii — ciało, potem stempel kolonii, brak obu — `sys_home` (reguła `ObservatorySystem._tickVesselDetection`). */
export function colonySystemId(colony) {
  return colony?.planet?.systemId ?? colony?.systemId ?? 'sys_home';
}

/** Promień radaru statku (AU) = zasięg wykrycia — `vesselDetectionRangeAU` (jak `ProximitySystem`). */
export function vesselRadarRangeAU(vessel, { vesselManager = null, techSystem = null } = {}) {
  return vesselDetectionRangeAU(vessel, { vesselManager, techSystem });
}

/** Promień radaru kolonii (AU) = zasięg wykrycia obserwatorium (∞ — bez okręgu); brak systemu — 0. */
export function colonyRadarRangeAU(colony, observatorySystem) {
  const r = observatorySystem?.getVesselDetectionRangeAU?.(colony);
  return (typeof r === 'number' && r > 0) ? r : 0;
}

/**
 * Kto ma radar w oglądanym układzie (D-HUD-4, D-HUD-18).
 * @param {{ vessels:Iterable, colonies:Iterable, sel:object, tactical:boolean, activeSystemId:string,
 *           vesselRange:(v)=>number, colonyRange:(c)=>number }} p
 * @returns {Array<{ key:string, kind:'vessel'|'colony', id:string, selected:boolean, rangeAU:number, circle:boolean,
 *           docked:boolean, anchorBodyId:string|null }>} — `circle` false: zasięg ∞ (bez okręgu)
 */
export function radarHolders({ vessels = [], colonies = [], sel = null, tactical = false, activeSystemId = 'sys_home',
  vesselRange = () => 0, colonyRange = () => 0 } = {}) {
  const pick = radarSelection(sel);
  const out = [];
  for (const v of vessels) {
    if (!v || v.isWreck || isEnemyVessel(v) || !isInService(v)) continue;      // wrak, obcy, rezerwa (507)
    if (systemIdOf(v) !== activeSystemId) continue;                             // inny układ, skok warp — null (516)
    const selected = pick.vesselId != null && String(v.id) === String(pick.vesselId);
    const docked = v.position?.state === 'docked';
    if (docked && !selected) continue;                                          // zadokowany — tylko zaznaczony (507)
    if (!tactical && !selected) continue;                                       // poza trybem Y — tylko zaznaczony
    const rangeAU = vesselRange(v);
    if (!(rangeAU > 0)) continue;
    out.push({ key: 'v:' + v.id, kind: 'vessel', id: v.id, selected, rangeAU, circle: Number.isFinite(rangeAU), docked,
      anchorBodyId: docked ? (v.position?.dockedAt ?? null) : null });
  }
  for (const c of colonies) {
    if (!isPlayerColony(c)) continue;                                           // kolonia AI — nigdy (506)
    if (colonySystemId(c) !== activeSystemId) continue;
    const selected = pick.bodyId != null && String(c.planetId) === String(pick.bodyId);
    if (!tactical && !selected) continue;
    const rangeAU = colonyRange(c);
    if (!(rangeAU > 0)) continue;
    out.push({ key: 'c:' + c.planetId, kind: 'colony', id: c.planetId, selected, rangeAU, circle: Number.isFinite(rangeAU),
      docked: false, anchorBodyId: c.planetId });
  }
  return out;
}

/**
 * Faza pingu zaznaczonego obiektu.
 * @param {{ realNowMs:number, realStartMs:number|null, simNowMs:number|null, simStartMs:number|null }} t — start: chwila
 *   zaznaczenia (czas realny) i zegar symulacji w tej chwili (albo przy pierwszym odczycie po wczytaniu)
 * @returns {{ u:number, clock:'real'|'sim', n:number }|null} — `u` ∈ [0, 1) postęp pingu; `n` — numer pingu (0 = pierwszy)
 */
export function pingPhase({ realNowMs, realStartMs = null, simNowMs = null, simStartMs = null }) {
  const D = HUD_RADAR.PING_MS, T = HUD_RADAR.PING_PERIOD_MS;
  if (Number.isFinite(realStartMs)) {
    const d = realNowMs - realStartMs;
    if (d >= 0 && d < D) return { u: d / D, clock: 'real', n: 0 };
  }
  if (!Number.isFinite(simNowMs) || !Number.isFinite(simStartMs)) return null;
  const ds = simNowMs - simStartMs;
  if (ds < T) return null;
  const n = Math.floor(ds / T);
  const into = ds - n * T;
  return into < D ? { u: into / D, clock: 'sim', n } : null;
}

/** Promień pingu jako część promienia granicy — ease-out (szybki start, łagodne dojście do granicy). */
export function pingRadiusFrac(u) {
  const x = Math.min(1, Math.max(0, u));
  return 1 - Math.pow(1 - x, 3);
}

/** Krycie pingu (mnożnik): pełne, potem gaśnie do zera na granicy. */
export function pingFade(u) {
  const a = HUD_RADAR.PING_FADE_FROM;
  if (u <= a) return 1;
  const t = Math.min(1, (u - a) / (1 - a));
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Czy ping stoi (D-HUD-b).
 * @param {{ ringPx:number, mapW:number, mapH:number, discPx?:number|null }} p — promień pierścienia na ekranie (px
 *   logiczne; ∞ — część okręgu albo środek za kamerą), obszar mapy, średnica tarczy ciała pod środkiem radaru
 * @returns {'ring'|'disc'|null}
 */
export function pingStopReason({ ringPx, mapW, mapH, discPx = null }) {
  const frame = Math.min(mapW, mapH);
  if (!(ringPx <= HUD_RADAR.PING_STOP_FRAME_FRAC * frame)) return 'ring';
  if (discPx >= HUD_RADAR.PING_STOP_DISC_PX) return 'disc';
  return null;
}

/** Kąty kresek podziałki (rad, ramka układu): 0, 30°, …, 330°. */
export function tickAngles() {
  const n = HUD_RADAR.TICK_COUNT;
  return Array.from({ length: n }, (_, k) => (k * 2 * Math.PI) / n);
}

/** Kreska główna podziałki — 0°, 90°, 180°, 270° (co `TICK_MAJOR_EVERY` kresek). */
export function isMajorTick(k) {
  return Number.isInteger(k) && k % HUD_RADAR.TICK_MAJOR_EVERY === 0;
}

/** Liczba odcinków okręgu o promieniu `rPx` (px logiczne) — ~6 px na odcinek, w granicach [48, 512]. */
export function ringSegments(rPx) {
  if (!Number.isFinite(rPx) || rPx <= 0) return HUD_RADAR.SEG_MAX;
  return Math.max(HUD_RADAR.SEG_MIN, Math.min(HUD_RADAR.SEG_MAX, Math.ceil((2 * Math.PI * rPx) / HUD_RADAR.SEG_PX)));
}

/**
 * Biegi łamanej (`[x0, y0, x1, y1, …]`, px logiczne) przycięte do prostokąta `r` = { x0, y0, x1, y1 } — granicę z kropek
 * rysujemy tylko w oknie: okrąg większy od kadru (kamera blisko obiektu) ma w rzucie miliony px długości (przycięcie
 * płaszczyzną bliską kamery), a koszt rasteryzacji kropek rośnie z długością ścieżki — korekta 1b, sonda K11 S5: 6 kl./s
 * z kropkami na całej ścieżce, 51 kl./s bez radaru. Kawałek niesie `offset` — długość biegu od jego początku do początku
 * kawałka; jako `lineDashOffset` daje te same kropki co rysunek bez przycięcia.
 * @returns {{ pts: number[], offset: number }[]}
 */
export function clipRunsToRect(runs, r) {
  const res = [];
  for (const run of runs ?? []) {
    let acc = 0, cur = null;
    for (let i = 2; i < run.length; i += 2) {
      const ax = run[i - 2], ay = run[i - 1], dx = run[i] - ax, dy = run[i + 1] - ay, len = Math.hypot(dx, dy);
      // Liang–Barsky: część odcinka [t0, t1] wewnątrz prostokąta.
      let t0 = 0, t1 = 1, ok = true;
      for (const [p, q] of [[-dx, ax - r.x0], [dx, r.x1 - ax], [-dy, ay - r.y0], [dy, r.y1 - ay]]) {
        if (p === 0) { if (q < 0) { ok = false; break; } continue; }
        const tt = q / p;
        if (p < 0) { if (tt > t1) { ok = false; break; } if (tt > t0) t0 = tt; }
        else { if (tt < t0) { ok = false; break; } if (tt < t1) t1 = tt; }
      }
      if (ok) {
        if (!cur || t0 > 0) { cur = { pts: [ax + dx * t0, ay + dy * t0], offset: acc + len * t0 }; res.push(cur); }
        cur.pts.push(ax + dx * t1, ay + dy * t1);
        if (t1 < 1) cur = null;
      } else cur = null;
      acc += len;
    }
  }
  return res;
}

/** Krycie jednej z `n` nałożonych warstw poświaty, tak by w środku (wszystkie warstwy) wyszło `peak`. */
export function glowLayerAlpha(n, peak) {
  return 1 - Math.pow(1 - peak, 1 / Math.max(1, n));
}

/** Odczyt zasięgu przy granicy (korekta 1b): „11,5 AU” / „1,0 AU” — jedno miejsce po przecinku, separator dziesiętny wg
 *  języka (`fmtDec`, `locale` = 'pl' | 'en'); jednostka „AU” jak w obu słownikach; ∞ albo brak zasięgu — `null` (bez okręgu). */
export function rangeReadoutText(rangeAU, locale = 'pl') {
  if (!(rangeAU > 0) || !Number.isFinite(rangeAU)) return null;
  return `${fmtDec(rangeAU, 1, locale)} AU`;
}

/**
 * Kotwica odczytu zasięgu: NAJWYŻSZA na ekranie kreska główna (najmniejsze y; remis — mniejszy kąt) — decyzja właściciela
 * 2026-10-23 (0° w ramce układu leży w domyślnym kadrze na DOLE okręgu, najwyżej — 180°).
 * @param {number[][]} ticks — kreski `[x0, y0, x1, y1, k]` (punkt na granicy → koniec do wewnątrz; `k` — numer kreski)
 * @param {string|null} text
 * @returns {{ text:string, k:number, deg:number, x:number, y:number, ux:number, uy:number }|null} — punkt granicy przy
 *   kresce i kierunek NA ZEWNĄTRZ okręgu (przeciwny do kreski); `null` — brak tekstu albo brak kresek głównych
 */
export function radarReadout(ticks, text) {
  if (!text) return null;
  let best = null;
  for (const t of ticks ?? []) {
    if (!isMajorTick(t?.[4])) continue;
    if (!best || t[1] < best[1]) best = t;
  }
  if (!best) return null;
  const dx = best[2] - best[0], dy = best[3] - best[1], d = Math.hypot(dx, dy);
  if (!(d > 0)) return null;
  return { text, k: best[4], deg: (best[4] * 360) / HUD_RADAR.TICK_COUNT, x: best[0], y: best[1], ux: -dx / d, uy: -dy / d };
}

/** Środek pola tekstu odczytu (szer. `w`, wys. `h` px): od punktu granicy na zewnątrz o `READOUT_GAP` + rzut połowy pola. */
export function readoutCenter(r, w, h) {
  const g = HUD_RADAR.READOUT_GAP + (Math.abs(r.ux) * w) / 2 + (Math.abs(r.uy) * h) / 2;
  return { x: r.x + r.ux * g, y: r.y + r.uy * g };
}

/** Styl radaru z ról motywu (D-HUD-2): granica, podziałka i odczyt zasięgu — rola `boundaryRole` (domyślnie stała
 *  `BOUNDARY_ROLE`, korekta 1b), ping — `primary`; błysk alertu — `alert` (szerokości i krycie — `HUD_ALERT`). Zero kolorów
 *  na sztywno. */
export function radarStyle(roles, boundaryRole = HUD_RADAR.BOUNDARY_ROLE) {
  const R = HUD_RADAR;
  const quiet = roles[boundaryRole] ?? roles.primary;
  return {
    boundary: { color: quiet, alpha: R.BOUNDARY_ALPHA, width: R.BOUNDARY_WIDTH, cap: R.BOUNDARY_CAP, dash: R.BOUNDARY_DASH },
    tick:     { color: quiet, alpha: R.TICK_ALPHA, width: R.TICK_WIDTH, len: R.TICK_LEN, majorLen: R.TICK_MAJOR_LEN },
    readout:  { color: quiet, alpha: R.READOUT_ALPHA },
    ping: {
      color: roles.primary,
      line: { width: R.PING_LINE_WIDTH, alpha: R.PING_LINE_ALPHA },
      glow: { widths: R.PING_GLOW_WIDTHS, alpha: glowLayerAlpha(R.PING_GLOW_WIDTHS.length, R.PING_GLOW_ALPHA) },
      echo: { width: R.PING_ECHO_WIDTH, alpha: R.PING_ECHO_ALPHA, gap: R.PING_ECHO_GAP },
    },
    flash: { color: roles.alert },
  };
}

// ── Obcy w zasięgu (D-HUD-4) ───────────────────────────────────────────────────────────────────────────────────────

/** Namiar (rad) z `from` do `to` w ramce UKŁADU (współrzędne logiki gry: 0 = oś x układu, rosnąco ku osi y) — nie kamera. */
export function bearingRad(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * Para `vessel:proximityEnter` → właściciel radaru (statek gracza) i obcy. `null`: para bez statku gracza (AI↔AI), swoi,
 * wrak. Zgłoszenie samo w sobie nie mówi, który statek jest czyj — rozstrzyga kanon `isEnemyVessel`.
 */
export function proximityFlashPair(a, b) {
  if (!a || !b || a.isWreck || b.isWreck) return null;
  const ea = isEnemyVessel(a), eb = isEnemyVessel(b);
  if (ea === eb) return null;
  return ea ? { holder: b, foe: a } : { holder: a, foe: b };
}

/**
 * Kolonia gracza, której radar „złapał” obcego (`vessel:detectionChanged` nie mówi, która): najbliższa kolonia gracza
 * w układzie obcego, w której zasięgu obcy leży (para liczona w JEDNYM układzie — współrzędne lokalne).
 * @param {{ foe:object, colonies:Iterable, rangeOf:(c)=>number, posOf:(c)=>{x:number,y:number}|null, auToPx:number }} p
 * @returns {{ colony:object, rangeAU:number, distAU:number, pos:object }|null} — zasięg ∞ zwracany (wołający: bez granicy)
 */
export function nearestCoveringColony({ foe, colonies = [], rangeOf = () => 0, posOf = () => null, auToPx }) {
  const sys = systemIdOf(foe);
  const fp = foe?.position;
  if (sys == null || !fp || !Number.isFinite(fp.x) || !Number.isFinite(fp.y) || !(auToPx > 0)) return null;
  let best = null;
  for (const c of colonies) {
    if (!isPlayerColony(c) || colonySystemId(c) !== sys) continue;
    const r = rangeOf(c);
    if (!(r > 0)) continue;
    const p = posOf(c);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const dAU = Math.hypot(fp.x - p.x, fp.y - p.y) / auToPx;
    if (dAU <= r && (!best || dAU < best.distAU)) best = { colony: c, rangeAU: r, distAU: dAU, pos: p };
  }
  return best;
}
