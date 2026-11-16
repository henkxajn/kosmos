// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// console_scene_smoke — KEEPER ARC KONSOLE, krok K0a (D-K-5, Finding 730: konsola zasłania scenę, composer pominięty)
// Plan: `docs/design/CONSOLES_PLAN.md` §4 ryzyko 7, §6.2 D-K-5.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CO PINUJE (logika + piny źródła ścieżki żywej; ThreeRenderer i UIManager nie importują się pod node):
//   S1 zbiór zakładek: członkowie grup nawigacji + U, BEZ Obserwatorium; panele boczne (eventLog, poi) nie są zakładkami
//   S2 predykat: flaga OFF → nigdy; poza civMode / globus / czysty widok → nie; overlay niewidoczny → nie
//   S3 WYKONANIEM na prawdziwym OverlayManager: otwarcie zakładki włącza pominięcie, zamknięcie wyłącza, Obserwatorium nigdy,
//      zamknięcie od środka (visible=false przy wiszącym `active`) wyłącza od razu, przełączenie zakładek trzyma pominięcie
//   S4 UIManager (pin źródła): metoda czyta flagę W CHWILI UŻYCIA (pierwsza instrukcja), widoczność jak OverlayManager.draw,
//      tło `bgPrimary` na całym płótnie PRZED TopBarem, po wczesnym wyjściu czystego widoku
//   S5 ThreeRenderer (pin źródła): pominięty WYŁĄCZNIE przebieg composera; wszystkie tiki prezentacji PRZED decyzją
//      i żaden w gałęzi pominięcia (tiki biegną pod konsolą); decyzja ciągnięta co klatkę z UIManagera (fail-open)
//   S6 flaga zadeklarowana w FEATURES (ON w K0a)
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
  const base = { enabled: true, civMode: true, globeOpen: false, cleanView: false, activeId: 'intel', visible: true, tabIds: tabs };
  const f = (o) => safe(() => CS.consoleSceneActive({ ...base, ...o }), null);
  assert(f({}) === true, 'S2 zakładka otwarta i widoczna → pominięcie');
  assert(f({ enabled: false }) === false, 'S2 flaga OFF → nigdy');
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
    return safe(() => CS.consoleSceneActive({ enabled: true, civMode: true, globeOpen: false, cleanView: false, activeId: id,
      visible: !!(ov && (ov.visible ?? ov.isVisible ?? ov._visible)), tabIds: tabs }), null);
  };
  assert(active() === false, 'S3 mapa (nic otwarte) → scena renderowana');
  om.openPanel('intel');
  assert(active() === true, 'S3 otwarcie Wywiadu → composer pominięty');
  om.openPanel('war');
  assert(active() === true, 'S3 przełączenie na Wojny → pominięcie trwa');
  om.closeActive();
  assert(active() === false, 'S3 zamknięcie → pierwsza klatka renderuje scenę');
  om.openPanel('observatory');
  assert(active() === false, 'S3 Obserwatorium → nigdy pominięcia');
  om.openPanel('colony');
  om.overlays.colony.hide();   // zamknięcie od środka ([x]) — `active` jeszcze wisi do najbliższego draw
  assert(om.active === 'colony' && active() === false, 'S3 zamknięcie od środka → pominięcie wyłączone od razu (przed wyzerowaniem active)');
  om.openPanel('eventLog');
  assert(active() === false, 'S3 Dziennik (panel boczny) → scena renderowana');
  om.handleKey('f');
  assert(om.active === 'fleet' && active() === true, 'S3 klawisz F (Dowództwo) → pominięcie');
}

console.log('\n── S4 UIManager — tło i predykat (pin źródła) ──');
{
  const ui = src('../../scenes/UIManager.js');
  const m = methodBody(ui, 'isConsoleSceneActive() {');
  assert(/^\{\s*if \(GAME_CONFIG\.FEATURES\.consoleKit !== true\) return false;/.test(m), 'S4 pierwsza instrukcja: flaga czytana w chwili użycia, OFF → false');
  assert(m.includes('consoleSceneActive(') && m.includes('ov.visible ?? ov.isVisible ?? ov._visible') && m.includes('consoleTabIds(NAV_GROUPS)'),
    'S4 ten sam predykat, widoczność jak OverlayManager.draw, zakładki z NAV_GROUPS');
  const d = methodBody(ui, '_draw() {');
  const iClean = d.indexOf('if (this._cleanView)'), iBg = d.indexOf('if (this.isConsoleSceneActive())'), iTop = d.indexOf('this._topBar.draw(');
  const bgBlock = iBg >= 0 ? d.slice(iBg, d.indexOf('}', iBg)) : '';
  assert(iClean >= 0 && iBg > iClean && iTop > iBg, 'S4 tło po wczesnym wyjściu czystego widoku, PRZED TopBarem (paski i overlay malują się na nim)');
  assert(bgBlock.includes('ctx.fillStyle = THEME.bgPrimary') && bgBlock.includes('ctx.fillRect(0, 0, W, H)'), 'S4 tło = token bgPrimary na całym płótnie');
}

console.log('\n── S5 ThreeRenderer — pominięty tylko composer, tiki biegną (pin źródła) ──');
{
  const tr = src('../../renderer/ThreeRenderer.js');
  const loop = methodBody(tr, '_startLoop() {');
  const iDec = loop.indexOf('const sceneSkip = this._consoleBackdropTick();');
  const iIf = loop.indexOf('if (sceneSkip) {');
  const iElse = loop.indexOf('} else {', iIf);
  const skipBranch = iIf >= 0 && iElse > iIf ? loop.slice(iIf, iElse) : null;
  const elseBranch = iElse >= 0 ? methodBody(loop.slice(iElse), '} else {'.slice(2)) : '';
  assert(iDec >= 0 && iIf > iDec, 'S5 decyzja raz na klatkę, z `_consoleBackdropTick()`');
  assert(!!skipBranch && !/render\(|tick|_update|_sync/i.test(skipBranch.replace('_sceneSkipFrames', '')), 'S5 gałąź pominięcia nie woła renderu ani tików (tylko licznik)');
  assert(elseBranch.includes('this._composer.render()') && elseBranch.includes('this.renderer.render(this.scene, this.camera)')
    && elseBranch.includes('this._cvDir?.reel?.onFrame()'), 'S5 composer, fallback i nagrywarka rolek — wyłącznie w gałęzi renderu');
  assert(loop.split('this._composer.render()').length === 2, 'S5 kontrola: dokładnie jedno wywołanie composera w pętli (zielona po obu stronach)');
  const ticks = ['this._cvDir?.tickWarp(', 'this._tickCombatGlide()', 'this._tickBattleStage()', 'this._cvDir?.tickCamera()',
    'this._cameraController.update()', 'this._tickClouds()', 'this._updateActiveEffects(', 'this._tickCvFx()', 'this._tickCvModels()',
    'this._syncCombatReveal()', 'this._syncHud3dColors()'];
  const idx = ticks.map((t) => loop.indexOf(t));
  assert(idx.every((i) => i >= 0), `S5 świadek (zielony po obu stronach): wszystkie ${ticks.length} tików obecne w pętli`);
  assert(iDec >= 0 && idx.every((i) => i >= 0 && i < iDec), 'S5 każdy tik prezentacji PRZED decyzją o pominięciu (biegnie pod konsolą)');
  const sk = methodBody(tr, '_consoleSceneSkip() {');
  assert(sk.includes('window.KOSMOS?.uiManager?.isConsoleSceneActive?.() === true') && /catch \(e\) \{ return false; \}/.test(sk),
    'S5 stan ciągnięty z UIManagera co klatkę, błąd → renderuj (fail-open)');
}

console.log('\n── S6 flaga ──');
assert(GAME_CONFIG.FEATURES.consoleKit === true, 'S6 FEATURES.consoleKit zadeklarowana, ON w K0a');

console.log('\n── S7 tryby tła (D-K-5 poprawione): tabela predykatu ──');
{
  const B = (o) => safe(() => CS.consoleBackdrop(o), null);
  const eq = (a, b) => !!a && Object.keys(b).every((k) => a[k] === b[k]);
  assert(eq(B({ covered: true, mode: 'glass', wasCovered: false }), { filter: true, skip: false, scrim: true, opaque: false }), 'S7 glass, pierwsza klatka pod konsolą → świeży render + filtr + zasłona');
  assert(eq(B({ covered: true, mode: 'glass', wasCovered: true }), { filter: true, skip: true, scrim: true, opaque: false }), 'S7 glass, kolejne klatki → composer pominięty, filtr trwa');
  assert(eq(B({ covered: true, mode: 'live', wasCovered: true }), { filter: true, skip: false, scrim: true }), 'S7 live → filtr + zasłona, scena renderuje się');
  assert(eq(B({ covered: true, mode: 'opaque', wasCovered: false }), { filter: false, skip: true, opaque: true }), 'S7 opaque → bez filtra, pominięcie od razu, pełne krycie');
  for (const m of ['glass', 'live', 'opaque']) {
    assert(eq(B({ covered: false, mode: m, wasCovered: true }), { filter: false, skip: false, scrim: false, opaque: false }), `S7 ${m}, konsola zamknięta → filtr zdjęty, scena renderuje się`);
  }
  // Obserwatorium: predykat zasłonięcia false → żaden tryb nie filtruje ani nie pomija.
  const obsCovered = safe(() => CS.consoleSceneActive({ enabled: true, civMode: true, activeId: 'observatory', visible: true, tabIds: tabs }), null);
  assert(obsCovered === false && ['glass', 'live', 'opaque'].every((m) => eq(B({ covered: obsCovered, mode: m, wasCovered: true }), { filter: false, skip: false })),
    'S7 Obserwatorium → nigdy filtra ani pominięcia (w każdym trybie)');
  const dm = safe(() => CS.CONSOLE_GLASS_DEFAULTS.mode);
  assert(['glass', 'live', 'opaque'].includes(dm) && safe(() => CS.consoleBgMode({ mode: 'bogus' })) === dm, `S7 nieznany tryb → tryb domyślny (${dm})`);
  const css = safe(() => CS.glassFilterCss({ blur: 3, bright: 0.5, sat: 0.7 }), '');
  assert(/^blur\(3px\) brightness\(0\.5\) saturate\(0\.7\)$/.test(css), 'S7 filtr CSS składany z pokręteł (kształt, nie wartości domyślne)');
  const LL = await tryImport('../../ui/ConsoleLayoutLogic.js');
  const own = safe(() => CS.consoleScrimAlpha({ scrimAlpha: 0.2 }, { scrim: 0.9 }));
  const other = safe(() => CS.consoleScrimAlpha(LL.CONSOLE_SCREEN_SPECS?.economy, { scrim: 0.9 }));
  assert(own === 0.2 && other === 0.9 && !!LL?.CONSOLE_SCREEN_SPECS, 'S7 zasłona: specyfikacja ekranu nadpisuje pokrętło, brak wpisu → pokrętło');
}

console.log('\n── S8 renderer: filtr zdejmowany przy zamknięciu, DOM nietknięty przy OFF (pin źródła) ──');
{
  const tr = src('../../renderer/ThreeRenderer.js');
  const b = methodBody(tr, '_consoleBackdropTick() {');
  assert(b.includes("const css = bd.filter ? glassFilterCss(CONSOLE_GLASS) : '';") && b.includes("if (css !== (this._consoleFilterCss ?? ''))")
    && b.includes('el.style.filter = css;'), 'S8 zamknięcie (bd.filter false) → styl filter = pusty napis; zapis wyłącznie przy zmianie (OFF nie dotyka DOM)');
  assert(b.includes('wasCovered: this._consoleWasCovered === true') && b.includes("this._consoleWasCovered = covered && mode !== 'live';"),
    'S8 pierwsza klatka szkła świeża: wasCovered z poprzedniej klatki, zerowane po zamknięciu');
  assert(b.indexOf('this._consoleSceneSkip()') >= 0, 'S8 zasłonięcie z tego samego predykatu co UI');
  const HL = await tryImport('../../ui/HudLayer.js');
  const g = HL && safe(() => HL.hudGate({ civMode: true, uiManager: { overlayManager: { isAnyOpen: () => true } }, threeRenderer: {} }));
  assert(!!g && g.shown === false && g.reason === 'overlay', 'S8 #hud-canvas pod konsolą wyczyszczony (hudGate → overlay)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
