// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// console_scene_smoke — KEEPER ARC KONSOLE, krok K0a (D-K-5 poprawione; KZ-Kit: żywa, przyciemniona scena na stałe)
// Plan: `docs/design/CONSOLES_PLAN.md` §4 ryzyko 7, §6.2 D-K-5.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CO PINUJE (logika + piny źródła ścieżki żywej; ThreeRenderer i UIManager nie importują się pod node):
//   S1 zbiór zakładek: członkowie grup nawigacji + U, BEZ Obserwatorium; panele boczne (eventLog, poi) nie są zakładkami
//   S2 predykat: bez flagi; poza civMode / globus / czysty widok → nie; overlay niewidoczny → nie
//   S3 WYKONANIEM na prawdziwym OverlayManager: otwarcie zakładki włącza, zamknięcie wyłącza, Obserwatorium nigdy,
//      zamknięcie od środka (visible=false przy wiszącym `active`) wyłącza od razu, przełączenie zakładek trzyma stan
//   S4 UIManager (pin źródła): predykat bez flagi, widoczność jak OverlayManager.draw, zasłona `bgPrimary` o kryciu
//      consoleScrimAlpha na całym płótnie PRZED TopBarem, po wczesnym wyjściu czystego widoku
//   S5 ThreeRenderer (pin źródła): scena renderuje się w każdej klatce (bez gałęzi pomijania), tik tła przed renderem
//   S6 trwałość: brak FEATURES.consoleKit; pomocniki strojenia zostają, przełączniki flagi i trybów usunięte
//   S7 pokrętła = ustawienia właściciela; tryby glass / opaque usunięte; filtr i zasłona z pokręteł
//   S8 renderer: filtr z predykatu zasłonięcia, zdejmowany przy zamknięciu, zapis do DOM tylko przy zmianie
// KZ-Kit (usunięte piny, z następcami): S2 „flaga OFF → nigdy” (→ S2 bez bramki), S4 „pierwsza instrukcja czyta flagę” (→ S4/S6),
//   S5 „gałąź pominięcia bez tików” (gałęzi nie ma — S5 renderuje co klatkę), S6 „flaga ON” (→ trwałość), S7 tabela trybów
//   glass / live / opaque i „nieznany tryb → domyślny” (tryby usunięte → S7 absencja ze świadkiem), S8 wasCovered (glass usunięty).
// ⚠ Fail-first: moduł i wpięcia powstają w K0a — importy dynamiczne, piny DEGRADUJĄ (czerwone), suita się nie przerywa.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';
import { readFileSync } from 'node:fs';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { buildNavGroups } from '../../ui/CivPanelDrawer.js';
import { OverlayManager } from '../../ui/OverlayManager.js';

const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const CS = await tryImport('../../ui/ConsoleSceneLogic.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const safe = (fn, d = null) => { try { return fn(); } catch (e) { console.log('  ! ' + e.message); return d; } };

// Źródło znormalizowane (\r\n → \n), komentarze zdjęte.
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const methodBody = (text, sig) => {
  const i = text.indexOf(sig);
  if (i < 0) return '';
  let d = 0, start = text.indexOf('{', i);
  for (let k = start; k < text.length; k++) {
    if (text[k] === '{') d++;
    else if (text[k] === '}' && --d === 0) return text.slice(start, k + 1);
  }
  return '';
};

const NAV = buildNavGroups(GAME_CONFIG.FEATURES);

console.log('\n── S0 kontrola (zielona po obu stronach): grupy nawigacji ──');
assert(NAV.length === 7 && NAV.some((g) => g.members.includes('observatory')), 'S0 7 grup, Obserwatorium w grupie Nauki');

console.log('\n── S1 zbiór zakładek ──');
const tabs = safe(() => CS.consoleTabIds(NAV), new Set());
{
  const members = NAV.flatMap((g) => g.members).filter((m) => m !== 'observatory');
  assert(members.length > 0 && members.every((m) => tabs.has(m)), `S1 każdy członek grup (poza Obserwatorium) jest zakładką konsoli (${members.length})`);
  assert(tabs.has('unit_design'), 'S1 projektant U jest zakładką');
  assert(tabs.size > 0 && !tabs.has('observatory'), 'S1 Obserwatorium zwolnione');
  assert(tabs.size > 0 && !tabs.has('eventLog') && !tabs.has('poi'), 'S1 panele boczne (eventLog, poi) nie są zakładkami');
}

console.log('\n── S2 predykat ──');
{
  const base = { civMode: true, globeOpen: false, cleanView: false, activeId: 'intel', visible: true, tabIds: tabs };
  const f = (o) => safe(() => CS.consoleSceneActive({ ...base, ...o }), null);
  assert(f({}) === true, 'S2 zakładka otwarta i widoczna → konsola nad sceną');
  assert(f({ enabled: false }) === true, 'S2 KZ-Kit: bez bramki flagi (dawne `enabled: false` nie wyłącza — pole nieczytane)');
  assert(f({ civMode: false }) === false && f({ globeOpen: true }) === false && f({ cleanView: true }) === false, 'S2 poza civMode / globus / czysty widok → nie');
  assert(f({ visible: false }) === false && f({ activeId: null }) === false, 'S2 overlay niewidoczny albo brak aktywnego → nie');
  assert(f({ activeId: 'observatory' }) === false && f({ activeId: 'eventLog' }) === false, 'S2 Obserwatorium i panele boczne → nie');
  assert(safe(() => CS.consoleSceneActive(null), null) === false, 'S2 brak stanu → nie');
}

console.log('\n── S3 wykonaniem: OverlayManager otwiera i zamyka ──');
{
  const om = new OverlayManager();
  const mk = () => ({ visible: false, show() { this.visible = true; }, hide() { this.visible = false; } });
  for (const id of ['intel', 'war', 'colony', 'observatory', 'eventLog', 'fleet']) om.register(id, mk());
  // Ten sam odczyt co UIManager.isConsoleSceneActive (widoczność jak OverlayManager.draw).
  const active = () => {
    const id = om.active, ov = id ? om.overlays[id] : null;
    return safe(() => CS.consoleSceneActive({ civMode: true, globeOpen: false, cleanView: false, activeId: id,
      visible: !!(ov && (ov.visible ?? ov.isVisible ?? ov._visible)), tabIds: tabs }), null);
  };
  assert(active() === false, 'S3 mapa (nic otwarte) → scena bez filtra');
  om.openPanel('intel');
  assert(active() === true, 'S3 otwarcie Wywiadu → konsola nad sceną');
  om.openPanel('war');
  assert(active() === true, 'S3 przełączenie na Wojny → trwa');
  om.closeActive();
  assert(active() === false, 'S3 zamknięcie → filtr zdjęty od następnej klatki');
  om.openPanel('observatory');
  assert(active() === false, 'S3 Obserwatorium → nigdy');
  om.openPanel('colony');
  om.overlays.colony.hide();   // zamknięcie od środka ([x]) — `active` jeszcze wisi do najbliższego draw
  assert(om.active === 'colony' && active() === false, 'S3 zamknięcie od środka → wyłączone od razu (przed wyzerowaniem active)');
  om.openPanel('eventLog');
  assert(active() === false, 'S3 Dziennik (panel boczny) → scena bez filtra');
  om.handleKey('f');
  assert(om.active === 'fleet' && active() === true, 'S3 klawisz F (Dowództwo) → konsola nad sceną');
}

console.log('\n── S4 UIManager — zasłona i predykat (pin źródła) ──');
{
  const ui = src('../../scenes/UIManager.js');
  const m = methodBody(ui, 'isConsoleSceneActive() {');
  assert(m.length > 0 && !m.includes('FEATURES') && !m.includes('enabled'), 'S4 KZ-Kit: predykat bez flagi i bez pola enabled (świadek: ciało metody znalezione)');
  assert(m.includes('consoleSceneActive(') && m.includes('ov.visible ?? ov.isVisible ?? ov._visible') && m.includes('consoleTabIds(NAV_GROUPS)'),
    'S4 ten sam predykat, widoczność jak OverlayManager.draw, zakładki z NAV_GROUPS');
  const d = methodBody(ui, '_draw() {');
  const iClean = d.indexOf('if (this._cleanView)'), iBg = d.indexOf('if (this.isConsoleSceneActive())'), iTop = d.indexOf('this._topBar.draw(');
  const bgBlock = iBg >= 0 ? d.slice(iBg, d.indexOf('}', iBg)) : '';
  assert(iClean >= 0 && iBg > iClean && iTop > iBg, 'S4 zasłona po wczesnym wyjściu czystego widoku, PRZED TopBarem (paski i overlay malują się na niej)');
  assert(bgBlock.includes('ctx.fillStyle = THEME.bgPrimary') && bgBlock.includes('ctx.fillRect(0, 0, W, H)'), 'S4 zasłona = token bgPrimary na całym płótnie');
  assert(bgBlock.includes('ctx.globalAlpha = consoleScrimAlpha(CONSOLE_SCREEN_SPECS[this.overlayManager.active], CONSOLE_GLASS);')
    && !/opaque|consoleBgMode/.test(bgBlock), 'S4 krycie zasłony wyłącznie z consoleScrimAlpha (bez trybu opaque)');
}

console.log('\n── S5 ThreeRenderer — scena renderuje się pod konsolą co klatkę (pin źródła) ──');
{
  const tr = src('../../renderer/ThreeRenderer.js');
  const loop = methodBody(tr, '_startLoop() {');
  const iDec = loop.indexOf('this._consoleBackdropTick();');
  const iRen = loop.indexOf('this._composer.render()');
  assert(iDec >= 0 && iRen > iDec, 'S5 tik tła raz na klatkę, PRZED renderem');
  assert(!/sceneSkip|_sceneSkipFrames|if \(skip/.test(loop), 'S5 KZ-Kit: brak gałęzi pomijania composera (świadek niżej: pętla znaleziona)');
  assert(loop.includes('this.renderer.render(this.scene, this.camera)') && loop.includes('this._cvDir?.reel?.onFrame()')
    && loop.includes('this._sceneRenderFrames++'), 'S5 composer / fallback / licznik / nagrywarka rolek w każdej klatce');
  assert(loop.split('this._composer.render()').length === 2, 'S5 kontrola: dokładnie jedno wywołanie composera w pętli');
  assert(loop.includes('consoleHidesMapBadges(this._consoleCovered === true)'), 'S5 plakietki mapy gasną z tego samego stanu zasłonięcia');
  const ticks = ['this._cvDir?.tickWarp(', 'this._tickCombatGlide()', 'this._tickBattleStage()', 'this._cvDir?.tickCamera()',
    'this._cameraController.update()', 'this._tickClouds()', 'this._updateActiveEffects(', 'this._tickCvFx()', 'this._tickCvModels()',
    'this._syncCombatReveal()', 'this._syncHud3dColors()'];
  const idx = ticks.map((t) => loop.indexOf(t));
  assert(idx.every((i) => i >= 0), `S5 świadek: wszystkie ${ticks.length} tików obecne w pętli`);
  const sk = methodBody(tr, '_consoleSceneCovered() {');
  assert(sk.includes('window.KOSMOS?.uiManager?.isConsoleSceneActive?.() === true') && /catch \(e\) \{ return false; \}/.test(sk),
    'S5 stan ciągnięty z UIManagera co klatkę, błąd → bez filtra (fail-open)');
}

console.log('\n── S6 trwałość (KZ-Kit) ──');
{
  assert(!('consoleKit' in GAME_CONFIG.FEATURES) && Object.keys(GAME_CONFIG.FEATURES).length > 5, 'S6 klucza FEATURES.consoleKit nie ma (świadek: FEATURES niepuste)');
  const D = await tryImport('../../debug/ConsoleKitDebug.js');
  const h = D && safe(() => D.consoleKitDebugHelpers({ getRenderer: () => ({ getConsoleSceneStats: () => ({ covered: true, filter: 'x' }) }) }).consoleKit);
  assert(!!h && typeof h.tune === 'object' && typeof h.tuneKit === 'function' && typeof h.tuneLayout === 'function' && typeof h.reset === 'function'
    && h.scene().covered === true, 'S6 pomocniki strojenia zostają: scene / tune / tuneKit / tuneLayout / reset');
  assert(!!h && ['on', 'off', 'glass', 'live', 'opaque'].every((k) => !(k in h)), 'S6 przełączniki flagi i trybów usunięte');
}

console.log('\n── S7 tło konsoli: pokrętła i zasłona ──');
{
  const D0 = safe(() => CS.CONSOLE_GLASS_DEFAULTS, null);
  assert(!!D0 && D0.bright === 0.4 && D0.blur === 0 && D0.sat === 1 && D0.scrim === 0, 'S7 ustawienia właściciela: jasność 0,4, rozmycie 0, nasycenie 1, zasłona 0');
  assert(!!D0 && !('mode' in D0) && !!CS && !('consoleBgMode' in CS) && !('consoleBackdrop' in CS) && !('CONSOLE_BG_MODES' in CS),
    'S7 KZ-Kit: tryby tła usunięte (bez mode / consoleBgMode / consoleBackdrop / CONSOLE_BG_MODES; świadek: moduł i domyślne wczytane)');
  const css = safe(() => CS.glassFilterCss({ blur: 3, bright: 0.5, sat: 0.7 }), '');
  assert(/^blur\(3px\) brightness\(0\.5\) saturate\(0\.7\)$/.test(css), 'S7 filtr CSS składany z pokręteł (kształt, nie wartości domyślne)');
  assert(safe(() => CS.glassFilterCss(D0), '') === 'blur(0px) brightness(0.4) saturate(1)', 'S7 filtr domyślny = ustawienia właściciela');
  const LL = await tryImport('../../ui/ConsoleLayoutLogic.js');
  const own = safe(() => CS.consoleScrimAlpha({ scrimAlpha: 0.2 }, { scrim: 0.9 }));
  const other = safe(() => CS.consoleScrimAlpha(LL.CONSOLE_SCREEN_SPECS?.economy, { scrim: 0.9 }));
  assert(own === 0.2 && other === 0.9 && !!LL?.CONSOLE_SCREEN_SPECS, 'S7 zasłona: specyfikacja ekranu nadpisuje pokrętło, brak wpisu → pokrętło');
}

console.log('\n── S8 renderer: filtr zdejmowany przy zamknięciu, zapis tylko przy zmianie (pin źródła) ──');
{
  const tr = src('../../renderer/ThreeRenderer.js');
  const b = methodBody(tr, '_consoleBackdropTick() {');
  assert(b.includes("const css = covered ? glassFilterCss(CONSOLE_GLASS) : '';") && b.includes("if (css !== (this._consoleFilterCss ?? ''))")
    && b.includes('el.style.filter = css;'), 'S8 zamknięcie → styl filter = pusty napis; zapis wyłącznie przy zmianie');
  assert(b.includes('const covered = this._consoleSceneCovered();') && b.includes('this._consoleCovered = covered;'), 'S8 zasłonięcie z tego samego predykatu co UI, zapamiętane dla plakietek');
  const HL = await tryImport('../../ui/HudLayer.js');
  const g = HL && safe(() => HL.hudGate({ civMode: true, uiManager: { overlayManager: { isAnyOpen: () => true } }, threeRenderer: {} }));
  assert(!!g && g.shown === false && g.reason === 'overlay', 'S8 #hud-canvas pod konsolą wyczyszczony (hudGate → overlay)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
