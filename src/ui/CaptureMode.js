// CaptureMode — TRYB NAGRYWANIA rolek (ARC COMBAT VISUALS, krok CV-7; flaga `cvDirector`).
// Chowa CAŁY interfejs (belki, outlinery, pasek walki, powiadomienia, okna DOM, warstwa HUD — etykiety, ikony, znak bitwy)
// i nakładki 3D „czystego widoku” (linie orbit, tras, handlu, celowniki); zostaje scena 3D i efekty walki. Opcjonalnie cienka
// ramka 9:16 POZA kadrem (przewodnik — `CvDirector`). Wyjście: Esc albo ten sam klawisz (`CAPTURE_KEY`) — wszystko wraca DOKŁADNIE:
//   • interfejs DOM i płótna chowa jedna klasa na <body> (`CAPTURE_CLASS`) z regułą CSS wstrzykniętą raz — żaden element nie
//     dostaje własnego stylu, więc zdjęcie klasy przywraca stan co do bitu;
//   • nakładki 3D — `renderer.setCleanView(true)`, przy wyjściu stan sprzed wejścia (gdy gracz miał już włączony „czysty widok”
//     klawiszem Shift, zostaje włączony); w trybie nagrywania Shift nie przełącza widoku (GameScene), więc stan się nie rozjedzie;
//   • `KOSMOS.captureMode` — UIManager nie łapie kliku ani kursora nad niewidocznym interfejsem.
// Czyste funkcje przyjmują dokument i renderer jako parametry (keeper `cv_director_logic_smoke` — atrapy pod node).

export const CAPTURE_CLASS = 'kosmos-capture';
export const CAPTURE_STYLE_ID = 'kosmos-capture-style';
/** Klawisz trybu nagrywania (wolny w grze: F7 — motyw, F5 / F11 / F12 — przeglądarka). */
export const CAPTURE_KEY = 'F9';

/** Reguła CSS: wszystko w #game-container poza sceną 3D, warstwą zdarzeń i przewodnikiem 9:16; wszystkie okna DOM poza grą (poza
 *  wskaźnikiem nagrywarki rolek „● REC” — element DOM, nie jest w nagraniu). */
export function captureCss() {
  return [
    `body.${CAPTURE_CLASS} #game-container > :not(#three-canvas):not(#event-layer):not(#cv916-guide) { visibility: hidden !important; }`,
    `body.${CAPTURE_CLASS} > :not(#game-container):not(#cv-rec-indicator):not(script):not(style) { visibility: hidden !important; }`,
  ].join('\n');
}

/** Klawisz przełączający tryb nagrywania (bez modyfikatorów). */
export function isCaptureKey(e) {
  return !!e && (e.key === CAPTURE_KEY || e.code === CAPTURE_KEY) && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
}

/**
 * Wejście: migawka stanu, który zmieniamy (klasa body, „czysty widok” renderera, flaga KOSMOS), potem zmiana.
 * @returns {{ hadClass:boolean, clean:boolean, kosmos:any }}
 */
export function enterCapture({ doc = null, renderer = null, K = null } = {}) {
  const snap = {
    hadClass: !!doc?.body?.classList?.contains?.(CAPTURE_CLASS),
    clean: renderer?._cleanView === true,
    kosmos: K ? K.captureMode : undefined,
  };
  if (doc?.head && !doc.getElementById?.(CAPTURE_STYLE_ID)) {
    const st = doc.createElement('style');
    st.id = CAPTURE_STYLE_ID;
    st.textContent = captureCss();
    doc.head.appendChild(st);
  }
  doc?.body?.classList?.add?.(CAPTURE_CLASS);
  if (renderer?.setCleanView && !snap.clean) renderer.setCleanView(true);
  if (K) K.captureMode = true;
  K?.hudLayer?.wake?.();
  return snap;
}

/** Wyjście: stan dokładnie z migawki (bez migawki — zdjęcie klasy i flagi, „czysty widok” bez zmian). */
export function exitCapture(snap, { doc = null, renderer = null, K = null } = {}) {
  const s = snap ?? { hadClass: false, clean: renderer?._cleanView === true, kosmos: undefined };
  if (!s.hadClass) doc?.body?.classList?.remove?.(CAPTURE_CLASS);
  if (renderer?.setCleanView && (renderer._cleanView === true) !== s.clean) renderer.setCleanView(s.clean);
  if (K) { if (s.kosmos === undefined) delete K.captureMode; else K.captureMode = s.kosmos; }
  if (K?.uiManager) K.uiManager._dirty = true;
  K?.hudLayer?.wake?.();
}
