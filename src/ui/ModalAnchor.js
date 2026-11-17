// ARC KONSOLE K7-B — kotwica okna dialogowego DOM (zmiana nazwy, potwierdzenie, wybór floty) z prostokąta strefy konsoli.
//
// `anchor` = `{ left, top, width }` w px CSS (liczone przez `dialogAnchorCss` z `consoleZones` i skali UI — bez `window.inner*`).
// Bez kotwicy — nic się nie zmienia (dzisiejsze okno wyśrodkowane flexem, bit w bit).

/** Przesuwa panel okna z środka ekranu na kotwicę (overlay dalej przyciemnia cały ekran i łapie Esc / klik tła). */
export function applyModalAnchor(overlay, panel, anchor) {
  if (!anchor || !overlay || !panel) return false;
  Object.assign(overlay.style, { alignItems: 'flex-start', justifyContent: 'flex-start' });
  Object.assign(panel.style, {
    position: 'absolute',
    left: `${Math.round(anchor.left)}px`,
    top: `${Math.round(anchor.top)}px`,
    width: `${Math.round(anchor.width)}px`,
    maxWidth: 'none',
    boxSizing: 'border-box',
  });
  return true;
}
