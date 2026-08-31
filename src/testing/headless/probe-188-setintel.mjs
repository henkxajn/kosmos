// SONDA: czy mechanizm `KOSMOS.debug.setIntel` (reset surowy + podniesienie PRODUKCYJNA sciezka)
// daje stan bit w bit taki, jaki gra produkuje naturalnie? Weryfikacja przed oddaniem gate'u.
import './env.js';
import gameState from '../../core/GameState.js';
import { IntelSystem } from '../../systems/IntelSystem.js';

const EMP = 'emp_001';
window.KOSMOS = {
  empireRegistry: { get: (id) => (id === EMP ? { id: EMP, name: 'Wezen', colonies: ['p_ai'] } : null),
                    listAll: () => [{ id: EMP, name: 'Wezen', colonies: ['p_ai'] }] },
  colonyManager:  { getColony: () => ({ systemId: 'sys_036' }) },
  threatAssessment: { getStrength: () => 42 },
};
const intel = new IntelSystem();
window.KOSMOS.intelSystem = intel;
intel.initForAllEmpires();

// Replika ciala helpera (ten sam kod co GameScene).
function setIntel(empireId, level) {
  gameState.set(`intel.${empireId}`, {
    level: 'unknown', knownColonies: [], knownTech: [], lastIncidents: [],
    knownMilitary: null, knownReserve: null, knownCrewCapacity: null,
  }, 'debug_set_intel_reset');
  if (level !== 'unknown') intel.advanceIntel(empireId, level, 'debug_set_intel');
  return intel.getLevel(empireId);
}
const rec = () => gameState.get(`intel.${EMP}`) ?? {};
const show = (tag) => {
  const r = rec();
  console.log(`  ${tag.padEnd(26)} level=${String(r.level).padEnd(9)} colonies=${JSON.stringify(r.knownColonies ?? [])} military=${r.knownMilitary}`);
};

console.log('start:'); show('(po initForAllEmpires)');
console.log('\npodnoszenie:');
for (const lvl of ['rumor', 'contact', 'detailed']) { setIntel(EMP, lvl); show(`setIntel(${lvl})`); }
console.log('\nOBNIZANIE (to, czego advanceIntel NIE potrafi):');
for (const lvl of ['contact', 'rumor', 'unknown']) { setIntel(EMP, lvl); show(`setIntel(${lvl})`); }

console.log('\nkontrola: czy advanceIntel SAM potrafi obnizyc?');
setIntel(EMP, 'detailed');
const ok = intel.advanceIntel(EMP, 'rumor', 'proba_obnizenia');
console.log(`  advanceIntel(detailed → rumor) zwrocilo ${ok}, poziom = ${intel.getLevel(EMP)}  <- dlatego helper jest potrzebny`);

console.log('\nweryfikacja czystosci: rumor NIE trzyma pol z wyzszych szczebli');
setIntel(EMP, 'rumor');
const r = rec();
console.log(`  knownMilitary=${r.knownMilitary}  knownColonies=${JSON.stringify(r.knownColonies)}  → ${r.knownMilitary === null && (r.knownColonies ?? []).length === 0 ? 'CZYSTY' : 'BRUDNY'}`);
