// Finding 746 — keeper: statek W LOCIE nie jest stawiany na (niezwolnionej) orbicie z OrbitalSpaceSystem.
//
// Defekt (zmierzony na żywym silniku, GATE-S4): rozpoznanie całego układu (`VesselManager._startForeignRecon`, scope full_system)
// przestawia stan na `in_transit` bez `vessel:launched`, więc `OrbitalSpaceSystem` nie zwalnia orbity ciała startowego.
// `ThreeRenderer._tickOrbitingVessels` (zdarzenie `physics:updated`, tuż przed `_updateCameraFocus`) stawiał wtedy sprite na tej
// orbicie w każdym tiku — kamera śledząca statek (drugi klik w Outlinerze, „POKAŻ” w Dowództwie) łapała miejsce startu
// rozpoznania: cel kamery 0,17 j. od ciała startu, statek 17–43 j. dalej. Naprawa u czytelnika (obejmuje każdego producenta).
//
//   S  źródło ThreeRenderer (piny źródłowe, komentarze zdjęte): w `_tickOrbitingVessels` strażnik `in_transit` stoi PRZED
//      odczytem orbity; wolna orbita (dockedAt null) dalej z pozycji logicznej (kontrola); fokus statku śledzi sprite (kontrola)
//   P  świadek producenta: start rozpoznania całego układu ustawia `in_transit` i NIE emituje `vessel:launched` (dlatego strażnik
//      u czytelnika, nie u producenta)

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; if (process.env.VERBOSE) console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

console.log('\n── S  ThreeRenderer._tickOrbitingVessels');
const src = strip(read('../../renderer/ThreeRenderer.js'));
const tick = src.match(/_tickOrbitingVessels\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
ok(tick.length > 0, 'S: świadek — metoda _tickOrbitingVessels');
const iGuard = tick.search(/if \(v && !v\.isWreck && v\.position\?\.state === 'in_transit'\) continue;/);
const iOrbit = tick.indexOf('orbital.getOrbit(id)');
ok(iGuard >= 0, 'S: strażnik — statek w locie pomijany przez pętlę orbit');
ok(iGuard >= 0 && iOrbit > iGuard, 'S: strażnik PRZED odczytem orbity (orbita nie nadpisuje sprite\'a lotu)');
ok(/state === 'orbiting' && v\.position\?\.dockedAt == null\)[\s\S]*?_placeFreeVessel/.test(tick), 'S: kontrola — wolna orbita z pozycji logicznej');
const focus = src.match(/EventBus\.on\('vessel:focus', safe\(\(\{ vesselId \}\) => \{([\s\S]*?)\n    \}\)\);/)?.[1] ?? '';
ok(/this\._focusVesselId = vesselId;/.test(focus) && /const pos = entry\.sprite\.position;/.test(focus), 'S: kontrola — fokus statku śledzi sprite (żywa pozycja)');

console.log('\n── P  producent (świadek)');
const vm = strip(read('../../systems/VesselManager.js'));
const start = vm.match(/_startForeignRecon\(vesselId, targetId, scope\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
const full = start.slice(start.indexOf("scope === 'full_system'"));
ok(full.length > 0 && /vessel\.position\.state = 'in_transit';/.test(full), 'P: świadek — start rozpoznania układu ustawia in_transit');
ok(!/vessel:launched/.test(full), 'P: świadek — bez vessel:launched (orbita nie jest zwalniana u producenta)');

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'} — ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
