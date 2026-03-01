// ModalInput — stylizowany modal do zmiany nazwy (zastępuje window.prompt)
//
// Tworzy DOM overlay z inputem pasującym do sci-fi estetyki gry.
// Zwraca Promise<string|null> — nowa nazwa lub null (anulowano).

/**
 * Wyświetla modal do zmiany nazwy obiektu.
 * @param {string} currentName — aktualna nazwa (wstawiona w input)
 * @returns {Promise<string|null>} — nowa nazwa lub null
 */
export function showRenameModal(currentName) {
  return new Promise((resolve) => {
    // ── Dimming overlay ───────────────────────────────────────
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0',
      background: 'rgba(0,0,0,0.6)',
      zIndex: '100',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });

    // ── Panel ─────────────────────────────────────────────────
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      background: '#0a1628',
      border: '1px solid #1a3050',
      borderRadius: '6px',
      boxShadow: '0 0 30px rgba(0,80,120,0.3)',
      padding: '18px 24px',
      width: '300px',
      fontFamily: 'monospace',
    });

    // ── Tytuł ─────────────────────────────────────────────────
    const title = document.createElement('div');
    title.textContent = 'ZMIEŃ NAZWĘ';
    Object.assign(title.style, {
      color: '#88ffcc',
      fontSize: '13px',
      marginBottom: '12px',
      letterSpacing: '1px',
    });
    panel.appendChild(title);

    // ── Input ─────────────────────────────────────────────────
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.maxLength = 30;
    Object.assign(input.style, {
      width: '100%',
      boxSizing: 'border-box',
      background: '#060d18',
      border: '1px solid #1a3050',
      borderRadius: '3px',
      color: '#c8e8ff',
      fontFamily: 'monospace',
      fontSize: '14px',
      padding: '8px 10px',
      outline: 'none',
      marginBottom: '16px',
    });
    // Focus glow
    input.addEventListener('focus', () => {
      input.style.borderColor = '#3a6090';
      input.style.boxShadow = '0 0 8px rgba(58,96,144,0.4)';
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = '#1a3050';
      input.style.boxShadow = 'none';
    });
    panel.appendChild(input);

    // ── Przyciski ─────────────────────────────────────────────
    const btnRow = document.createElement('div');
    Object.assign(btnRow.style, {
      display: 'flex', justifyContent: 'flex-end', gap: '10px',
    });

    const makeBtn = (label, borderColor, textColor) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      Object.assign(btn.style, {
        background: 'transparent',
        border: `1px solid ${borderColor}`,
        borderRadius: '3px',
        color: textColor,
        fontFamily: 'monospace',
        fontSize: '11px',
        padding: '6px 18px',
        cursor: 'pointer',
        letterSpacing: '0.5px',
      });
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(255,255,255,0.05)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent';
      });
      return btn;
    };

    const btnCancel = makeBtn('ANULUJ', '#3a5068', '#6888aa');
    const btnOk     = makeBtn('OK', '#226644', '#44ff88');

    btnRow.appendChild(btnCancel);
    btnRow.appendChild(btnOk);
    panel.appendChild(btnRow);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // ── Cleanup + resolve ─────────────────────────────────────
    const cleanup = () => {
      document.body.removeChild(overlay);
    };

    const submit = () => {
      const val = input.value.trim();
      cleanup();
      resolve(val || null);
    };

    const cancel = () => {
      cleanup();
      resolve(null);
    };

    btnOk.addEventListener('click', submit);
    btnCancel.addEventListener('click', cancel);

    // Klik na dimming = anuluj
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cancel();
    });

    // Klawisze: Enter = OK, Escape = Anuluj
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  { e.preventDefault(); submit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      e.stopPropagation(); // nie propaguj do GameScene (Space, 1-5, etc.)
    });

    // Autofocus z zaznaczeniem tekstu
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });
}
