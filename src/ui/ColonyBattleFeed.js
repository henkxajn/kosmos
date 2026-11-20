// ARC COLONY SPHERE CS-10b — karta bitwy naziemnej na żywo (D-CS-31, plan §3.20).
//
// System walki (CombatSystem, Victoria 2) trzyma tylko licznik rund i sumy do raportu końcowego; przebieg bitwy niosą
// zdarzenia: `groundUnit:attacked` (trafienie, HP celu), `groundUnit:destroyed` (cause 'combat'), `groundUnit:disbanded`
// (morale_collapse), `groundUnit:routed` (odwrót), `combat:round` (koniec rundy), `combat:hexResolved` (wynik). Ten moduł
// słucha ich i składa rekord bitwy na pole: skład obu stron z HP, utracone jednostki, rundę, krótki dziennik i wynik.
// Okno bitwy (`ColonyBattleWindow`) rysuje z rekordu — także po końcu bitwy (wynik zostaje do zamknięcia).
// Tylko odczyt zdarzeń: żadnej zmiany reguł walki, żadnego stanu w zapisie (rekordy żyją w sesji).
//
// Kolejność zdarzeń w jednym tiku walki: trafienia → zniszczenia → rozpad / odwrót → `combat:round`; wynik przychodzi
// w tiku, w którym pole przestaje być sporne. Zdarzenia sprzed `combat:round` należą więc do rundy `rec.round + 1`.
//
// Importowalne pod node: bez THREE, bez DOM; magistrala i KOSMOS wstrzykiwane.

export const BATTLE_FEED = Object.freeze({
  MAX_LOG: 5,        // tyle ostatnich wpisów pokazuje karta (dziennik rekordu trzyma ×4)
  MAX_RECORDS: 24,   // zakończone rekordy ponad ten limit — najstarsze wypadają
});

export const battleKey = (planetId, q, r) => `${planetId}|${q}|${r}`;

const FEED_EVENTS = ['groundUnit:attacked', 'groundUnit:destroyed', 'groundUnit:disbanded', 'groundUnit:routed', 'combat:round', 'combat:hexResolved'];
const ownerOf = (u) => u?.owner ?? 'player';

export class ColonyBattleFeed {
  /**
   * @param {object} [o]
   * @param {() => object} [o.kosmos] dostęp do window.KOSMOS (groundUnitManager)
   * @param {(rec: object) => void} [o.onStart] pierwsza runda bitwy (raz na rekord)
   * @param {(rec: object) => void} [o.onChange] każda zmiana rekordu (odśwież UI)
   */
  constructor(o = {}) {
    this._kosmos = o.kosmos ?? (() => (typeof window !== 'undefined' ? window.KOSMOS : null));
    this.onStart = o.onStart ?? null;
    this.onChange = o.onChange ?? null;
    this.records = new Map();   // klucz pola → rekord bitwy
    this._seq = 0;
    this._bus = null;
    this._handlers = null;
  }

  /** Podłącz do magistrali (EventBus: on / off). */
  attach(bus) {
    this.detach();
    this._bus = bus;
    const h = {
      'groundUnit:attacked': (p) => this.onAttacked(p),
      'groundUnit:destroyed': (p) => this.onDestroyed(p),
      'groundUnit:disbanded': (p) => this.onDisbanded(p),
      'groundUnit:routed': (p) => this.onRouted(p),
      'combat:round': (p) => this.onRound(p),
      'combat:hexResolved': (p) => this.onResolved(p),
    };
    this._handlers = h;
    for (const ev of FEED_EVENTS) bus.on(ev, h[ev]);
    return this;
  }

  detach() {
    if (this._bus && this._handlers) for (const ev of FEED_EVENTS) this._bus.off?.(ev, this._handlers[ev]);
    this._bus = null; this._handlers = null;
  }

  /** Rekord bitwy na polu (także zakończonej, dopóki nie wypadnie) albo null. */
  get(planetId, q, r) { return this.records.get(battleKey(planetId, q, r)) ?? null; }

  _gum() { return this._kosmos?.()?.groundUnitManager ?? null; }

  _ensure(planetId, q, r) {
    const key = battleKey(planetId, q, r);
    let rec = this.records.get(key);
    if (rec && !rec.ended) return rec;
    rec = { key, planetId, q, r, seq: ++this._seq, round: 0, units: new Map(), log: [], started: false, ended: false,
      winnerId: null, totals: null, autoOpened: false, notified: false };
    this.records.set(key, rec);
    for (const u of this._gum()?.getUnitsAtHex?.(planetId, q, r) ?? []) this._seed(rec, u);
    this._prune();
    return rec;
  }

  _seed(rec, u) {
    if (!u?.id || (u.hp ?? 0) <= 0) return null;
    let row = rec.units.get(u.id);
    if (!row) {
      row = { id: u.id, archetypeId: u.archetypeId ?? null, owner: ownerOf(u), hp: u.hp ?? 0, hpMax: u.maxHp ?? u.hpMax ?? null, state: 'alive' };
      rec.units.set(u.id, row);
    }
    return row;
  }

  _findByUnit(unitId) {
    let best = null;
    for (const rec of this.records.values()) if (rec.units.has(unitId) && (!best || (!rec.ended && best.ended) || rec.seq > best.seq)) best = rec;
    return best;
  }

  _push(rec, entry) {
    rec.log.push(entry);
    if (rec.log.length > BATTLE_FEED.MAX_LOG * 4) rec.log.splice(0, rec.log.length - BATTLE_FEED.MAX_LOG * 4);
  }

  _changed(rec) { try { this.onChange?.(rec); } catch (e) { /* UI nie może zatrzymać walki */ } }

  _prune() {
    if (this.records.size <= BATTLE_FEED.MAX_RECORDS) return;
    const ended = [...this.records.values()].filter(r => r.ended).sort((a, b) => a.seq - b.seq);
    while (this.records.size > BATTLE_FEED.MAX_RECORDS && ended.length) this.records.delete(ended.shift().key);
  }

  onAttacked(p) {
    if (!p?.planetId || p.q == null) return;
    const rec = this._ensure(p.planetId, p.q, p.r);
    const gum = this._gum();
    const target = rec.units.get(p.targetId) ?? this._seed(rec, gum?.getUnit?.(p.targetId));
    if (target) { target.hp = Math.max(0, p.targetHP ?? target.hp); if (p.targetHPMax) target.hpMax = p.targetHPMax; }
  }

  onDestroyed(p) {
    if (p?.cause !== 'combat') return;
    const rec = this._findByUnit(p.unitId);
    if (!rec || rec.ended) return;
    const row = rec.units.get(p.unitId);
    row.state = 'destroyed'; row.hp = 0;
    this._push(rec, { kind: 'kill', round: rec.round + 1, own: row.owner === 'player', archetypeId: row.archetypeId });
    this._changed(rec);
  }

  onDisbanded(p) {
    if (p?.reason !== 'morale_collapse') return;
    const rec = this._findByUnit(p.unitId);
    if (!rec || rec.ended) return;
    const row = rec.units.get(p.unitId);
    row.state = 'collapsed';
    this._push(rec, { kind: 'collapse', round: rec.round + 1, own: row.owner === 'player', archetypeId: row.archetypeId });
    this._changed(rec);
  }

  onRouted(p) {
    const rec = p ? this.get(p.planetId, p.fromQ, p.fromR) : null;
    const row = rec?.units.get(p.unitId);
    if (!rec || rec.ended || !row) return;
    row.state = 'retreated';
    this._push(rec, { kind: 'retreat', round: rec.round + 1, own: row.owner === 'player', archetypeId: row.archetypeId });
    this._changed(rec);
  }

  onRound(p) {
    if (!p?.planetId || p.q == null) return;
    const rec = this._ensure(p.planetId, p.q, p.r);
    rec.round = p.round ?? rec.round + 1;
    // HP po rundzie z pola (posiłki, które weszły w trakcie, dochodzą do składu)
    for (const u of this._gum()?.getUnitsAtHex?.(p.planetId, p.q, p.r) ?? []) {
      const row = this._seed(rec, u);
      if (row && row.state === 'alive') row.hp = u.hp ?? row.hp;
    }
    // playerLosses = to, co strona gracza otrzymała (ogień wroga); enemyLosses = to, co zadała
    this._push(rec, { kind: 'round', round: rec.round, dealt: p.enemyLosses?.dmgDealt ?? 0, taken: p.playerLosses?.dmgDealt ?? 0 });
    const first = !rec.started;
    rec.started = true;
    if (first) { try { this.onStart?.(rec); } catch (e) { /* jw. */ } }
    this._changed(rec);
  }

  onResolved(p) {
    if (!p?.planetId || p.q == null) return;
    const rec = this.get(p.planetId, p.q, p.r);
    if (!rec || rec.ended) return;
    rec.ended = true;
    rec.winnerId = p.winnerId ?? null;
    rec.totals = { playerKilled: p.playerKilled ?? 0, enemyKilled: p.enemyKilled ?? 0, playerDmg: p.playerDmg ?? 0, enemyDmg: p.enemyDmg ?? 0 };
    this._push(rec, { kind: 'result', round: rec.round, winnerId: rec.winnerId });
    this._changed(rec);
  }
}

/** Wynik z punktu widzenia gracza: 'win' | 'loss' | 'draw' (null — bitwa trwa). */
export function battleOutcome(rec) {
  if (!rec?.ended) return null;
  if (rec.winnerId === 'player') return 'win';
  if (rec.winnerId) {
    const playerFought = [...(rec.units?.values?.() ?? [])].some(u => u.owner === 'player');
    return playerFought ? 'loss' : 'draw';
  }
  return 'draw';
}

/**
 * Model karty bitwy: rekord zdarzeń (przebieg, utraty, dziennik, wynik) + stan żywy pola (HP, gdy bitwa trwa).
 * Bez rekordu (np. okno otwarte przed pierwszą rundą po wczytaniu) — sam stan żywy, jak `battleWindowModel`.
 * @param {object|null} rec rekord `ColonyBattleFeed`
 * @param {{ sides: Object<string, object[]>, round: number }|null} live `CombatSystem.getBattleStateAt`
 * @param {object} [archetypes] UNIT_ARCHETYPES (HP maks.)
 * @param {string|null} [terrainId]
 */
export function battleCardModel(rec, live, archetypes = {}, terrainId = null) {
  const rows = new Map();
  const hpMaxOf = (u) => archetypes?.[u.archetypeId]?.baseStats?.hp ?? u.hpMax ?? u.maxHp ?? u.hp ?? 1;
  if (rec) for (const u of rec.units.values()) rows.set(u.id, { id: u.id, archetypeId: u.archetypeId, owner: u.owner, hp: u.state === 'alive' ? u.hp : 0, hpMax: hpMaxOf(u), state: u.state });
  if (live?.sides && !rec?.ended) {
    for (const [owner, list] of Object.entries(live.sides)) for (const u of list ?? []) {
      if (!u?.id) continue;
      const row = rows.get(u.id);
      if (row) { if (row.state === 'alive') row.hp = Math.max(0, u.hp ?? row.hp); continue; }
      if ((u.hp ?? 0) <= 0) continue;
      rows.set(u.id, { id: u.id, archetypeId: u.archetypeId, owner, hp: u.hp ?? 0, hpMax: hpMaxOf(u), state: 'alive' });
    }
  }
  if (!rows.size) return null;
  if (!rec && !live) return null;
  const order = { alive: 0, retreated: 1, collapsed: 2, destroyed: 3 };
  const list = [...rows.values()].map(r => ({ ...r, hpFrac: Math.max(0, Math.min(1, r.hp / (r.hpMax || 1))) }))
    .sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9));
  const own = list.filter(r => r.owner === 'player'), enemy = list.filter(r => r.owner !== 'player');
  const alive = (a) => a.filter(r => r.state === 'alive');
  const sum = (a, k) => a.reduce((s, r) => s + r[k], 0);
  return {
    round: Math.max(rec?.round ?? 0, live?.round ?? 0), terrainKey: terrainId ?? null, own, enemy,
    ownHp: sum(alive(own), 'hp'), ownHpMax: sum(own, 'hpMax'), enemyHp: sum(alive(enemy), 'hp'), enemyHpMax: sum(enemy, 'hpMax'),
    ownLost: own.filter(r => r.state === 'destroyed' || r.state === 'collapsed').length,
    enemyLost: enemy.filter(r => r.state === 'destroyed' || r.state === 'collapsed').length,
    ended: !!rec?.ended, outcome: battleOutcome(rec), log: rec ? rec.log.slice(-BATTLE_FEED.MAX_LOG) : [],
    ownerIds: [...new Set(list.map(r => r.owner))].sort(),
  };
}

/**
 * Co zrobić na starcie bitwy (pierwsza runda), raz na bitwę:
 *   'open'   — konsola pokazuje kolonię bitwy (i nie trwa tam inna bitwa w oknie) → okno otwiera się samo;
 *   'notify' — konsola nie pokazuje tej kolonii, gracz walczy, kolonia ma kulę (konsola istnieje) → meldunek w dzwonku;
 *   'none'   — inaczej (mapa płaska: dziś bez okna bitwy — Dziennik ma wpis jak dotąd).
 */
export function battleStartAction({ rec, consoleOn = false, consolePlanetId = null, windowBusy = false, playerSide = false, sphere = false }) {
  if (!rec || rec.autoOpened || rec.notified) return 'none';
  if (consoleOn && consolePlanetId === rec.planetId) return windowBusy ? 'none' : 'open';
  if (playerSide && sphere) return 'notify';
  return 'none';
}

/** Klucz i18n i argumenty wpisu dziennika karty (nazwa jednostki podaje rysujący). */
export function battleLogLine(e) {
  switch (e?.kind) {
    case 'round':    return { key: 'colonyBattle.logRound', args: [e.round, Math.round(e.dealt), Math.round(e.taken)], tone: 'dim' };
    case 'kill':     return { key: e.own ? 'colonyBattle.logLostOwn' : 'colonyBattle.logKillEnemy', unit: e.archetypeId, args: [e.round], tone: e.own ? 'alert' : 'primary' };
    case 'retreat':  return { key: e.own ? 'colonyBattle.logRetreatOwn' : 'colonyBattle.logRetreatEnemy', unit: e.archetypeId, args: [e.round], tone: 'dim' };
    case 'collapse': return { key: e.own ? 'colonyBattle.logCollapseOwn' : 'colonyBattle.logCollapseEnemy', unit: e.archetypeId, args: [e.round], tone: e.own ? 'alert' : 'primary' };
    case 'result':   return { key: 'colonyBattle.logResult', args: [e.round], tone: 'primary' };
    default:         return null;
  }
}

/**
 * Glue gry (GameScene): start bitwy → okno w otwartej konsoli tej kolonii albo meldunek w dzwonku.
 * @returns {'open'|'notify'|'none'}
 */
export function handleBattleStart(K, rec, { t = (k) => k, nameOf = null } = {}) {
  const ov = K?.overlayManager?.overlays?.colony ?? null;
  const shown = !!ov?.visible && K?.overlayManager?.active === 'colony';
  const col = shown ? (ov._getColony?.() ?? null) : null;
  const cur = ov?._cBattle ?? null;
  const curRec = cur ? K?.colonyBattleFeed?.get?.(cur.planetId, cur.q, cur.r) : null;
  const windowBusy = !!cur && cur.planetId === rec.planetId && battleKey(cur.planetId, cur.q, cur.r) !== rec.key && !curRec?.ended
    && !!K?.combatSystem?.isBattleAt?.(cur.planetId, cur.q, cur.r);
  const colony = K?.colonyManager?.getColony?.(rec.planetId) ?? null;
  const action = battleStartAction({
    rec, consoleOn: shown && !!ov?._consoleOn, consolePlanetId: col?.planetId ?? null, windowBusy,
    playerSide: [...rec.units.values()].some(u => u.owner === 'player'),
    sphere: colony?.grid?.kind === 'geo',   // konsola = siatka geo (jak `colonyConsoleActive`), niezależnie od bieżącej flagi
  });
  if (action === 'open') {
    ov._cBattle = { planetId: rec.planetId, q: rec.q, r: rec.r };
    rec.autoOpened = true;
    if (K?.uiManager) K.uiManager._dirty = true;
  } else if (action === 'notify') {
    rec.notified = true;
    const name = nameOf?.(rec.planetId) ?? colony?.planet?.name ?? colony?.name ?? rec.planetId;
    K?.notificationCenter?.add?.({
      type: 'groundBattle', severity: 'danger', source: 'groundBattle', noLog: true,   // Dziennik ma już wpis „bitwa naziemna” (combat:round 1)
      title: t('notif.groundBattleTitle', name), subtitle: t('notif.groundBattleSubtitle'),
      payload: { planetId: rec.planetId, q: rec.q, r: rec.r, bodyId: rec.planetId },
    });
  }
  return action;
}

/** Klik meldunku „bitwa naziemna” → konsola kolonii bitwy z oknem bitwy (raz otwarte = bitwa „widziana”). */
export function openBattleCard(K, { planetId, q, r }) {
  const om = K?.overlayManager;
  if (!om?.openPanel || !planetId) return false;
  om.openPanel('colony', { colonyId: planetId });
  const ov = om.overlays?.colony;
  if (!ov) return false;
  ov._cBattle = { planetId, q, r };
  const rec = K?.colonyBattleFeed?.get?.(planetId, q, r);
  if (rec) rec.autoOpened = true;
  if (K?.uiManager) K.uiManager._dirty = true;
  return true;
}
