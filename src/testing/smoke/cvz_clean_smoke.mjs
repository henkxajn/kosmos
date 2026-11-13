// src/testing/smoke/cvz_clean_smoke.mjs
// ARC COMBAT VISUALS, krok CV-Z (metoda T4) — PIN CZYSTOŚCI: flagi kroków CV na stałe ON, klucze zdjęte z `FEATURES`, ścieżki OFF
// usunięte (COMBAT_VISUALS_PLAN.md §4 CV-Z). Wzór: `hud_bz_clean_smoke`, `galaxy_g5_clean_smoke`.
//   Z1 `FEATURES` bez kluczy wycofanych flag (KONTROLA — inne flagi gry są, np. `fcCombatFx`)
//   Z2 żaden plik `src/` (poza testami) nie czyta wycofanej flagi (`.cvX` bez wywołania; komentarze zdjęte); KONTROLA — wzorzec
//      łapie odczyt na syntetycznej linii
//   Z3 przełączniki konsoli wycofanych flag (`KOSMOS.debug.cvX()`) zwracają { retired: true, flag } i niczego nie zmieniają
//   Z4 usunięte ścieżki OFF: metody renderera (dawne smugi i błysk, salwa CV-2a, pierścień starcia, paski HP 3D, kadr bez sceny),
//      karta walki `CombatHUD` (plik) i czip „⚔ Walki”; KONTROLA — renderer czytany (metody sceny są)
//   Z5 klucze i18n dawnej karty walki wycofane w PL i EN; klucze paska walki zostają
//   Z6 grupa 5: `EnemyAttackHandler` zawsze niesie `fx` bitwy orbitalnej (bez bramki), `GameScene` bez bramki `cvOrbital`;
//      reżyser bez flagi — FUNKCJA zostaje: chip domyślnie WYŁĄCZONY (`uiPrefs.cvDirector`, D-CV-23), F9 / F10 i `cv916` działają
import '../headless/env.js';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';

let pass = 0, fail = 0;
function assert(c, m) { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } }
function guard(tag, fn) { try { return fn(); } catch (e) { fail++; console.log(`  ✗ ${tag} rzucił: ${String(e?.stack ?? e).slice(0, 300)}`); } }
async function tryImport(p) { try { return await import(p); } catch (e) { console.log('  (import nieudany', p, String(e).slice(0, 120), ')'); return {}; } }
const ROOT = new URL('../../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

// Wycofane flagi CV-Z — grupy 1–5.
const RETIRED = ['cvFxEngine', 'cvStage', 'cvChoreo', 'cvChoreo2', 'cvModels', 'cvPresets', 'cvWeapons', 'cvDamage', 'cvShields', 'cvStrip', 'cvTactical',
  'cvOrbital', 'cvDirector'];
// Przełączniki konsoli → flaga (nazwa przełącznika bywa krótsza od flagi).
const TOGGLES = { cvFx: 'cvFxEngine', cvStage: 'cvStage', cvChoreo: 'cvChoreo', cvChoreo2: 'cvChoreo2', cvModels: 'cvModels', cvPresets: 'cvPresets',
  cvWeapons: 'cvWeapons', cvDamage: 'cvDamage', cvShields: 'cvShields', cvStrip: 'cvStrip', cvTactical: 'cvTactical',
  cvOrbital: 'cvOrbital', cvDirectorFlag: 'cvDirector' };

const GC = await tryImport('../../config/GameConfig.js');
const ST = await tryImport('../../debug/CvBattleStager.js');

console.log('Z1 — FEATURES bez wycofanych kluczy');
guard('Z1', () => {
  const F = GC.GAME_CONFIG?.FEATURES ?? null;
  const left = RETIRED.filter((k) => F && k in F);
  assert(!!F && left.length === 0 && 'fcCombatFx' in F, `Z1 klucze zdjęte (${RETIRED.length}); zostały: ${left.join(', ') || '—'}; KONTROLA — \`fcCombatFx\` jest`);
});

console.log('Z2 — nikt w src/ nie czyta wycofanej flagi');
guard('Z2', () => {
  const files = [];
  const walk = (dir) => {
    for (const n of readdirSync(new URL(dir, ROOT))) {
      const rel = `${dir}/${n}`;
      if (rel.startsWith('src/testing') || rel.startsWith('src/lib')) continue;
      const st = statSync(new URL(rel, ROOT));
      if (st.isDirectory()) walk(rel); else if (/\.(js|mjs)$/.test(n)) files.push(rel);
    }
  };
  walk('src');
  // Odczyt FLAGI: `FEATURES.cvX` / `F.cvX` (alias `const F = GAME_CONFIG.FEATURES`) — nie `threeRenderer.cvDirector` (getter reżysera)
  // ani `uiPrefs.cvDirector` (chip), które zostają.
  const re = new RegExp(`(?:FEATURES|\\bF)\\s*\\??\\.\\s*(${RETIRED.join('|')})\\b`);
  const hits = files.filter((p) => re.test(strip(read(p))));
  assert(files.length > 100 && hits.length === 0, `Z2 ${files.length} plików, odczyt wycofanej flagi: ${hits.join(', ') || 'brak'}`);
  assert(re.test('if (GAME_CONFIG.FEATURES?.cvStage) x();') && re.test('F.cvOrbital = 1') && !re.test('debug.cvStage(0)')
    && !re.test('K.threeRenderer?.cvDirector') && !re.test('uiPrefs.cvDirector === true'),
    'Z2 KONTROLA: wzorzec łapie odczyt flagi, nie przełącznik konsoli, getter reżysera ani preferencję chipa');
});

console.log('Z3 — przełączniki konsoli wycofanych flag');
guard('Z3', () => {
  const H = ST.cvBattleDebugHelpers?.({ getRenderer: () => null }) ?? {};
  const F = GC.GAME_CONFIG?.FEATURES ?? {};
  const before = JSON.stringify(F);
  const bad = Object.entries(TOGGLES).filter(([fn, flag]) => {
    const r = typeof H[fn] === 'function' ? H[fn](0) : null;
    return !(r?.retired === true && r.flag === flag);
  });
  assert(Object.keys(H).length > 10 && bad.length === 0 && JSON.stringify(F) === before,
    `Z3 ${Object.keys(TOGGLES).length} przełączników zwraca { retired: true, flag } i nie zmienia FEATURES; złe: ${bad.map(([f]) => f).join(', ') || '—'}`);
  assert(typeof H.cvBattle === 'function' && typeof H.cvParade === 'function' && typeof H.cvExplode === 'function' && typeof H.cvShieldHit === 'function',
    'Z3 KONTROLA: narzędzia stagera zostają (cvBattle, cvParade, cvExplode, cvShieldHit)');
});

console.log('Z4 — usunięte ścieżki OFF');
guard('Z4', () => {
  const tr = strip(read('src/renderer/ThreeRenderer.js'));
  const gone = ['_onCombatRoundFx', '_cvFxRoundFx', '_spawnCombatTracer', '_spawnHitGlow', '_followTracerEnds', '_hitGlowTexture',
    '_syncCombatHpBars', '_createHpBar', '_hideEncounterRings', '_tickEngagementMarkers', '_upsertEngagementMarker', '_engagementMarkers',
    '_computeWatchFit', '_engagementFit', '_engagementCentre', 'tacActive'];
  const left = gone.filter((n) => new RegExp(`\\b${n}\\b`).test(tr));
  assert(left.length === 0 && /\b_stageWatchFit\(enc\) \{/.test(tr) && /\b_cvWpnRoundFx\(payload\) \{/.test(tr),
    `Z4 renderer bez ${gone.length} nazw ścieżek OFF (zostały: ${left.join(', ') || '—'}); KONTROLA — \`_stageWatchFit\`, \`_cvWpnRoundFx\` są`);
  const bcb = strip(read('src/ui/BottomControlBar.js'));
  assert(!existsSync(new URL('src/ui/CombatHUD.js', ROOT)) && !/_chipRect|_drawCombatChip|toggleMinimize/.test(bcb) && /_zoomRect/.test(bcb),
    'Z4 karta walki `CombatHUD` (plik) i czip „⚔ Walki” usunięte; KONTROLA — pas dolny czytany (suwak zoomu jest)');
  const fxl = strip(read('src/utils/VesselFxLogic.js'));
  assert(!/planEngagementMarkers|ENGAGEMENT_RING|engagementRingBand|planCombatHpBars|HP_BAR\b|hpBarFrac/.test(fxl) && /isEngagementInView/.test(fxl),
    'Z4 `VesselFxLogic` bez planera znacznika, pierścienia i pasków HP; KONTROLA — `isEngagementInView` zostaje');
});

console.log('Z5 — i18n dawnej karty walki');
guard('Z5', () => {
  const pl = read('src/i18n/pl.js'), en = read('src/i18n/en.js');
  const old = ['hudHeaderSingle', 'hudHeaderMulti', 'hudChip', 'hudChipN', 'hudMore', 'hudRound', 'hudAlive', 'hudBattleLog', 'hudNoWeapons', 'hudMiss', 'hudShield'];
  const has = (src, k) => new RegExp(`'combat\\.${k}':`).test(src);
  const left = old.filter((k) => has(pl, k) || has(en, k));
  assert(left.length === 0 && /'combat\.watchBattle':/.test(pl) && /'combat\.watchBattle':/.test(en) && /'combatStrip\.round':/.test(pl),
    `Z5 ${old.length} kluczy karty wycofanych w PL i EN (zostały: ${left.join(', ') || '—'}); KONTROLA — \`combat.watchBattle\` i klucze paska zostają`);
});

console.log('Z6 — grupa 5: bitwa orbitalna i reżyser bez flag');
await (async () => {
  try {
    const eah = strip(read('src/systems/EnemyAttackHandler.js')), gs = strip(read('src/scenes/GameScene.js'));
    assert(/const fx = this\._orbitalFx\(\{ allEnemies, systemId, planetId, empireId \}\);/.test(eah) && !/cvOrbital/.test(eah),
      'Z6a `EnemyAttackHandler` zawsze liczy `fx` powtórki (bez bramki flagi)');
    assert(/if \(fx\?\.kind === 'orbital'\) \{/.test(gs) && /this\._noteRaidBattle\(\{ battleId, result \}\);/.test(gs)
      && /if \(this\._raidAnnouncer\?\.offerBanner\(b\)\) return;/.test(gs) && /if \(!dir\) return;/.test(gs),
      'Z6b `GameScene`: źródło orbital, rajd i F9 / F10 bez bramki flagi');
    const D = await import('../../renderer/CvDirector.js');
    const proto = D.CvDirector?.prototype ?? {};
    const desc = (n) => Object.getOwnPropertyDescriptor(proto, n);
    const prevK = globalThis.window.KOSMOS;
    globalThis.window.KOSMOS = { uiPrefs: {} };
    const off = desc('armed')?.get?.call({});
    globalThis.window.KOSMOS.uiPrefs.cvDirector = true;
    const on = desc('armed')?.get?.call({});
    globalThis.window.KOSMOS = prevK;
    assert(!desc('flag') && off === false && on === true,
      `Z6c reżyser bez getteru \`flag\`; chip domyślnie WYŁĄCZONY (armed ${off}), włączony preferencją (armed ${on}) — D-CV-23`);
    const cd = strip(read('src/renderer/CvDirector.js'));
    assert(/setRecording\(on\) \{/.test(cd) && !/flag_off/.test(cd) && /setPromo916\(/.test(cd) && /setCapture\(/.test(cd),
      'Z6d nagrywarka (F10), tryb nagrywania (F9) i 9:16 bez odmowy „flag_off”');
  } catch (e) { fail++; console.log(`  ✗ Z6 rzucił: ${String(e?.stack ?? e).slice(0, 300)}`); }
})();

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
