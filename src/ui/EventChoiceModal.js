// EventChoiceModal — modal DOM do wyświetlania zdarzeń losowych
//
// Wyświetla powiadomienie o zdarzeniu losowym z opcjonalnym wyborem gracza.
// Styl: sci-fi, ciemny panel, z-index 100 (nad wszystkim).

const MODAL_TIMEOUT = 8000; // ms — auto-zamknięcie po 8 sekundach

/**
 * Pokaż powiadomienie o zdarzeniu losowym.
 * @param {Object} event — definicja zdarzenia z RandomEventsData
 * @param {string} colonyName — nazwa kolonii
 * @returns {Promise<void>}
 */
export function showEventNotification(event, colonyName) {
  return new Promise(resolve => {
    // Kontener
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      z-index: 100; display: flex; justify-content: center; align-items: flex-start;
      padding-top: 80px; pointer-events: none;
    `;

    // Panel
    const panel = document.createElement('div');
    const borderColor = event.severity === 'danger' ? '#cc4422'
                      : event.severity === 'warning' ? '#ffaa44'
                      : '#2288cc';
    const bgColor = event.severity === 'danger' ? 'rgba(60,10,10,0.95)'
                  : event.severity === 'warning' ? 'rgba(40,30,5,0.95)'
                  : 'rgba(8,20,40,0.95)';
    panel.style.cssText = `
      background: ${bgColor}; border: 1px solid ${borderColor};
      border-radius: 6px; padding: 16px 24px; max-width: 400px; min-width: 280px;
      font-family: monospace; color: #c8e8ff; pointer-events: auto;
      box-shadow: 0 0 20px rgba(0,0,0,0.7); animation: slideDown 0.3s ease-out;
    `;

    // Nagłówek
    const header = document.createElement('div');
    header.style.cssText = 'font-size: 14px; margin-bottom: 8px; font-weight: bold;';
    header.textContent = `${event.icon} ${event.namePL}`;
    panel.appendChild(header);

    // Kolonia
    const colony = document.createElement('div');
    colony.style.cssText = 'font-size: 10px; color: #6888aa; margin-bottom: 8px;';
    colony.textContent = `Kolonia: ${colonyName}`;
    panel.appendChild(colony);

    // Opis
    const desc = document.createElement('div');
    desc.style.cssText = 'font-size: 11px; color: #88aacc; margin-bottom: 12px; line-height: 1.4;';
    desc.textContent = event.description;
    panel.appendChild(desc);

    // Czas trwania
    if (event.duration > 0) {
      const dur = document.createElement('div');
      dur.style.cssText = 'font-size: 9px; color: #6888aa; margin-bottom: 8px;';
      dur.textContent = `Czas trwania: ${event.duration} lat`;
      panel.appendChild(dur);
    }

    // Przycisk OK
    const btn = document.createElement('button');
    btn.style.cssText = `
      background: rgba(20,40,60,0.9); border: 1px solid ${borderColor};
      color: #88ffcc; padding: 4px 16px; cursor: pointer; font-family: monospace;
      font-size: 11px; border-radius: 3px;
    `;
    btn.textContent = 'OK';
    btn.onclick = close;
    panel.appendChild(btn);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Auto-zamknięcie po timeout
    const timer = setTimeout(close, MODAL_TIMEOUT);

    function close() {
      clearTimeout(timer);
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      resolve();
    }

    // Keydown: Enter/Escape zamyka
    const onKey = (e) => {
      if (e.code === 'Enter' || e.code === 'Escape') {
        e.stopPropagation();
        document.removeEventListener('keydown', onKey);
        close();
      }
    };
    document.addEventListener('keydown', onKey);
  });
}

// Animacja CSS wstrzykiwana do <head>
(function injectStyle() {
  if (document.getElementById('event-modal-style')) return;
  const style = document.createElement('style');
  style.id = 'event-modal-style';
  style.textContent = `
    @keyframes slideDown {
      from { transform: translateY(-30px); opacity: 0; }
      to   { transform: translateY(0);     opacity: 1; }
    }
  `;
  document.head.appendChild(style);
})();
