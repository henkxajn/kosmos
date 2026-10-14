// DirectorRetake — ODBIJANIE UTRACONYCH KOLONII (AI STRIKES BACK S3, sesja 2 — decyzja SB57).
//
// PO CO TEN PLIK ISTNIEJE. Do S3/2 imperium AI nigdy nie odbijało ciała, które gracz mu zdobył (audyt fazy A, C5–C6).
// Ta reguła wysyła na nie ESKADRĘ (`StrikeSquadronSystem.launchSquadron`: transportowiec z falą + eskorta, lot razem,
// desant po wygranej orbicie, trzymanie orbity do rozstrzygnięcia walki naziemnej, powrót). Ciało wraca do imperium
// ISTNIEJĄCĄ ścieżką przejęcia AI (`InvasionSystem._tickCaptureChecks` → `ColonyManager.transferColony`).
//
// KIEDY (podpis SB57, 2026-10-11, i polecenie sesji 2): reguła Directora BEZ RZUTU (`retake_lost_colony`), oceniana na
//   ticku imperium (`DirectorSystem.tickEmpire`), z cooldownem REGUŁY 1,0 roku wyświetlanego (przepustnica decyzji jak
//   w `recall_strike_force` — reguła bez rzutu musi mieć cooldown). Odpala, gdy:
//     • imperium jest w wojnie z graczem (guard `empireAtWarWithPlayer`);
//     • w KSIĘDZE BIEŻĄCEJ wojny (`WarSystem.getCaptures`) jest ciało, które gracz zdobył od tego imperium (ostatni wpis
//       ciała: od imperium do gracza) i które NADAL należy do gracza;
//     • od straty minęło co najmniej `retakeDelayYears` (klucz strojenia, domyślnie 1);
//     • od ostatniej próby na to ciało (eskadra z tym celem — rekord `strikeSquadrons`) minęło co najmniej
//       `retakeCooldownYears` (klucz, domyślnie 5);
//     • żadna eskadra tego imperium nie jest w drodze (guard `empireHasNoSquadronUnderway`).
// KOLEJNOŚĆ CELÓW: utracona stolica najpierw (`EmpireRegistry.getLostCapitals` — stolica w chwili utraty), potem porządek
//   planera garnizonu (D11: pełne kolonie przed placówkami ze złożem Xe / Nt, `devScore` malejąco; reszta placówek na
//   końcu). Cel, którego obrona wymaga więcej okrętów niż sufit (`squadronMaxShips`), jest pomijany (strukturalnie poza
//   zasięgiem — następny w kolejce); cel w zasięgu sufitu przy za małej puli — ODMOWA i czekanie (bez schodzenia niżej).
// ESKORTA: liczba z `requiredSquadron` (SB56, mnożnik `squadronHpRatio`) wobec obrony celu, z kadłubów uzbrojonych, w
//   służbie, poza rosterem strażników, w układzie stolicy, bez zajęcia, w doku albo na orbicie, poza starciem; cel poza
//   układem stolicy — wyłącznie kadłuby z bakiem warp. Za mało — odmowa z powodem w DebugLog (`director:retakeRefused`),
//   bez spalenia cooldownu CELU (próbą jest wyłącznie wysłana eskadra).
// STOLICA UTRACONA: eskadra formuje się przy stolicy wg `DirectorProduction.capitalOf` (kolejna pełna kolonia imperium);
//   imperium bez pełnej kolonii — odmowa `no_capital`.
//
// ⚠ AKCJA NIGDY NIE RZUCA (`_firePending` / `tickEmpire` biegną poza per-regułowym try/catch — zasada `DirectorOffensive`).
// ⚠ Nazwy katalogowe rejestruje `registerOffensiveBehaviors` (rodzina uderzenia; jedna rejestracja dla gry i keeperów).
// ⚠ Zero importów systemów — kolaboratorzy leniwie przez `window.KOSMOS`; liczby strojenia przez planer eskadry.

import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { isEnemyVessel, hasWeapons, isInService } from '../../entities/Vessel.js';
import { isPlayerColony } from '../../utils/ColonyOwnership.js';
import { systemIdOf } from '../../utils/SystemScope.js';
import { garrisonBodyRecord, garrisonCandidateOrder } from '../../utils/GarrisonPlanner.js';
import { retakeDelayYears, retakeCooldownYears, squadronMaxShips, squadronVerdict } from '../../utils/StrikeWavePlanner.js';

export class DirectorRetake {
  /** @param {object} offensive — `DirectorOffensive` (jedno źródło `requiredSquadron`). */
  constructor(offensive) {
    this._off = offensive;
  }

  _K() { return (typeof window !== 'undefined') ? window.KOSMOS : null; }

  _year() { return this._K()?.timeSystem?.gameTime ?? 0; }

  _capital(empireId) {
    return this._K()?.directorProduction?.capitalOf?.(empireId) ?? null;
  }

  // ── Kandydaci ──────────────────────────────────────────────────────────────────────

  /**
   * Ciała do odbicia: zdobyte przez gracza od imperium w BIEŻĄCEJ wojnie i nadal jego — w kolejności SB57, z oceną czasu.
   * @returns {Array<{body:object, colony:object, systemId:string|null, lossYear:number, lastAttemptYear:number|null,
   *                  isLostCapital:boolean, eligible:boolean, wait:null|'delay'|'cooldown'}>}
   */
  retakeCandidates(empireId) {
    const K = this._K();
    const war = K?.warSystem?.getWarWith?.(empireId);
    if (!empireId || !war?.active) return [];
    const last = new Map();
    for (const e of K.warSystem.getCaptures?.(war.id) ?? []) if (e?.bodyId) last.set(e.bodyId, e);
    const now = this._year();
    const delay = retakeDelayYears();
    const cooldown = retakeCooldownYears();
    const lostCapitals = K?.empireRegistry?.getLostCapitals?.(empireId) ?? [];
    const squadrons = K?.strikeSquadronSystem?.listSquadrons?.(empireId) ?? [];
    const out = [];
    for (const [bodyId, e] of last) {
      if (e.toEmpireId !== 'player' || e.fromEmpireId !== empireId) continue;
      const colony = K?.colonyManager?.getColony?.(bodyId);
      const body = EntityManager.get(bodyId);
      if (!colony || !body || !isPlayerColony(colony)) continue;
      const attempts = squadrons.filter((s) => s.targetBodyId === bodyId && Number.isFinite(s.launchedYear)).map((s) => s.launchedYear);
      const lastAttemptYear = attempts.length ? Math.max(...attempts) : null;
      const lossYear = Number(e.year) || 0;
      const wait = (now - lossYear < delay) ? 'delay'
        : (lastAttemptYear != null && now - lastAttemptYear < cooldown) ? 'cooldown' : null;
      const lost = lostCapitals.filter((c) => c?.bodyId === bodyId);
      out.push({ body, colony, systemId: body.systemId ?? null, lossYear, lastAttemptYear,
                 isLostCapital: lost.length > 0, lostCapitalYear: lost.length ? Math.min(...lost.map((c) => c.year ?? 0)) : null,
                 eligible: wait === null, wait });
    }
    // Utracona stolica najpierw (najwcześniej utracona — pierwsza), potem porządek planera garnizonu (D11).
    const capitals = out.filter((c) => c.isLostCapital).sort((a, b) => a.lostCapitalYear - b.lostCapitalYear);
    const rest = out.filter((c) => !c.isLostCapital);
    const order = garrisonCandidateOrder(rest.map((c, i) => garrisonBodyRecord(c.colony, i)));
    const byId = new Map(rest.map((c) => [c.body.id, c]));
    return [...capitals, ...order.map((id) => byId.get(id)).filter(Boolean)];
  }

  /** Sonda katalogowa `retakeTargets`: ile ciał odbijalnych TERAZ (czas spełniony). */
  countRetakeTargets(empireId) {
    return this.retakeCandidates(empireId).filter((c) => c.eligible).length;
  }

  /** Guard `empireHasNoSquadronUnderway`: żadna eskadra imperium nie jest w drodze. */
  hasNoSquadronUnderway(empireId) {
    return !this._K()?.strikeSquadronSystem?.hasSquadronUnderway?.(empireId);
  }

  // ── Eskorta ────────────────────────────────────────────────────────────────────────

  /** Pula eskorty odbicia (warunki `launchSquadron`): uzbrojone, w służbie, nie strażnicy, w domu, wolne, poza starciem. */
  retakeEscortPool(empireId, target) {
    const K = this._K();
    const cap = this._capital(empireId);
    const capSys = cap ? systemIdOf(EntityManager.get(cap.planetId)) : null;
    if (!capSys) return [];
    const crossSystem = systemIdOf(target?.body) !== capSys;
    const dscs = K?.deepSpaceCombatSystem;
    const out = [];
    for (const v of K?.vesselManager?.getAllVessels?.() ?? []) {
      if (!v || v.isWreck || !isEnemyVessel(v) || (v.ownerEmpireId ?? v.owner) !== empireId) continue;
      if (!hasWeapons(v) || !isInService(v)) continue;
      if (systemIdOf(v) !== capSys) continue;
      if (v.mission || v.movementOrder || v.pendingOrder) continue;
      if (K?.directorDoctrine?.isGuard?.(empireId, v.id)) continue;
      const st = v.position?.state;
      if (st !== 'docked' && st !== 'orbiting') continue;
      if (dscs?._findActiveEncounterContaining?.(v.id)) continue;
      if (crossSystem && !(v.warpFuel?.max > 0)) continue;
      out.push(v);
    }
    return out;
  }

  /** Odczyt konsoli (`printSquadronNeeds`): potrzebne wobec dostępnych dla każdego kandydata, z werdyktem. */
  retakeNeeds(empireId) {
    const underway = !this.hasNoSquadronUnderway(empireId);
    const cap = squadronMaxShips();
    return this.retakeCandidates(empireId).map((c) => {
      const pool = this.retakeEscortPool(empireId, c);
      const need = this._off.requiredSquadron(c, pool);
      const verdict = c.wait ? `czeka_${c.wait}` : underway ? 'eskadra_w_drodze' : squadronVerdict(need.needed, pool.length, cap);
      return { target: c, need, available: pool.length, verdict };
    });
  }

  // ── Plan ───────────────────────────────────────────────────────────────────────────

  /**
   * Plan odbijania TERAZ (bez wysyłki) — JEDNO źródło dla akcji `launchRetake` i pierwszeństwa kampanii (S4/2, SB83:
   * `DirectorCampaign.retakePending`): pierwszy kandydat poza czekaniem (kolejność SB57) w zasięgu sufitu.
   * @returns {{kind:'no_capital'|'none'|'beyond'|'insufficient'|'start', target?:object, pool?:object[], need?:object,
   *            skipped:Array<{bodyId:string, needed:number}>, cap?:number}}
   */
  planRetake(empireId) {
    if (!this._capital(empireId)) return { kind: 'no_capital', skipped: [] };
    const cands = this.retakeCandidates(empireId).filter((c) => c.eligible);
    if (cands.length === 0) return { kind: 'none', skipped: [] };
    const cap = squadronMaxShips();
    const skipped = [];
    for (const c of cands) {
      const pool = this.retakeEscortPool(empireId, c);
      const need = this._off.requiredSquadron(c, pool);
      if (need.needed > cap) { skipped.push({ bodyId: c.body.id, needed: need.needed }); continue; }
      return { kind: pool.length < need.needed ? 'insufficient' : 'start', target: c, pool, need, skipped, cap };
    }
    return { kind: 'beyond', skipped, cap };
  }

  // ── Akcja ──────────────────────────────────────────────────────────────────────────

  /**
   * Akcja `launchRetake`: pierwszy kandydat (kolejność SB57) w zasięgu sufitu dostaje eskadrę (plan — `planRetake`).
   * @returns {{launched:number, reason?:string, squadronId?:string, targetBodyId?:string, needed?:number}}
   */
  launchRetake(ctx = {}) {
    const empireId = ctx?.empireId;
    const year = ctx?.year ?? this._year();
    try {
      const p = this.planRetake(empireId);
      if (p.kind === 'no_capital') return this._refuse(empireId, 'no_capital', year);
      if (p.kind === 'none') return this._refuse(empireId, 'no_target', year);
      if (p.kind === 'beyond') return this._refuse(empireId, 'target_beyond_reach', year, { skipped: p.skipped, cap: p.cap });
      const c = p.target;
      const need = p.need;
      const skipped = p.skipped;
      if (p.kind === 'insufficient') {
        return this._refuse(empireId, 'insufficient_squadron', year, {
          targetBodyId: c.body.id, needed: need.needed, available: p.pool.length, defenderHp: need.defenderHp, skipped,
        });
      }
      const escorts = p.pool.slice(0, need.needed).map((v) => v.id);
      const r = this._K()?.strikeSquadronSystem?.launchSquadron?.(empireId, c.body.id, escorts, { origin: 'retake' });
      if (!r?.ok) {
        return this._refuse(empireId, 'launch_refused', year, { targetBodyId: c.body.id, detail: r?.reason ?? 'no_squadron_system', skipped });
      }
      EventBus.emit('director:retakeLaunched', {
        empireId, year, squadronId: r.squadronId, targetBodyId: c.body.id, targetSystemId: c.systemId,
        lostCapital: c.isLostCapital, needed: need.needed, escorts: [...escorts], wave: r.unitIds?.length ?? 0, skipped,
      });
      return { launched: 1, squadronId: r.squadronId, targetBodyId: c.body.id, needed: need.needed };
    } catch (err) {
      console.error('[DirectorRetake] launchRetake rzucił — odbicie pominięte', err);
      return { launched: 0, reason: 'exception' };
    }
  }

  _refuse(empireId, reason, year, extra = {}) {
    EventBus.emit('director:retakeRefused', { empireId, reason, year, ...extra });
    return { launched: 0, reason, ...extra };
  }
}

export default DirectorRetake;
