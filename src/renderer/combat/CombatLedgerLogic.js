// CombatLedgerLogic — REJESTR SALW walki (ARC COMBAT VISUALS, krok CV-4a; plan §2.4, D-CV-8, D-CV-9, §3.1-3; Findingi 614, 615,
// 637, 655 (i); flaga `cvWeapons`).
//
// ⚠ ZERO IMPORTÓW. Czysta logika: wykonuje się pod node (keeper `cv_weapons_ledger_smoke` — wykonaniem, nie lekturą).
//
// Po co. Logika (DSCS) rozstrzyga rundę w jednej chwili: HP spada, okręt ginie, a dopiero potem renderer rysuje salwę.
// Dziś pasek HP i log uciekają przed błyskiem (Finding 614), a okręt zniszczony we wczesnej rundzie lata dalej do końca bitwy
// i wybucha razem z resztą w jednej klatce (Findingi 615, 655 (i)). Rejestr układa dla każdej rundy oglądanego starcia
// HARMONOGRAM w czasie PREZENTACJI (`PresentationClock`): kiedy laser się ładuje i kiedy wiązka rusza, kiedy pocisk wylatuje
// i kiedy trafia, kiedy rakieta startuje i kiedy uderza. Z harmonogramu wynika to, co gracz widzi jako przyczynę i skutek:
//   · HP / osłona POKAZYWANE = stan logiczny + obrażenia zdarzeń jeszcze NIE trafionych (bez czekających — dokładnie stan
//     logiczny); spadają w chwili TRAFIENIA;
//   · ZNISZCZENIE pokazane w chwili ostatniego trafienia w okręt (zwykle — trafienie zabijające), nigdy przed nim.
//
// Reguły harmonogramu (tempo R = `combatRoundMs`, wszystkie ułamki w R; pokrętła `LEDGER_TUNING`, alias w `cvTuning`):
//   · M1 (decyzja 4 — ogień jednoczesny): salwy OBU stron przeplatają się w oknie [0, VOLLEY_END·R] — kolejność strzelców
//     z ziarna starcia i numeru rundy (§2.4 sprzed M1 dzieliło okno na stronę A, potem B — nieaktualne: okręt zestrzelony
//     w rundzie strzela w niej); bronie jednego okrętu co SALVO_GAP·R;
//   · laser: ładowanie LASER_CHARGE·R → wiązka (start wiązki = chwila strzału) LASER_BEAM·R, trafienie LASER_IMPACT_MS po
//     starcie wiązki; kinetyk: błysk wylotu = strzał, lot clamp(odstęp / KIN_SPEED_L, KIN_FLIGHT_MIN·R, KIN_FLIGHT_MAX·R);
//     rakieta: start = strzał, lot z ziarna w [MIS_FLIGHT_MIN·R, MIS_FLIGHT_MAX·R]. Laser i kinetyk trafiają w SWOJEJ rundzie
//     (≤ R od jej startu), rakieta może skończyć lot w następnej (≤ 2R);
//   · okręt zniszczony w rundzie oddaje WSZYSTKIE swoje strzały tej rundy przed trafieniem zabijającym (≥ KILL_MARGIN·R
//     wcześniej) — prezentacja nigdy nie pokazuje strzelającego wraku; wiązka lasera kończy się najpóźniej w chwili śmierci;
//   · trafienia w jeden cel — w kolejności logicznej, gdy da się to zrobić w oknie (inaczej HP nadal schodzi poprawnie, a
//     zniszczenie czeka na ostatnie trafienie);
//   · runda startuje w chwili nadejścia, najpóźniej LAG_MAX·R po nim (D-CV-9: opóźnienie ≤ 1 runda), a po poprzedniej rundzie
//     tego starcia nie wcześniej niż po R_eff. Finding 637: zegar prezentacji poniżej 10 kl./s płynie wolniej od realnego, więc
//     rundy przychodzą w nim GĘŚCIEJ niż co R — R_eff = średnia krocząca odstępów nadejść (pasmo [REFF_MIN·R, R]), harmonogram
//     kurczy się razem z nim i nie odpływa od rund logiki (zakotwiczony w nadejściu rundy, nie w „idealnym” R).
// Losowość wyłącznie z ziarna (mulberry32) — nigdy `Math` losujący (reguła CV-0b).

/** Pokrętła harmonogramu — na żywo (`KOSMOS.threeRenderer.cvTuning.WPN_*`, alias w `LIVE_CV_FX`); czytane przy każdej rundzie. */
export const LEDGER_TUNING = {
  WPN_VOLLEY_END:      0.85,   // [R] koniec okna salw (start strzału)
  WPN_SALVO_GAP:       0.04,   // [R] odstęp kolejnych broni jednego okrętu
  WPN_SLOT_JITTER:     0.6,    // [szczelina] rozrzut chwili strzelca wewnątrz jego szczeliny okna
  WPN_LASER_CHARGE:    0.15,   // [R] ładowanie lasera przed wiązką
  WPN_LASER_BEAM:      0.25,   // [R] czas wiązki
  WPN_LASER_IMPACT_MS: 20,     // [ms] trafienie po starcie wiązki
  WPN_KIN_SPEED_L:     25,     // [L / R] prędkość pocisku kinetycznego (L = długość fregaty)
  WPN_KIN_FLIGHT_MIN:  0.2,    // [R] najkrótszy lot pocisku
  WPN_KIN_FLIGHT_MAX:  0.45,   // [R] najdłuższy lot pocisku
  WPN_MIS_FLIGHT_MIN:  0.5,    // [R] najkrótszy lot rakiety
  WPN_MIS_FLIGHT_MAX:  0.9,    // [R] najdłuższy lot rakiety
  WPN_KILL_MARGIN:     0.03,   // [R] ostatni strzał okrętu najpóźniej tyle przed jego trafieniem zabijającym
  WPN_LAG_MAX:         1.0,    // [R] najwyżej tyle opóźnienia startu rundy względem jej nadejścia (D-CV-9)
  WPN_REFF_MIN:        0.2,    // [R] dolna granica tempa harmonogramu przy wolnym zegarze prezentacji (Finding 637)
};

const ORDER_EPS_MS = 2;   // [ms] trafienia w jeden cel — kolejne co najmniej tyle po poprzednim

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Liczniki rejestru — te same klucze w zakresie starcia (`encounterStats`) i od wczytania strony (`stats`). */
const ledgerCounters = () => ({ rounds: 0, events: 0, hits: 0, duplicates: 0, violations: 0, outOfOrder: 0, kills: 0, killsShown: 0 });

/**
 * Legenda odczytu `KOSMOS.debug.ledgerInfo()` (kontrola właściciela CV-4a 2026-11-12: „liczniki per bitwa czy od załadowania?”).
 * Klucze `rejestr` / `renderer` = klucze liczników (`CombatLedger.stats`, `ThreeRenderer._cvWpnStats`) — keeper pilnuje, że każdy
 * licznik ma tu linię.
 */
export const LEDGER_INFO_LEGEND = Object.freeze({
  wTymStarciu: 'liczniki JEDNEGO starcia od jego początku (starcie = jedna walka DSCS; bitwa stagera 10v10 = jedno starcie, '
    + '`split` / `battles` — kilka); starcie znika z odczytu ok. 10 s po końcu',
  odZaladowaniaStrony: 'sumy WSZYSTKICH starć od wczytania strony — nie per bitwa; F5 zeruje',
  rejestr: Object.freeze({
    rounds: 'rundy przyjęte do rejestru (tylko rundy ze strzałami, starcie w oglądanym układzie)',
    events: 'strzały w harmonogramie (trafienia i pudła)',
    hits: 'trafienia w harmonogramie',
    duplicates: 'runda odebrana drugi raz — pominięta (ma być 0)',
    violations: 'strzały okrętu w chwili albo po chwili jego pokazanego zniszczenia (ma być 0)',
    outOfOrder: 'trafienia w jeden cel lądujące w innej kolejności niż w logice: okno rundy (laser i kinetyk trafiają w swojej '
      + 'rundzie) albo śmierć strzelca nie pozwoliły przesunąć ich później — tylko kolejność rysunku; HP po trafieniach i chwila '
      + 'zniszczenia bez zmian (ok. 14 na bitwę 10v10)',
    kills: 'zniszczenia zaplanowane przez rejestr',
    killsShown: 'zniszczenia rejestru, których chwila minęła (z wrakami z logiki odnotowanymi bez pokazu)',
    maxLagR: 'największe opóźnienie startu rundy po jej nadejściu [R] (≤ 1)',
    maxSpanR: 'największa rozpiętość trafień od startu rundy [R_eff] (laser i kinetyk ≤ 1, rakieta ≤ 2)',
    czekajace: 'strzały jeszcze przed trafieniem albo minięciem celu',
  }),
  renderer: Object.freeze({
    rounds: 'rundy narysowane językiem broni',
    shots: 'strzały narysowane',
    hidden: 'strzały bez rysunku — niewidoczny koniec (mgła wojny)',
    killsShown: 'pokazy zniszczenia w chwili trafienia (eksplozja + wygląd wraku) — każdy okręt najwyżej raz',
    wreckDeduped: 'późny vessel:wrecked (koniec bitwy) dla zniszczenia już pokazanego — bez drugiego pokazu',
    wreckDeferred: 'vessel:wrecked, gdy trafienie zabijające jeszcze leciało — pokaz w chwili trafienia',
    wreckUnknown: 'vessel:wrecked okrętu, którego zniszczenia rejestr nie zaplanował (bitwa poza widokiem, salwy po `cvWeapons(0)`) — '
      + 'dzisiejszy pokaz, raz',
    bilans: 'po zakończonych bitwach: killsShown = wreckDeduped + wreckDeferred; wszystkich pokazów = killsShown + wreckUnknown',
  }),
});

/** Kategoria modułu broni (`short` / `medium` / `long`) → rodzaj strzału. Nieznana — kinetyk. */
export function weaponKindOf(category) {
  return category === 'short' ? 'laser' : category === 'long' ? 'missile' : 'kinetic';
}

/** Skrót FNV-1a (32 bity) z części: liczb i napisów — ziarna wariacji wizualnych. */
export function ledgerHash(...parts) {
  let h = 0x811c9dc5;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= 0x2c; h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — generator z ziarna (32 bity) → funkcja zwracająca liczby z [0, 1). */
export function ledgerRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Harmonogram JEDNEJ rundy — czasy WZGLĘDNE od startu rundy [ms].
 * @param {{ events: object[], roundMs: number, seed?: number, round?: number, gapL?: (ev:object, i:number)=>number,
 *           tuning?: object, prior?: { lastImpact?: Map<string,number>, lastFire?: Map<string,number> } }} p
 *   events — zdarzenia ładunku `combat:roundFx` (D-CV-8: attacker, target, category, hit, killed, …), w kolejności logicznej;
 *   gapL — rysowany odstęp strzelec → cel w L (lot pocisku kinetycznego); prior — z poprzednich rund (czasy względne):
 *   ostatnie czekające trafienie w cel, ostatni strzał okrętu.
 * @returns {{ items: object[], stats: { violations:number, outOfOrder:number, passes:number } }}
 */
export function scheduleRound({ events = [], roundMs = 1000, seed = 0, round = 0, gapL = null, tuning = LEDGER_TUNING, prior = null } = {}) {
  const T = tuning;
  const R = roundMs > 0 ? roundMs : 1000;
  const n = events.length;
  const rng = ledgerRng(ledgerHash('cv4a-ledger', seed, round));
  const win = clamp(T.WPN_VOLLEY_END, 0, 1) * R;
  const gap = Math.max(0, T.WPN_SALVO_GAP) * R;
  const charge = Math.max(0, T.WPN_LASER_CHARGE) * R;
  const laserTravel = Math.max(1, T.WPN_LASER_IMPACT_MS);
  const margin = Math.max(0, T.WPN_KILL_MARGIN) * R;

  // Strzelcy w kolejności zdarzeń → permutacja z ziarna → szczelina okna każdego strzelca.
  const shooters = [];
  const sIdx = new Map();
  for (const ev of events) if (!sIdx.has(ev.attacker)) { sIdx.set(ev.attacker, shooters.length); shooters.push(ev.attacker); }
  const m = shooters.length;
  const order = shooters.map((_, i) => i);
  for (let i = m - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
  const slot = new Array(m);
  for (let k = 0; k < m; k++) {
    const jit = (rng() - 0.5) * Math.max(0, T.WPN_SLOT_JITTER);
    slot[order[k]] = clamp((k + 0.5 + jit) / Math.max(1, m), 0, 1) * win;
  }

  const items = new Array(n);
  const wCount = new Array(m).fill(0);
  const byShooter = shooters.map(() => []);
  for (let i = 0; i < n; i++) {
    const ev = events[i];
    const kind = weaponKindOf(ev.category);
    const si = sIdx.get(ev.attacker);
    const w = wCount[si]++;
    const u1 = rng(), u2 = rng(), u3 = rng();
    let travel;
    if (kind === 'laser') travel = laserTravel;
    else if (kind === 'kinetic') {
      const g = typeof gapL === 'function' ? gapL(ev, i) : NaN;
      const v = Math.max(1e-6, T.WPN_KIN_SPEED_L);
      const f = Number.isFinite(g) && g > 0 ? g / v : T.WPN_KIN_FLIGHT_MIN;
      travel = clamp(f, T.WPN_KIN_FLIGHT_MIN, Math.max(T.WPN_KIN_FLIGHT_MIN, T.WPN_KIN_FLIGHT_MAX)) * R;
    } else {
      travel = (T.WPN_MIS_FLIGHT_MIN + (Math.max(T.WPN_MIS_FLIGHT_MIN, T.WPN_MIS_FLIGHT_MAX) - T.WPN_MIS_FLIGHT_MIN) * u1) * R;
    }
    const lead = kind === 'laser' ? charge : 0;
    // laser i kinetyk trafiają w swojej rundzie (≤ R); rakieta startuje w oknie salw (lot może przejść do następnej rundy)
    const fireMax = kind === 'missile' ? Math.max(0, win) : Math.max(lead, R - travel);
    const fire = clamp(slot[si] + w * gap + lead, Math.min(lead, fireMax), fireMax);
    const it = { i, ev, kind, si, w, lead, travel, fireMax, fire, impact: fire + travel, u1, u2, u3 };
    items[i] = it;
    byShooter[si].push(it);
  }

  // Zabici w tej rundzie: indeks zdarzenia zabijającego (pierwsze trafienie, po którym HP celu ≤ 0 — pole D-CV-8 `killed`).
  const killEv = new Map();
  for (const it of items) if (it.ev.hit === true && it.ev.killed === true && !killEv.has(it.ev.target)) killEv.set(it.ev.target, it.i);
  const killLimit = (shooterId) => { const ki = killEv.get(shooterId); return ki === undefined ? Infinity : items[ki].impact - margin; };

  // (1) Okręt zabity w rundzie strzela PRZED swoim trafieniem zabijającym. Przesunięcia wyłącznie WCZEŚNIEJ (do 0) — zbieżne.
  let passes = 0;
  for (; passes < 16; passes++) {
    let changed = false;
    for (const [tgt, ki] of killEv) {
      const si = sIdx.get(tgt);
      if (si === undefined) continue;   // zabity nie strzelał w tej rundzie
      const limit = items[ki].impact - margin;
      const list = byShooter[si];
      for (let k = list.length - 1; k >= 0; k--) {
        const it = list[k];
        const lim = limit - (list.length - 1 - k);   // kolejne bronie okrętu 1 ms przed sobą
        if (it.fire > lim) { it.fire = Math.max(0, lim); it.impact = it.fire + it.travel; changed = true; }
      }
    }
    if (!changed) break;
  }

  // (1b) Okręt zabity w tej rundzie: trafienia w niego WCZEŚNIEJSZE logicznie lądują PRZED trafieniem zabijającym — zniszczenie
  //      pokazane w chwili trafienia zabijającego (nie przy późniejszej rakiecie). Wyłącznie WCZEŚNIEJ: rakieta najpierw skraca lot
  //      (do MIS_FLIGHT_MIN·R), potem startuje wcześniej (≥ 0); laser i kinetyk — wcześniejszy strzał. Przesunięcie wcześniej nie
  //      łamie (1) (strzelec strzela jeszcze wcześniej przed swoją śmiercią) i nie zmienia trafień zabijających (ruszamy tylko
  //      trafienia NIE zabijające). Gdy się nie da (strzał musiałby wyjść przed startem rundy) — zostaje (zniszczenie przy ostatnim).
  const misMin = Math.max(0, T.WPN_MIS_FLIGHT_MIN) * R;
  for (const [tgt, ki] of killEv) {
    let cap = items[ki].impact - ORDER_EPS_MS;
    for (let i = ki - 1; i >= 0; i--) {
      const it = items[i];
      if (it.ev.target !== tgt || it.ev.hit !== true) continue;
      if (it.impact > cap) {
        let travel = it.travel, fire = cap - travel;
        if (it.kind === 'missile') { travel = Math.max(misMin, Math.min(it.travel, cap - it.fire)); fire = cap - travel; }
        if (fire >= 0) { it.fire = Math.min(it.fire, fire); it.travel = travel; it.impact = it.fire + it.travel; }
      }
      cap = Math.min(cap, it.impact) - ORDER_EPS_MS;
    }
  }

  // (2) Trafienia w jeden cel w kolejności logicznej (miękko): przesunięcia wyłącznie PÓŹNIEJ, w granicach okna i ograniczenia (1)
  //     strzelca — więc (1) zostaje spełnione (granica z (1) tylko się luzuje, gdy trafienie zabijające jedzie później); trafienie
  //     NIE zabijające w okręt zabijany w tej rundzie nie przechodzi za trafienie zabijające (1b).
  const killImpactOf = (tg) => { const ki = killEv.get(tg); return ki === undefined ? Infinity : items[ki].impact; };
  const lastImp = new Map();
  const priorImp = prior?.lastImpact ?? null, priorFire = prior?.lastFire ?? null;
  let outOfOrder = 0;
  for (const it of items) {
    if (it.ev.hit !== true) continue;
    const tg = it.ev.target;
    let need = lastImp.has(tg) ? lastImp.get(tg) + ORDER_EPS_MS : (priorImp?.get?.(tg) ?? -Infinity) + ORDER_EPS_MS;
    if (it.ev.killed === true && priorFire?.has?.(tg)) need = Math.max(need, priorFire.get(tg) + margin);
    if (it.impact < need) {
      const want = need - it.travel;
      let cap = Math.min(it.fireMax, killLimit(it.ev.attacker));
      if (it.ev.killed !== true) cap = Math.min(cap, killImpactOf(tg) - ORDER_EPS_MS - it.travel);
      if (want <= cap) { it.fire = want; it.impact = want + it.travel; } else outOfOrder++;
    }
    lastImp.set(tg, Math.max(lastImp.get(tg) ?? -Infinity, it.impact));
  }

  // Kontrola: żaden strzał okrętu zabitego w tej rundzie nie wychodzi w chwili jego trafienia zabijającego ani później.
  let violations = 0;
  for (const [tgt, ki] of killEv) {
    const si = sIdx.get(tgt);
    if (si === undefined) continue;
    for (const it of byShooter[si]) if (it.fire >= items[ki].impact) violations++;
  }
  return { items, stats: { violations, outOfOrder, passes } };
}

/**
 * Wybór wieżyczki: najlepszy namiar na cel (cosinus kąta między kierunkiem wieżyczki od środka okrętu a kierunkiem na cel);
 * wieżyczki w paśmie `tieCos` od najlepszej są RÓWNE — między nimi po kolei (`counter`). Deterministyczne.
 * @param {{ turrets: Array<{x:number,y:number,z:number}>, center: {x:number,y:number,z:number}, target: {x:number,y:number,z:number},
 *           counter?: number, tieCos?: number }} p
 * @returns {number} indeks w `turrets` albo −1 (brak wieżyczek)
 */
export function pickTurret({ turrets = [], center, target, counter = 0, tieCos = 0.12 } = {}) {
  const n = turrets?.length ?? 0;
  if (!n || !center || !target) return -1;
  let dx = target.x - center.x, dy = target.y - center.y, dz = target.z - center.z;
  const dl = Math.hypot(dx, dy, dz) || 1;
  dx /= dl; dy /= dl; dz /= dl;
  let best = -Infinity;
  const score = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = turrets[i];
    const ox = t.x - center.x, oy = t.y - center.y, oz = t.z - center.z;
    const ol = Math.hypot(ox, oy, oz);
    score[i] = ol > 1e-12 ? (ox * dx + oy * dy + oz * dz) / ol : 0;
    if (score[i] > best) best = score[i];
  }
  const ties = [];
  for (let i = 0; i < n; i++) if (score[i] >= best - Math.max(0, tieCos)) ties.push(i);
  const c = Number.isFinite(counter) && counter >= 0 ? Math.floor(counter) : 0;
  return ties[c % ties.length];
}

/**
 * Rejestr salw — stan wszystkich oglądanych starć. Czasy w ms zegara PREZENTACJI.
 */
export class CombatLedger {
  constructor({ tuning = LEDGER_TUNING } = {}) {
    this.tuning = tuning;
    this._enc = new Map();        // encounterId → { lastStart, lastArrive, emaDA, rounds: Map(round → rekord) }
    this._pending = [];           // zdarzenia przed trafieniem (trafione i pudła)
    this._byTarget = new Map();   // cel → Set trafień przed trafieniem (HP / osłona pokazywane)
    this._kills = new Map();      // okręt → { at, impactAt, encounterId, round, shown }
    this._lastFire = new Map();   // okręt → ostatni zaplanowany strzał [ms]
    this._lastImpact = new Map(); // cel → ostatnie zaplanowane trafienie [ms]
    this.stats = { ...ledgerCounters(), maxLagR: 0, maxSpanR: 0 };   // od utworzenia rejestru (= od wczytania strony)
  }

  /**
   * Runda z ładunku `combat:roundFx`. Ta sama runda tego samego starcia drugi raz — pominięta (każde zdarzenie dokładnie raz).
   * @param {{ encounterId:string, round:number, seed?:number, events:object[], nowMs:number, roundMs:number,
   *           gapL?: (ev:object, i:number)=>number }} p
   * @returns {object|null} rekord rundy (start, tempo, wpisy) albo null
   */
  addRound({ encounterId, round, seed = 0, events = [], nowMs = 0, roundMs = 1000, gapL = null } = {}) {
    if (encounterId == null || !Number.isFinite(round)) return null;
    let es = this._enc.get(encounterId);
    if (!es) { es = { id: encounterId, lastStart: null, lastArrive: null, emaDA: null, rounds: new Map(), stats: ledgerCounters() }; this._enc.set(encounterId, es); }
    if (es.rounds.has(round)) { this.stats.duplicates++; es.stats.duplicates++; return null; }
    const T = this.tuning;
    const R = roundMs > 0 ? roundMs : 1000;
    const now = Number.isFinite(nowMs) ? nowMs : 0;
    if (es.lastArrive != null) {
      const dA = now - es.lastArrive;
      if (dA > 0) es.emaDA = es.emaDA == null ? dA : es.emaDA * 0.7 + dA * 0.3;
    }
    es.lastArrive = now;
    const ema = es.emaDA ?? R;
    const Reff = clamp(ema, Math.max(1e-6, T.WPN_REFF_MIN) * R, R);
    let start = now;
    if (es.lastStart != null) start = Math.max(now, Math.min(es.lastStart + Reff, now + Math.max(0, T.WPN_LAG_MAX) * R));
    es.lastStart = start;

    const prior = { lastImpact: new Map(), lastFire: new Map() };
    for (const ev of events) {
      const li = this._lastImpact.get(ev.target);
      if (li != null && li > start) prior.lastImpact.set(ev.target, li - start);
      const lf = this._lastFire.get(ev.target);
      if (lf != null && lf > start - Reff) prior.lastFire.set(ev.target, lf - start);
    }
    const { items, stats } = scheduleRound({ events, roundMs: Reff, seed, round, gapL, tuning: T, prior });
    const charge = Math.max(0, T.WPN_LASER_CHARGE) * Reff, beam = Math.max(0, T.WPN_LASER_BEAM) * Reff;
    const margin = Math.max(0, T.WPN_KILL_MARGIN) * Reff;

    const entries = items.map((it) => {
      const ev = it.ev;
      const fireAt = start + it.fire;
      return {
        encounterId, round, index: it.i, attacker: ev.attacker, target: ev.target, kind: it.kind,
        weapon: ev.weapon ?? null, category: ev.category ?? null, side: ev.side ?? null,
        hit: ev.hit === true, dmg: ev.hit === true ? Math.max(0, Number(ev.dmg) || 0) : 0,
        blocked: ev.hit === true ? Math.max(0, Number(ev.blockedByShield) || 0) : 0,
        killed: ev.hit === true && ev.killed === true,
        chargeAt: it.kind === 'laser' ? fireAt - charge : null,
        fireAt, impactAt: start + it.impact, flight: it.travel,
        beamEnd: it.kind === 'laser' ? fireAt + beam : null,
        seed: ledgerHash(seed, round, it.i), u1: it.u1, u2: it.u2, u3: it.u3,
        impacted: false,
      };
    });

    // Zniszczenia: ostatnie trafienie w okręt (z poprzednimi czekającymi), nie przed jego ostatnim strzałem.
    for (const x of entries) {
      if (!x.killed) continue;
      let at = x.impactAt;
      const set = this._byTarget.get(x.target);
      if (set) for (const y of set) if (y.impactAt > at) at = y.impactAt;
      for (const y of entries) if (y.hit && y.target === x.target && y.impactAt > at) at = y.impactAt;
      const lf = Math.max(this._lastFire.get(x.target) ?? -Infinity, ...entries.filter((y) => y.attacker === x.target).map((y) => y.fireAt));
      if (Number.isFinite(lf) && lf + margin > at) at = lf + margin;
      this._kills.set(x.target, { at, impactAt: x.impactAt, encounterId, round, index: x.index, shown: false });
      this.stats.kills++;
      es.stats.kills++;
    }
    // Wiązka lasera kończy się najpóźniej w chwili śmierci strzelca.
    for (const x of entries) {
      if (x.kind !== 'laser') continue;
      const k = this._kills.get(x.attacker);
      if (k && !k.shown && k.at < x.beamEnd) x.beamEnd = Math.max(x.fireAt, k.at);
    }
    for (const x of entries) {
      this._pending.push(x);
      if (x.hit) {
        let set = this._byTarget.get(x.target);
        if (!set) { set = new Set(); this._byTarget.set(x.target, set); }
        set.add(x);
        if (!(x.impactAt <= (this._lastImpact.get(x.target) ?? -Infinity))) this._lastImpact.set(x.target, x.impactAt);
      }
      if (!(x.fireAt <= (this._lastFire.get(x.attacker) ?? -Infinity))) this._lastFire.set(x.attacker, x.fireAt);
    }
    const lastImpactAt = entries.reduce((a, x) => Math.max(a, x.impactAt), start);
    const rec = { encounterId, round, arriveMs: now, startMs: start, roundMs: R, R: Reff, entries, lastImpactAt, stats };
    es.rounds.set(round, rec);
    const hits = entries.reduce((a, x) => a + (x.hit ? 1 : 0), 0);
    for (const s of [this.stats, es.stats]) {
      s.rounds++;
      s.events += entries.length;
      s.hits += hits;
      s.violations += stats.violations;
      s.outOfOrder += stats.outOfOrder;
    }
    this.stats.maxLagR = Math.max(this.stats.maxLagR, (start - now) / R);
    this.stats.maxSpanR = Math.max(this.stats.maxSpanR, (lastImpactAt - start) / Reff);
    return rec;
  }

  /**
   * Postęp do chwili `nowMs`: zdarzenia, których trafienie nadeszło (HP pokazywane schodzi), i zniszczenia do pokazania.
   * @returns {{ impacts: object[], kills: string[] }}
   */
  advance(nowMs) {
    const now = Number.isFinite(nowMs) ? nowMs : 0;
    const impacts = [];
    const p = this._pending;
    for (let i = p.length - 1; i >= 0; i--) {
      const x = p[i];
      if (x.impactAt > now) continue;
      x.impacted = true;
      p[i] = p[p.length - 1]; p.pop();
      if (x.hit) this._byTarget.get(x.target)?.delete(x);
      impacts.push(x);
    }
    const kills = [];
    for (const [id, k] of this._kills) {
      if (k.shown || k.at > now) continue;
      this._markShown(k);
      kills.push(id);
    }
    return { impacts, kills };
  }

  /** Zniszczenie odnotowane jako pokazane — liczniki od wczytania strony i jego starcia (dopóki starcie jest w rejestrze). */
  _markShown(k) {
    k.shown = true;
    this.stats.killsShown++;
    const es = k.encounterId != null ? this._enc.get(k.encounterId) : null;
    if (es) es.stats.killsShown++;
  }

  /** Liczniki JEDNEGO starcia od jego początku (te same klucze co `stats`) albo null (starcie nieznane albo już sprzątnięte). */
  encounterStats(encounterId) {
    const es = this._enc.get(encounterId);
    return es ? { ...es.stats } : null;
  }

  /**
   * HP / osłona POKAZYWANE: stan logiczny + obrażenia trafień jeszcze nie pokazanych; klamra [0, start].
   * @returns {{ hp:number, shield:number, pending:number }}
   */
  presented(vesselId, logicalHp, logicalShield, hpStart = Infinity, shieldStart = Infinity) {
    let hp = Number(logicalHp) || 0, sh = Number(logicalShield) || 0, n = 0;
    const set = this._byTarget.get(vesselId);
    if (set) for (const x of set) { hp += x.dmg; sh += x.blocked; n++; }
    const h0 = Number.isFinite(hpStart) ? hpStart : Infinity, s0 = Number.isFinite(shieldStart) ? shieldStart : Infinity;
    return { hp: clamp(hp, 0, h0), shield: clamp(sh, 0, s0), pending: n };
  }

  /** Zniszczenie okrętu: null (rejestr go nie zna), 'pending' (zaplanowane, jeszcze nie pokazane), 'shown'. */
  killState(vesselId) {
    const k = this._kills.get(vesselId);
    return k ? (k.shown ? 'shown' : 'pending') : null;
  }

  /** Chwila pokazania zniszczenia okrętu [ms] albo null. */
  killAt(vesselId) { return this._kills.get(vesselId)?.at ?? null; }

  /** Zniszczenie pokazane poza rejestrem (wrak z logiki, gdy rejestr okrętu nie znał) w chwili `nowMs` — bez ponownego pokazania. */
  markKillShown(vesselId, nowMs = 0) {
    const k = this._kills.get(vesselId);
    if (k) { if (!k.shown) this._markShown(k); return; }
    this._kills.set(vesselId, { at: Number.isFinite(nowMs) ? nowMs : 0, impactAt: null, encounterId: null, round: null, index: null, shown: true });
  }

  /** Czy zdarzenie (starcie, runda, indeks) zostało już pokazane (trafiło albo minęło cel). Nieznane — tak. */
  isEventShown(encounterId, round, index) {
    const x = this._enc.get(encounterId)?.rounds?.get?.(round)?.entries?.[index];
    return !x || x.impacted === true;
  }

  /** Rekordy rund starcia (do odczytu `ledgerInfo`). */
  roundsOf(encounterId) { return [...(this._enc.get(encounterId)?.rounds?.values?.() ?? [])]; }

  encounterIds() { return [...this._enc.keys()]; }

  pendingCount() { return this._pending.length; }

  // ── ARC CV-7 — odczyty kamery reżysera (wyłącznie odczyt; harmonogram nietknięty) ──────────────────────────────────────────

  /**
   * Zniszczenia zaplanowane, jeszcze nie pokazane, w starciach `encIds` (null — wszystkie), w kolejności chwili pokazania:
   * `{ vesselId, at, impactAt, encounterId, attacker }` (`attacker` — strzelec trafienia zabijającego, gdy jeszcze czeka).
   */
  upcomingKills(encIds = null) {
    const set = encIds == null ? null : new Set([...encIds].map(String));
    const out = [];
    for (const [vid, k] of this._kills) {
      if (k.shown || !Number.isFinite(k.at)) continue;
      if (set && !set.has(String(k.encounterId))) continue;
      const x = this._pending.find((y) => y.killed && y.target === vid && y.encounterId === k.encounterId) ?? null;
      out.push({ vesselId: vid, at: k.at, impactAt: k.impactAt, encounterId: k.encounterId, attacker: x?.attacker ?? null });
    }
    return out.sort((a, b) => a.at - b.at || (a.vesselId < b.vesselId ? -1 : 1));
  }

  /** Czy w starciach `encIds` (null — wszystkie) coś jeszcze czeka na pokazanie (trafienie albo zniszczenie). */
  hasPending(encIds = null) {
    const set = encIds == null ? null : new Set([...encIds].map(String));
    if (this._pending.some((x) => !set || set.has(String(x.encounterId)))) return true;
    for (const [, k] of this._kills) if (!k.shown && (!set || set.has(String(k.encounterId)))) return true;
    return false;
  }

  /**
   * Najzajętsze pary strzelec → cel w starciach `encIds` ze strzałami w oknie [fromMs, toMs] (chwila strzału): `{ attacker, target,
   * shots, dmg }` malejąco (strzały, obrażenia, klucz — deterministycznie).
   */
  pairIntensity(encIds = null, fromMs = -Infinity, toMs = Infinity) {
    const set = encIds == null ? null : new Set([...encIds].map(String));
    const acc = new Map();
    for (const [id, es] of this._enc) {
      if (set && !set.has(String(id))) continue;
      for (const r of es.rounds.values()) for (const x of r.entries) {
        if (!(x.fireAt >= fromMs && x.fireAt <= toMs)) continue;
        const key = `${x.attacker}>${x.target}`;
        const a = acc.get(key) ?? { attacker: x.attacker, target: x.target, shots: 0, dmg: 0, key };
        a.shots++; a.dmg += x.dmg;
        acc.set(key, a);
      }
    }
    return [...acc.values()].sort((a, b) => b.shots - a.shots || b.dmg - a.dmg || (a.key < b.key ? -1 : 1));
  }

  /** Ostatni cel strzelca (najpóźniejszy strzał do chwili `nowMs`) albo null. */
  lastTargetOf(attacker, nowMs = Infinity) {
    let best = null;
    for (const [, es] of this._enc) for (const r of es.rounds.values()) for (const x of r.entries) {
      if (x.attacker === attacker && x.fireAt <= nowMs && (!best || x.fireAt > best.fireAt)) best = x;
    }
    return best?.target ?? null;
  }

  /**
   * Sprzątanie: rundy w pełni pokazane starsze niż `keepMs` (zostaje `keepRounds` ostatnich na starcie), starcia nieaktywne
   * bez czekających zdarzeń, zniszczenia pokazane dawno temu (starcie już nieaktywne).
   */
  prune(nowMs, activeIds = null, { keepMs = 10000, keepRounds = 6 } = {}) {
    const act = activeIds instanceof Set ? activeIds : new Set(activeIds ?? []);
    const pendingEnc = new Set(this._pending.map((x) => x.encounterId));
    for (const [id, es] of this._enc) {
      const rounds = [...es.rounds.values()].sort((a, b) => a.round - b.round);
      for (let i = 0; i < rounds.length - keepRounds; i++) {
        const r = rounds[i];
        if (r.lastImpactAt < nowMs - keepMs && r.entries.every((x) => x.impacted)) es.rounds.delete(r.round);
      }
      if (!act.has(id) && !pendingEnc.has(id) && (es.lastStart == null || es.lastStart < nowMs - keepMs)) this._enc.delete(id);
    }
    for (const [vid, k] of this._kills) {
      if (k.shown && (k.encounterId == null || !act.has(k.encounterId)) && (k.at < nowMs - 4 * keepMs)) this._kills.delete(vid);
    }
  }

  clear() {
    this._enc.clear(); this._pending.length = 0; this._byTarget.clear(); this._kills.clear();
    this._lastFire.clear(); this._lastImpact.clear();
  }
}
