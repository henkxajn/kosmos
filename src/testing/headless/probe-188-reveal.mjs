// SONDA (read-only, do skasowania): czy `_drawStratcomDetail` da sie uruchomic headless?
import './env.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import EntityManager from '../../core/EntityManager.js';

const texts = [];
const ctx = new Proxy({}, { get: (_, p) => {
  if (p === 'fillText') return (s) => texts.push(String(s));
  if (p === 'measureText') return () => ({ width: 40 });
  if (p === 'createRadialGradient') return () => ({ addColorStop() {} });
  if (p === 'canvas') return { width: 1280, height: 720 };
  return () => {};
}, set: () => true });

window.KOSMOS = {
  intelSystem:   { isAtLeast: (id, lvl) => id === 'emp_001' && lvl === 'rumor' },
  empireRegistry:{ get: () => ({ name: 'Krolestwo Wezen', archetype: 'militarist' }) },
  diplomacySystem:{ getTension: () => 72 },
  territoryService:{ getSystemOwner: () => null, getEmpireColor: () => '#fff' },
  observatorySystem: { getSystemScanResult: () => null, getSystemScanProgress: () => null, getMaxSystemScanTier: () => 0 },
};

const sys = { id: 'sys_036', name: 'Wezen', empireId: 'emp_001', isHome: false, explored: false, colorHex: 0x88aaff };
const colMgr = {
  activePlanetId: 'p_home',
  getAllColonies: () => [{ planetId: 'p_ai', civSystem: { population: 55 } }],
};
EntityManager.add({ id: 'p_ai', type: 'planet', systemId: 'sys_036', lifeScore: 80 });

const o = Object.create(FleetManagerOverlay.prototype);
o._hitZones = [];
o._selectedStratcomShipId = null;
try {
  o._drawStratcomDetail(ctx, 0, 0, 400, 600, sys, { getSystem: () => null }, { getAvailable: () => [] }, colMgr);
  console.log('DRAW OK. Wiersze panelu:');
  for (const t of texts) console.log('   |', t);
} catch (e) { console.log('DRAW FAIL:', e.message); }
