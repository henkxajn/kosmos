// OrbitalReplayLogic — REŻYSER POWTÓRKI BITWY ORBITALNEJ (ARC COMBAT VISUALS, krok CV-8a; plan §2.8, D-CV-25, D-CV-26, D-CV-27,
// Findingi 628, 632, 635; na stałe od CV-Z).
//
// ⚠ Importy wyłącznie z czystego `CombatLedgerLogic` (ziarno, generator) — wykonuje się pod node (keeper `cv_orbital_logic_smoke`
// — wykonaniem, nie lekturą). Bez THREE, bez `window`, bez losowania gry (reguła CV-0b): wszystko z ziarna = skrót `battleId`.
//
// Po co. Bitwa orbitalna (`EnemyAttackHandler` → `BattleSystem.resolveBattle`) rozstrzyga się w JEDNEJ chwili, na zagregowanych
// stronach: oś czasu tur ma tylko sumy HP / osłony / obrażeń strony — bez strzelców, celów i statków. Dziś gracz widział 16 kresek
// „imitacji” wokół planety (Finding 628 — także w innym układzie) i kino `BattleView3D`. Tu z tej osi powstaje POWTÓRKA w kształcie
// zdarzeń rejestru salw CV-4a (`combat:roundFx`: attacker, target, category, hit, dmg, blockedByShield, hpAfter, shieldAfter, killed,
// weapon, side) — ten sam rejestr, silnik FX, osłony, uszkodzenia, warstwa taktyczna, pasek walki i reżyser rysują ją jak bitwę
// w wolnej przestrzeni. Wynik logiki NIE zależy od powtórki (powtórka czyta, logika pisze — §2.1).
//
// M1 (decyzja 34) — pogodzenie z osią czasu bez limitu tur (plan §2.8 sprzed M1 zakładał ≤ 30 tur scalanych do ≤ 8 rund):
//   · liczba rund prezentacji N = klamra( max(T, BASE + PER_SHIP · statki), MIN, MAX ) — T = liczba tur logiki (2…200), statki =
//     napastnicy + okręty gracza (także w hangarach). 10 na 10 → 36 rund ≈ 41 s przy 1150 ms (jak bitwa 10 na 10 w wolnej
//     przestrzeni, 31–44 rund po M1), 2 na 2 → 14, rajder na obronę żetonową → 12 (≈ 14 s); T > N — kolejne tury scalane po równo
//     (bezpiecznik 200 tur → 36 rund), T < N — każda tura rozłożona na kolejne rundy (obrażenia dzielone po równo);
//   · kto ginie — REGUŁA EAH (`_resolveBatchedBattle`): wygrywa A (także odwrót B) — giną WSZYSTKIE okręty gracza w służbie
//     w układzie, wygrywa B (także odwrót A) — giną wszyscy napastnicy, remis przez wzajemne zniszczenie — obie strony, PAT
//     (`endReason` `no_damage_possible` / `safety_cap`) — nikt (napastnicy zostają na orbicie, bez wraków). Odwrót przy 20 % HP
//     i tak kończy się wrakami (EAH, Finding 632) — powtórka dobija stronę przegraną do zera (nadwyżka prezentacji w `stats.excess`);
//   · obrażenia tury i strony rozłożone CAŁE na trafienia (suma kadłuba + osłony = budżet rundy; keeper), kadłub skazanych
//     ogniem skupionym (kolejne zniszczenia w trakcie bitwy, ostatnie w ostatniej rundzie), ocaleni nie schodzą poniżej podłogi.
// Obrona planetarna (D-CV-26): `defense_tower` / `defense_grid` to w kodzie WYŁĄCZNIE pula HP + obrażenia + pancerz jednostki
//   obrońcy (`WarSystem._buildPlayerBattleUnit`: wieża 40 HP / 5 obrażeń / 1 pancerza na poziom, siatka 100 / 10 / 2) — NIE tarcza
//   planetarna (osłona strony B pochodzi tylko z modułów okrętów). Powtórka: wieża — działa kinetyczne (flak) na powierzchni,
//   siatka — ciężkie lasery; jedna pula HP obrony (cel `…:def`), emitery na półkuli zwróconej ku napastnikom; okręty
//   w hangarach (bez sprite'a) strzelają z emiterów hangarowych — żadnych udawanych statków.
//
// Jednostki: HP / osłona — punkty BattleSystem; rundy — liczby całkowite od 1; kąty — radiany; długości formacji — j. świata
// (L = długość fregaty, podana przez wołającego).

import { ledgerHash, ledgerRng } from './CombatLedgerLogic.js';

/** Pokrętła powtórki i sceny planety — na żywo (`KOSMOS.threeRenderer.cvTuning.ORB_*`). */
export const ORB_TUNING = {
  ORB_ROUNDS_MIN:        12,     // [rund] najkrótsza powtórka (≈ 14 s przy 1150 ms)
  ORB_ROUNDS_MAX:        36,     // [rund] najdłuższa (≈ 41 s — jak 10 na 10 w wolnej przestrzeni)
  ORB_ROUNDS_BASE:       8,      // [rund] podstawa długości z liczby statków
  ORB_ROUNDS_PER_SHIP:   1.4,    // [rund / statek] przyrost długości z liczby statków (2 na 2 → 14, 10 na 10 → 36)
  ORB_SURVIVOR_FLOOR:    0.12,   // [× HP startu] ocalały okręt nie schodzi niżej w powtórce
  ORB_HIT_P:             0.7,    // [0–1] szansa trafienia strzału ponad trafienia wymagane budżetem rundy
  // Kadencja broni w rundach (jak DSCS: przeładowanie `fireCooldownYears` / krok rundy 0,3 roku — laser co rundę, kinetyk co 2,
  // rakieta co 4); faza z ziarna strzelca i broni. Runda z obrażeniami bez strzału z kadencji — strzelają wszystkie bronie.
  ORB_CADENCE_SHORT:     1,
  ORB_CADENCE_MEDIUM:    2,
  ORB_CADENCE_LONG:      4,
  ORB_FOCUS_SPLIT:       0.25,   // [0–1] część kadłuba rundy ocalałych rozrzucona na drugi cel (reszta — cel główny rundy)
  ORB_TOWER_EMITTERS:    3,      // [szt.] najwięcej emiterów wież (poziomy rozdzielone po równo)
  ORB_GRID_EMITTERS:     3,      // [szt.] najwięcej emiterów siatki
  ORB_HANGAR_EMITTERS:   4,      // [szt.] najwięcej emiterów hangarowych (okręty zadokowane strzelają z nich po kolei)
  // ── scena planety (formacja) ──
  ORB_SHELL_GAP_L:       2.5,    // [L] obrońcy: rysowany promień ciała + to (podłoga skorupy D-CV-4 = 2 L)
  ORB_ARC_GAP_L:         8,      // [L] napastnicy: skorupa obrońców + to (pasmo kinetyczne sceny)
  ORB_SPACING_L:         2.2,    // [L] odstęp sąsiadów na łuku (× rozsunięcie sceny)
  ORB_ROW_GAP_L:         3,      // [L] kolejny rząd łuku (gdy rząd przekroczy ORB_ARC_MAX_DEG)
  ORB_ARC_MAX_DEG:       140,    // [°] najszerszy łuk jednego rzędu
  ORB_VERT_L:            0.6,    // [L] rozrzut pionowy formacji (z ziarna)
  ORB_BEARING_JITTER_DEG: 35,    // [°] kierunek bitwy: ku gwieździe (strona dzienna) ± to z ziarna
  ORB_BATTERY_CONE_DEG:  55,     // [°] emitery na półkuli: stożek wokół kierunku bitwy
  ORB_LEAD_MS:           700,    // [ms prezentacji] wejście w formację przed pierwszą rundą
  ORB_TAIL_ROUNDS:       3,      // [R] po ostatniej rundzie — najwyżej tyle czekania na ostatnie trafienia rejestru
  ORB_RESULT_LINGER_MS:  10000,  // [ms prezentacji] ARC CV-8b (§3.1-6) — wiersz WYNIKU bitwy na pasku walki po końcu powtórki (pauza = pauza)
};

/**
 * ARC CV-8b (§3.1-6, D-CV-27 (a)) — wynik bitwy orbitalnej z perspektywy gracza dla wiersza paska walki po powtórce. EAH: strona A =
 * napastnicy, B = gracz. Pat (strażnik M1 / bezpiecznik — `endReason`) — 'stalemate'; remis przez wzajemne zniszczenie — 'draw'.
 * @returns {'victory'|'defeat'|'draw'|'stalemate'}
 */
export function orbitalOutcome(result, { playerSide = 'B' } = {}) {
  const er = result?.endReason ?? null;
  if (er === 'no_damage_possible' || er === 'safety_cap') return 'stalemate';
  const w = result?.winner;
  if (w === playerSide) return 'victory';
  if (w === 'A' || w === 'B') return 'defeat';
  return 'draw';
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const EPS = 1e-9;

/** Kategoria modułu (`short` / `medium` / `long`) — wieża i siatka nie mają modułu. */
export const ORB_DEFENCE_WEAPONS = Object.freeze({
  tower: Object.freeze({ category: 'medium', perLevel: 5 }),   // działa kinetyczne (flak)
  grid:  Object.freeze({ category: 'short',  perLevel: 10 }),  // ciężkie lasery
  token: Object.freeze({ category: 'medium', perLevel: 2 }),   // improwizowane działka obrony żetonowej (30 HP / 2 obrażeń)
});

/** Ziarno powtórki z identyfikatora bitwy (ta sama bitwa = ta sama powtórka). */
export function orbitalSeed(battleId) {
  return ledgerHash('cv8a-orbital', String(battleId ?? ''));
}

/** Id starcia powtórki (rejestr salw, pasek walki, reżyser) — rozłączne z id starć DSCS (`enc_…`). */
export function orbitalEncounterId(battleId) {
  return `orb:${battleId}`;
}

/**
 * Liczba rund prezentacji (M1 — patrz nagłówek).
 * @param {{ turns:number, ships:number, tuning?:object }} p
 */
export function orbitalRoundCount({ turns = 0, ships = 0, tuning = ORB_TUNING } = {}) {
  const T = tuning;
  const floor = Math.round(num(T.ORB_ROUNDS_BASE, 8) + num(T.ORB_ROUNDS_PER_SHIP, 1.4) * Math.max(0, num(ships)));
  const lo = Math.max(1, Math.round(num(T.ORB_ROUNDS_MIN, 12)));
  const hi = Math.max(lo, Math.round(num(T.ORB_ROUNDS_MAX, 36)));
  return clamp(Math.max(Math.max(0, Math.floor(num(turns))), floor), lo, hi);
}

/**
 * Mapa tur logiki na rundy prezentacji: dla rundy k (0…N−1) lista `{ t, w }` — tura (1…T) z wagą obrażeń. T ≥ N — kolejne tury
 * scalane w ciągłe grupy (każda z wagą 1); T < N — tura rozłożona na kolejne rundy (waga 1 / liczba jej rund); T = 0 — puste.
 */
export function orbitalTurnMap(T, N) {
  const out = Array.from({ length: Math.max(0, N) }, () => []);
  if (!(T > 0) || !(N > 0)) return out;
  if (T >= N) {
    for (let k = 0; k < N; k++) {
      const a = Math.floor((k * T) / N), b = Math.floor(((k + 1) * T) / N);
      for (let t = a; t < b; t++) out[k].push({ t: t + 1, w: 1 });
    }
    return out;
  }
  const cnt = new Array(T).fill(0);
  const tOf = new Array(N);
  for (let k = 0; k < N; k++) { tOf[k] = Math.min(T - 1, Math.floor((k * T) / N)); cnt[tOf[k]]++; }
  for (let k = 0; k < N; k++) out[k].push({ t: tOf[k] + 1, w: 1 / cnt[tOf[k]] });
  return out;
}

/** Strona przegrana wg reguły EAH: `{ A, B }` — czy wszystkie okręty strony giną. */
export function orbitalDoomed(result) {
  const stalemate = result?.endReason === 'no_damage_possible' || result?.endReason === 'safety_cap';
  if (stalemate) return { A: false, B: false, stalemate: true };
  const w = result?.winner;
  return { A: w === 'B' || w === 'draw', B: w === 'A' || w === 'draw', stalemate: false };
}

/**
 * Emitery obrony na powierzchni planety (D-CV-26): wieże, siatka, obrona żetonowa, hangary. Kierunki — `orbitalEmitterDirs`.
 * @param {{ prefix:string, defence?:{tower?:number, grid?:number, token?:boolean}, hangarIds?:string[], tuning?:object }} p
 * @returns {Array<{ id:string, kind:'tower'|'grid'|'token'|'hangar', weapons:Array<{category:string, damage:number, moduleId:null}> }>}
 */
export function orbitalEmitters({ prefix, defence = {}, hangarIds = [], tuning = ORB_TUNING } = {}) {
  const T = tuning;
  const out = [];
  const add = (kind, levels, maxN) => {
    const lv = Math.max(0, Math.floor(num(levels)));
    if (!lv) return;
    const n = Math.max(1, Math.min(lv, Math.max(1, Math.floor(num(maxN, 3)))));
    const spec = ORB_DEFENCE_WEAPONS[kind];
    for (let i = 0; i < n; i++) {
      const share = Math.floor(lv / n) + (i < lv % n ? 1 : 0);   // poziomy rozdzielone po równo
      out.push({ id: `${prefix}e${out.length}`, kind, weapons: [{ category: spec.category, damage: spec.perLevel * share, moduleId: null }] });
    }
  };
  add('tower', defence.tower, T.ORB_TOWER_EMITTERS);
  add('grid', defence.grid, T.ORB_GRID_EMITTERS);
  if (defence.token && !out.length) out.push({ id: `${prefix}e${out.length}`, kind: 'token', weapons: [{ category: ORB_DEFENCE_WEAPONS.token.category, damage: ORB_DEFENCE_WEAPONS.token.perLevel, moduleId: null }] });
  const nh = Math.min(hangarIds.length, Math.max(1, Math.floor(num(T.ORB_HANGAR_EMITTERS, 4))));
  for (let i = 0; i < nh; i++) out.push({ id: `${prefix}e${out.length}`, kind: 'hangar', weapons: [] });
  return out;
}

/** Emiter hangarowy okrętu zadokowanego o indeksie `i` (po kolei przez emitery hangarowe). */
export function hangarEmitterOf(emitters, i) {
  const hs = emitters.filter((e) => e.kind === 'hangar');
  return hs.length ? hs[i % hs.length].id : null;
}

/**
 * Powtórka bitwy orbitalnej.
 * @param {{ battleId:string, result:object, attackers:object[], defenders:object[], defence?:object, sideHp?:{A?:number, B?:number},
 *           tuning?:object }} p
 *   attackers / defenders — okręty `{ id, hpStart, shieldStart?, shieldRegen?, weapons:[{category, damage, moduleId}], hangar?:boolean }`
 *     (defenders = okręty gracza w służbie w układzie — `fx.defenderIds`; `hangar` — zadokowany, bez sprite'a);
 *   defence — `{ tower, grid, token, poolHp }` (pula HP obrony = 40·wieża + 100·siatka albo 30 dla obrony żetonowej);
 *   sideHp — HP startu stron w BattleSystem (domyślnie suma okrętów + pula — ta sama formuła co `playerVesselsToBattleUnit`).
 */
export function buildOrbitalReplay({ battleId, result, attackers = [], defenders = [], defence = {}, sideHp = null, tuning = ORB_TUNING } = {}) {
  const T = tuning;
  const seed = orbitalSeed(battleId);
  const encounterId = orbitalEncounterId(battleId);
  const prefix = `${encounterId}:`;
  const poolId = `${prefix}def`;
  const timeline = Array.isArray(result?.timeline) ? result.timeline : [];
  const turns = timeline.length;
  const doomed = orbitalDoomed(result);
  const hangarIds = defenders.filter((d) => d.hangar).map((d) => String(d.id));
  const emitters = orbitalEmitters({ prefix, defence, hangarIds, tuning: T });
  const emitterOf = new Map();
  hangarIds.forEach((id, i) => emitterOf.set(id, hangarEmitterOf(emitters, i)));
  const poolHp = Math.max(0, num(defence.poolHp));

  // Członkowie (cele i strzelcy): okręty obu stron + pula obrony.
  const members = new Map();
  const mk = (s, side, kind) => ({
    id: String(s.id), side, kind, hpStart: Math.max(1, num(s.hpStart, 50)), shieldStart: Math.max(0, num(s.shieldStart)),
    shieldRegen: Math.max(0, num(s.shieldRegen)), weapons: (s.weapons ?? []).filter((w) => num(w?.damage) > 0),
    emitter: emitterOf.get(String(s.id)) ?? null,
  });
  for (const a of attackers) members.set(String(a.id), mk(a, 'A', 'ship'));
  for (const d of defenders) members.set(String(d.id), mk(d, 'B', d.hangar ? 'hangar' : 'ship'));
  if (poolHp > 0) members.set(poolId, { id: poolId, side: 'B', kind: 'pool', hpStart: poolHp, shieldStart: 0, shieldRegen: 0, weapons: [], emitter: null });
  const sideMembers = (side) => [...members.values()].filter((m) => m.side === side);
  const sideStart = {
    A: num(sideHp?.A, sideMembers('A').reduce((s, m) => s + m.hpStart, 0)),
    B: num(sideHp?.B, sideMembers('B').reduce((s, m) => s + m.hpStart, 0)),
  };
  const ships = attackers.length + defenders.length;
  const N = turns > 0 || doomed.stalemate || ships > 0 ? orbitalRoundCount({ turns, ships, tuning: T }) : 0;
  const map = orbitalTurnMap(turns, N);

  // Obrażenia tury strony: kadłub = spadek HP (oś tur), osłona = obrażenia − kadłub.
  const turnLoss = (side) => {
    const out = [];
    let prev = sideStart[side];
    for (const r of timeline) {
      const hp = num(side === 'A' ? r.aHP : r.bHP, prev);
      const dmg = Math.max(0, num(side === 'A' ? r.dmgA : r.dmgB));
      const hull = Math.max(0, prev - hp);
      out.push({ hull, shield: Math.max(0, dmg - hull) });
      prev = hp;
    }
    return out;
  };
  const loss = { A: turnLoss('A'), B: turnLoss('B') };
  const budgetOf = (side, k) => {
    let hull = 0, shield = 0;
    for (const { t, w } of map[k] ?? []) { const L = loss[side][t - 1]; if (L) { hull += L.hull * w; shield += L.shield * w; } }
    return { hull, shield };
  };
  const turnsIn = (k) => (map[k] ?? []).reduce((s, x) => s + x.w, 0);

  // Stan bieżący
  const hp = new Map(), sh = new Map(), alive = new Map();
  for (const m of members.values()) { hp.set(m.id, m.hpStart); sh.set(m.id, m.shieldStart); alive.set(m.id, true); }
  const rng = ledgerRng(seed);
  const order = (list) => {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  };
  // Kolejka ognia skupionego na skazanych (z ziarna) — zniszczenia po kolei w trakcie bitwy.
  const focusQueue = {
    A: doomed.A ? order(sideMembers('A').filter((m) => m.kind !== 'pool').map((m) => m.id)) : [],
    B: doomed.B ? order(sideMembers('B').filter((m) => m.kind !== 'pool').map((m) => m.id)) : [],
  };
  const remainingHull = { A: [], B: [] };
  for (const side of ['A', 'B']) {
    let acc = 0;
    for (let k = N - 1; k >= 0; k--) { acc += budgetOf(side, k).hull; remainingHull[side][k] = acc; }
  }

  const kills = {};
  const stats = { excess: { A: 0, B: 0 }, dropped: { A: 0, B: 0 }, shieldDropped: { A: 0, B: 0 }, hullLogical: { A: 0, B: 0 }, shieldLogical: { A: 0, B: 0 } };
  const rounds = [];

  for (let k = 0; k < N; k++) {
    const round = k + 1;
    const last = k === N - 1;
    const aliveAtStart = new Set([...alive].filter(([, a]) => a).map(([id]) => id));
    // Strzelcy strony (żywi na początku rundy): okręty z bronią + emitery obrony (dopóki pula obrony żyje).
    const shotsOf = (side, cadence = true) => {
      const list = [];
      const due = (id, wi, w) => {
        if (!cadence) return true;
        const c = Math.max(1, Math.round(num(w.category === 'short' ? T.ORB_CADENCE_SHORT : w.category === 'long' ? T.ORB_CADENCE_LONG : T.ORB_CADENCE_MEDIUM, 1)));
        return c <= 1 || (round + (ledgerHash(seed, id, wi) % c)) % c === 0;
      };
      for (const m of members.values()) {
        if (m.side !== side || m.kind === 'pool' || !aliveAtStart.has(m.id)) continue;
        m.weapons.forEach((w, wi) => { if (due(m.id, wi, w)) list.push({ attacker: m.id, w }); });
      }
      if (side === 'B' && aliveAtStart.has(poolId)) {
        for (const e of emitters) e.weapons.forEach((w, wi) => { if (due(e.id, wi, w)) list.push({ attacker: e.id, w }); });
      }
      return list;
    };
    const events = [];
    const budget = {};
    for (const [X, Y] of [['A', 'B'], ['B', 'A']]) {
      const b = budgetOf(Y, k);
      stats.hullLogical[Y] += b.hull; stats.shieldLogical[Y] += b.shield;
      let shots = shotsOf(X);
      if (!shots.length && (b.hull > EPS || b.shield > EPS)) shots = shotsOf(X, false);   // obrażenia rundy bez strzału z kadencji
      const targetsAlive = sideMembers(Y).filter((m) => aliveAtStart.has(m.id));
      let excess = 0, dropped = 0, shieldDropped = 0;
      // ── plan kadłuba rundy (kolejność = kolejność przyjęcia celów) ──
      const hullPlan = new Map();
      const addH = (id, v) => { if (v > EPS) hullPlan.set(id, (hullPlan.get(id) ?? 0) + v); };
      let hull = b.hull;
      if (!shots.length) { dropped += hull; hull = 0; }   // strona bez broni nie zadaje obrażeń (zaokrąglenia osi)
      if (doomed[Y] && shots.length) {
        // skazani — ogień skupiony: kolejka z ziarna, udział w kadłubie rundy tak, by ostatni zginął w ostatniej rundzie
        const queue = focusQueue[Y].filter((id) => alive.get(id));
        const need = queue.reduce((s, id) => s + hp.get(id), 0);
        const rem = remainingHull[Y][k];
        let dShare = 0;
        if (need > 0) dShare = last ? need : (rem > EPS ? Math.min(need, hull * need / rem) : 0);
        if (dShare > hull) excess += dShare - hull;   // przegrany dobity do zera (odwrót przy 20 % — EAH i tak robi wraki)
        const rest = Math.max(0, hull - dShare);
        let d = dShare;
        for (const id of queue) {
          if (!(d > EPS)) break;
          const take = Math.min(d, hp.get(id));
          addH(id, take);
          d -= take;
        }
        hull = rest;
      }
      if (hull > EPS) {
        // reszta: ocaleni (podłoga `ORB_SURVIVOR_FLOOR`) i pula obrony; cel główny + drugi (`ORB_FOCUS_SPLIT`), nadmiar po pojemności
        const floorK = clamp(num(T.ORB_SURVIVOR_FLOOR, 0.12), 0, 0.95);
        const cap = (m) => (m.kind === 'pool' ? hp.get(m.id) - (hullPlan.get(m.id) ?? 0)
          : Math.max(0, hp.get(m.id) - Math.max(1, floorK * m.hpStart) - (hullPlan.get(m.id) ?? 0)));
        const cands = targetsAlive.filter((m) => !(doomed[Y] && m.kind !== 'pool') && cap(m) > EPS);
        if (cands.length) {
          const primary = cands[Math.floor(rng() * cands.length)];
          const picks = [primary];
          if (cands.length > 1 && shots.length > 1) picks.push(cands[(cands.indexOf(primary) + 1 + Math.floor(rng() * (cands.length - 1))) % cands.length]);
          const split = picks.length > 1 ? clamp(num(T.ORB_FOCUS_SPLIT, 0.25), 0, 0.5) : 0;
          const want = [hull * (1 - split), hull * split];
          let left = hull;
          picks.forEach((m, i) => { const take = Math.min(want[i], cap(m)); if (take > EPS) { addH(m.id, take); left -= take; } });
          for (const m of cands) { if (!(left > EPS)) break; const take = Math.min(left, cap(m)); if (take > EPS) { addH(m.id, take); left -= take; } }
          // ostatnia deska: ocaleni do 1 HP (strona logicznie żyje — nikt z niej nie ginie)
          for (const m of cands) {
            if (!(left > EPS) || m.kind === 'pool') continue;
            const take = Math.min(left, Math.max(0, hp.get(m.id) - 1 - (hullPlan.get(m.id) ?? 0)));
            if (take > EPS) { addH(m.id, take); left -= take; }
          }
          if (left > EPS) dropped += left;
        } else dropped += hull;
      }
      // ── plan osłony rundy: proporcjonalnie do osłony celów ──
      const shieldPlan = new Map();
      const shCands = shots.length ? targetsAlive.filter((m) => sh.get(m.id) > EPS) : [];
      const shTot = shCands.reduce((s, m) => s + sh.get(m.id), 0);
      const shEff = Math.min(b.shield, shTot);
      if (b.shield > shEff) shieldDropped += b.shield - shEff;
      if (shEff > EPS) for (const m of shCands) shieldPlan.set(m.id, shEff * sh.get(m.id) / shTot);
      // ── przyjęcie celów: kadłub ZAWSZE (zniszczenia muszą mieć trafienie — strzelcy mogą strzelić ponownie), osłona samodzielnie —
      //    tylko w liczbie strzałów; reszta osłony odrzucona ──
      const targets = [];
      for (const [id, h] of hullPlan) targets.push({ id, hull: h, shield: shieldPlan.get(id) ?? 0 });
      const shOnly = [...shieldPlan.entries()].filter(([id]) => !hullPlan.has(id)).sort((p, q) => q[1] - p[1] || (p[0] < q[0] ? -1 : 1));
      for (const [id, v] of shOnly) {
        if (targets.length < shots.length) targets.push({ id, hull: 0, shield: v });
        else shieldDropped += v;
      }
      // ── strzały: każdy przyjęty cel ≥ 1 trafienie (ponad liczbę strzałów — ci sami strzelcy po kolei), reszta: trafienie
      //    z szansą `ORB_HIT_P` (cel z wagą przydziału) albo pudło obok losowego żywego celu ──
      const sh2 = order(shots);
      const hitsOf = new Map(targets.map((x) => [x.id, []]));
      const misses = [];
      for (let i = 0; i < Math.max(sh2.length, targets.length); i++) {
        const s = sh2.length ? sh2[i % sh2.length] : null;
        if (!s) break;
        if (i < targets.length) { hitsOf.get(targets[i].id).push(s); continue; }
        if (targets.length && rng() < clamp(num(T.ORB_HIT_P, 0.7), 0, 1)) {
          const tot = targets.reduce((a, x) => a + x.hull + x.shield, 0);
          let r = rng() * tot, pick = targets[0].id;
          for (const x of targets) { r -= x.hull + x.shield; if (r <= 0) { pick = x.id; break; } }
          hitsOf.get(pick).push(s);
        } else misses.push(s);
      }
      for (const s of misses) {
        if (!targetsAlive.length) break;
        const t = targetsAlive[Math.floor(rng() * targetsAlive.length)];
        events.push({ attacker: s.attacker, target: t.id, category: s.w.category ?? 'medium', weapon: s.w.moduleId ?? null,
          hit: false, dmg: 0, blockedByShield: 0, hpAfter: hp.get(t.id), shieldAfter: sh.get(t.id), killed: false, side: X });
      }
      let hullSum = 0, shieldSum = 0;
      for (const x of targets) {
        const hits = hitsOf.get(x.id);
        const wsum = hits.reduce((s, h) => s + Math.max(EPS, num(h.w.damage)), 0);
        let curHp = hp.get(x.id), curSh = sh.get(x.id);
        const doom = doomed[Y] && members.get(x.id).kind !== 'pool';
        const killNow = doom && x.hull >= curHp - 1e-6;
        hits.forEach((s, i) => {
          const f = Math.max(EPS, num(s.w.damage)) / wsum;
          const lastHit = i === hits.length - 1;
          const dH = lastHit && killNow ? curHp : Math.min(curHp, x.hull * f);
          const dS = Math.min(curSh, x.shield * f);
          curHp = Math.max(0, curHp - dH);
          curSh = Math.max(0, curSh - dS);
          hullSum += dH; shieldSum += dS;
          const kill = lastHit && killNow;
          events.push({ attacker: s.attacker, target: x.id, category: s.w.category ?? 'medium', weapon: s.w.moduleId ?? null,
            hit: true, dmg: dH, blockedByShield: dS, hpAfter: kill ? 0 : curHp, shieldAfter: curSh, killed: kill, side: X });
        });
        hp.set(x.id, killNow ? 0 : curHp);
        sh.set(x.id, curSh);
        if (killNow) { alive.set(x.id, false); kills[x.id] = round; }
        else if (members.get(x.id).kind === 'pool' && !(curHp > EPS)) alive.set(x.id, false);   // pula obrony wyczerpana — emitery milkną
      }
      stats.excess[Y] += excess; stats.dropped[Y] += dropped; stats.shieldDropped[Y] += shieldDropped;
      budget[Y] = { hull: hullSum, shield: shieldSum, hullLogical: b.hull, shieldLogical: b.shield, excess, dropped, shieldDropped };
    }
    // regeneracja osłon po rundzie (tury rundy × regeneracja okrętu), do osłony startu
    const tw = turnsIn(k);
    for (const m of members.values()) if (alive.get(m.id) && m.shieldRegen > 0) sh.set(m.id, Math.min(m.shieldStart, sh.get(m.id) + m.shieldRegen * tw));
    const after = {};
    for (const m of members.values()) after[m.id] = { hp: hp.get(m.id), shield: sh.get(m.id) };
    rounds.push({ round, turns: (map[k] ?? []).map((x) => x.t), events, budget, after });
  }

  return {
    ok: true, battleId, encounterId, seed, turns, rounds: N, roundList: rounds, map, doomed, stalemate: doomed.stalemate,
    kills, emitters, poolId: members.has(poolId) ? poolId : null, emitterOf: Object.fromEntries(emitterOf),
    members: Object.fromEntries([...members.values()].map((m) => [m.id, { side: m.side, kind: m.kind, hpStart: m.hpStart, shieldStart: m.shieldStart,
      emitter: m.emitter, weapons: m.weapons.map((w) => ({ category: w.category, moduleId: w.moduleId ?? null })) }])),
    sideStart, stats,
  };
}

/**
 * Formacja sceny planety (D-CV-4): obrońcy na skorupie (promień ciała + `ORB_SHELL_GAP_L`·L), napastnicy na łuku dalej
 * (+ `ORB_ARC_GAP_L`·L), oba łuki wyśrodkowane na kierunku bitwy `bearing` (płaszczyzna x–z, radiany), rzędy dokładane, gdy
 * łuk przekroczy `ORB_ARC_MAX_DEG`; pion z ziarna ± `ORB_VERT_L`·L. Przesunięcia względem ŚRODKA ciała [j.].
 * @param {{ bodyR:number, L:number, spread?:number, nA:number, nB:number, bearing:number, seed?:number, tuning?:object }} p
 * @returns {{ A:Array<{x,y,z}>, B:Array<{x,y,z}>, rA:number, rB:number }}
 */
export function orbitalFormation({ bodyR = 0, L = 0.016, spread = 1, nA = 0, nB = 0, bearing = 0, seed = 0, tuning = ORB_TUNING } = {}) {
  const T = tuning;
  const sp = Math.max(0.25, num(spread, 1));
  const rB = Math.max(0, num(bodyR)) + num(T.ORB_SHELL_GAP_L, 2.5) * L * sp;
  const rA = rB + num(T.ORB_ARC_GAP_L, 8) * L * sp;
  const rng = ledgerRng(ledgerHash('cv8a-formation', seed));
  const arcMax = (num(T.ORB_ARC_MAX_DEG, 140) * Math.PI) / 180;
  const vert = num(T.ORB_VERT_L, 0.6) * L * sp;
  const place = (n, r0, rowGapDir) => {
    const out = [];
    const step = num(T.ORB_SPACING_L, 2.2) * L * sp;
    let i = 0, row = 0;
    while (i < n) {
      const r = r0 + rowGapDir * row * num(T.ORB_ROW_GAP_L, 3) * L * sp;
      const dAng = step / Math.max(r, EPS);
      const fit = Math.max(1, Math.floor(arcMax / dAng) + 1);
      const m = Math.min(fit, n - i);
      const off = row % 2 ? dAng / 2 : 0;
      for (let j = 0; j < m; j++) {
        const a = bearing + (j - (m - 1) / 2) * dAng + off;
        out.push({ x: Math.cos(a) * r, y: (rng() * 2 - 1) * vert, z: Math.sin(a) * r });
      }
      i += m; row++;
    }
    return out;
  };
  return { A: place(nA, rA, 1), B: place(nB, rB, 1), rA, rB };
}

/**
 * Kierunek bitwy w płaszczyźnie x–z [rad]: od ciała ku gwieździe (początek układu — strona dzienna) ± `ORB_BEARING_JITTER_DEG`
 * z ziarna; ciało w początku — kąt z ziarna.
 */
export function orbitalBearing({ bodyX = 0, bodyZ = 0, seed = 0, tuning = ORB_TUNING } = {}) {
  const rng = ledgerRng(ledgerHash('cv8a-bearing', seed));
  const j = ((rng() * 2 - 1) * num(tuning.ORB_BEARING_JITTER_DEG, 35) * Math.PI) / 180;
  const d = Math.hypot(bodyX, bodyZ);
  const base = d > EPS ? Math.atan2(-bodyZ, -bodyX) : rng() * Math.PI * 2;
  return base + j;
}

/**
 * Kierunki emiterów na półkuli ciała zwróconej ku bitwie (wektory jednostkowe): stożek `ORB_BATTERY_CONE_DEG` wokół kierunku
 * bitwy, spirala złotego kąta (deterministycznie z ziarna), lekko w górę — strzały wznoszą się z powierzchni.
 */
export function orbitalEmitterDirs({ n = 0, bearing = 0, seed = 0, tuning = ORB_TUNING } = {}) {
  const out = [];
  const cone = (num(tuning.ORB_BATTERY_CONE_DEG, 55) * Math.PI) / 180;
  const rng = ledgerRng(ledgerHash('cv8a-emitters', seed));
  const ux = Math.cos(bearing), uz = Math.sin(bearing);
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? (i + 0.5) / n : 0.35;
    const th = cone * Math.sqrt(f);                 // od osi
    const ph = phase + i * 2.39996323;              // złoty kąt
    // baza: oś u (poziomo), prostopadłe: v (poziomo) i góra
    const c = Math.cos(th), s = Math.sin(th);
    const vx = -uz, vz = ux;
    const along = c, side = s * Math.cos(ph), up = Math.abs(s * Math.sin(ph)) * 0.8 + 0.08;
    let x = ux * along + vx * side, y = up, z = uz * along + vz * side;
    const l = Math.hypot(x, y, z) || 1;
    x /= l; y /= l; z /= l;
    out.push({ x, y, z });
  }
  return out;
}

/** Czy powtórka ma się odbyć (Finding 628): bitwa w OGLĄDANYM układzie i nie w trybie galaktyki. */
export function orbitalReplayInView({ battleSystemId, activeSystemId, galaxy = false } = {}) {
  if (galaxy) return false;
  if (typeof battleSystemId !== 'string' || !battleSystemId) return false;
  return battleSystemId === activeSystemId;
}
