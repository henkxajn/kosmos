// DirectorCampaign — KAMPANIA UKŁAD PO UKŁADZIE (AI STRIKES BACK S4/2 — decyzje SB10, SB83, SB84).
//
// PO CO TEN PLIK ISTNIEJE. Do S4 ofensywa AI w wojnie (`strike_player_target`) to same eskorty — bez transportowca, więc
// bez desantu — a cel to najcenniejsze ciało w zasięgu (stolica gracza bywała pierwsza). Desant z ładunku miało wyłącznie
// odbijanie (S3/2). Kampania wysyła ESKADRĘ (`StrikeSquadronSystem.launchSquadron`: transportowiec z falą + eskorta, lot
// razem, desant po wygranej orbicie) na NASTĘPNE ciało gracza w porządku SB84.
//
// KIEDY (podpis 2026-10-14): reguła Directora BEZ RZUTU (`campaign_strike`, wzór `retake_lost_colony`), oceniana na ticku
//   imperium, z cooldownem REGUŁY 1,0 roku wyświetlanego (przepustnica decyzji). Odpala, gdy:
//     • imperium jest w wojnie z graczem (guard `empireAtWarWithPlayer`);
//     • jest cel kampanii poza cooldownem celu (sonda `campaignTargets`);
//     • żadna eskadra imperium nie jest w drodze (guard `empireHasNoSquadronUnderway`);
//     • nie ma czego odbijać (guard `empireHasNoRetakePending`): ODBIJANIE MA PIERWSZEŃSTWO (SB83) — kampania czeka, dopóki
//       reguła odbijania mogłaby wysłać eskadrę albo czeka na pulę (cel odbijany w zasięgu sufitu).
// CELE: ciała gracza w zasięgu imperium (`DirectorOffensive.reachableTargets` — przestrzeń roszczona albo powłoka
//   graniczna `InfluenceMap`, ta sama granica co uderzenie), BEZ ciał odbijanych w bieżącej wojnie (te ma reguła
//   odbijania z własnym opóźnieniem i cooldownem); ciało zatrzymane wcześniejszym pokojem status quo jest zwykłym celem
//   (SB75). PORZĄDEK — `CampaignPlanner.orderCampaignTargets` (SB84: najbliższy układ gracza, w nim placówki → kolonie →
//   stolica gracza). STOLICA GRACZA OSTATNIA (SB84): nie jest celem, dopóki w jej układzie stoi INNE ciało gracza — także
//   czekające na cooldown albo ponad sufitem (czekanie `capital_last`); plan bierze wtedy następny cel w kolejności (inny
//   układ) albo czeka. Cel ponad sufit eskadry (`squadronMaxShips`) — pomijany (następny w kolejce); cel w zasięgu sufitu
//   przy za małej puli — ODMOWA i czekanie, bez schodzenia niżej (jak odbijanie, SB71). Cooldown CELU
//   (`campaignCooldownYears`) liczy każdą wysłaną eskadrę na to ciało; odmowa próbą nie jest.
// ESKORTA: `requiredSquadron` (SB56) z puli eskorty odbijania (`DirectorRetake.retakeEscortPool` — te same warunki:
//   uzbrojone, w służbie, nie strażnicy, w układzie stolicy, wolne, w doku albo na orbicie, poza starciem; cel poza
//   układem stolicy — wyłącznie kadłuby z bakiem warp).
// ZWYKŁE UDERZENIE ESKORTĄ (SB83): wyłącznie, gdy pula nie pokrywa ŻADNEJ eskadry (guard `empireSquadronUnaffordable`
//   reguły `strike_player_target`): eskadra jest „do wzięcia”, gdy odbijanie albo kampania wysłałyby ją teraz i fala desantu
//   nie jest pusta.
//
// KONIEC WOJNY (SB85, reguła `campaign_peace_offer`): kampania WYCZERPANA — `campaignMaxFailedAttempts` kolejnych prób bez
//   zdobycia celu albo żadna eskadra do wzięcia i nic nie czeka na swój czas — imperium wysyła depeszę pokojową STATUS QUO
//   (`WarSystem.requestAiPeaceOffer`). SB89 (rewizja SB86): depesza idzie BEZ oceny pokoju AI i jest WIĄŻĄCA, ale tylko gdy
//   (i) wyczerpanie trwa przez `campaignPeaceAfterChecks` KOLEJNE kontrole roczne (każde odpalenie reguły to kontrola) i
//   (ii) brak eskadry do wzięcia nie wynika z eskort w drodze (kadłuby z bakiem warp w puli imperium liczone wszystkie;
//   SB96 — także KAŻDA eskorta w drodze, z bakiem albo bez, razem z dostępnymi teraz).
//
// ⚠ AKCJA NIGDY NIE RZUCA (`_firePending` / `tickEmpire` biegną poza per-regułowym try/catch — zasada `DirectorOffensive`).
// ⚠ Zero importów systemów — kolaboratorzy leniwie przez `window.KOSMOS`; liczby strojenia przez planery.

import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { isEnemyVessel, hasWeapons, isInService } from '../../entities/Vessel.js';
import { squadronMaxShips, squadronVerdict, readEmpireWavePlan, campaignCooldownYears, campaignMaxFailedAttempts,
         campaignPeaceAfterChecks } from '../../utils/StrikeWavePlanner.js';
import { orderCampaignTargets, campaignClass } from '../../utils/CampaignPlanner.js';
import { DIRECTOR_RULES } from '../../data/DirectorRuleData.js';

/** Etapy eskadry, w których próba jeszcze TRWA (lot do celu, trzymanie orbity po desancie) — nie liczą się do wyczerpania. */
const ATTEMPT_OPEN_STAGES = new Set(['launched', 'landed']);

/** SB89 — klucz `gameState` kontroli rocznych końca wojny (deklaracja: `GameState.createDefaultState`). */
export const PEACE_CHECKS_STATE_KEY = 'campaignPeaceChecks';

/** Krok Directora: 1 rok cywilizacyjny = 1/12 roku wyświetlanego (`AlienCivSystem._tickAll` → `tickEmpire`). */
const DIRECTOR_TICK_YEARS = 1 / 12;

export class DirectorCampaign {
  /**
   * @param {object} offensive — `DirectorOffensive` (zasięg celów, `requiredSquadron`)
   * @param {object} retake    — `DirectorRetake` (kandydaci odbijania, pula eskorty, plan odbijania)
   */
  constructor(offensive, retake) {
    this._off = offensive;
    this._rt = retake;
  }

  _K() { return (typeof window !== 'undefined') ? window.KOSMOS : null; }

  _year() { return this._K()?.timeSystem?.gameTime ?? 0; }

  _capital(empireId) {
    return this._K()?.directorProduction?.capitalOf?.(empireId) ?? null;
  }

  // ── Kandydaci ──────────────────────────────────────────────────────────────────────

  /**
   * Cele kampanii (bez kolejności): ciała gracza w zasięgu imperium, bez ciał odbijanych w bieżącej wojnie, z odległością
   * układu od stolicy imperium (LY), klasą i stanem czekania: `cooldown` (cooldown celu) albo `capital_last` (stolica
   * gracza, a w jej układzie stoi inne ciało gracza — SB84).
   * @returns {Array<{colony:object, body:object, systemId:string, distLY:number, capital:boolean, outpost:boolean,
   *                  lastAttemptYear:number|null, eligible:boolean, wait:null|'cooldown'|'capital_last'}>}
   */
  campaignCandidates(empireId) {
    const K = this._K();
    const cap = this._capital(empireId);
    if (!empireId || !cap) return [];
    const retaken = new Set((this._rt?.retakeCandidates?.(empireId) ?? []).map((c) => c.body.id));
    const now = this._year();
    const cooldown = campaignCooldownYears();
    const squadrons = K?.strikeSquadronSystem?.listSquadrons?.(empireId) ?? [];
    const out = [];
    // SB84 / SB92 — odległość, klasa i czekanie stolicy z JEDNEGO źródła (`DirectorOffensive.sb84Targets`), wspólnego
    //   z porządkiem zwykłego uderzenia.
    for (const t of this._off.sb84Targets(empireId)) {
      if (retaken.has(t.body.id)) continue;
      const attempts = squadrons.filter((s) => s.targetBodyId === t.body.id && Number.isFinite(s.launchedYear)).map((s) => s.launchedYear);
      const lastAttemptYear = attempts.length ? Math.max(...attempts) : null;
      const wait = (lastAttemptYear != null && now - lastAttemptYear < cooldown) ? 'cooldown'
        : t.capitalLast ? 'capital_last' : null;
      out.push({ ...t, lastAttemptYear, eligible: wait === null, wait });
    }
    return out;
  }

  /** Sonda katalogowa `campaignTargets`: ile celów kampanii TERAZ (poza cooldownem celu). */
  countCampaignTargets(empireId) {
    return this.campaignCandidates(empireId).filter((c) => c.eligible).length;
  }

  /**
   * Cele kampanii W KOLEJNOŚCI SB84, każdy z pulą eskorty, potrzebną eskadrą i werdyktem reguły (`czeka_cooldown` ·
   * `czeka_capital_last` · `eskadra_w_drodze` · `czeka_odbicie` · `start` · `za_malo` · `poza_zasiegiem`). Jedno źródło
   * dla akcji, guardów, wojny z okazji i odczytu konsoli; werdykt czyta WYŁĄCZNIE odczyt konsoli (plan liczy z `pool`/`need`).
   * @returns {Array<{target:object, pool:object[], need:{needed:number, defenderHp:number, perShipHp:number}, verdict:string}>}
   */
  campaignNeeds(empireId) {
    const cap = squadronMaxShips();
    const underway = !(this._rt?.hasNoSquadronUnderway?.(empireId) ?? true);
    const retakeFirst = this.retakePending(empireId);
    const rows = this.campaignCandidates(empireId).map((t) => {
      const pool = this._rt.retakeEscortPool(empireId, t);
      const need = this._off.requiredSquadron(t, pool);
      const verdict = t.wait ? `czeka_${t.wait}` : underway ? 'eskadra_w_drodze' : retakeFirst ? 'czeka_odbicie'
        : squadronVerdict(need.needed, pool.length, cap);
      return { bodyId: t.body.id, systemId: t.systemId, distLY: t.distLY, capital: t.capital, outpost: t.outpost,
               needed: need.needed, target: t, pool, need, verdict };
    });
    return orderCampaignTargets(rows);
  }

  /**
   * Plan kampanii TERAZ (bez wysyłki): pierwszy cel poza cooldownem w kolejności SB84 w zasięgu sufitu.
   * @returns {{kind:'no_capital'|'none'|'beyond'|'insufficient'|'start', target?:object, pool?:object[], need?:object,
   *            skipped?:Array<{bodyId:string, needed:number}>, cap?:number, rows?:Array}}
   */
  planCampaign(empireId) {
    if (!this._capital(empireId)) return { kind: 'no_capital' };
    const rows = this.campaignNeeds(empireId);
    const eligible = rows.filter((r) => r.target.eligible);
    if (eligible.length === 0) return { kind: 'none', rows };
    const cap = squadronMaxShips();
    const skipped = [];
    for (const r of eligible) {
      if (r.need.needed > cap) { skipped.push({ bodyId: r.bodyId, needed: r.need.needed }); continue; }
      return { kind: r.pool.length < r.need.needed ? 'insufficient' : 'start', target: r.target, pool: r.pool, need: r.need,
               skipped, cap, rows };
    }
    return { kind: 'beyond', skipped, cap, rows };
  }

  // ── Pierwszeństwo (SB83) ───────────────────────────────────────────────────────────

  /** Odbijanie czeka albo wysłałoby eskadrę (cel odbijany w zasięgu sufitu) — kampania ustępuje. */
  retakePending(empireId) {
    const k = this._rt?.planRetake?.(empireId)?.kind;
    return k === 'start' || k === 'insufficient';
  }

  /** Guard `empireHasNoRetakePending`. */
  hasNoRetakePending(empireId) {
    return !this.retakePending(empireId);
  }

  /**
   * Czy imperium wysłałoby teraz ESKADRĘ (odbijanie albo kampania w kolejności pierwszeństwa) — i czy fala desantu nie
   * jest pusta (bez niej `launchSquadron` odmawia `empty_wave`).
   */
  squadronAffordable(empireId) {
    if (!((readEmpireWavePlan(this._K(), empireId)?.count ?? 0) > 0)) return false;
    const rk = this._rt?.planRetake?.(empireId)?.kind;
    if (rk === 'start') return true;
    if (rk === 'insufficient') return false;   // odbijanie ma pierwszeństwo, a pula go nie pokrywa — kampania czeka
    return this.planCampaign(empireId).kind === 'start';
  }

  /** Guard `empireSquadronUnaffordable` reguły `strike_player_target` (SB83): zwykłe uderzenie tylko bez eskadry. */
  squadronUnaffordable(empireId) {
    return !this.squadronAffordable(empireId);
  }

  // ── Akcja ──────────────────────────────────────────────────────────────────────────

  /**
   * Akcja `launchCampaign`: eskadra na pierwszy cel planu kampanii.
   * @returns {{launched:number, reason?:string, squadronId?:string, targetBodyId?:string, needed?:number}}
   */
  launchCampaign(ctx = {}) {
    const empireId = ctx?.empireId;
    const year = ctx?.year ?? this._year();
    try {
      const p = this.planCampaign(empireId);
      if (p.kind === 'no_capital') return this._refuse(empireId, 'no_capital', year);
      if (p.kind === 'none') return this._refuse(empireId, 'no_target', year);
      if (p.kind === 'beyond') return this._refuse(empireId, 'target_beyond_reach', year, { skipped: p.skipped, cap: p.cap });
      const body = p.target.body;
      if (p.kind === 'insufficient') {
        return this._refuse(empireId, 'insufficient_squadron', year, {
          targetBodyId: body.id, needed: p.need.needed, available: p.pool.length, defenderHp: p.need.defenderHp, skipped: p.skipped,
        });
      }
      const escorts = p.pool.slice(0, p.need.needed).map((v) => v.id);
      const r = this._K()?.strikeSquadronSystem?.launchSquadron?.(empireId, body.id, escorts, { origin: 'campaign' });
      if (!r?.ok) {
        return this._refuse(empireId, 'launch_refused', year, { targetBodyId: body.id, detail: r?.reason ?? 'no_squadron_system', skipped: p.skipped });
      }
      EventBus.emit('director:campaignLaunched', {
        empireId, year, squadronId: r.squadronId, targetBodyId: body.id, targetSystemId: p.target.systemId,
        targetClass: campaignClass(p.target), distLY: +p.target.distLY.toFixed(2), needed: p.need.needed,
        escorts: [...escorts], wave: r.unitIds?.length ?? 0, skipped: p.skipped,
      });
      return { launched: 1, squadronId: r.squadronId, targetBodyId: body.id, needed: p.need.needed };
    } catch (err) {
      console.error('[DirectorCampaign] launchCampaign rzucił — kampania pominięta', err);
      return { launched: 0, reason: 'exception' };
    }
  }

  _refuse(empireId, reason, year, extra = {}) {
    EventBus.emit('director:campaignRefused', { empireId, reason, year, ...extra });
    return { launched: 0, reason, ...extra };
  }

  // ── Koniec wojny (SB85) ────────────────────────────────────────────────────────────

  /**
   * Ile KOLEJNYCH prób bez zdobycia celu, od najnowszej: eskadry imperium wysłane w BIEŻĄCEJ wojnie (od jej początku),
   * zakończone (etap poza `launched` / `landed`). Próba udana = w księdze zdobyczy wojny (`WarSystem.getCaptures`) ciało
   * celu przeszło do imperium nie wcześniej niż w roku wysyłki — także po powrocie eskadry (fala zostaje na ziemi, SB70).
   */
  failedAttemptStreak(empireId) {
    const K = this._K();
    const war = K?.warSystem?.getWarWith?.(empireId);
    if (!war?.active) return 0;
    const start = Number.isFinite(war.startYear) ? war.startYear : 0;
    const won = (K.warSystem.getCaptures?.(war.id) ?? []).filter((c) => c?.toEmpireId === empireId);
    const done = (K?.strikeSquadronSystem?.listSquadrons?.(empireId) ?? [])
      .filter((s) => Number.isFinite(s.launchedYear) && s.launchedYear >= start && !ATTEMPT_OPEN_STAGES.has(s.stage))
      .sort((a, b) => (b.launchedYear - a.launchedYear) || String(b.id).localeCompare(String(a.id)));
    let streak = 0;
    for (const s of done) {
      if (won.some((c) => c.bodyId === s.targetBodyId && Number(c.year) >= s.launchedYear)) break;
      streak += 1;
    }
    return streak;
  }

  /**
   * SB85 — czy kampania imperium jest WYCZERPANA (drugi wyzwalacz depeszy pokojowej AI):
   *   • `failed_attempts` — `campaignMaxFailedAttempts` kolejnych prób bez zdobycia celu (`failedAttemptStreak`);
   *   • `no_affordable_target` — żadnej eskadry do wzięcia TERAZ (`squadronAffordable`: odbijanie, potem kampania; pusta
   *     fala desantu) i nic nie czeka na swój CZAS (cel odbicia w zwłoce albo cooldownie, cel kampanii w cooldownie —
   *     w zasięgu sufitu; stolica czekająca na ciała swojego układu — `capital_last` — się nie liczy).
   * Kampania trwa: `no_war`, `squadron_underway` (eskadra w drodze), `squadron_affordable`, `target_waiting`.
   * @returns {{exhausted:boolean, reason:string, failedStreak?:number, max?:number, plan?:string}}
   */
  campaignExhaustion(empireId) {
    const K = this._K();
    if (!K?.warSystem?.getWarWith?.(empireId)?.active) return { exhausted: false, reason: 'no_war' };
    if (!(this._rt?.hasNoSquadronUnderway?.(empireId) ?? true)) return { exhausted: false, reason: 'squadron_underway' };
    const max = campaignMaxFailedAttempts();
    const failedStreak = this.failedAttemptStreak(empireId);
    if (failedStreak >= max) return { exhausted: true, reason: 'failed_attempts', failedStreak, max };
    if (this.squadronAffordable(empireId)) return { exhausted: false, reason: 'squadron_affordable', failedStreak, max };
    const cap = squadronMaxShips();
    // Czekanie CZASOWE (zwłoka / cooldown) — nie `capital_last`: stolica czekająca na ciała, których nie da się wziąć,
    // nie podtrzymuje kampanii.
    const waiting = (this._rt?.retakeNeeds?.(empireId) ?? []).some((r) => r.target?.wait && r.need?.needed <= cap)
      || this.campaignNeeds(empireId).some((r) => r.target?.wait === 'cooldown' && r.need?.needed <= cap);
    if (waiting) return { exhausted: false, reason: 'target_waiting', failedStreak, max };
    return { exhausted: true, reason: 'no_affordable_target', failedStreak, max, plan: this.planCampaign(empireId).kind };
  }

  /** Sonda katalogowa `campaignExhausted`: 1, gdy kampania wyczerpana, inaczej 0. */
  countCampaignExhausted(empireId) {
    return this.campaignExhaustion(empireId).exhausted ? 1 : 0;
  }

  // ── SB89 (i) — kontrole roczne ─────────────────────────────────────────────────────

  /** Okres kontroli = cooldown reguły `campaign_peace_offer` (lata wyświetlane; reguła odpala najwyżej raz na okres). */
  _peaceCheckYears() {
    return Number(DIRECTOR_RULES.campaign_peace_offer?.cooldown?.years) || 1.0;
  }

  /**
   * SB89 (i) — zapisz KONTROLĘ ROCZNĄ z wyczerpaną kampanią (akcja reguły `campaign_peace_offer`). Kontrola liczy się do
   * serii, gdy przyszła w NASTĘPNYM okresie po poprzedniej — od okresu do okresu i półtora kroku Directora (zapas na granicę
   * cooldownu reguły) — w tej samej wojnie i bez eskadry imperium wysłanej od poprzedniej kontroli; później (kontrola bez
   * wyczerpania nie odpala reguły, więc przerwa jest dłuższa) albo po wysyłce — seria od nowa. Wywołanie w tym samym okresie
   * (spoza reguły) serii nie zmienia.
   * @returns {number} ile KOLEJNYCH kontroli zastało kampanię wyczerpaną (z tą)
   */
  _notePeaceCheck(empireId, warId, year) {
    const key = `${PEACE_CHECKS_STATE_KEY}.${empireId}`;
    const rec = gameState.get(key) ?? null;
    const period = this._peaceCheckYears();
    const gap = (rec && rec.warId === warId && Number.isFinite(rec.lastCheckYear)) ? year - rec.lastCheckYear : null;
    if (gap != null && gap < period - 1e-6) return rec.checks ?? 1;   // ta sama kontrola roczna
    const launched = gap != null && (this._K()?.strikeSquadronSystem?.listSquadrons?.(empireId) ?? [])
      .some((s) => Number.isFinite(s.launchedYear) && s.launchedYear > rec.lastCheckYear);
    const consecutive = gap != null && gap <= period + 1.5 * DIRECTOR_TICK_YEARS && !launched;
    const checks = consecutive ? (rec.checks ?? 1) + 1 : 1;
    gameState.set(key, { warId, checks, lastCheckYear: year }, 'campaign_peace_check');
    return checks;
  }

  // ── SB89 (ii) — eskorty w drodze ───────────────────────────────────────────────────

  /** Uzbrojone kadłuby imperium w służbie z bakiem warp (nie strażnicy, nie wraki) — WSZĘDZIE, także w locie. */
  _warpHulls(empireId) {
    const K = this._K();
    return (K?.vesselManager?.getAllVessels?.() ?? []).filter((v) => v && !v.isWreck && isEnemyVessel(v)
      && (v.ownerEmpireId ?? v.owner) === empireId && hasWeapons(v) && isInService(v) && v.warpFuel?.max > 0
      && !K?.directorDoctrine?.isGuard?.(empireId, v.id));
  }

  /**
   * SB96 (S4/4; zmienia SB89 (ii)) — eskorty imperium W DRODZE: uzbrojone, w służbie, nie strażnicy, nie wraki, z aktywnym
   * rozkazem ruchu, misją albo złożonym rozkazem (`movementOrder` / `mission` / `pendingOrder`) — z bakiem warp ALBO BEZ.
   * Kadłuby z puli eskorty (dostępne teraz) nie mają żadnego z nich, więc oba zbiory są rozłączne.
   */
  _escortsInTransit(empireId) {
    const K = this._K();
    return (K?.vesselManager?.getAllVessels?.() ?? []).filter((v) => v && !v.isWreck && isEnemyVessel(v)
      && (v.ownerEmpireId ?? v.owner) === empireId && hasWeapons(v) && isInService(v)
      && !K?.directorDoctrine?.isGuard?.(empireId, v.id)
      && !!(v.movementOrder || v.mission || v.pendingOrder));
  }

  /**
   * Plan, który CZEKA na eskortę (`insufficient`): odbicie przed kampanią (SB83); bez fali desantu — `null` (brak eskadry
   * nie wynika wtedy z eskorty).
   */
  _waitingSquadronPlan(empireId) {
    if (!((readEmpireWavePlan(this._K(), empireId)?.count ?? 0) > 0)) return null;
    const r = this._rt?.planRetake?.(empireId);
    if (r?.kind === 'insufficient') return r;
    if (r?.kind === 'start') return null;
    const c = this.planCampaign(empireId);
    return c.kind === 'insufficient' ? c : null;
  }

  /**
   * SB89 (ii) z SB96 — czy brak eskadry do wzięcia wynika z ESKORT W DRODZE: plan czeka na eskortę (`insufficient`, dostępnych
   * mniej niż potrzeba), a pokryłyby ją (SB89 (ii)) kadłuby z bakiem warp w puli imperium liczone wszystkie (także w locie
   * i poza układem stolicy) ALBO (SB96) eskorty dostępne teraz razem z KAŻDĄ eskortą w drodze (`_escortsInTransit` — z bakiem
   * albo bez). Pusta fala, brak celu, cel ponad sufit — nie (brak eskadry nie z eskort).
   * @returns {{blocked:boolean, warpHulls:number, inTransit:number, available:number|null, needed:number|null,
   *   targetBodyId:string|null}}
   */
  escortsInTransit(empireId) {
    const warpHulls = this._warpHulls(empireId).length;
    const inTransit = this._escortsInTransit(empireId).length;
    const plan = this._waitingSquadronPlan(empireId);
    if (!plan) return { blocked: false, warpHulls, inTransit, available: null, needed: null, targetBodyId: null };
    const needed = plan.need?.needed ?? null;
    const available = plan.pool?.length ?? 0;
    const short = Number.isFinite(needed) && available < needed;
    return { blocked: short && (warpHulls >= needed || available + inTransit >= needed), warpHulls, inTransit, available,
             needed, targetBodyId: plan.target?.body?.id ?? null };
  }

  /**
   * Odczyt konsoli i bramki (bez zapisu): wyczerpanie, seria kontroli rocznych, warunek eskort w drodze.
   * @returns {{exhaustion:object, checks:number, need:number, lastCheckYear:number|null, transit:object}}
   */
  peaceStatus(empireId) {
    const rec = gameState.get(`${PEACE_CHECKS_STATE_KEY}.${empireId}`) ?? null;
    const warId = this._K()?.warSystem?.getWarWith?.(empireId)?.id ?? null;
    const same = !!rec && rec.warId === warId;
    return { exhaustion: this.campaignExhaustion(empireId), checks: same ? (rec.checks ?? 0) : 0, need: campaignPeaceAfterChecks(),
             lastCheckYear: same ? (rec.lastCheckYear ?? null) : null, transit: this.escortsInTransit(empireId) };
  }

  /**
   * Akcja `offerCampaignPeace`: depesza pokojowa AI (status quo) przy wyczerpanej kampanii — SB89: bez oceny pokoju AI
   * (`WarSystem.requestAiPeaceOffer` — depesza wiążąca), po (i) `campaignPeaceAfterChecks` kolejnych kontrolach rocznych
   * z wyczerpaniem i (ii) gdy brak eskadry do wzięcia nie wynika z eskort w drodze (`escortsInTransit`; dotyczy wyczerpania
   * `no_affordable_target`). Bramki depeszy bez zmian: depesza otwarta (`offer_open`), cooldown po odpowiedzi gracza.
   * @returns {{offered:number, reason?:string, warId?:string, checks?:number}}
   */
  offerCampaignPeace(ctx = {}) {
    const empireId = ctx?.empireId;
    const year = ctx?.year ?? this._year();
    try {
      const ex = this.campaignExhaustion(empireId);
      if (!ex.exhausted) return this._peaceRefuse(empireId, ex.reason, year, { failedStreak: ex.failedStreak ?? null });
      const warId = this._K()?.warSystem?.getWarWith?.(empireId)?.id ?? null;
      const checks = this._notePeaceCheck(empireId, warId, year);
      const need = campaignPeaceAfterChecks();
      if (checks < need) {
        return this._peaceRefuse(empireId, 'exhaustion_not_held', year, {
          exhaustion: ex.reason, failedStreak: ex.failedStreak, checks, need,
        });
      }
      if (ex.reason === 'no_affordable_target') {
        const tr = this.escortsInTransit(empireId);
        if (tr.blocked) {
          return this._peaceRefuse(empireId, 'escorts_in_transit', year, { exhaustion: ex.reason, checks, need, ...tr });
        }
      }
      const r = this._K()?.warSystem?.requestAiPeaceOffer?.(empireId, 'campaign_exhausted');
      if (!r?.ok) {
        return this._peaceRefuse(empireId, r?.reason ?? 'no_war_system', year, {
          exhaustion: ex.reason, failedStreak: ex.failedStreak, checks, need,
        });
      }
      EventBus.emit('director:campaignPeaceOffered', {
        empireId, year, warId: r.warId, exhaustion: ex.reason, failedStreak: ex.failedStreak, max: ex.max, checks, need,
      });
      return { offered: 1, warId: r.warId, checks };
    } catch (err) {
      console.error('[DirectorCampaign] offerCampaignPeace rzucił — depesza pominięta', err);
      return { offered: 0, reason: 'exception' };
    }
  }

  _peaceRefuse(empireId, reason, year, extra = {}) {
    EventBus.emit('director:campaignPeaceRefused', { empireId, reason, year, ...extra });
    return { offered: 0, reason, ...extra };
  }
}

export default DirectorCampaign;
