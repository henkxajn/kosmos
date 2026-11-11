// STUB three dla testow headless (node). NIE jest zaleznoscia produkcyjna —
// gra laduje Three.js z importmapy (src/lib/three.module.js) i dodatki z CDN (patrz CLAUDE.md, sekcja Technologia).
//
// Istnieje po to, zeby lancuch importow GameCore -> GroundUnitManager ->
// GroundUnitFactory -> GlbSnapshotRenderer dal sie w ogole zaladowac pod node.
// Cale uzycie THREE.* w GlbSnapshotRenderer jest LENIWE (_ensureInit), wiec
// pusty namespace wystarcza.
//
// ŚLEDZONY W GIT (Finding 683, decyzja właściciela 2026-11-11): dawniej żył wyłącznie w `node_modules/three`
// (gitignorowane), więc każde `npm ci` / `npm install` go kasowało i keepery importujące GameCore padały do ręcznego
// odtworzenia. Teraz leży tu, a `package.json` → `devDependencies.three = "file:src/testing/fixtures/three-stub"`:
// instalacja pakietów tworzy `node_modules/three` jako ŁĄCZE do tego folderu (npm `link: true`), więc czysta instalacja
// odtwarza je sama. Pilnuje tego keeper `three_stub_fixture_smoke`.
//
// UWAGA — GRANICA DOWODU JEST CELOWA (docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md):
// ten stub NIE eksportuje TextureLoader. Dzieki temu PlanetTextureUtils (a przez
// nie ColonyOverlay i GameScene) NADAL nie importuje sie pod node — i keepery
// musza pinowac te warstwe zrodlowo albo live-gate'em, zamiast udawac wykonanie.
// Dopisanie tu TextureLoader ZMIENILOBY to, co jest dowodliwe.
