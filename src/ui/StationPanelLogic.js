// StationPanelLogic — czyste helpery dla StationPanel (S4-2). Bez zależności UI/DOM,
// testowalne headless (wzór POIPanelLogic/POIFormLogic). Dwie funkcje: klasyfikacja
// zawartości depotu (surowce vs towary) i zbiórka statków handlowych powiązanych ze stacją.

import { COMMODITIES } from '../data/CommoditiesData.js';

/**
 * Podziel zawartość depotu stacji na surowce vs towary.
 * Towar = id istnieje w COMMODITIES; reszta (Fe/Ti/Cu/Si, minerals, energy…) = surowiec.
 * Pomija wpisy z amount <= 0.
 * @param {Array<[string, number]>} entries — [...station.depot.inventory]
 * @returns {{ resources: Array<[string,number]>, commodities: Array<[string,number]> }}
 */
export function classifyStationDepot(entries) {
  const resources = [];
  const commodities = [];
  for (const [id, amt] of (entries ?? [])) {
    if (!(amt > 0)) continue;
    if (id in COMMODITIES) commodities.push([id, amt]);
    else resources.push([id, amt]);
  }
  return { resources, commodities };
}

/**
 * Zbierz statki handlowe powiązane ze stacją — LIVE snapshot (brak historii przepływów,
 * patrz audyt §4). Dokowane = autorytatywne z VesselManager (position.dockedAt). Inbound/
 * outbound = aktywne misje transportu: targetId to bieżący leg, loopTargetId to stały cel pętli.
 *   - targetId === stationId               → leci DO stacji  (inbound)
 *   - loopTargetId === stationId,           → pętla wraca OD stacji (outbound)
 *     a targetId !== stationId
 * Statek już policzony jako docked nie jest dublowany.
 * @param {string} stationId
 * @param {{ vesselManager?, missionSystem? }} deps
 * @returns {Array<{ vesselId:string, name:string, status:'docked'|'inbound'|'outbound' }>}
 */
export function gatherStationTraders(stationId, { vesselManager, missionSystem } = {}) {
  const out = [];
  const seen = new Set();

  // 1) Dokowane — autorytatywne (statek fizycznie zacumowany przy stacji).
  for (const v of (vesselManager?.getAllVessels?.() ?? [])) {
    if (v?.position?.dockedAt === stationId) {
      out.push({ vesselId: v.id, name: v.name ?? v.id, status: 'docked' });
      seen.add(v.id);
    }
  }

  // 2) W locie — aktywne misje celujące w stację (bieżący leg / cel pętli).
  for (const m of (missionSystem?.getActive?.() ?? [])) {
    const toStation   = m.targetId === stationId;
    const fromStation = m.loopTargetId === stationId && m.targetId !== stationId;
    if (!toStation && !fromStation) continue;
    if (seen.has(m.vesselId)) continue;                 // już policzony jako docked
    const v = vesselManager?.getVessel?.(m.vesselId);
    out.push({
      vesselId: m.vesselId,
      name:     v?.name ?? m.vesselId,
      status:   toStation ? 'inbound' : 'outbound',
    });
    seen.add(m.vesselId);
  }

  return out;
}
