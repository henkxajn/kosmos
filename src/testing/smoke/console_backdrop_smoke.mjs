// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// console_backdrop_smoke — KEEPER ARC KONSOLE KZ, Finding 755 (czytelność tekstu konsoli nad jasnym tłem)
// Plan: `docs/design/CONSOLES_PLAN.md` (KZ). Pinuje LOGIKĘ DECYZJI (jasność → siła poświaty, per strefa i per linia), nie stałe
// rysowania. Drugie podejście (decyzja właściciela): rośnie poświata TEKSTU, nie tło strefy (przyciemnianie dawało szary prostokąt).
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//   B1 luminancja sRGB: czerń 0, biel 1, kolejność kanałów (zieleń > czerwień > niebieski), siatka z RGBA
//   B2 jasność pod prostokątem: mapowanie UI → komórki siatki, percentyl (jasne fragmenty liczą się), × jasność filtra
//   B3 decyzja: ciemno / brak pomiaru → 0 (poświata bez zmian), rampa monotoniczna, jasno → pełna; siła → promień i przebiegi
//   B4 per strefa (nagłówek, lista, bohater, inspektor, pas) i per linia (prostokąt linii z fontu, wyrównania, linii bazowej)
//   B5 sygnatura pomiaru: zmiana jasności → inna sygnatura (przerysowanie UI), ta sama → ta sama
//   W  wykonanie poświaty adaptacyjnej na atrapie ctx (ciemno → oryginał bez zmian stanu; jasno → większa poświata; brak
//      prostokątów) + piny źródła: 9 ekranów konsoli wpiętych; próbnik ASYNC (blit → readPixels do PBO → fence, odbiór bez
//      czekania) — ścieżka klatki nigdy nie czyta pikseli synchronicznie; W7 tabela samplerAction (fallback nigdy na zegar)
//   W8 Finding 768: nowy magazyn PBO (bufferData STREAM_READ) przed każdym readPixels — bez ostrzeżenia Chrome co próbkę
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const B = await tryImport('../../ui/ConsoleBackdropLogic.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const safe = (fn, d = null) => { try { return fn(); } catch (e) { console.log('  ! ' + e.message); return d; } };
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

const K = { ...(B?.CONSOLE_BACKDROP_DEFAULTS ?? {}) };
// siatka 10×10: lewa połowa ciemna (0.02), prawa jasna (0.9); w lewej połowie jedna jasna komórka (szum)
const mkSample = (left = 0.02, right = 0.9) => {
  const gw = 10, gh = 10, luma = new Float32Array(gw * gh);
  for (let r = 0; r < gh; r++) for (let c = 0; c < gw; c++) luma[r * gw + c] = c < 5 ? left : right;
  luma[0] = 1;   // pojedyncza jasna komórka w lewym górnym rogu
  return { gw, gh, luma };
};

console.log('\n── B1 luminancja ──');
{
  assert(safe(() => B.srgbLuma(0, 0, 0)) === 0 && Math.abs(safe(() => B.srgbLuma(255, 255, 255), 0) - 1) < 1e-9, 'B1 czerń 0, biel 1');
  const r = safe(() => B.srgbLuma(255, 0, 0), 0), g = safe(() => B.srgbLuma(0, 255, 0), 0), b = safe(() => B.srgbLuma(0, 0, 255), 0);
  assert(g > r && r > b && b > 0, 'B1 zieleń > czerwień > niebieski (wagi Rec. 709)');
  assert(safe(() => B.srgbLuma(128, 128, 128), 0) < 0.5, 'B1 szarość 128 → < 0,5 (linearyzacja sRGB, nie średnia kanałów)');
  const g2 = safe(() => B.lumaGridFromRgba(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]), 2, 1), null);
  assert(!!g2 && g2.length === 2 && g2[0] === 0 && Math.abs(g2[1] - 1) < 1e-6, 'B1 siatka z RGBA: kolejność komórek i kanał alfa pominięty');
}

console.log('\n── B2 jasność pod prostokątem ──');
{
  const s = mkSample();
  const W = 1000, H = 500;
  const dark = safe(() => B.zoneLuma(s, { x: 0, y: 100, w: 400, h: 300 }, W, H, 1, K));
  const bright = safe(() => B.zoneLuma(s, { x: 600, y: 100, w: 300, h: 300 }, W, H, 1, K));
  assert(dark != null && dark < 0.05 && bright != null && bright > 0.85, `B2 prostokąt nad ciemną połową → ciemno (${dark?.toFixed?.(3)}), nad jasną → jasno (${bright?.toFixed?.(3)})`);
  const withNoise = safe(() => B.zoneLuma(s, { x: 0, y: 0, w: 400, h: 400 }, W, H, 1, K));
  assert(withNoise != null && withNoise < 0.05, 'B2 pojedyncza jasna komórka nie przełącza strefy (percentyl, nie maksimum)');
  const half = safe(() => B.zoneLuma(s, { x: 300, y: 0, w: 400, h: 500 }, W, H, 1, K));
  assert(half != null && half > 0.85, 'B2 strefa w połowie nad jasnym → jasno (percentyl 85, nie średnia)');
  const filtered = safe(() => B.zoneLuma(s, { x: 600, y: 100, w: 300, h: 300 }, W, H, 0.4, K));
  assert(filtered != null && Math.abs(filtered - bright * 0.4) < 1e-6, 'B2 jasność widziana = pomiar × jasność filtra sceny');
  assert(safe(() => B.zoneLuma({ gw: 0, gh: 0, luma: null }, { x: 0, y: 0, w: 10, h: 10 }, W, H, 1, K)) === null, 'B2 brak pomiaru → null');
  assert(safe(() => B.zoneLuma(s, { x: 2000, y: 0, w: 10, h: 10 }, W, H, 1, K)) === null, 'B2 prostokąt poza płótnem → null');
}

console.log('\n── B3 decyzja: jasność → siła poświaty ──');
{
  const a = (l) => safe(() => B.haloStrength(l, K), -1);
  assert(a(null) === 0 && a(NaN) === 0, 'B3 brak pomiaru → 0');
  assert(a(0) === 0 && a(K.LUMA_ON) === 0 && a(K.LUMA_ON * 0.5) === 0, 'B3 ciemne tło (≤ próg) → 0 (poświata bez zmian)');
  assert(a(K.LUMA_FULL) === 1 && a(5) === 1, 'B3 jasne tło (≥ pełny próg) → 1, klamra');
  const mid = a((K.LUMA_ON + K.LUMA_FULL) / 2);
  assert(Math.abs(mid - 0.5) < 1e-6, 'B3 rampa liniowa: w połowie progów połowa siły');
  const seq = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.5, 1].map(a);
  assert(seq.every((v, i) => i === 0 || v >= seq[i - 1]), 'B3 monotoniczna');
  const h = (t) => safe(() => B.haloFor(t, 2, K), 'x');
  assert(h(0) === null && h(-1) === null, 'B3 siła 0 → brak zmiany poświaty (null)');
  const h1 = h(0.25), h2 = h(0.75), h3 = h(1);
  assert(!!h1 && h1.blur > 2 && h2.blur > h1.blur && h3.blur === K.HALO_MAX, 'B3 promień rośnie od bazowego (2) do HALO_MAX');
  assert(h1.passes >= 1 && h2.passes >= h1.passes && h3.passes === K.PASSES_MAX, 'B3 przebiegi rosną 1 → PASSES_MAX');
  assert(K.LUMA_ON > 0 && K.LUMA_FULL > K.LUMA_ON && K.HALO_MAX > 2, 'B3 progi uporządkowane, maksimum ponad bazową poświatą');
}

console.log('\n── B4 per strefa i per linia ──');
{
  const W = 1000, H = 500;
  const zones = { header: { x: 0, y: 0, w: 1000, h: 30 }, list: { x: 0, y: 50, w: 300, h: 400 }, hero: { x: 310, y: 50, w: 380, h: 400 },
    inspector: { x: 700, y: 50, w: 290, h: 400 }, strip: { x: 310, y: 455, w: 380, h: 40 }, frame: { x: 0, y: 0, w: 1000, h: 500 } };
  const dark = safe(() => B.zoneHaloPlan(zones, mkSample(0.02, 0.02), W, H, 0.4, K), []);
  assert(dark.length === 5 && dark.every((p) => p.t === 0), 'B4 ciemne tło → siła 0 we wszystkich 5 strefach tekstu (świadek: 5 stref)');
  const right = safe(() => B.zoneHaloPlan(zones, mkSample(0.02, 0.9), W, H, 0.4, K), []);
  const tOf = (k) => right.find((p) => p.key === k)?.t;
  assert(tOf('inspector') === 1 && tOf('list') === 0, 'B4 jasno po prawej → inspektor pełna siła, lista bez zmian');
  assert(safe(() => B.HALO_ZONE_KEYS.join(','), '') === 'header,list,hero,inspector,strip', 'B4 reguła obejmuje każdą strefę tekstu (nagłówek, lista, bohater, inspektor, pas)');
  // per linia: prostokąt z fontu, wyrównania i linii bazowej (bez measureText)
  const r = safe(() => B.textRect('ABCDEFGHIJ', 100, 50, "bold 10px 'Share Tech Mono'", 'left', 'alphabetic', K), null);
  assert(!!r && Math.abs(r.w - 10 * K.EM_W * 10) < 1e-9 && r.x === 100 && r.y < 50 && r.y + r.h > 50, 'B4 prostokąt linii: szerokość = znaki × EM_W × px, linia bazowa w środku wysokości');
  const rr = safe(() => B.textRect('ABCD', 100, 50, '10px x', 'right', 'middle', K), null), rc = safe(() => B.textRect('ABCD', 100, 50, '10px x', 'center', 'top', K), null);
  assert(!!rr && rr.x + rr.w === 100 && rr.y === 45 && !!rc && Math.abs(rc.x + rc.w / 2 - 100) < 1e-9 && rc.y === 50, 'B4 wyrównanie right / center i linia bazowa middle / top');
  assert(safe(() => B.fontPx('bold 13px Foo'), 0) === 13 && safe(() => B.fontPx(''), 0) === 12, 'B4 rozmiar fontu z ctx.font (brak → 12)');
  // linia nad jasnym fragmentem w ciemnej strefie dostaje poświatę, linia obok — nie (rozdzielczość linii, nie strefy)
  const s = mkSample(0.02, 0.9);
  const tLine = (x) => safe(() => B.haloStrength(B.zoneLuma(s, B.textRect('XXXXXX', x, 100, '10px m', 'left', 'alphabetic', K), W, H, 0.4, K), K), -1);
  assert(tLine(560) === 1 && tLine(100) === 0, 'B4 linia nad jasnym → pełna siła, linia nad ciemnym → 0');
}

console.log('\n── B5 sygnatura pomiaru ──');
{
  const s1 = safe(() => B.sampleSignature(mkSample(0.02, 0.9).luma), ''), s2 = safe(() => B.sampleSignature(mkSample(0.02, 0.9).luma), '');
  const s3 = safe(() => B.sampleSignature(mkSample(0.02, 0.5).luma), '');
  assert(s1.length === 100 && s1 === s2 && s1 !== s3, 'B5 ten sam pomiar → ta sama sygnatura; zmiana jasności → inna');
  assert(safe(() => B.sampleSignature(null), 'x') === '', 'B5 brak pomiaru → pusta sygnatura');
}

console.log('\n── W wpięcie: poświata tekstu, renderer, overlaye ──');
{
  const KIT = await tryImport('../../ui/ConsoleKit.js');
  // atrapa ctx: prototypowe fillText zapisuje wywołanie ze stanem cienia; ustawienia właściwości zapisywane
  const mkCtx = () => {
    const log = [];
    const proto = { fillText(text, x, y) { log.push(`fillText(${text},${x},${y}) blur=${this.shadowBlur} col=${this.shadowColor}`); } };
    const ctx = Object.create(proto);
    const st = { font: '10px mono', textAlign: 'left', textBaseline: 'alphabetic', shadowBlur: 2, shadowColor: '#000', shadowOffsetX: 0, shadowOffsetY: 0 };
    for (const k of Object.keys(st)) Object.defineProperty(ctx, k, { get: () => st[k], set: (v) => { log.push(`${k}=${v}`); st[k] = v; }, configurable: true });
    return { ctx, log, proto };
  };
  const W = 1000, H = 500;
  if (KIT && B) {
    Object.assign(B.CONSOLE_BACKDROP, { ...mkSample(0.02, 0.02), at: 1 });
    const d = mkCtx();
    safe(() => KIT.withAdaptiveHalo(d.ctx, W, H, () => { d.ctx.fillText('Rejestr', 100, 100); d.ctx.fillText('Szczegóły', 800, 100); }));
    assert(d.log.length === 2 && d.log.every((l) => l.startsWith('fillText(') && l.includes('blur=2')), 'W1 ciemne tło → każde fillText = oryginał, zero zmian stanu ctx');
    assert(!Object.prototype.hasOwnProperty.call(d.ctx, 'fillText'), 'W1 po rysunku przechwycenie zdjęte (fillText znów z prototypu)');
    Object.assign(B.CONSOLE_BACKDROP, { ...mkSample(0.02, 0.9), at: 2 });
    const b = mkCtx();
    safe(() => KIT.withAdaptiveHalo(b.ctx, W, H, () => { b.ctx.fillText('lewa', 100, 100); b.ctx.fillText('prawa', 800, 100); }));
    const left = b.log.filter((l) => l.startsWith('fillText(lewa')), right = b.log.filter((l) => l.startsWith('fillText(prawa'));
    assert(left.length === 1 && left[0].includes('blur=2'), 'W2 linia nad ciemnym tłem → bez zmian (jedno wywołanie, poświata bazowa)');
    assert(right.length === 1 + K.PASSES_MAX && right.every((l) => l.includes(`blur=${K.HALO_MAX}`)), 'W2 linia nad jasnym → poświata HALO_MAX i PASSES_MAX dodatkowych przebiegów');
    assert(b.log[b.log.length - 1].startsWith('shadowOffsetY=') && b.log.includes('shadowBlur=2') && !b.log.some((l) => /fillRect|strokeRect/.test(l)),
      'W2 stan cienia przywrócony po linii; żadnych prostokątów ani wypełnień');
    B.clearBackdropSample();
    const n = mkCtx(); let ran = false;
    safe(() => KIT.withAdaptiveHalo(n.ctx, W, H, () => { ran = true; n.ctx.fillText('x', 900, 100); }));
    assert(ran && n.log.length === 1 && !Object.prototype.hasOwnProperty.call(n.ctx, 'fillText'), 'W3 brak pomiaru → rysunek bez przechwycenia');
  } else assert(false, 'W ConsoleKit / logika importowalne');

  const tr = src('../../renderer/ThreeRenderer.js');
  const iR = tr.indexOf('this._sceneRenderFrames++;'), iS = tr.indexOf('this._sampleConsoleBackdrop();', iR), iReel = tr.indexOf('this._cvDir?.reel?.onFrame()', iR);
  assert(iR >= 0 && iS > iR && iReel > iS, 'W4 próbnik zaraz po renderze klatki, przed nagrywarką rolek');
  const body = (name) => { const i = tr.indexOf(`  ${name}(`); if (i < 0) return ''; const j = tr.indexOf('\n  }\n', i); return tr.slice(i, j); };
  const main = body('_sampleConsoleBackdrop'), start = body('_bdStart'), poll = body('_bdPoll'), fb = body('_bdFallback');
  assert(main.length > 0 && start.length > 0 && poll.length > 0 && fb.length > 0, 'W4 świadek: metody próbnika znalezione');
  assert(main.includes('samplerAction({') && /act === 'fallback'\) \{ this\._bdCamLast = camSig; this\._bdFallback\(\); \}/.test(main)
    && main.includes("act === 'poll') this._bdPoll(gl)") && main.includes("act === 'start') this._bdStart(gl)"), 'W4 decyzja z samplerAction; odczyt synchroniczny wyłącznie w gałęzi fallback');
  const rp = start.match(/gl\.readPixels\([^)]*\)/g) ?? [];
  assert(rp.length === 1 && /, 0\)$/.test(rp[0]) && start.indexOf('gl.bindBuffer(gl.PIXEL_PACK_BUFFER, R.pbo)') < start.indexOf('gl.readPixels(')
    && start.includes('gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)'), 'W4 zlecenie: jedyne readPixels idzie do PBO (offset 0, PBO związany wcześniej) + fence');
  assert(/gl\.clientWaitSync\(this\._bdFence, 0, 0\)/.test(poll) && poll.indexOf('TIMEOUT_EXPIRED) return') < poll.indexOf('getBufferSubData'),
    'W4 odbiór: fence sprawdzany z limitem 0 (bez czekania), dane z PBO dopiero po sygnale');
  const syncRead = /readPixels|getImageData|drawImage/;
  assert(!syncRead.test(main) && !syncRead.test(poll) && !/getImageData|drawImage/.test(start), 'W4 ścieżka klatki (decyzja, zlecenie, odbiór) bez synchronicznego odczytu pikseli');
  assert(/getImageData|drawImage/.test(fb) && tr.split('this._bdFallback()').length === 2, 'W4 odczyt przez płótno 2D tylko w fallbacku, wołanym z jednego miejsca');
  assert(start.includes('gl.blitFramebuffer(0, 0, cw, ch, 0, 0, cw, ch, gl.COLOR_BUFFER_BIT, gl.NEAREST)') && start.includes('gl.blitFramebuffer(0, 0, cw, ch, 0, 0, gw, gh, gl.COLOR_BUFFER_BIT, gl.LINEAR)'),
    'W4 zmniejszenie na GPU: rozwiązanie MSAA 1:1, potem blit do siatki');
  assert(poll.includes('lumaGridFromRgba(R.buf, R.gw, R.gh, true)'), 'W4 dane z readPixels odwracane w pionie (początek w lewym dolnym rogu)');
  // Finding 768 — każde zlecenie zakłada NOWY magazyn PBO (STREAM_READ) między związaniem R.pbo a readPixels; bez tego Chrome
  //   ostrzega przy każdej próbce (kopia cienia bufora READ z poprzedniego fence unieważniona zapisem).
  const iBind = start.lastIndexOf('gl.bindBuffer(gl.PIXEL_PACK_BUFFER, R.pbo)'), iRp = start.indexOf('gl.readPixels(');
  const respec = iBind >= 0 && iRp > iBind ? start.slice(iBind, iRp) : '';
  assert(respec.includes('gl.bufferData(gl.PIXEL_PACK_BUFFER, gw * gh * 4, gl.STREAM_READ);') && (respec.match(/gl\.\w+\(/g) ?? []).length === 2
    && (start.match(/gl\.bufferData\(/g) ?? []).length === 2,
    'W8 (768) zlecenie: bufferData(PIXEL_PACK_BUFFER, gw·gh·4, STREAM_READ) tuż przed readPixels, po związaniu R.pbo (+ alokacja = 2)');
  assert(start.indexOf('gl.bufferData(') >= 0 && start.indexOf('gl.bufferData(') < start.indexOf('R = this._bdGl = {')
    && !/STREAM_DRAW|DYNAMIC_|STATIC_/.test(start), 'W8 (768) kontrola: alokacja przy (re)tworzeniu zasobów zostaje, jedyny rodzaj użycia = STREAM_READ');
  assert(main.includes('catch (e) { this._bdDropFence(gl); clearBackdropSample(); }') && /act === 'clear'\) \{ this\._bdDropFence\(gl\); clearBackdropSample\(\);/.test(main),
    'W4 bez konsoli / błąd → fence zwolniony, pomiar wyczyszczony');
  assert(tr.includes('if (sig !== this._bdSig) { this._bdSig = sig; const u = window.KOSMOS?.uiManager; if (u) u._dirty = true; }'), 'W4 zmiana pomiaru → jedna klatka UI');
  // tabela decyzji próbnika
  const A = (o) => safe(() => B.samplerAction({ covered: true, wasCovered: true, now: 1000, lastAt: 900, pending: false, hasSample: true, asyncOk: true, camMoved: false, ...o }, K), '?');
  assert(A({ covered: false }) === 'clear' && A({ covered: false, hasSample: false, pending: true }) === 'clear' && A({ covered: false, hasSample: false }) === 'idle', 'W7 konsola zamknięta → wyczyść (albo nic, gdy nie ma czego)');
  assert(A({ pending: true }) === 'poll' && A({ pending: true, lastAt: -1e9 }) === 'poll', 'W7 async: odczyt w toku → tylko sprawdzenie fence (nowe zlecenie dopiero po odbiorze)');
  assert(A({}) === 'idle' && A({ lastAt: 1000 - K.SAMPLE_MS }) === 'start' && A({ hasSample: false }) === 'start', `W7 async: kadencja ${K.SAMPLE_MS} ms, brak pomiaru → zlecenie od razu`);
  const F = (o) => A({ asyncOk: false, ...o });
  assert(F({ lastAt: -1e9 }) === 'idle' && F({ now: 1e9 }) === 'idle', 'W7 fallback: NIGDY na zegar (dowolnie długo bez ruchu kamery → nic)');
  assert(F({ wasCovered: false }) === 'fallback' && F({ camMoved: true }) === 'fallback' && F({ hasSample: false }) === 'fallback', 'W7 fallback: otwarcie konsoli / ruch kamery / brak pomiaru → odczyt');
  const g = safe(() => B.lumaGridFromRgba(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), 1, 2, true), null);
  assert(!!g && g[0] === 0 && Math.abs(g[1] - 1) < 1e-6, 'W7 odwrócenie w pionie: wiersz dolny bufora → wiersz górny siatki');

  const ovs = ['CivilizationOverlay', 'DysonOverlay', 'DiplomacyOverlay', 'IntelOverlay', 'WarOverlay', 'EconomyOverlay', 'TradeOverlay', 'ShipyardOverlay', 'FleetManagerOverlay'];
  const bad = ovs.filter((o) => {
    const s = src(`../../ui/${o}.js`);
    const iH = s.indexOf('applyConsoleHalo(ctx);'), iW = s.indexOf('withAdaptiveHalo(ctx, W, H, () =>', iH);
    return !(iH >= 0 && iW > iH && iW - iH < 120 && s.split('withAdaptiveHalo(ctx, W, H,').length === 2);
  });
  assert(ovs.length === 9 && bad.length === 0, `W5 każdy z 9 ekranów konsoli rysuje się w poświacie adaptacyjnej, zaraz po poświacie bazowej${bad.length ? ' — brak: ' + bad.join(',') : ''}`);
  const views = ['CivilizationConsoleView', 'CommandConsoleView', 'DiplomacyConsoleView', 'EconomyConsoleView', 'ShipyardConsoleView', 'TradeConsoleView', 'WarConsoleView'];
  assert(views.every((v) => !src(`../../ui/${v}.js`).includes('drawBackdropVeils')) && !!KIT && !('drawBackdropVeils' in KIT), 'W6 przyciemnianie stref (pierwsze podejście) usunięte (świadek: ConsoleKit wczytany)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
