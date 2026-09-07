// VesselGroupActions — JEDNO źródło rozkazów grupowych, których cel nie jest wskazywany
// kliknięciem w mapę (przypisanie do floty, dokowanie przez picker).
//
// PO CO TO POWSTAŁO (bilans duplikacji tego slice'u jest UJEMNY):
//   Przed 258 „Dokuj" istniał w DWÓCH niemal znak-w-znak kopiach — `FleetGroupPanel` (`grpDock`)
//   i `FleetCommandPanel` (`bgDock`): ten sam `getDockTargets()`, ten sam `showBodyPickerModal`,
//   ta sama pętla `issueOrder({type:'dock'})`, ten sam klucz `fleetGroup.dockFailed`.
//   „→ Flota" istniała w jednej. Dołożenie footera do panelu statku nad mapą zrobiłoby z docka
//   TRZECIĄ kopię, a z „→ Flota" DRUGĄ. Zamiast tego zwijamy do jednego źródła:
//   dock 2 → 1, „→ Flota" zostaje 1, „Odwrót" nigdy kopią nie był (to dwie linie do MOS,
//   a pod nim `resolveShelterOrderSpec` jest już jedynym źródłem doboru schronienia).
//
// ⚠ `sameSystemOnly` TO UCZCIWY SZEW FINDINGU 256, NIE TCHÓRZOSTWO.
//   `getDockTargets()` (`BodyName.js:47`) listuje kolonie i stacje gracza BEZ terminu układu,
//   a `MovementOrderSystem._issueDock` zrzuca `targetBodyId` przed `_issueMoveToPoint`, więc
//   bramka W3-4b nigdy tego celu nie ogląda ⇒ cel z OBCEGO układu przechodzi (zmierzone:
//   `{ok:true}`, `_pendingDock = p_home`). NOWA powierzchnia (panel mapy) przekazuje `true`.
//   DWIE ISTNIEJĄCE przekazują `false` = zachowanie dzisiejsze BIT W BIT — ich zmiana to
//   zadanie Findingu 256, nie tego slice'u. Naprawa 256 = przełączenie argumentu + zdjęcie flagi.

import EventBus            from '../core/EventBus.js';
import EntityManager       from '../core/EntityManager.js';
import { THEME }           from '../config/ThemeConfig.js';
import { t }               from '../i18n/i18n.js';
import { systemIdOf }      from '../utils/SystemScope.js';
import { resolveBodyName, resolveBodyPos, getDockTargets } from '../utils/BodyName.js';
import { showBodyPickerModal } from './BodyPickerModal.js';
import { showFleetAssignModal } from './FleetAssignModal.js';
import { showRenameModal } from './ModalInput.js';

/**
 * Odsiew celów dokowania do układu statku (Finding 256, szew `sameSystemOnly`).
 * CZYSTA funkcja poza odczytem `EntityManager` — `getDockTargets()` zwraca same id/nazwy,
 * więc układ trzeba rozwiązać z encji.
 *
 * ⚠ `systemId === null` znaczy TRANZYT MIĘDZYGWIEZDNY, nie „nie wiem" — statek między układami
 *   nie ma „tutaj", więc nie ma czego dokować (wzór `RetreatTarget.bodiesInSystemOf`).
 *
 * @param {Array<{id:string}>} targets
 * @param {object|null} vessel
 * @param {boolean} sameSystemOnly
 * @returns {Array<{id:string}>}
 */
export function filterDockTargets(targets, vessel, sameSystemOnly) {
  const list = targets ?? [];
  if (!sameSystemOnly) return list;                 // zachowanie sprzed 258 (dwie stare powierzchnie)
  if (!vessel) return list;
  const sys = systemIdOf(vessel);
  if (sys == null) return [];                       // tranzyt warp — brak „tutaj"
  return list.filter((tg) => {
    const ent = EntityManager.get(tg.id);
    return ent ? systemIdOf(ent) === sys : false;
  });
}

/**
 * Rozkaz dokowania dla zbioru statków — JEDYNA implementacja w repo.
 * Kształt spec-a jest DOKŁADNIE ten, który miały obie stare kopie (pin P8).
 *
 * @returns {{ okCount:number, firstFail:(string|null) }}
 */
export function dispatchDockTo(vesselIds, bodyId) {
  const mos = window.KOSMOS?.movementOrderSystem;
  const pos = resolveBodyPos(bodyId);
  if (!pos) return { okCount: 0, firstFail: 'target_not_found' };
  const name = resolveBodyName(bodyId);
  let okCount = 0, firstFail = null;
  for (const id of (vesselIds ?? [])) {
    const r = mos?.issueOrder?.(id, { type: 'dock', targetBodyId: bodyId, targetName: name, targetPoint: pos });
    if (r?.ok) okCount++;
    else if (!firstFail) firstFail = r?.reason ?? null;
  }
  if (okCount === 0 && firstFail) {
    EventBus.emit('ui:toast', { text: t('fleetGroup.dockFailed', firstFail), color: '#ff4466', durationMs: 3500 });
  }
  return { okCount, firstFail };
}

/**
 * Picker dokowania + wysyłka rozkazu. Zwraca Promise (dla spójności z resztą modali).
 * @param {string[]} vesselIds
 * @param {{ sameSystemOnly?: boolean, vessel?: object, onDone?: Function }} [opts]
 */
export function openDockPicker(vesselIds, opts = {}) {
  const ids = vesselIds ?? [];
  if (ids.length === 0) return Promise.resolve(null);
  const bodies = filterDockTargets(getDockTargets(), opts.vessel ?? null, opts.sameSystemOnly === true);
  return showBodyPickerModal(bodies, 'bodyPicker.dockTitle').then((choice) => {
    if (!choice?.bodyId) return null;
    const res = dispatchDockTo(ids, choice.bodyId);
    opts.onDone?.(res);
    return res;
  });
}

/**
 * Przypisanie zbioru statków do floty (istniejącej albo nowej) — JEDYNA implementacja.
 * @param {string[]} vesselIds
 * @param {{ onDone?: Function }} [opts]
 */
export function assignVesselsToFleet(vesselIds, opts = {}) {
  const fSys = window.KOSMOS?.fleetSystem;
  const ids = vesselIds ?? [];
  if (!fSys || ids.length === 0) return Promise.resolve(null);
  const fleets = fSys.listFleets?.() ?? [];
  return showFleetAssignModal(fleets).then(async (choice) => {
    if (!choice) return null;
    let targetFleetId = choice.fleetId;
    if (choice.action === 'new') {
      const name = await showRenameModal(t('fleet.newFleetDefaultName'));
      if (!name?.trim()) return null;
      targetFleetId = fSys.createFleet(name.trim())?.id;
    }
    if (!targetFleetId) return null;
    let accepted = 0;
    for (const vid of ids) {
      if (fSys.addMember(targetFleetId, vid)?.ok) accepted++;
    }
    const fleet = fSys.getFleet?.(targetFleetId);
    window.KOSMOS?.uiManager?.setSelectedFleetId?.(targetFleetId);
    EventBus.emit('ui:toast', {
      text: t('fleetGroup.assignedToFleet', accepted, fleet?.name ?? ''),
      color: THEME.accent, durationMs: 2500,
    });
    opts.onDone?.({ fleetId: targetFleetId, accepted });
    return { fleetId: targetFleetId, accepted };
  });
}
