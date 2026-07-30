// ── Czysta logika linii efektów środowiskowych do UI (bez THREE — headless-testowalna) ──
// C3 — pod-linie „warunek → efekt" pod wierszami charakterystyki w zakładce Planeta
// (ColonyOverlay). Wzór modułowy jak DepositReadoutLogic (C2): logika zwraca surowe tokeny
// {key, params, tone}; UI składa napisy przez t() i decyduje o kolorze/pozycji.
//
// Źródło couplingów = audyt §5. Renderujemy WYŁĄCZNIE aktywne sprzężenia z listy zadania:
//   • wzrost planetMod (temp×atmo×grav, clamp 0.6–1.0) — NIE przeliczamy: planetMod PRZEKAZANY
//     z CivilizationSystem.getGrowthBreakdown() (to samo źródło co tooltip wzrostu w Załodze),
//   • twardy cap habitatów (atmo ≠ breathable) — blockReason 'no_habitat' z getGrowthBreakdown(),
//   • dopłata kosztu BUDOWY (grav/atmo/temp) — EnvironmentCost *_SURCHARGE (pasmo → frakcja),
//   • bramka Farmy (atmo none / temp < 0) — HexTile requiresOpenAirClimate,
//   • bramka Studni (brak wody powierzchniowej) — HexTile requiresWater,
//   • mnożnik paliwa STARTU (pasmo grawitacji) — LaunchFuelCost,
//   • kara żywności open-air na rzadkiej atmosferze (×0.5) — BuildingSystem.
// ŚWIADOMIE POMIJAMY (poza listą couplingów zadania / martwy kod): popyt dóbr konsumpcyjnych,
// potrzeby przetrwania, konsumpcję POP, satysfakcję, +5 Si quirk, redystrybucję kafelków
// worldgenu ORAZ _housingGrowthModifier/_foodGrowthModifier/_calcStrataGrowthRate (nigdy wołane).

import { gravityBand, temperatureBand } from '../data/EnvironmentBands.js';
import { GRAVITY_SURCHARGE, ATMOSPHERE_SURCHARGE, TEMPERATURE_SURCHARGE } from '../data/EnvironmentCost.js';
import { LAUNCH_FUEL_GRAVITY_MULT } from '../data/LaunchFuelCost.js';

// Dopłata kosztu → „+40%" (zaokrąglona do %). Pokazuje FRAKCJĘ pasma (dopłata przy sensitivity=1,
// czyli najmocniej odczuwająca kategoria, np. górnictwo dla grawitacji) — headline honesty §5.
const pctStr  = (frac) => '+' + Math.round(frac * 100) + '%';
const multStr = (m, dp = 1) => '×' + m.toFixed(dp);   // ×1.5 / ×0.7 (paliwo), ×0.90 (wzrost, dp=2)

/**
 * Deskryptory linii efektów środowiskowych dla zakładki Planeta.
 * @param {object} planet — encja planety (temperatureC, surfaceGravity, atmosphere, surface.hasWater)
 * @param {?{planetMod:number, blockReason:?string}} growthInfo — wyjęte z civ.getGrowthBreakdown()
 *        (null gdy brak civSystem — outpost/podgląd → linia wzrostu pominięta)
 * @returns {?{temperature:object, gravity:object, atmosphere:object, water:object, growth:?object}}
 *          null gdy brak planety. `effects` = tablica tokenów {key, params, tone}; tone ∈
 *          'bad'|'good'|'gate' (UI: gate → akcent ostrzegawczy, reszta → przygaszona).
 */
export function computeEnvironmentEffects(planet, growthInfo = null) {
  if (!planet) return null;

  const tempC    = planet.temperatureC ?? planet.surface?.temperature ?? 0;
  const atmo     = planet.atmosphere || 'none';
  const grav     = planet.surfaceGravity ?? 1;
  const hasWater = !!planet.surface?.hasWater;

  const gBand = gravityBand(grav);        // low | normal | high
  const tBand = temperatureBand(tempC);   // cold | moderate | hot

  // ── Temperatura ── dopłata kosztu (pasmo) + bramka Farmy (temp < 0, NIEZALEŻNA od pasma cold) ──
  const tempEffects = [];
  const tSur = TEMPERATURE_SURCHARGE[tBand] ?? 0;
  if (tSur > 0)  tempEffects.push({ key: 'colonyInfo.env.buildCost', params: [pctStr(tSur)], tone: 'bad' });
  if (tempC < 0) tempEffects.push({ key: 'colonyInfo.env.farmBlocked', params: [], tone: 'gate' });

  // ── Grawitacja ── dopłata kosztu (pasmo) + mnożnik paliwa startu (pasmo) ──
  const gravEffects = [];
  const gSur = GRAVITY_SURCHARGE[gBand] ?? 0;
  if (gSur > 0) gravEffects.push({ key: 'colonyInfo.env.buildCost', params: [pctStr(gSur)], tone: 'bad' });
  const fuelMult = LAUNCH_FUEL_GRAVITY_MULT[gBand] ?? 1;
  if (fuelMult !== 1) {
    gravEffects.push({ key: 'colonyInfo.env.launchFuel', params: [multStr(fuelMult)], tone: fuelMult > 1 ? 'bad' : 'good' });
  }

  // ── Atmosfera ── dopłata kosztu + bramka Farmy (none) + kara żywności open-air (thin) ──
  const atmoEffects = [];
  const aSur = ATMOSPHERE_SURCHARGE[atmo] ?? 0;
  if (aSur > 0)          atmoEffects.push({ key: 'colonyInfo.env.buildCost', params: [pctStr(aSur)], tone: 'bad' });
  if (atmo === 'none')   atmoEffects.push({ key: 'colonyInfo.env.farmBlocked', params: [], tone: 'gate' });
  if (atmo === 'thin')   atmoEffects.push({ key: 'colonyInfo.env.openAirFood', params: [], tone: 'bad' });

  // ── Woda ── bramka Studni (brak wody powierzchniowej) ──
  const waterEffects = [];
  if (!hasWater) waterEffects.push({ key: 'colonyInfo.env.wellBlocked', params: [], tone: 'gate' });

  // ── Wzrost (łączny planetMod + twardy cap habitatów) — jedno źródło z tooltipem Załogi ──
  // planetMod to ILOCZYN (clamp) 3 pasm — cało-planetarny, więc osobna linia (nie per-warunek).
  // Format ×.toFixed(2) IDENTYCZNY jak _growthTooltip → wartości zawsze zgodne.
  let growth = null;
  if (growthInfo) {
    if (growthInfo.blockReason === 'no_habitat') {
      growth = { key: 'colonyInfo.env.growthHalted', params: [], tone: 'gate' };
    } else if (typeof growthInfo.planetMod === 'number' && growthInfo.planetMod < 0.999) {
      growth = { key: 'colonyInfo.env.growthMod', params: [multStr(growthInfo.planetMod, 2)], tone: 'bad' };
    }
  }

  return {
    temperature: { bandKey: 'colonyInfo.env.temp.' + tBand, effects: tempEffects },
    gravity:     { bandKey: 'colonyInfo.env.grav.' + gBand, effects: gravEffects },
    atmosphere:  { effects: atmoEffects },
    water:       { hasWater, effects: waterEffects },
    growth,
  };
}
