// probe-firstcontact-seed — mierzy DWA seedy łańcucha pierwszego kontaktu (W2 §Findings filed 12).
//
// Powstała przy domknięciu GATE 3 W2, żeby wpis rejestru „pierwszy kontakt jest w KAŻDEJ partii
// zsynchronizowaną parą sond z tego samego namiaru" był ZMIERZONY, nie argumentowany — i żeby ten,
// kto go naprawi, miał czym pokazać przed/po. Sonda, nie keeper: nic nie asercjuje, drukuje liczby.
//
//   (a) na której PRÓBIE odpala `first_contact` dla kolejnych imperiów — klucz rzutu (`rollKey`,
//       `DirectorRuleMath.js:87-89`) nie dostaje soli galaktyki (`DirectorSystem.js:216` jej nie
//       podaje), a oba archetypy dziedziczą `science: 0.6` bez jittera ⇒ ten sam wynik w każdej partii.
//   (b) pod jakim KĄTEM leci sonda — `DirectorFirstContact._courseAngle` (:191-196) to surowe
//       `h*31 + charCode` z `h % 360`, nigdy przez `mixSeed`, więc sąsiednie id dają sąsiednie stopnie.
//
// Wywołanie: node src/testing/headless/probe-firstcontact-seed.mjs

import { rollFires, expectedAttemptsToFire, personalityMultiplier, rollKey } from '../../utils/DirectorRuleMath.js';
import { DIRECTOR_RULES } from '../../data/DirectorRuleData.js';

const IDS = ['emp_001', 'emp_002', 'emp_003', 'emp_004'];
const SCIENCE_AXIS = 0.6;   // industrialist; expansionist = structuredClone bez nadpisania osobowości
const AU_TO_PX = 110;       // GameConfig.js
const FLYBY_RADIUS_PX = 2600;
const FLYBY_DURATION_YEARS = 6.0;

const rule = DIRECTOR_RULES.first_contact ?? Object.values(DIRECTOR_RULES).find(r => r.id === 'first_contact');
if (!rule) { console.error('BRAK reguły first_contact w katalogu'); process.exit(1); }

console.log('--- reguła first_contact (z ŻYWEGO katalogu) ---');
console.log('roll          :', JSON.stringify(rule.roll));
console.log('personalityMod:', JSON.stringify(rule.personalityMod));
console.log('cooldown      :', JSON.stringify(rule.cooldown));

const mult = personalityMultiplier(SCIENCE_AXIS, rule.personalityMod);
console.log(`mult (science=${SCIENCE_AXIS}):`, mult);
console.log('expectedAttemptsToFire (bez mult):', expectedAttemptsToFire(rule.roll).toFixed(3));

console.log('\n--- (a) PRÓBA pierwszego odpalenia, per imperium ---');
for (const empireId of IDS) {
  let first = null;
  for (let a = 1; a <= 50; a++) {
    if (rollFires(rule.id, empireId, a, rule.roll, mult)) { first = a; break; }
  }
  console.log(`${empireId}: pierwsze odpalenie na próbie ${first}   klucz próby 1 = ${rollKey(rule.id, empireId, 1)}`);
}
console.log('⚠ Normalna galaktyka ma DWA imperia (emp_001, emp_002) — jeśli oba mają tę samą próbę,');
console.log('  „pierwszy kontakt" jest zsynchronizowany w każdej partii, niezależnie od seeda galaktyki.');

// DOKŁADNA kopia DirectorFirstContact._courseAngle (:191-196). Kopia, nie import: klasa ciągnie
// EventBus/gameState/createVessel/i18n. Funkcja jest czysta i czterolinijkowa — porównaj z plikiem,
// jeśli sonda i kod zaczną się rozjeżdżać.
function courseAngleDeg(empireId) {
  let h = 0;
  for (const ch of String(empireId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

const R = FLYBY_RADIUS_PX / AU_TO_PX;   // AU
console.log(`\n--- (b) KĄT KURSU sondy (promień ${R.toFixed(1)} AU) ---`);
for (const empireId of IDS) {
  const deg = courseAngleDeg(empireId);
  const rad = (deg * Math.PI) / 180;
  console.log(`${empireId}: ${deg}°   wejście = (${(Math.cos(rad) * R).toFixed(2)}, ${(Math.sin(rad) * R).toFixed(2)}) AU względem domu`);
}
console.log('⚠ Sekwencja idąca PO KOLEI (226/227/228/229) = brak rozproszenia, nie przypadek.');

const d1 = courseAngleDeg(IDS[0]), d2 = courseAngleDeg(IDS[1]);
const r1 = (d1 * Math.PI) / 180, r2 = (d2 * Math.PI) / 180;
const sep = Math.hypot(Math.cos(r1) * R - Math.cos(r2) * R, Math.sin(r1) * R - Math.sin(r2) * R);
console.log(`\nRÓŻNICA KĄTÓW ${IDS[0]} vs ${IDS[1]}: ${Math.abs(d1 - d2)}°`);
console.log(`ODLEGŁOŚĆ punktów wejścia: ${sep.toFixed(3)} AU`);
console.log(`PRĘDKOŚĆ przelotu: ${((2 * R) / FLYBY_DURATION_YEARS).toFixed(2)} AU / rok wyświetlany (2×${R.toFixed(1)} AU w ${FLYBY_DURATION_YEARS} lat)`);
