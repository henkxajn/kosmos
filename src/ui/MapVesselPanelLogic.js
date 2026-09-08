// MapVesselPanelLogic — czysta reguła: KTÓRA powierzchnia obsługuje bieżące zaznaczenie mapy.
//
// PO CO OSOBNY MODUŁ (a nie `if` w UIManagerze): `UIManager` NIE IMPORTUJE SIĘ pod node
// (`THREE.TextureLoader is not a constructor` — ta sama ściana co `ColonyOverlay`; stub `three`
// celowo nie wystawia loadera i NIE WOLNO go podnosić). Reguła zaszyta w `UIManager` byłaby
// niepinowalna wykonaniem. Wzór: `FleetGroupPanelLogic`, `PanelDockLogic`, `ColonyModalLogic`.
//
// ZERO importów — moduł jest czysty i node-testowalny.

/**
 * Rozstrzyga powierzchnię dla bieżącego zaznaczenia statków na mapie 3D (D-MVP-3).
 *
 * ⚠ KLUCZEM JEST **LICZBA**, NIE DROGA DOJŚCIA. `removeFromSelection` przy N==2 też ląduje
 *   na N==1 — i ma dać ten sam wynik co świeży single-select. Gdyby reguła patrzyła na
 *   „jak tu trafiliśmy" (poprzedni stan, typ zdarzenia), te dwie drogi rozjechałyby się
 *   i panel migałby zależnie od historii kliknięć. Dlatego `prevCount` jest CELOWO ignorowany
 *   — przyjmujemy go tylko po to, żeby wołający nie musiał go odfiltrowywać.
 *
 * @param {string[]|null|undefined} vesselIds — `vesselIds` z `ui:selectionChanged`
 * @param {{ flagOn?: boolean, prevCount?: number }} [opts]
 *        flagOn — `FEATURES.mapVesselPanel`; `false` ⇒ zachowanie sprzed slice'u 258 (grupa od N==1)
 * @returns {'none'|'vessel'|'group'}
 */
export function resolveMapSelectionSurface(vesselIds, opts = {}) {
  const n = Array.isArray(vesselIds) ? vesselIds.length : 0;
  if (n === 0) return 'none';
  // Kill-switch: bez flagi pojedynczy statek obsługuje GRUPA, dokładnie jak przed 258.
  if (opts.flagOn === false) return 'group';
  return n === 1 ? 'vessel' : 'group';
}

/**
 * Kotwica pływającego panelu statku (slice B, commit 2) — CZYSTA reguła, bez DOM i bez three.
 *
 * ⚠ KONWERSJA `/uiScale` JEST OBOWIĄZKOWA. `ThreeRenderer.getVesselScreenPosition` liczy z
 *   `window.innerWidth/Height`, czyli px CSS, a overlay 2D rysuje pod transformatą UI_SCALE
 *   (`UIManager._draw`: `setTransform(UI_SCALE * _DPR, ...)`). Bez dzielenia pozycja rozjeżdża
 *   się na KAŻDEJ rozdzielczości ≠ 1280×720 (kanon: `MapLabelLogic.toLogicalPx`, Aneks A.3).
 *   ⚠ `StationPanel:117-120` tej konwersji NIE robi — to defekt PRE-EXISTING, osobny finding;
 *   tutaj świadomie NIE powielamy tamtego wzorca.
 *
 * ⚠ `null` (statek za kamerą albo ZADOKOWANY — brak sprite'a, `ThreeRenderer:4783`) NIE chowa
 *   panelu: wracamy do kotwicy przy prawej krawędzi, czyli tam, gdzie kolumna A stała od 258.
 *   Chowanie panelu odebrałoby graczowi rozkazy dokładnie wtedy, gdy statek zniknął z kadru.
 *
 * @param {{x:number,y:number}|null} screenPos — px CSS z `getVesselScreenPosition`
 * @param {number} uiScale
 * @param {{ox:number,oy:number,ow:number,oh:number}} bounds — obszar mapy (px LOGICZNE)
 * @param {number} panelW @param {number} panelH
 * @param {number} offset — odsunięcie w prawo-dół od sprite'a
 * @returns {{x:number, y:number, anchored:boolean}}
 */
export function resolveVesselPanelAnchor(screenPos, uiScale, bounds, panelW, panelH, offset = 24) {
  const b = bounds ?? { ox: 0, oy: 0, ow: 0, oh: 0 };
  const s = (Number.isFinite(uiScale) && uiScale > 0) ? uiScale : 1;
  const ok = !!screenPos && Number.isFinite(screenPos.x) && Number.isFinite(screenPos.y);
  if (!ok) {
    // Fallback: prawa krawędź obszaru mapy (pozycja kolumny A ze slice'u 258).
    return { x: b.ox + Math.max(0, b.ow - panelW - 12), y: b.oy + 8, anchored: false };
  }
  // Prawo-dół od sprite'a: panel NIE zakrywa statku, bo start leży poza jego promieniem.
  return { x: screenPos.x / s + offset, y: screenPos.y / s + offset, anchored: true };
}
