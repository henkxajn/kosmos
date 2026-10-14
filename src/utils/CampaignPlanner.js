// CampaignPlanner — KAMPANIA AI układ po układzie: czysty porządek celów i odczyt kluczy strojenia
// (AI STRIKES BACK S4/2 — decyzje SB10, SB83, SB84).
//
// Odpowiada na pytanie „W JAKIEJ KOLEJNOŚCI imperium bierze ciała gracza”. NICZEGO nie wysyła — wysyłka eskadry to
// `DirectorCampaign.launchCampaign` (→ `StrikeSquadronSystem.launchSquadron`).
//
// PORZĄDEK (SB84, 2026-10-14 — „nearest player system first; inside it outposts, then colonies, player's capital last”):
//   1. układ gracza bliżej stolicy imperium pierwszy (odległość w LY, metryka 3D — `InfluenceMath.distanceLY`);
//      remis odległości — id układu;
//   2. w układzie: placówki, potem kolonie, stolica gracza na końcu;
//   3. w tej samej klasie: tańszy do wzięcia pierwszy (mniej potrzebnych okrętów eskadry), potem id ciała (determinizm —
//      ten sam zapis daje po wczytaniu ten sam cel).
// ⚠ Rozstrzygnięcie remisu w klasie (koszt, potem id) to WYBÓR IMPLEMENTACJI S4/2, nie decyzja właściciela — przy regule
//   „cel w zasięgu sufitu przy za małej puli: odmowa i czekanie” (jak odbijanie, SB71) tańszy cel pierwszy nie zatrzymuje
//   kampanii na droższej placówce, gdy obok stoi tańsza.
// ⚠ PLANER NIE ZNA `window` (wzór `StrikeWavePlanner`, `GarrisonPlanner`): rekordy dostaje gotowe. Zero importów — klucze
//   strojenia kampanii czyta `StrikeWavePlanner` (jedyny czytelnik tabeli po stronie eskadry — pin `sb1_fleet_tuning` T11b).

/** Klasy celu kampanii w porządku SB84: placówka → kolonia → stolica gracza. */
export const CAMPAIGN_CLASS_RANK = Object.freeze({ outpost: 0, colony: 1, capital: 2 });

/** Klasa celu: stolica gracza (kolonia macierzysta) — `capital`; placówka — `outpost`; inaczej `colony`. */
export function campaignClass({ capital = false, outpost = false } = {}) {
  if (capital) return 'capital';
  return outpost ? 'outpost' : 'colony';
}

const num = (x, fb) => (Number.isFinite(x) ? x : fb);

/**
 * Porządek celów kampanii (kopia, wejście nietknięte).
 * @param {Array<{bodyId:string, systemId:string|null, distLY:number, capital?:boolean, outpost?:boolean, needed?:number}>} records
 * @returns {Array} te same rekordy w porządku SB84
 */
export function orderCampaignTargets(records) {
  return [...(records ?? [])].sort((a, b) =>
    (num(a.distLY, Infinity) - num(b.distLY, Infinity))
    || String(a.systemId ?? '').localeCompare(String(b.systemId ?? ''))
    || (CAMPAIGN_CLASS_RANK[campaignClass(a)] - CAMPAIGN_CLASS_RANK[campaignClass(b)])
    || (num(a.needed, Infinity) - num(b.needed, Infinity))
    || String(a.bodyId ?? '').localeCompare(String(b.bodyId ?? '')));
}
