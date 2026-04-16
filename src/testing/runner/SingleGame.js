// ═══════════════════════════════════════════════════════════════
// SingleGame — uruchamia jedną grę bot-vs-environment headless
// ─────────────────────────────────────────────────────────────
// Zbiera rich snapshot metrics + event log z EventBus.
// ═══════════════════════════════════════════════════════════════

import EventBus from '../../core/EventBus.js';
import { GameCore } from '../headless/GameCore.js';
import { Ticker } from '../headless/Ticker.js';
import { ActionCatalog } from '../actions/ActionCatalog.js';
import ActionAdapter from '../actions/ActionAdapter.js';
import { GameReport } from '../analytics/Reporter.js';
import { buildObservation } from '../bots/BaseBot.js';
import Snapshot from '../headless/Snapshot.js';

const MAX_EVENTS_PER_GAME = 200;

export function runSingleGame({
  bot,
  civYears = 800,
  decisionsPerCivYear = 1,
  gameId = 'game_' + Date.now(),
  seed = null,
  snapshotInterval = 50,
  onFlag = null,
  bootOptions = {},
  detectors = [],
  scenario = 'new-game',
} = {}) {
  const report = new GameReport({ id: gameId, seed, bot: bot?.name ?? 'Unknown', scenario });

  // Event log — kluczowe milestone'y z EventBus
  const events = [];
  const eventSummary = {
    popBorn: 0, popDied: 0,
    techsResearched: 0,
    vesselsCreated: 0, vesselsLaunched: 0, vesselsArrived: 0, vesselsDocked: 0,
    coloniesFounded: 0, coloniesDestroyed: 0, outpostsFounded: 0,
    observatoryDiscoveries: 0,
    missionsComplete: 0, missionsFailed: 0,
    randomEvents: 0, randomEventsBlocked: 0,
    buildSuccess: 0, buildFailed: 0,
    upgradeSuccess: 0,
    shortages: 0,
    shipsBuiltByType: {},
    techsByBranch: {},
    shortagesByResource: {},
    gameOverReason: null,
  };

  const pushEvent = (type, data = {}) => {
    if (events.length >= MAX_EVENTS_PER_GAME) return;
    events.push({
      civYear: Math.floor((window.KOSMOS?.timeSystem?.gameTime ?? 0) * 12),
      type, ...data,
    });
  };

  // Handlery zostaną podłączone DOPIERO po bootowaniu (EventBus.clear() na start)
  const handlers = [];
  const registerHandler = (event, fn) => {
    EventBus.on(event, fn);
    handlers.push([event, fn]);
  };

  let core, ticker, catalog, lastAction = null;

  try {
    core = new GameCore();
    core.boot({ quiet: true, ...bootOptions });
    ticker = new Ticker(core.timeSystem);
    catalog = new ActionCatalog({
      colonyManager: core.colonyManager,
      techSystem: core.techSystem,
      resourceSystem: core.resourceSystem,
      buildingSystem: core.buildingSystem,
      vesselManager: core.vesselManager,
      civSystem: core.civSystem,
      starSystemManager: core.starSystemManager,
    });

    // ── Event listeners (podłączane PO boot, EventBus już ma listeners systemów) ──
    registerHandler('civ:popBorn', () => { eventSummary.popBorn++; pushEvent('popBorn'); });
    registerHandler('civ:popDied', ({ cause, population }) => {
      eventSummary.popDied++;
      pushEvent('popDied', { cause, remaining: population });
    });
    registerHandler('tech:researched', ({ tech, restored }) => {
      if (restored) return;
      eventSummary.techsResearched++;
      const branch = tech?.branch ?? 'unknown';
      eventSummary.techsByBranch[branch] = (eventSummary.techsByBranch[branch] ?? 0) + 1;
      pushEvent('techResearched', { techId: tech?.id, branch });
    });
    registerHandler('vessel:created', ({ vessel }) => {
      eventSummary.vesselsCreated++;
      pushEvent('vesselCreated', { vesselId: vessel?.id, shipId: vessel?.shipId });
    });
    registerHandler('fleet:shipCompleted', ({ shipId }) => {
      eventSummary.shipsBuiltByType[shipId] = (eventSummary.shipsBuiltByType[shipId] ?? 0) + 1;
    });
    registerHandler('vessel:launched', ({ vessel }) => { eventSummary.vesselsLaunched++; pushEvent('vesselLaunched', { vesselId: vessel?.id }); });
    registerHandler('vessel:arrived', () => eventSummary.vesselsArrived++);
    registerHandler('vessel:docked', () => eventSummary.vesselsDocked++);
    registerHandler('colony:founded', ({ colony }) => {
      eventSummary.coloniesFounded++;
      pushEvent('colonyFounded', { planetId: colony?.planetId, name: colony?.name });
    });
    registerHandler('outpost:founded', ({ colony }) => {
      eventSummary.outpostsFounded++;
      pushEvent('outpostFounded', { planetId: colony?.planetId });
    });
    registerHandler('colony:destroyed', ({ planetId, reason }) => {
      eventSummary.coloniesDestroyed++;
      pushEvent('colonyDestroyed', { planetId, reason });
    });
    registerHandler('observatory:discovered', ({ body }) => {
      eventSummary.observatoryDiscoveries++;
      pushEvent('observatoryDiscovered', { bodyId: body?.id, bodyName: body?.name });
    });
    registerHandler('expedition:missionReport', ({ expedition }) => eventSummary.missionsComplete++);
    registerHandler('expedition:disaster', ({ expedition }) => {
      eventSummary.missionsFailed++;
      pushEvent('missionDisaster', { type: expedition?.type, targetId: expedition?.targetId });
    });
    registerHandler('randomEvent:occurred', ({ event, colonyName }) => {
      eventSummary.randomEvents++;
      pushEvent('randomEvent', { eventId: event?.id, severity: event?.severity, colonyName });
    });
    registerHandler('randomEvent:blocked', () => eventSummary.randomEventsBlocked++);
    registerHandler('planet:buildResult', (data) => {
      if (data?.success) eventSummary.buildSuccess++;
      else eventSummary.buildFailed++;
    });
    registerHandler('planet:upgradeResult', (data) => {
      if (data?.success) eventSummary.upgradeSuccess++;
    });
    registerHandler('resource:shortage', ({ resource }) => {
      eventSummary.shortages++;
      const key = resource ?? 'unknown';
      eventSummary.shortagesByResource[key] = (eventSummary.shortagesByResource[key] ?? 0) + 1;
      pushEvent('shortage', { resource });
    });

    // Game-over tracking
    let gameOverReason = null;
    registerHandler('game:over', ({ reason, planetName }) => {
      gameOverReason = reason;
      eventSummary.gameOverReason = reason;
      pushEvent('gameOver', { reason, planetName });
    });

    // ── Hook co 1 civYear — bot decyzje + snapshots ──
    ticker.onCivYear((civYear) => {
      for (let d = 0; d < decisionsPerCivYear; d++) {
        let action = null;
        try {
          const observation = buildObservation({ core, civYear });
          if (!observation.homeAlive) {
            report.recordError(civYear, new Error('home_planet_lost'), null);
            throw new Error('__game_over__');
          }
          action = bot.decideAction(observation, catalog);
        } catch (err) {
          if (err.message === '__game_over__') throw err;
          report.recordError(civYear, err, null);
          continue;
        }

        if (!action) continue;
        lastAction = action;
        report.recordAction(action.type);

        try {
          ActionAdapter.execute(action);
        } catch (err) {
          report.recordError(civYear, err, action);
        }
      }

      // Rich snapshot metrics co snapshotInterval
      if (snapshotInterval > 0 && civYear % snapshotInterval === 0) {
        const snap = Snapshot.capture(core);
        report.snapshotMetrics(civYear, {
          pop: snap.pop,
          housing: snap.housing,
          prosperity: snap.prosperity,
          morale: snap.morale,
          buildings: snap.buildingCount,
          buildingsByCategory: snap.buildingsByCategory,
          colonies: snap.colonies,
          vessels: snap.vessels,
          missions: snap.missions,
          techs: snap.researchedCount,
          research: snap.researchAmount,
          researchRate: snap.researchPerYear,
          credits: snap.credits,
          energyProduction: snap.energy.production,
          energyConsumption: snap.energy.consumption,
          energyBalance: snap.energy.balance,
          observatoryDiscoveries: snap.observatory.discoveries,
          resFe: snap.inventory.Fe ?? 0,
          resFood: snap.inventory.food ?? 0,
          resWater: snap.inventory.water ?? 0,
          resSi: snap.inventory.Si ?? 0,
          resC: snap.inventory.C ?? 0,
          rateFe: snap.rates.Fe ?? 0,
          rateFood: snap.rates.food ?? 0,
          rateWater: snap.rates.water ?? 0,
          rateResearch: snap.rates.research ?? 0,
        });
      }

      // Detectors
      for (const det of detectors) {
        try {
          const flag = det.check?.(core, civYear, report);
          if (flag) {
            report.addFlag(flag);
            onFlag?.(flag, civYear);
          }
        } catch (err) { /* nie łamaj gry */ }
      }
    });

    // Główny bieg
    const result = ticker.run(civYears, {
      tickSize: 1.0,
      stopOnCrash: false,
      shouldStop: () => !!gameOverReason,
    });

    // Finish
    let outcome = 'finished';
    if (gameOverReason) outcome = 'game_over';
    else if (result.crashed) {
      outcome = 'crash';
      if (result.error) report.recordError(result.civYearsCompleted, result.error, lastAction);
    } else if (result.civYearsCompleted < civYears * 0.9) {
      outcome = 'timeout';
    }

    // Final snapshot — pełen obraz końcowy
    const finalSnap = Snapshot.capture(core);
    report.finish(outcome, result.civYearsCompleted, {
      pop: finalSnap.pop,
      housing: finalSnap.housing,
      prosperity: finalSnap.prosperity,
      morale: finalSnap.morale,
      colonies: finalSnap.colonies,
      coloniesList: finalSnap.coloniesList,
      vessels: finalSnap.vessels,
      missions: finalSnap.missions,
      techs: finalSnap.researchedCount,
      techList: finalSnap.researched,
      credits: finalSnap.credits,
      buildings: finalSnap.buildingCount,
      buildingsByCategory: finalSnap.buildingsByCategory,
      energy: finalSnap.energy,
      inventory: finalSnap.inventory,
      rates: finalSnap.rates,
      observatory: finalSnap.observatory,
      empires: finalSnap.empires,
      gameOverReason,
    });

    // Attach event log + summary
    report.events = events;
    report.eventSummary = eventSummary;

  } catch (err) {
    if (err.message !== '__game_over__') {
      report.recordError(0, err, lastAction);
      report.finish('crash', 0, null);
    } else {
      report.finish('game_over', ticker?._civYearsElapsed ?? 0, null);
    }
    report.events = events;
    report.eventSummary = eventSummary;
  } finally {
    // Odpisz handlery aby nie wyciekły do kolejnych gier w tym samym procesie
    for (const [event, fn] of handlers) {
      try { EventBus.off(event, fn); } catch {}
    }
  }

  return report;
}
