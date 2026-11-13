// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_retire_cinema_smoke — KEEPER ARC COMBAT VISUALS, krok CV-8b (D-CV-27 (a), plan §4 CV-8b, §1 Q3): PINY NIEOBECNOŚCI po wycofaniu
// kina BattleView3D, modalu „ENGAGEMENT IMMINENT / BITWA NIEUCHRONNA” (intro `BattleIntroModal`, preferencja w localStorage),
// „imitacji” bitwy orbitalnej (`_onBattleResolvedFx` / `_spawnBattleBurst`, znacznik 'burst') i bramki `suspend` / `resume`
// (`_renderingEnabled`). Wykonanie tam, gdzie moduł importuje się pod node (`BattleIntroModal`, `VesselFxLogic`, `HudLayer`, `CvOrbital`);
// `GameScene` i `ThreeRenderer` — piny źródłowe (komentarze zdjęte).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// PINY:
//   N1 BattleView3D: pliku nie ma; żaden plik `src/` go nie importuje
//   N2 imitacja bitwy orbitalnej: brak producenta (`_spawnBattleBurst`, `_onBattleResolvedFx`, 'burst'); słuchacz `battle:resolved`
//      renderera tylko przekazuje bitwę do powtórki; CV-Z — znacznik starcia (`planEngagementMarkers`) usunięty w całości
//   N3 modal kina: `BattleIntroModal` eksportuje WYŁĄCZNIE baner (`showBattleOutcome`); żadnego `showBattleIntro` / preferencji
//      `kosmos_battle_view_auto` w `src/`; `_tryShowNextBattle` = sam baner dla każdego źródła; baner wykonany na atrapie DOM
//   N4 `suspend` / `resume` / `_renderingEnabled` — nie ma ich w rendererze ani w bramce HUD (wykonanie `hudGate`)
//   N5 bez `fx` powtórka się nie zaczyna (wykonanie `CvOrbital.handle`); CV-Z (przecelowane świadomie — flaga `cvOrbital` zdjęta):
//      EAH buduje `fx` zawsze, `GameScene` — rajd i wstrzymania Dziennika bez bramki flagi, klucza flagi nie ma
//   N6 `check-i18n`: baseline bez `BattleIntroModal.js` (trzy napisy zniknęły z popupem)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
import '../headless/env.js';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import * as BIM from '../../ui/BattleIntroModal.js';
import * as FXL from '../../utils/VesselFxLogic.js';
import { hudGate } from '../../ui/HudLayer.js';
import { CvOrbital } from '../../renderer/CvOrbital.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l); } };
const guard = (label, fn) => { try { fn(); } catch (e) { fail++; console.log(`  ✗ ${label}: WYJĄTEK ${e?.stack ?? e}`); } };
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const body = (src, sig) => { const i = src.indexOf(sig); return i < 0 ? '' : src.slice(i, src.indexOf('\n  }\n', i)); };
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : (/\.(m?js)$/.test(f) ? [p] : []); });
const SRC_FILES = walk(join(ROOT, 'src')).filter((p) => !p.includes(join('src', 'testing')) && !p.includes(join('src', 'lib')));
const GS = strip(read('src/scenes/GameScene.js'));
const TR = strip(read('src/renderer/ThreeRenderer.js'));

console.log('N1 — BattleView3D');
guard('N1', () => {
  assert(!existsSync(join(ROOT, 'src/scenes/BattleView3D.js')), 'N1a plik `src/scenes/BattleView3D.js` usunięty');
  const importers = SRC_FILES.filter((p) => /import[^;]*BattleView3D/.test(readFileSync(p, 'utf8')));
  assert(SRC_FILES.length > 200 && importers.length === 0, `N1b żaden z ${SRC_FILES.length} plików src/ nie importuje BattleView3D${importers.length ? ' — ' + importers.join(', ') : ''}`);
  assert(!/new BattleView3D|_battleView3D/.test(GS), 'N1c GameScene: bez instancji kina');
});

console.log('N2 — imitacja bitwy orbitalnej (burst)');
guard('N2', () => {
  assert(!/_spawnBattleBurst|_onBattleResolvedFx/.test(TR) && !/'burst'/.test(TR), 'N2a ThreeRenderer: brak `_spawnBattleBurst`, `_onBattleResolvedFx` i znacznika `burst`');
  assert(/EventBus\.on\('battle:resolved', safe\(\(p\) => this\._cvOrb\?\.handle\?\.\(p\)\)\);/.test(TR), 'N2b słuchacz `battle:resolved` renderera — wyłącznie powtórka bitwy orbitalnej');
  assert(!('ENGAGEMENT_BURST_TTL_MS' in FXL), 'N2c `VesselFxLogic` bez czasu życia imitacji');
  // CV-Z — przecelowane świadomie: znacznik starcia usunięty w całości (planer i renderer) — pin nieobecności.
  assert(!('planEngagementMarkers' in FXL) && !('ENGAGEMENT_RING' in FXL) && typeof FXL.isEngagementInView === 'function' && !/_engagementMarkers/.test(TR),
    'N2d (CV-Z): znacznika starcia nie ma (planer `VesselFxLogic` i renderer); KONTROLA — moduł wczytany');
});

console.log('N3 — modal kina (intro) i preferencja');
guard('N3', () => {
  assert(JSON.stringify(Object.keys(BIM).sort()) === JSON.stringify(['showBattleOutcome']), `N3a BattleIntroModal eksportuje wyłącznie baner (${Object.keys(BIM).join(', ')})`);
  const hits = SRC_FILES.filter((p) => /showBattleIntro|getBattleViewPreference|setBattleViewPreference|kosmos_battle_view_auto/.test(strip(readFileSync(p, 'utf8').replace(/\r\n/g, '\n'))));
  assert(hits.length === 0, `N3b żadnego intro / preferencji kina w kodzie src/${hits.length ? ' — ' + hits.join(', ') : ''}`);
  const tsn = body(GS, '  async _tryShowNextBattle() {');
  assert(tsn.length > 0 && /await showBattleOutcome\(battleData\)/.test(tsn) && !/source|pref|watch|BattleView/.test(tsn), 'N3c `_tryShowNextBattle`: sam baner, bez gałęzi źródła / preferencji / kina');
  // baner na atrapie DOM — powstaje, bez nagłówka intro
  const before = document.body?.children?.length ?? 0;
  const appended = [];
  const orig = document.body.append?.bind(document.body);
  document.body.append = (...els) => { appended.push(...els); return orig?.(...els); };
  let pr = null;
  try { pr = BIM.showBattleOutcome({ result: { winner: 'B', turns: 9, lossesA: 120, lossesB: 40 }, playerSide: 'B', aggressorName: 'Liga', defenderName: 'Gracz' }); }
  finally { document.body.append = orig; }
  const html = appended.map((e) => `${e?.innerHTML ?? ''}${e?.textContent ?? ''}`).join(' ');
  assert(pr instanceof Promise && appended.length === 3 && /ZWYCIĘSTWO/.test(html) && !/ENGAGEMENT|NIEUCHRONN/i.test(html),
    `N3d baner wyniku powstaje (${appended.length} elementy, „ZWYCIĘSTWO”), bez nagłówka intro (dzieci body przed: ${before})`);
});

console.log('N4 — suspend / resume / _renderingEnabled');
guard('N4', () => {
  assert(!/\bsuspend\(\)|\bresume\(\)|_renderingEnabled/.test(TR), 'N4a ThreeRenderer: bez `suspend` / `resume` i bramki `_renderingEnabled`');
  assert(!/_renderingEnabled/.test(strip(read('src/ui/HudLayer.js'))), 'N4b HudLayer: bramka bez `_renderingEnabled`');
  const K = { civMode: true, uiManager: { _cleanView: false, overlayManager: { isAnyOpen: () => false } }, threeRenderer: { _cleanView: false, _renderingEnabled: false, _contextLost: false } };
  const g1 = hudGate(K);
  K.threeRenderer._contextLost = true;
  const g2 = hudGate(K);
  assert(g1.shown === true, 'N4c `hudGate`: dawne pole `_renderingEnabled = false` nic już nie znaczy (warstwa HUD widoczna)');
  assert(g2.shown === false && g2.reason === 'renderer', 'N4d KONTROLA: utracony kontekst WebGL — warstwa HUD dalej się chowa');
});

console.log('N5 — znaczenie `cvOrbital` OFF po CV-8b');
guard('N5', () => {
  const orb = new CvOrbital({ _presClock: { nowMs: 0 } });
  const r0 = orb.handle({ battleId: 'b1', result: { winner: 'B' } });
  assert(r0 === false && orb.replays.size === 0, 'N5a bez `fx` powtórka się nie zaczyna');
  const eah = strip(read('src/systems/EnemyAttackHandler.js'));
  assert(/const fx = this\._orbitalFx\(/.test(eah) && !/cvOrbital/.test(eah), 'N5b (CV-Z) EAH buduje `fx` zawsze');
  assert(/if \(this\._raidAnnouncer\?\.offerBanner\(b\)\) return;/.test(GS) && /if \(this\._raidAnnouncer\?\.offerLine\(battleIds\)\) return;/.test(GS)
    && /reason === 'wrecked' \? this\.threeRenderer/.test(GS) && !/FEATURES\?\.cvOrbital/.test(GS), 'N5c (CV-Z) GameScene: rajd (#635) i wstrzymania Dziennika (#713) bez bramki flagi');
  assert(!('cvOrbital' in GAME_CONFIG.FEATURES), 'N5d (CV-Z) klucz flagi `cvOrbital` zdjęty — powtórka jedyną prezentacją bitwy orbitalnej');
});

console.log('N6 — check-i18n');
guard('N6', () => {
  const tool = read('tools/check-i18n.mjs');
  assert(!/^\s*'src\/ui\/BattleIntroModal\.js':\s*\d+/m.test(tool), 'N6a baseline bez wpisu `BattleIntroModal.js` (napisy popupu zniknęły z nim)');
});

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
