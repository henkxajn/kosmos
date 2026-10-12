// AI STRIKES BACK S3 (SB54, SB45, Finding 420) — WSPÓLNA CHWILA PRZYLOTU GRUPY DO CIAŁA.
//
// Grupa statków leci do ciała tak, by przylecieć RAZEM: chwila przylotu jest jedna dla wszystkich i ustala ją najwolniejszy
// członek (najpóźniejsze z najwcześniejszych przechwyceń), a w tej chwili ciało musi być osiągalne dla KAŻDEGO członka —
// przy ciele szybszym od statków najwcześniejsza chwila jednego członka bywa nieosiągalna dla innego, więc szukamy w przód,
// aż chwila jest wspólna. Przechwycenie członka liczy `VesselManager._interceptBody` (SB39) — ta sama funkcja, z której
// `MovementOrderSystem._issueMoveToPoint` liczy przylot członka z `_arrivalSyncYear` (`notBefore`): przechwycenie
// z `notBefore` równym chwili osiągalnej zwraca DOKŁADNIE tę chwilę, więc każdy członek przylatuje w chwili grupy.
// Jeden pomocnik dla flot gracza (`FleetSystem.issueFleetOrder`, Finding 420) i dla grupy AI (`OrderService`, SB54).
// ⚠ Moduł nie zna `window`: menedżer statków przychodzi jako argument (wzór `GarrisonPlanner`).
// ⚠ Wejścia członka (pozycja, prędkość, układ) MUSZĄ być te same co w `_issueMoveToPoint` — inaczej chwila grupy rozjedzie
//   się z chwilą rozkazu członka.

/** Najwięcej kroków szukania wspólnej chwili (każdy krok przesuwa chwilę w przód; horyzont `_interceptBody` gwarantuje koniec). */
export const GROUP_ARRIVAL_MAX_ITER = 64;

/** Wejścia przechwycenia członka — lustro `MovementOrderSystem._issueMoveToPoint` (start, prędkość, układ trasy). */
function memberInput(v) {
  return {
    x: v.position?.x, y: v.position?.y,
    speed: Math.max(0.01, v.speedAU ?? 1.0),
    systemId: v.systemId ?? 'sys_home',
  };
}

/**
 * Wspólna chwila przylotu grupy do ciała.
 * @param {object} vm — menedżer statków (`_interceptBody`)
 * @param {string} bodyId
 * @param {object[]} vessels
 * @param {{now?:number, notBefore?:number, maxBoost?:number, maxIter?:number}} [opts]
 *   `now` — bieżący rok gry (do klamry); `notBefore` — przylot nie wcześniej; `maxBoost` — klamra flot gracza
 *   (`FleetSystem.MAX_SYNC_BOOST_FACTOR`): członek, którego najwcześniejsze przechwycenie leży dalej niż `maxBoost ×`
 *   najkrótszy czas lotu w grupie, nie wstrzymuje reszty (przylatuje sam, później) — wzór klamry sprzed SB54. Bez klamry
 *   chwilę ustala najwolniejszy (grupa AI).
 * @returns {{arrivalYear:number, earliest:Object<string,number>, core:string[], outliers:string[], iterations:number,
 *            converged:boolean} | null}  `null` — brak menedżera, ciała albo przechwycenia któregoś członka
 */
export function groupArrivalYear(vm, bodyId, vessels, opts = {}) {
  if (typeof vm?._interceptBody !== 'function' || !bodyId) return null;
  const list = (vessels ?? []).filter(Boolean);
  if (list.length === 0) return null;
  const maxIter = Number.isFinite(opts.maxIter) ? opts.maxIter : GROUP_ARRIVAL_MAX_ITER;
  const intercept = (v, notBefore) => {
    const m = memberInput(v);
    const r = vm._interceptBody(bodyId, m.x, m.y, m.speed, { systemId: m.systemId, notBefore });
    return (r && Number.isFinite(r.arrivalYear)) ? r.arrivalYear : null;
  };

  const earliest = {};
  for (const v of list) {
    const t = intercept(v, opts.notBefore);
    if (t === null) return null;
    earliest[v.id] = t;
  }

  let core = list;
  let outliers = [];
  if (Number.isFinite(opts.maxBoost)) {
    const now = Number.isFinite(opts.now) ? opts.now : 0;
    const minDur = Math.max(0.001, Math.min(...list.map(v => earliest[v.id] - now)));
    const cutoff = now + minDur * opts.maxBoost;
    core = list.filter(v => earliest[v.id] <= cutoff);
    outliers = list.filter(v => earliest[v.id] > cutoff).map(v => v.id);
  }

  let T = Math.max(...core.map(v => earliest[v.id]));
  let iterations = 0;
  let converged = false;
  for (; iterations < maxIter; iterations++) {
    let next = T;
    for (const v of core) {
      const t = intercept(v, T);
      if (t === null) return null;
      if (t > next) next = t;
    }
    if (next <= T) { converged = true; break; }
    T = next;
  }
  return { arrivalYear: T, earliest, core: core.map(v => v.id), outliers, iterations, converged };
}
