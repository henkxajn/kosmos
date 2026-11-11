// RendezvousDebug — Finding 663 (MECHANIKA, poza arciem CV): pomocniki kontroli właściciela „leć do ciała” (konsola, bez
// cudzysłowów). Reguły i pokrętła: `src/data/RendezvousData.js` (alias `KOSMOS.rendezvousTuning`).
//
//   KOSMOS.debug.rendezvousPlace(0.8)    — ZAZNACZONY statek gracza stawia `d` AU ZA najbliższą planetą jego układu (wolny: bez
//                                          orbity, misji i rozkazu); drugi argument 1 — PRZED planetą; trzeci N ≥ 1 — N-ta planeta
//                                          licząc od gwiazdy zamiast najbliższej (planety wewnętrzne okrążają szybko — spotkanie po
//                                          jednym okrążeniu mieści się w horyzoncie; odmowę widać przy planecie dalszej). Wypisuje
//                                          planetę, jej okres i to, co da rozkaz „Lecisz do planety” (przy ciele / lot / odmowa).
//   KOSMOS.debug.rendezvousInfo()        — zaznaczony statek: wynik tego rozkazu dla każdej planety i księżyca w jego układzie.
// ⚠ `rendezvousPlace` zmienia stan gry (jak `cvBattle`): autozapis wyłączony do F5 — nie zapisuj gry po teście.

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { systemIdOf } from '../utils/SystemScope.js';

const AU = GAME_CONFIG.AU_TO_PX;

/** Wynik rozkazu „Lecisz do planety” dla statku i ciała — bez wydawania rozkazu (te same pomocniki co MOS). */
function predictOutcome(vm, v, bodyId) {
  if (vm._rendezvousCapture?.(v, bodyId)) return { wynik: 'przy ciele — orbita od razu' };
  const refusal = vm._rendezvousRefusal?.(v, bodyId) ?? null;
  if (refusal) return { wynik: 'odmowa', etaLat: +refusal.etaYears.toFixed(2), limitLat: +refusal.horizonYears.toFixed(2) };
  const ic = vm._interceptBody?.(bodyId, v.position.x, v.position.y, Math.max(0.01, v.speedAU ?? 1), { systemId: v.systemId ?? 'sys_home' });
  const now = window.KOSMOS?.timeSystem?.gameTime ?? 0;
  return ic ? { wynik: 'lot', etaLat: +(ic.arrivalYear - now).toFixed(2) } : { wynik: 'brak przechwycenia' };
}

function selectedPlayerVessel() {
  const K = window.KOSMOS ?? {};
  const v = K.vesselManager?.getVessel?.(K.uiManager?.getSelectedVesselId?.() ?? null) ?? null;
  if (!v) return { err: 'no_selected_vessel' };
  if (isEnemyVessel(v) || v.isWreck) return { err: 'not_player_vessel' };
  return { v };
}

export function rendezvousDebugHelpers({ getSaveSystem = () => null } = {}) {
  return {
    rendezvousPlace(dAU = 0.8, ahead = 0, nth = 0) {
      const K = window.KOSMOS ?? {};
      const vm = K.vesselManager;
      const { v, err } = selectedPlayerVessel();
      if (err) { console.warn('[rendezvousPlace]', err); return { ok: false, reason: err }; }
      const sys = systemIdOf(v);
      const planets = EntityManager.getByType('planet').filter(p => p?.orbital && systemIdOf(p) === sys && Number.isFinite(p.x));
      if (planets.length === 0) return { ok: false, reason: 'no_planet_in_system' };
      const byStar = [...planets].sort((a, b) => (a.orbital.a ?? 0) - (b.orbital.a ?? 0));
      const p = Number(nth) >= 1
        ? byStar[Math.min(byStar.length, Math.floor(Number(nth))) - 1]
        : planets.reduce((a, b) => (Math.hypot(b.x - v.position.x, b.y - v.position.y) < Math.hypot(a.x - v.position.x, a.y - v.position.y) ? b : a));
      const now = K.timeSystem?.gameTime ?? 0;
      const q = vm._predictPosition(p.id, now + 1e-4);
      let ux = q.x - p.x, uy = q.y - p.y; const n = Math.hypot(ux, uy) || 1; ux /= n; uy /= n;
      const sgn = Number(ahead) === 1 ? 1 : -1;
      // statek wolny w punkcie: bez rozkazu, misji, slotu orbity
      K.movementOrderSystem?.cancelOrder?.(v.id, 'debug_rendezvous_place');
      K.orbitalSpaceSystem?.releaseOrbit?.(v.id);
      delete v._suspendedMission;
      v.mission = null; v.status = 'idle';
      v.position.x = p.x + sgn * ux * Number(dAU) * AU;
      v.position.y = p.y + sgn * uy * Number(dAU) * AU;
      v.position.state = 'orbiting'; v.position.dockedAt = null;
      EventBus.emit('vessel:positionUpdate', { vessels: [v] });
      const ss = getSaveSystem();
      if (ss && '_autosaveInterval' in ss) ss._autosaveInterval = 0;   // tylko w pamięci — F5 przywraca ustawienie z menu
      const out = { ok: true, statek: v.name, planeta: p.name, planetaNr: byStar.indexOf(p) + 1, okresLat: +(p.orbital.T ?? 0).toFixed(2),
        odleglosc: Number(dAU), strona: sgn > 0 ? 'przed' : 'za',
        rozkaz: predictOutcome(vm, v, p.id), autozapis: ss ? 'off (do F5)' : 'n/a' };
      console.log('[rendezvousPlace]', out, '— prawy klik na planecie → „Lecisz do planety”; nie zapisuj gry po teście');
      return out;
    },

    rendezvousInfo() {
      const vm = window.KOSMOS?.vesselManager;
      const { v, err } = selectedPlayerVessel();
      if (err) { console.warn('[rendezvousInfo]', err); return { ok: false, reason: err }; }
      const sys = systemIdOf(v);
      const rows = [...EntityManager.getByType('planet'), ...EntityManager.getByType('moon')]
        .filter(b => systemIdOf(b) === sys && Number.isFinite(b.x))
        .map(b => ({ cialo: b.name, odlAU: +(Math.hypot(b.x - v.position.x, b.y - v.position.y) / AU).toFixed(2), ...predictOutcome(vm, v, b.id) }))
        .sort((a, b) => a.odlAU - b.odlAU);
      console.table(rows);
      return rows;
    },
  };
}
