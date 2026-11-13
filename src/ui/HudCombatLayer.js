// HudCombatLayer — ARC COMBAT VISUALS, krok CV-6a (COMBAT_VISUALS_PLAN.md §2.6, D-CV-20, D-CV-22; Findingi 653 (a), 666, 674):
// WARSTWA TAKTYCZNA bitwy — podwarstwa HUD 2D (`HudLayer`) między znacznikiem statku a etykietami (zbierana przed etykietami:
// etykiety omijają znak bitwy i linię najechania — `labelObstacles`). Flaga `cvTactical` (czytana co klatkę), wymaga `cvStage`
// (scena podaje klastry starć w widoku i `px_L`). Logika — czysty `HudCombatLogic`; tu: odczyt świata (`F.K` = `window.KOSMOS`),
// rzut wspólnym projektorem, rysunek Canvas 2D w px logicznych, klik i najechanie.
//   • sylwetki klas (fregata / niszczyciel / pancernik / cywilny / nieznany) w położeniach RYSOWANYCH (scena + choreografia), nos
//     wg rysowanego kursu (dziób modelu), znacznik kursu, krótki wektor prędkości rysowanej; wrak — przekreślony, przygaszony;
//   • zoom semantyczny: krycie ikon = 1 − smoothstep(8, 24, px_L) (to samo px_L co scena) — kino bez ikon i bez pasków; daleko —
//     jeden znak bitwy „⚔ 10 : 9” z paskami siły i rundą (zamiast stosu „⚠ ×N”), z histerezą;
//   • linie ognia w chwilach rejestru salw, mikropaski HP / osłony z wartości pokazywanych, ramka starcia (narożniki + „R n”) na
//     średnim zoomie, pasma zasięgu zaznaczonego / najechanego statku (prawo sceny), najechanie — „nazwa · klasa · HP %”;
//   • mgła wojny = `isEndpointVisibleInCombat` (`HudCombatLogic.tacVisibility`); kolory wyłącznie z ról motywu (`F.roles`);
//   • decyzja właściciela 46: (1) CTRL — nazwy uczestników przy ich ikonach (w kinie — przy statkach) z rozkładem bez kupy, zamiast
//     etykiet CTRL renderera (`getAllVisibleLabels` pomija uczestników); (2) klik w znak bitwy = „Obserwuj” (ładunek paska walki);
//     (3) bitwa poza kadrem — JEDNA strzałka krawędzi na bitwę (bez strzałek statków);
//   • klucz klatki zmienia się przy każdym zdarzeniu rejestru (linie ognia, HP pokazywane, zniszczenia) i przy ruchu statków;
//     w pauzie (zegar prezentacji stoi) i bez ruchu kamery — spoczynek warstwy.
// ⚠ Moduł importuje się pod node (keeper `cv_tactical_logic_smoke` — atrapa ctx): bez three i bez DOM.
import EventBus from '../core/EventBus.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { THEME } from '../config/ThemeConfig.js';
import { t, getName } from '../i18n/i18n.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { HULLS } from '../data/HullsData.js';
import { vesselSizeClass } from '../renderer/VesselModelResolver.js';
import { isPlayerEngagement } from '../utils/VesselFxLogic.js';
import { areAtWar } from '../utils/WarGate.js';
import { clickObject, vesselTarget, vesselsTarget, enemyTarget } from './ClickIntentLogic.js';
import {
  tacActive, tacTuning, tacIconAlpha, tacGlyphMode, tacVisibility, tacIconClass, tacRole, tacLayoutIcons, tacFireLines, tacFireStyle,
  tacMissEnd, tacMicroBars, tacGlyphCounts, tacBandRadiusWU, tacUniqueRanges, tacHitAt, tacIconShape, tacMinSeparation,
  tacWatchPayload, tacBattleArrow, tacPlaceNames, tacBandTarget,
} from './HudCombatLogic.js';

const AU_TO_WU = GAME_CONFIG.AU_TO_PX / 10;   // [j. / AU] (WORLD_SCALE = 10 px logiki na 1 j.; renderer: AU / WORLD_SCALE)
const q3 = (v) => Math.round(v * 1000);       // klucz — 0,001 j.
const OBJECT_NEAR = 1e-4;

// Uczestnicy starcia (strona A i B, z dołączonymi).
const sideIds = (s) => [...(s?.vesselIds ?? []), ...(s?.joinedVesselIds ?? [])];

export class HudCombatLayer {
  constructor(hud = null) {
    this._hud = hud;
    this._prep = { on: false, clusters: [] };
    this._last = { nodes: [], glyphs: [], frames: [], lines: [], bands: [], hover: null };
    this._glyph = new Map();     // klaster → tryb znaku (histereza)
    this._vel = new Map();       // statek → próbka położenia rysowanego i prędkość (j. / s prezentacji)
    this._zones = [];            // strefy kliku / najechania ikon z ostatniej klatki
    this._glyphZones = [];       // decyzja 46 (2) — znaki bitew: prostokąt + ładunek „Obserwuj”
    this._obstacles = [];        // przeszkody etykiet: znaki bitew, linia najechania
    this._measure = new Map();
    this.stats = { prepares: 0, collects: 0, fogHidden: 0, linesShown: 0, linesSecond: [] };
  }

  /** Klastry starć w widoku z uczestnikami (widoczność, położenie rysowane, klasa, kurs, HP pokazywane), linie ognia. */
  prepare(F) {
    this.stats.prepares++;
    const K = F.K, tr = K.threeRenderer, FE = F.features ?? {};
    if (!tacActive(FE) || F.mode !== 'system' || !tr) {
      if (this._prep.on) { this._glyph.clear(); this._vel.clear(); this._zones = []; this._glyphZones = []; this._obstacles = []; }
      this._prep = { on: false, clusters: [] };
      return 'tc:0';
    }
    const T = tacTuning(tr.cvTuning);
    const list = tr._stageFrame?.list ?? [];
    const now = Number(tr._presClock?.nowMs) || 0;
    const vm = K.vesselManager, intel = K.intelSystem;
    const led = FE.cvWeapons ? (tr._cvLedger ?? null) : null;
    const sel = F.sel ?? {};
    const selIds = new Set([...(sel.vesselIds ?? []), sel.leadId].filter((x) => x != null).map(String));
    const clusters = [];
    const visOf = new Map();
    let fogHidden = 0;
    // Relacja strony bitwy BEZ gracza z graczem (wojna / pasmo „wrogie”) — raz na imperium w klatce.
    const hostileMemo = new Map();
    const hostileOf = (empId) => {
      if (!empId) return true;
      if (!hostileMemo.has(empId)) {
        let h = false;
        try { h = areAtWar('player', empId) || K.diplomacySystem?.getOpinionBand?.(empId) === 'hostile'; } catch { h = false; }
        hostileMemo.set(empId, h);
      }
      return hostileMemo.get(empId);
    };
    for (const info of list) {
      const encs = (info.encs ?? []).filter(Boolean);
      if (!encs.length) continue;
      const playerBattle = encs.some((e) => isPlayerEngagement(e));
      const playerSide = new Set(), all = new Set(), stOf = new Map(), sideA = new Set(), ownerOf = new Map();
      for (const e of encs) {
        const pk = e.sideA?.ownerEmpireId === 'player' ? 'sideA' : e.sideB?.ownerEmpireId === 'player' ? 'sideB' : null;
        for (const k of ['sideA', 'sideB']) for (const id of sideIds(e[k])) {
          all.add(String(id));
          if (k === pk) playerSide.add(String(id));
          if (k === 'sideA') sideA.add(String(id));
          if (!ownerOf.has(String(id))) ownerOf.set(String(id), e[k]?.ownerEmpireId ?? null);
          const st = e.vesselStates?.get?.(id);
          if (st && !stOf.has(String(id))) stOf.set(String(id), st);
        }
      }
      const members = [], hiddenSlots = [];   // ukryci mgłą — tylko do liczb znaku („?” jak w pasku walki)
      for (const id of [...all].sort()) {
        const v = vm?.getVessel?.(id) ?? null;
        const e = tr._vessels?.get?.(id) ?? null;
        if (!v || !e?.sprite) continue;
        const isEnemy = isEnemyVessel(v);
        const quality = isEnemy ? (intel?.getVesselContact?.(id)?.quality ?? 'unknown') : null;
        let inPE = false;
        if (isEnemy) { try { inPE = tr._isCombatRevealed?.(id) === true; } catch { inPE = false; } }
        const vis = tacVisibility({ isEnemy, quality, inPlayerEngagement: inPE });
        visOf.set(id, vis);
        if (vis === 'hidden') {
          fogHidden++;
          hiddenSlots.push(playerBattle ? (playerSide.has(id) ? 'own' : 'enemy') : (sideA.has(id) ? 'own' : 'enemy'));
          continue;
        }
        if (e.sprite.visible === false) continue;   // sprite w przebudowie / zgaszony — bez ikony w tej klatce
        const w = tr.getVesselWorldPosition?.(id);
        if (!w || !Number.isFinite(w.x) || !Number.isFinite(w.y) || !Number.isFinite(w.z)) continue;
        const st = stOf.get(id) ?? null;
        const pres = vis === 'full' && st ? (tr.cvPresentedState?.(id, st) ?? null) : null;
        const killed = v.isWreck === true || e.cvKilled === true || pres?.killed === true
          || (st != null && !(Math.max(0, Number(pres ? pres.hp : st.hp) || 0) > 0));
        const own = playerSide.has(id);
        const heading = vis === 'full' ? (tr.getVesselBowWorld?.(id) ?? null) : null;
        // Strona w znaku bitwy: z graczem — gracz : przeciwnik; bez gracza — strona A : strona B.
        const slot = playerBattle ? (own ? 'own' : 'enemy') : (sideA.has(id) ? 'own' : 'enemy');
        members.push({
          id, v, vis, own, side: slot,
          role: tacRole({ playerSide: own, playerBattle, hostile: playerBattle ? true : hostileOf(ownerOf.get(id)) }),
          cls: tacIconClass(vesselSizeClass(v), vis), world: w, heading, killed,
          bars: vis === 'full' && !killed ? tacMicroBars(st, pres) : null,
          hp: Math.max(0, Number(pres ? pres.hp : st?.hp) || 0), hpStart: Math.max(0, Number(st?.hpStart) || 0),
          st, selected: selIds.has(id), vel: this._velocityOf(id, w, now, killed),
        });
      }
      clusters.push({
        id: String(info.id), pxL: Number(info.pxL) || 0, blend: Number.isFinite(info.blend) ? info.blend : 1,
        law: info.law ?? null, scale: info.fallback ? (info.scale ?? null) : null, playerBattle, encs, members, hiddenSlots,
        round: Math.max(0, ...encs.map((e) => Number(e.currentRound) || 0)),
      });
    }
    this.stats.fogHidden = fogHidden;
    // Linie ognia — wpisy rejestru starć tych klastrów (czasy zegara prezentacji).
    let lines = [];
    if (led && clusters.length) {
      const entries = [];
      for (const cl of clusters) for (const e of cl.encs) for (const r of led.roundsOf?.(e.id) ?? []) for (const x of r.entries ?? []) entries.push(x);
      lines = tacFireLines(entries, now, { killAt: (id) => led.killAt?.(id) ?? null, visible: (id) => visOf.get(String(id)) === 'full' }, T);
    }
    // Najechanie: strefa ikony z ostatniej klatki (px logiczne) albo sprite pod kursorem (kino — bez ikon).
    const ptr = F.pointer;
    let hoverId = null;
    if (ptr && !ptr.overUI && clusters.length) {
      const z = tacHitAt(this._zones, ptr.lx, ptr.ly, T.TAC_HIT_PX);
      if (z) hoverId = z.ids[0];
      else {
        const hv = F.hover?.vesselId;
        if (hv != null && clusters.some((c) => c.members.some((m) => m.id === String(hv)))) hoverId = String(hv);
      }
    }
    // Pasma zasięgu: zaznaczony (prowadzący) albo najechany uczestnik, widoczny, żywy.
    const qualifies = (id) => clusters.some((c) => c.members.some((m) => m.id === id && m.vis === 'full' && !m.killed));
    const bandId = tacBandTarget({ hoverId, selectedIds: selIds, qualifies });
    const ctrl = tr._showAllLabels === true;   // decyzja 46 (1) — CTRL: nazwy uczestników przy ikonach
    let key = `tc:1:${hoverId ?? ''}:${bandId ?? ''}:${ctrl ? 1 : 0}`;
    for (const cl of clusters) {
      key += `|c${cl.id}:${Math.round(cl.pxL * 20)}:${cl.round}`;
      for (const m of cl.members) {
        const h = m.heading;
        key += `|${m.id}:${m.vis[0]}${m.killed ? 1 : 0}${m.selected ? 1 : 0}:${q3(m.world.x)},${q3(m.world.y)},${q3(m.world.z)}`
          + `:${h ? `${Math.round(h.x * 50)},${Math.round(h.z * 50)}` : '-'}:${m.bars ? `${Math.round(m.bars.hp * 100)},${m.bars.shield == null ? '' : Math.round(m.bars.shield * 100)}` : '-'}`;
      }
    }
    for (const l of lines) key += `|f${l.key}:${Math.round(l.age * 24)}`;
    this._prep = { on: true, T, now, clusters, lines, hoverId, bandId, led, ctrl };
    return key;
  }

  // Prędkość RYSOWANA (j. / s prezentacji) z kolejnych położeń; w pauzie (zegar stoi) — ostatnia; wrak — zero.
  _velocityOf(id, w, now, killed) {
    const s = this._vel.get(id);
    if (!s) { this._vel.set(id, { x: w.x, y: w.y, z: w.z, t: now, vx: 0, vy: 0, vz: 0 }); return { x: 0, y: 0, z: 0 }; }
    const dt = (now - s.t) / 1000;
    if (dt > 1e-4) {
      const k = Math.min(1, dt / 0.25);   // wygładzenie ~0,25 s
      s.vx += ((w.x - s.x) / dt - s.vx) * k; s.vy += ((w.y - s.y) / dt - s.vy) * k; s.vz += ((w.z - s.z) / dt - s.vz) * k;
      s.x = w.x; s.y = w.y; s.z = w.z; s.t = now;
    } else if (dt < 0) { s.x = w.x; s.y = w.y; s.z = w.z; s.t = now; s.vx = s.vy = s.vz = 0; }
    if (killed) return { x: 0, y: 0, z: 0 };
    return { x: s.vx, y: s.vy, z: s.vz };
  }

  /** Geometria (px logiczne): ikony po anti-overlap, znaki bitew, ramki, linie ognia, pasma, najechanie; strefy i przeszkody. */
  collect(F, proj) {
    this.stats.collects++;
    const P = this._prep;
    this._zones = []; this._glyphZones = []; this._obstacles = [];
    const empty = { count: 0, animating: false, nodes: [], glyphs: [], frames: [], lines: [], bands: [], hover: null, clusterInfo: [], arrows: [], names: [] };
    if (!P.on || !proj || !P.clusters.length) { this._last = empty; this._pruneMaps(new Set()); return empty; }
    const T = P.T, K = F.K, tr = K.threeRenderer;
    const scale = Math.max(0.25, T.TAC_ICON_SCALE);
    const glyphs = [], frames = [], items = [], bands = [], lines = [], arrows = [];
    const map = F.mapRect ?? { x: 0, y: 0, w: F.W ?? 0, h: F.H ?? 0 };
    const mapR = { x0: map.x, y0: map.y, x1: map.x + map.w, y1: map.y + map.h };
    const posOf = new Map();      // statek → { x, y, alpha, cluster } (px po układzie)
    const memberOf = new Map();
    const alive = new Set();
    for (const cl of P.clusters) {
      alive.add(cl.id);
      const alpha = tacIconAlpha(cl.pxL, T);
      const pts = [];
      for (const m of cl.members) {
        const p = proj.point(m.world.x, m.world.y, m.world.z, OBJECT_NEAR);
        if (!p) continue;
        pts.push({ m, p });
        memberOf.set(m.id, { m, cl, p });
      }
      if (!pts.length) continue;
      // Decyzja 46 (3) — bitwa poza kadrem: JEDNA strzałka krawędzi na bitwę (żaden uczestnik w obszarze mapy).
      const arrow = tacBattleArrow(pts.map(({ p }) => p), mapR, T.TAC_ARROW_MARGIN);
      if (arrow) {
        arrows.push({ cluster: cl.id, ...arrow, role: cl.members.some((m) => m.role === 'alert') ? 'alert' : (cl.members[0]?.role ?? 'alert') });
        this._obstacles.push({ x: arrow.x - 9, y: arrow.y - 9, w: 18, h: 18 });
      }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const { p } of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      const extent = Math.max(x1 - x0, y1 - y0);
      const glyph = tacGlyphMode(this._glyph.get(cl.id) === true, extent, T);
      this._glyph.set(cl.id, glyph);
      cl._alpha = alpha; cl._glyph = glyph; cl._box = { x0, y0, x1, y1 };
      if (glyph) {
        const counts = tacGlyphCounts([
          ...cl.members.map((m) => ({ side: m.side, visibility: m.vis, alive: !m.killed, hp: m.hp, hpStart: m.hpStart })),
          ...(cl.hiddenSlots ?? []).map((side) => ({ side, visibility: 'hidden', alive: true, hp: 0, hpStart: 0 })),
        ]);
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const roleOf = (slot) => cl.members.find((m) => m.side === slot)?.role ?? (slot === 'own' ? 'primary' : 'alert');
        const g = this._glyphLayout(cx, cy, counts, cl.round, roleOf('own'), roleOf('enemy'));
        glyphs.push({ cluster: cl.id, ...g, counts, round: cl.round, alpha: 1 });
        this._obstacles.push(g.rect);
        // Decyzja 46 (2) — klik w znak bitwy = „Obserwuj” tej bitwy (ładunek paska walki).
        const payload = tacWatchPayload(cl.encs);
        if (payload) this._glyphZones.push({ cluster: cl.id, rect: g.rect, payload });
        continue;
      }
      if (!(alpha > 0.001)) continue;   // kino — bez ikon, pasków, ramki i linii
      for (const { m, p } of pts) items.push({ id: m.id, x: p.x, y: p.y, role: m.role, cl, m });
    }
    // Anti-overlap wszystkich ikon w widoku (klastry daleko od siebie nie wchodzą sobie w drogę).
    const byId = new Map(items.map((it) => [it.id, it]));
    const laid = tacLayoutIcons(items, T);
    const nodes = [];
    for (const nd of laid) {
      const its = nd.ids.map((id) => byId.get(id)).filter(Boolean);
      if (!its.length) continue;
      const cl = its[0].cl;
      const alpha = Math.min(...its.map((it) => it.cl._alpha));
      const head = its[0].m;
      const node = { ids: nd.ids, x: nd.x, y: nd.y, stack: nd.stack, alpha, role: nd.role ?? head.role, roles: nd.roles,
        cluster: cl.id, m: nd.stack ? null : head, members: its.map((it) => it.m) };
      if (!nd.stack) {
        // Kurs: rzut dziobu (świat) — kąt nosa na ekranie; prędkość rysowana × TAC_VEL_S, długość obcięta.
        const p0 = memberOf.get(head.id)?.p;
        const h = head.heading;
        if (p0 && h) {
          const s = Math.max(1e-6, p0.depth * 0.02);
          const p1 = proj.point(head.world.x + h.x * s, head.world.y + h.y * s, head.world.z + h.z * s, OBJECT_NEAR);
          if (p1 && Math.hypot(p1.x - p0.x, p1.y - p0.y) > 1e-6) node.angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        }
        const vel = head.vel;
        if (p0 && vel && Math.hypot(vel.x, vel.y, vel.z) > 1e-6 && !head.killed) {
          const k = T.TAC_VEL_S;
          const p1 = proj.point(head.world.x + vel.x * k, head.world.y + vel.y * k, head.world.z + vel.z * k, OBJECT_NEAR);
          if (p1) {
            let dx = p1.x - p0.x, dy = p1.y - p0.y;
            const len = Math.hypot(dx, dy);
            if (len > 1.5) { const cap = Math.min(len, T.TAC_VEL_MAX_PX); dx = dx / len * cap; dy = dy / len * cap; node.vel = { dx, dy }; }
          }
        }
        node.shape = tacIconShape(head.cls, nd.x, nd.y, node.angle ?? null, scale);
      }
      nodes.push(node);
      for (const id of nd.ids) posOf.set(id, { x: nd.x, y: nd.y, alpha, stack: nd.stack });
      // Strefa kliku / najechania: ikona widoczna (klikalna tylko w pełni widoczna — „nieznany” przepuszcza klik do mapy).
      this._zones.push({ x: nd.x, y: nd.y, ids: nd.ids, clickable: node.members.every((m) => m.vis === 'full'), cluster: cl.id });
    }
    // Mikropaski — gdy jest miejsce: zoom (px_L) i brak sąsiada w obszarze pasków.
    for (const nd of nodes) {
      if (nd.stack || !nd.m?.bars) continue;
      const cl = P.clusters.find((c) => c.id === nd.cluster);
      if (!(cl?.pxL >= T.TAC_BAR_MIN_PXL)) continue;
      const bw = T.TAC_BAR_W, by = nd.y + (nd.shape?.r ?? 5) + 3;
      const room = nodes.every((o) => o === nd || !(Math.abs(o.x - nd.x) < bw / 2 + 5 && o.y > nd.y - 1 && o.y < by + 9));
      if (room) nd.barsAt = { x: nd.x - bw / 2, y: by };
    }
    // Ramki starcia — średni zoom (ikony widoczne): narożniki wokół ikon klastra + „R n”.
    for (const cl of P.clusters) {
      if (cl._glyph || !(cl._alpha > 0.001)) continue;
      const own = nodes.filter((n) => n.cluster === cl.id);
      if (!own.length) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of own) { const r = n.shape?.r ?? 6; x0 = Math.min(x0, n.x - r); y0 = Math.min(y0, n.y - r); x1 = Math.max(x1, n.x + r); y1 = Math.max(y1, n.y + r + (n.barsAt ? 6 : 0)); }
      const pad = T.TAC_FRAME_PAD;
      const fr = { cluster: cl.id, x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad, round: cl.round, alpha: T.TAC_FRAME_ALPHA * cl._alpha };
      frames.push(fr);
      // „R n” nad prawym górnym narożnikiem — przeszkoda etykiet (etykieta zaznaczonego statku nie wchodzi na rundę).
      const fs = THEME.fontSizeSmall ?? 9, fw = this._width(fs, t('combatStrip.round', cl.round));
      this._obstacles.push({ x: fr.x1 - fw - 1, y: fr.y0 - 3 - fs, w: fw + 2, h: fs + 2 });
    }
    // Linie ognia (klastry z ikonami): końce = położenia ikon po układzie; pudło — za cel.
    for (const l of P.lines) {
      const a = posOf.get(l.attacker), b = posOf.get(l.target);
      if (!a || !b) continue;
      if (a.x === b.x && a.y === b.y) continue;   // ten sam mikrostos
      const end = l.hit ? { x: b.x, y: b.y } : tacMissEnd(a, b, T.TAC_FIRE_MISS_PX);
      const m = memberOf.get(l.attacker)?.m;
      lines.push({ key: l.key, x0: a.x, y0: a.y, x1: end.x, y1: end.y, hit: l.hit, kind: l.kind, role: m?.role ?? 'alert',
        alpha: T.TAC_FIRE_ALPHA * (1 - l.age) * Math.min(a.alpha, b.alpha) });
    }
    this._countLines(P.lines.length, P.now);
    // Pasma zasięgu — zaznaczony / najechany (ikony widoczne).
    if (P.bandId) {
      const mo = memberOf.get(P.bandId);
      const cl = mo?.cl;
      if (mo && cl && !cl._glyph && cl._alpha > 0.001 && mo.m.vis === 'full' && !mo.m.killed) {
        const ranges = this._rangesOf(mo.m, cl, K);
        for (const rAU of ranges) {
          const r = tacBandRadiusWU(rAU, { auToWU: proj.worldPerAU ?? AU_TO_WU, blend: cl.blend, law: cl.law, fallbackScale: cl.scale });
          if (!(r > 0)) continue;
          const pts = [];
          const N = Math.max(12, Math.floor(T.TAC_BAND_SEGMENTS));
          for (let i = 0; i <= N; i++) {
            const a = (i / N) * Math.PI * 2;
            const p = proj.point(mo.m.world.x + Math.cos(a) * r, mo.m.world.y, mo.m.world.z + Math.sin(a) * r, OBJECT_NEAR);
            if (p) pts.push(p.x, p.y); else if (pts.length && pts[pts.length - 1] !== null) pts.push(null, null);
          }
          bands.push({ id: P.bandId, rangeAU: rAU, radiusWU: r, pts, alpha: T.TAC_BAND_ALPHA * cl._alpha });
        }
      }
    }
    // Najechanie — linia „nazwa · klasa · HP %” nad ikoną (albo nad sprite'em w kinie).
    let hover = null;
    if (P.hoverId) {
      const mo = memberOf.get(P.hoverId);
      if (mo) {
        const pos = posOf.get(P.hoverId) ?? { x: mo.p.x, y: mo.p.y };
        const text = this._hoverText(mo.m);
        const size = (THEME.fontSizeSmall ?? 9);
        const w = this._width(size, text) + 8, h = size + 6;
        const r = posOf.has(P.hoverId) ? 10 : Math.max(10, (tr.getVesselWorldInfo?.(P.hoverId)?.r ?? 0) * proj.pxPerWorld(mo.p.depth));
        const rect = { x: pos.x - w / 2, y: pos.y - r - 4 - h, w, h };
        hover = { id: P.hoverId, text, rect, role: mo.m.vis === 'full' ? mo.m.role : 'dim', size };
        this._obstacles.push(rect);
      }
    }
    const names = P.ctrl ? this._ctrlNames(P, nodes, memberOf, posOf, mapR, proj, K) : [];
    this._pruneMaps(alive);
    const clusterInfo = P.clusters.map((cl) => ({ id: cl.id, pxL: cl.pxL, alpha: cl._alpha ?? null, glyph: !!cl._glyph, round: cl.round,
      members: cl.members.length, extent: cl._box ? Math.max(cl._box.x1 - cl._box.x0, cl._box.y1 - cl._box.y0) : null }));
    const out = { count: nodes.length + glyphs.length + frames.length + lines.length + bands.length + arrows.length + names.length + (hover ? 1 : 0),
      animating: false, nodes, glyphs, frames, lines, bands, hover, clusterInfo, arrows, names };
    this._last = out;
    return out;
  }

  // Decyzja 46 (1) — CTRL: nazwy uczestników przy ich ikonach (tryb ikon — położenie ikony po układzie, mikrostos — „nazwa +N”) albo
  // przy statku (kino — ikony zgaszone); znak bitwy (daleko) — bez nazw statków. Mgła: widoczny — nazwa, „nieznany” — „?”. Rozkład
  // bez kupy (`tacPlaceNames`): nazwa omija inne nazwy, ikony i przeszkody (znak, linia najechania, strzałki), bez miejsca — pominięta.
  _ctrlNames(P, nodes, memberOf, posOf, mapR, proj, K) {
    const size = 10;
    const items = [], icons = [];
    const nameOf = (m) => (m.vis === 'full' ? String(m.v?.name ?? m.id) : '?');
    for (const n of nodes) {
      const head = n.members[0];
      if (!head) continue;
      const text = n.stack ? `${nameOf(head)} +${n.members.length - 1}` : nameOf(head);
      const r = n.shape?.r ?? 6;
      items.push({ id: head.id, x: n.x, y: n.y, r, w: this._width(size, text) + 2, h: size + 2, text, role: head.vis === 'full' ? head.role : 'dim',
        killed: !n.stack && head.killed === true });
      icons.push({ id: head.id, x: n.x, y: n.y, r: r + 1 });
    }
    // Kino (ikony zgaszone) — przy statkach (rzut sprite'a), promień = połowa modelu na ekranie.
    for (const cl of P.clusters) {
      if (cl._glyph || cl._alpha > 0.001) continue;
      for (const m of cl.members) {
        if (posOf.has(m.id)) continue;
        const mo = memberOf.get(m.id);
        if (!mo) continue;
        const text = nameOf(m);
        const rw = (K.threeRenderer?.getVesselWorldInfo?.(m.id)?.r ?? 0) * proj.pxPerWorld(mo.p.depth);
        const r = Math.max(4, Math.min(40, rw));
        items.push({ id: m.id, x: mo.p.x, y: mo.p.y, r, w: this._width(size, text) + 2, h: size + 2, text, role: m.vis === 'full' ? m.role : 'dim', killed: m.killed === true });
        icons.push({ id: m.id, x: mo.p.x, y: mo.p.y, r });
      }
    }
    if (!items.length) return [];
    const placed = tacPlaceNames(items, { obstacles: this._obstacles, icons, rect: mapR, gap: P.T.TAC_NAME_GAP, lead: P.T.TAC_NAME_LEAD });
    const byId = new Map(items.map((it) => [String(it.id), it]));
    return placed.map((pl) => { const it = byId.get(pl.id); return { ...pl, text: it.text, role: it.role, killed: it.killed, size, ax: it.x, ay: it.y }; });
  }

  // Sprzątanie pamięci klastrów i próbek prędkości statków, których już nie ma.
  _pruneMaps(aliveClusters) {
    for (const id of [...this._glyph.keys()]) if (!aliveClusters.has(id)) this._glyph.delete(id);
    const ids = new Set();
    for (const cl of this._prep.clusters ?? []) for (const m of cl.members) ids.add(m.id);
    for (const id of [...this._vel.keys()]) if (!ids.has(id)) this._vel.delete(id);
  }

  // Linie ognia pokazane w ostatniej sekundzie zegara prezentacji (odczyt `tacticalInfo`).
  _countLines(n, now) {
    const a = this.stats.linesSecond;
    a.push({ t: now, n });
    while (a.length && a[0].t < now - 1000) a.shift();
    this.stats.linesShown = n;
  }

  // Zasięgi broni statku (AU, z mnożnikami technologii jak DSCS — `_resolveWeaponRange`); unikalne.
  _rangesOf(m, cl, K) {
    const dscs = K.deepSpaceCombatSystem;
    const owner = m.own ? 'player' : (cl.encs.find((e) => sideIds(e.sideA).includes(m.id))?.sideA?.ownerEmpireId
      ?? cl.encs.find((e) => sideIds(e.sideB).includes(m.id))?.sideB?.ownerEmpireId ?? null);
    const out = [];
    for (const w of m.st?.weapons ?? []) {
      let r = null;
      try { r = dscs?._resolveWeaponRange?.(w, owner); } catch { r = null; }
      if (!(r > 0)) r = w.rangeAU;
      if (r > 0) out.push(r);
    }
    return tacUniqueRanges(out).slice(0, 3);
  }

  _hoverText(m) {
    if (m.vis !== 'full') return t('combatTac.unknown');
    const hullId = m.v?.hullId ?? m.v?.shipId ?? '';
    const hull = HULLS?.[hullId];
    const cls = hull ? getName(hull, 'ship') : t(`combatTac.class.${m.cls}`);
    const name = m.v?.name ?? String(m.id);
    if (m.killed) return `✕ ${name} · ${cls} · ${t('combatTac.wreck')}`;
    const pct = m.hpStart > 0 ? Math.round((m.hp / m.hpStart) * 100) : 0;
    return `${name} · ${cls} · ${t('combatTac.hp', pct)}`;
  }

  // Szerokość tekstu (px logiczne) — pomiar kanwą warstwy, pamięć; bez kanwy — szacunek z liczby znaków.
  _width(size, text) {
    const k = `${size}|${text}`;
    if (this._measure.has(k)) return this._measure.get(k);
    const ctx = this._hud?.ctx ?? null;
    let w = text.length * size * 0.62;
    if (ctx?.measureText) { ctx.font = `${size}px ${THEME.fontFamily}`; const m = ctx.measureText(text); if (Number.isFinite(m?.width)) w = m.width; }
    if (this._measure.size > 400) this._measure.clear();
    this._measure.set(k, w);
    return w;
  }

  // Znak bitwy: „⚔ 10 : 9” + dwa paski siły + „R n”, wyśrodkowany w (cx, cy); prostokąt (przeszkoda etykiet).
  _glyphLayout(cx, cy, counts, round, ownRole = 'primary', enemyRole = 'alert') {
    const size = (THEME.fontSizeSmall ?? 9) + 1;
    const cnt = (s) => (s.hidden > 0 ? '?' : `${s.alive}`);
    const parts = [
      { text: '⚔ ', role: 'alert' },
      { text: cnt(counts.own), role: ownRole },
      { text: ' : ', role: 'dim' },
      { text: cnt(counts.enemy), role: enemyRole },
      { text: `  ${t('combatStrip.round', round)}`, role: 'primary', alpha: 0.62 },   // runda — tekst drugiego planu (jak pasek walki)
    ];
    let w = 0;
    for (const p of parts) { p.w = this._width(size, p.text); w += p.w; }
    const T = this._prep.T;
    const barW = T.TAC_GLYPH_BAR_W, padX = 5, padY = 3;
    const W = Math.max(w, barW * 2 + 6) + padX * 2, H = size + 2 * padY + 5;
    const rect = { x: cx - W / 2, y: cy - H / 2, w: W, h: H };
    return { rect, parts, size, padX, padY, barW, own: { pct: counts.own.pct, hidden: counts.own.hidden > 0, role: ownRole },
      enemy: { pct: counts.enemy.pct, hidden: counts.enemy.hidden > 0, role: enemyRole } };
  }

  /** Przeszkody etykiet (anti-overlap): znaki bitew i linia najechania z tej klatki. */
  labelObstacles() { return this._obstacles; }

  draw(ctx, F, c) {
    const R = F.roles, T = this._prep.T ?? tacTuning(null);
    const role = (r) => R[r] ?? R.primary;
    ctx.save();
    ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    // Pasma zasięgu (pod spodem) — rola `dim`, kreski.
    ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.strokeStyle = R.dim;
    for (const b of c.bands ?? []) {
      ctx.globalAlpha = b.alpha;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < b.pts.length; i += 2) {
        const x = b.pts[i], y = b.pts[i + 1];
        if (x == null) { pen = false; continue; }
        if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Ramki starcia — narożniki (rola `dim`) + „R n”.
    for (const f of c.frames ?? []) {
      const a = T.TAC_FRAME_ARM;
      ctx.globalAlpha = f.alpha; ctx.strokeStyle = R.dim; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(f.x0, f.y0 + a); ctx.lineTo(f.x0, f.y0); ctx.lineTo(f.x0 + a, f.y0);
      ctx.moveTo(f.x1 - a, f.y0); ctx.lineTo(f.x1, f.y0); ctx.lineTo(f.x1, f.y0 + a);
      ctx.moveTo(f.x1, f.y1 - a); ctx.lineTo(f.x1, f.y1); ctx.lineTo(f.x1 - a, f.y1);
      ctx.moveTo(f.x0 + a, f.y1); ctx.lineTo(f.x0, f.y1); ctx.lineTo(f.x0, f.y1 - a);
      ctx.stroke();
      const size = THEME.fontSizeSmall ?? 9;
      // „R n” — tekst drugiego planu w roli `primary` (jak runda w pasku walki); narożniki zostają w roli `dim`.
      ctx.globalAlpha = Math.min(1, f.alpha / Math.max(1e-6, T.TAC_FRAME_ALPHA)) * 0.62;
      ctx.font = `${size}px ${THEME.fontFamily}`; ctx.fillStyle = R.primary; ctx.textBaseline = 'bottom'; ctx.textAlign = 'right';
      ctx.fillText(t('combatStrip.round', f.round), f.x1, f.y0 - 2);
    }
    // Linie ognia — rola strzelca, styl wg broni.
    for (const l of c.lines ?? []) {
      const st = tacFireStyle(l.kind);
      ctx.setLineDash(st.dash); ctx.lineWidth = st.width; ctx.strokeStyle = role(l.role); ctx.globalAlpha = l.alpha;
      ctx.beginPath(); ctx.moveTo(l.x0, l.y0); ctx.lineTo(l.x1, l.y1); ctx.stroke();
    }
    ctx.setLineDash([]);
    // Ikony — wraki pod żywymi; sylwetka: obrys w roli, wypełnienie słabe (holo); stos — romb + „×N”.
    const nodes = [...(c.nodes ?? [])].sort((a, b) => (a.m?.killed ? 0 : 1) - (b.m?.killed ? 0 : 1));
    for (const n of nodes) {
      if (n.stack) { this._drawStack(ctx, n, R, T); continue; }
      const m = n.m, sh = n.shape;
      if (!m || !sh) continue;
      const col = role(m.role);
      const a = n.alpha * (m.killed ? T.TAC_WRECK_ALPHA : T.TAC_ICON_ALPHA);
      ctx.globalAlpha = a * (m.vis === 'full' ? 0.22 : 0.1); ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(sh.pts[0], sh.pts[1]);
      for (let i = 2; i < sh.pts.length; i += 2) ctx.lineTo(sh.pts[i], sh.pts[i + 1]);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = m.selected ? 1.6 : 1;
      if (m.vis !== 'full') ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (m.killed) {   // wrak — przekreślenie
        ctx.beginPath(); ctx.moveTo(n.x - sh.r, n.y + sh.r * 0.7); ctx.lineTo(n.x + sh.r, n.y - sh.r * 0.7); ctx.stroke();
        continue;
      }
      if (m.vis !== 'full') {   // nieznany — „?”
        const size = THEME.fontSizeSmall ?? 9;
        ctx.font = `${size}px ${THEME.fontFamily}`; ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', n.x, n.y + 0.5);
        continue;
      }
      if (sh.nose && Number.isFinite(n.angle)) {   // znacznik kursu — krótka kreska przed nosem
        const ux = Math.cos(n.angle), uy = Math.sin(n.angle);
        ctx.beginPath(); ctx.moveTo(sh.nose.x + ux * 1.5, sh.nose.y + uy * 1.5); ctx.lineTo(sh.nose.x + ux * 4.5, sh.nose.y + uy * 4.5); ctx.stroke();
      }
      if (n.vel) {   // wektor prędkości — cienki, przygaszony
        ctx.globalAlpha = a * 0.6; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(n.x + n.vel.dx, n.y + n.vel.dy); ctx.stroke();
      }
      if (n.barsAt && m.bars) {   // mikropaski: HP (rola strony), osłona (rola `foreign`), tor `dim`
        const bw = T.TAC_BAR_W, bh = T.TAC_BAR_H, x = n.barsAt.x, y = n.barsAt.y;
        ctx.globalAlpha = 0.35 * n.alpha; ctx.fillStyle = R.dim; ctx.fillRect(x, y, bw, bh);
        ctx.globalAlpha = n.alpha; ctx.fillStyle = col; ctx.fillRect(x, y, Math.round(bw * m.bars.hp), bh);
        if (m.bars.shield != null) {
          ctx.globalAlpha = 0.35 * n.alpha; ctx.fillStyle = R.dim; ctx.fillRect(x, y + bh + 1, bw, 1);
          ctx.globalAlpha = 0.78 * n.alpha; ctx.fillStyle = R.foreign ?? col; ctx.fillRect(x, y + bh + 1, Math.round(bw * m.bars.shield), 1);
        }
      }
    }
    // Znaki bitew (daleko) — ciemny pasek, „⚔ 10 : 9  R n”, paski siły stron.
    for (const g of c.glyphs ?? []) {
      const r = g.rect;
      ctx.globalAlpha = 0.6 * g.alpha; ctx.fillStyle = THEME.bgPrimary ?? '#000';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.font = `${g.size}px ${THEME.fontFamily}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      let x = r.x + g.padX;
      for (const p of g.parts) { ctx.globalAlpha = g.alpha * (p.alpha ?? 1); ctx.fillStyle = role(p.role); ctx.fillText(p.text, x, r.y + g.padY); x += p.w; }
      const by = r.y + g.padY + g.size + 2, bw = g.barW;
      const bar = (bx, s) => {
        ctx.globalAlpha = 0.35 * g.alpha; ctx.fillStyle = R.dim; ctx.fillRect(bx, by, bw, 2);
        if (s.hidden) return;
        ctx.globalAlpha = g.alpha; ctx.fillStyle = role(s.role); ctx.fillRect(bx, by, Math.round(bw * s.pct), 2);
      };
      const mid = r.x + r.w / 2;
      bar(mid - 3 - bw, g.own); bar(mid + 3, g.enemy);
    }
    // Decyzja 46 (3) — strzałka bitwy poza kadrem: trójkąt ku krawędzi (idiom strzałek etykiet) + „⚔”.
    const DIRS = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
    for (const a of c.arrows ?? []) {
      const [dx, dy] = DIRS[a.edge] ?? [1, 0];
      const sz = 6;
      ctx.globalAlpha = 0.9; ctx.fillStyle = role(a.role);
      ctx.beginPath();
      ctx.moveTo(a.x + dx * sz, a.y + dy * sz);
      ctx.lineTo(a.x - dx * sz + dy * sz, a.y - dy * sz + dx * sz);
      ctx.lineTo(a.x - dx * sz - dy * sz, a.y - dy * sz - dx * sz);
      ctx.closePath(); ctx.fill();
      ctx.font = `${THEME.fontSizeSmall ?? 9}px ${THEME.fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⚔', a.x - dx * (sz + 9), a.y - dy * (sz + 9) + 0.5);
    }
    // Decyzja 46 (1) — CTRL: nazwy przy ikonach (cień w kolorze tła motywu, jak etykiety CTRL); wrak przygaszony; nazwa z drugiego
    // pierścienia — cienka nitka od ikony do najbliższego punktu nazwy.
    for (const nm of c.names ?? []) {
      if (nm.lead && Number.isFinite(nm.ax)) {
        const nx = Math.max(nm.x, Math.min(nm.ax, nm.x + nm.w)), ny = Math.max(nm.y, Math.min(nm.ay, nm.y + nm.h));
        ctx.globalAlpha = 0.35; ctx.strokeStyle = role(nm.role); ctx.lineWidth = 1; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(nm.ax, nm.ay); ctx.lineTo(nx, ny); ctx.stroke();
      }
      ctx.font = `${nm.size}px ${THEME.fontFamily}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const ty = nm.y + nm.h / 2;
      ctx.globalAlpha = 0.55; ctx.fillStyle = THEME.bgPrimary ?? '#000'; ctx.fillText(nm.text, nm.x + 2, ty + 1);
      ctx.globalAlpha = nm.killed ? 0.5 : 0.92; ctx.fillStyle = role(nm.role); ctx.fillText(nm.text, nm.x + 1, ty);
    }
    // Najechanie — linia nad ikoną.
    const h = c.hover;
    if (h) {
      ctx.globalAlpha = 0.78; ctx.fillStyle = THEME.bgPrimary ?? '#000'; ctx.fillRect(h.rect.x, h.rect.y, h.rect.w, h.rect.h);
      ctx.globalAlpha = 1; ctx.fillStyle = role(h.role); ctx.font = `${h.size}px ${THEME.fontFamily}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(h.text, h.rect.x + h.rect.w / 2, h.rect.y + h.rect.h / 2 + 0.5);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  _drawStack(ctx, n, R, T) {
    const roles = Object.entries(n.roles ?? {}).filter(([k]) => k !== '-');
    const mixed = roles.length > 1;
    const col = R[n.role] ?? R.primary;
    const r = 5.5 * Math.max(0.25, T.TAC_ICON_SCALE);
    ctx.globalAlpha = n.alpha * T.TAC_ICON_ALPHA; ctx.strokeStyle = mixed ? R.dim : col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(n.x, n.y - r); ctx.lineTo(n.x + r, n.y); ctx.lineTo(n.x, n.y + r); ctx.lineTo(n.x - r, n.y); ctx.closePath(); ctx.stroke();
    const size = THEME.fontSizeSmall ?? 9;
    ctx.font = `${size}px ${THEME.fontFamily}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    if (!mixed) { ctx.fillStyle = col; ctx.fillText(`×${n.ids.length}`, n.x + r + 2, n.y + 0.5); return; }
    let x = n.x + r + 2;
    roles.sort((a, b) => (a[0] === 'primary' ? -1 : b[0] === 'primary' ? 1 : 0));
    roles.forEach(([k, v], i) => {
      const s = (i ? ':' : '') + v;
      ctx.fillStyle = R[k] ?? col; ctx.fillText(s, x, n.y + 0.5); x += this._width(size, s);
    });
  }

  /** Klik w ikonę (px logiczne): statek, który gracz WIDZI w tym miejscu (strefa niesie jego id), przez regułę kliku (D-UI-5). */
  handleClick(x, y) {
    const P = this._prep;
    if (!P?.on) return false;
    // Decyzja 46 (2) — klik w znak bitwy = „Obserwuj” tej bitwy (ten sam ładunek co przycisk paska walki).
    const gz = this.glyphZoneAt(x, y);
    if (gz) { EventBus.emit('camera:watchBattle', { ...gz.payload }); return true; }
    const z = tacHitAt(this._zones, x, y, (P.T ?? tacTuning(null)).TAC_HIT_PX);
    if (!z || !z.clickable) return false;
    const K = (typeof window !== 'undefined') ? window.KOSMOS : null;
    const vm = K?.vesselManager;
    const target = this.clickTargetFor(z, (id) => vm?.getVessel?.(id) ?? null);
    if (!target) return false;
    clickObject(target, { K, emit: (n, p) => EventBus.emit(n, p) });
    return true;
  }

  /** Decyzja 46 (2) — znak bitwy pod punktem (px logiczne) z ostatniej klatki: `{ cluster, rect, payload }` albo null. */
  glyphZoneAt(x, y) {
    for (const z of this._glyphZones ?? []) {
      const r = z.rect;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return z;
    }
    return null;
  }

  /** Cel reguły kliku dla strefy ikony: własny statek / własny mikrostos / wróg (pierwszy w stosie). */
  clickTargetFor(z, getVessel) {
    const vs = (z?.ids ?? []).map((id) => getVessel(id)).filter(Boolean);
    if (!vs.length) return null;
    const own = vs.filter((v) => !isEnemyVessel(v));
    if (own.length === vs.length) {
      return own.length === 1 ? vesselTarget(own[0].id, own[0]) : vesselsTarget(own.map((v) => v.id), own[0].systemId ?? null);
    }
    const foe = vs.find((v) => isEnemyVessel(v));
    return enemyTarget(foe.id, foe);
  }

  /** Czy punkt (px logiczne) leży pod ikoną / znakiem bitwy / linią najechania z ostatniej klatki (dymek pustej mapy). */
  coversUiPoint(lx, ly) {
    if (!this._prep?.on) return false;
    if (tacHitAt(this._zones, lx, ly, (this._prep.T ?? tacTuning(null)).TAC_HIT_PX)) return true;
    return this._obstacles.some((r) => lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h);
  }

  /** Odczyt dla bramki (`KOSMOS.debug.tacticalInfo()`): per klaster stopień zoomu, ikony, tryb znaku, linie ognia, mgła. */
  debug() {
    const P = this._prep, L = this._last;
    const r1 = (v) => (Number.isFinite(v) ? +v.toFixed(1) : v);
    const sec = this.stats.linesSecond.reduce((a, s) => a + s.n, 0);
    return {
      id: 'combat', on: !!P.on,
      clusters: (L.clusterInfo ?? []).map((cl) => ({
        id: cl.id, pxL: r1(cl.pxL), iconAlpha: r1(cl.alpha), glyph: cl.glyph, extentPx: r1(cl.extent),
        zoom: cl.glyph ? 'glyph' : (cl.alpha ?? 1) <= 0.001 ? 'cinema' : (cl.alpha ?? 1) < 1 ? 'handover' : 'icons',
        members: cl.members, round: cl.round,
        icons: (L.nodes ?? []).filter((n) => n.cluster === cl.id).length,
        stacks: (L.nodes ?? []).filter((n) => n.cluster === cl.id && n.stack).length,
        glyphText: (L.glyphs ?? []).filter((g) => g.cluster === cl.id).map((g) => g.parts.map((p) => p.text).join('').trim())[0] ?? null,
      })),
      nodes: (L.nodes ?? []).slice(0, 40).map((n) => ({ ids: n.ids, x: r1(n.x), y: r1(n.y), stack: n.stack, cls: n.m?.cls ?? null,
        role: n.role, wreck: !!n.m?.killed, bars: !!n.barsAt, alpha: r1(n.alpha) })),
      linesNow: (L.lines ?? []).length, linesLastSecond: sec, fogHidden: this.stats.fogHidden,
      minSeparation: r1(tacMinSeparation(L.nodes ?? [])), bands: (L.bands ?? []).map((b) => ({ id: b.id, rangeAU: b.rangeAU, radiusWU: +b.radiusWU.toFixed(4) })),
      hover: L.hover ? { id: L.hover.id, text: L.hover.text } : null,
      glyphWatch: (this._glyphZones ?? []).map((z) => ({ cluster: z.cluster, encounterId: z.payload?.encounterId ?? null })),
      arrows: (L.arrows ?? []).map((a) => ({ cluster: a.cluster, edge: a.edge, x: r1(a.x), y: r1(a.y) })),
      names: (L.names ?? []).map((n) => ({ id: n.id, text: n.text, side: n.side, lead: !!n.lead })),
    };
  }
}
