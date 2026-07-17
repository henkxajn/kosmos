// SaveFile — eksport/import zapisu do pliku .json na dysku gracza
//
// Rozdział ról obu magazynów (świadoma decyzja projektowa):
//   localStorage 'kosmos_save_v1' → BIEŻĄCA gra: autozapis, ochrona przed crashem/F5, jeden slot
//   plik .json na dysku           → TRWAŁE zapisy gracza: ręczne, nieograniczone, przenośne
// Pliki pełnią rolę slotów — system plików gracza jest lepszym menedżerem zapisów niż
// picker w grze (własne nazwy, foldery, kopie zapasowe). Dlatego NIE ma multi-slotu w UI.
//
// Moduł jest czysto pomocniczy: NIE dotyka localStorage (to robi SaveSystem.exportSave/importSave)
// i NIE przeładowuje gry — o obu decyduje wywołujący.

const MAX_SLUG_LEN  = 30;   // spójne z maxlength inputu nazwy cywilizacji (IntroModal)
const PICK_GRACE_MS = 500;  // okno na zdarzenie 'change' po powrocie fokusu (anulowanie dialogu)

/**
 * Powody odrzucenia z SaveSystem.importSave() → klucze i18n.
 * Trzymane tu (a nie w UI), bo konsumują je oba wejścia importu: menu w grze i ekran tytułowy.
 */
export const IMPORT_REASON_KEYS = {
  parse_error:    'saveFile.reasonParseError',
  not_object:     'saveFile.reasonNotObject',
  no_version:     'saveFile.reasonNoVersion',
  future_version: 'saveFile.reasonFutureVersion',
  too_old:        'saveFile.reasonTooOld',
  write_error:    'saveFile.reasonWriteError',
};

/**
 * Zamienia dowolny tekst gracza na fragment bezpieczny w nazwie pliku.
 * Zdejmuje diakrytyki (ą→a, é→e); 'ł' mapowane osobno, bo NIE dekomponuje się w NFKD.
 * Przycięcie długości PO sanityzacji — inaczej cięcie mogłoby zostawić wiszący '_'.
 * @param {string} raw
 * @returns {string} slug [A-Za-z0-9_] lub '' gdy nic nie zostało
 */
export function slugify(raw) {
  return String(raw ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')                   // znaki łączące (diakrytyki)
    .replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_SLUG_LEN)
    .replace(/_+$/g, '');                              // sprzątnij ogon po przycięciu
}

/**
 * Buduje nazwę pliku Z ZAWARTOŚCI zapisu (nie z żywego window.KOSMOS) — funkcja czysta,
 * dzięki czemu działa tak samo w grze, na ekranie tytułowym i w teście.
 * Nazwa cywilizacji jest serializowana w civ4x.civName (SaveSystem._serializeCiv4x).
 * W scenariuszu 'generator' civ4x === null → segment nazwy pomijany.
 * @param {object} data — sparsowany obiekt zapisu
 * @returns {string} np. 'kosmos_Zjednoczona_Federacja_r39_v90.json' albo 'kosmos_r5_v90.json'
 */
export function buildSaveFileName(data) {
  const slug    = slugify(data?.civ4x?.civName);
  const year    = Math.round(Number(data?.gameTime) || 0);
  const version = Number.isFinite(data?.version) ? data.version : '0';

  const parts = ['kosmos'];
  if (slug) parts.push(slug);
  parts.push(`r${year}`, `v${version}`);
  return `${parts.join('_')}.json`;
}

/**
 * Pobiera surowy JSON jako plik (Blob + <a download>).
 * @param {string} raw       — surowa treść zapisu
 * @param {string} filename  — nazwa pliku z buildSaveFileName()
 * @returns {boolean} czy pobranie wystartowało
 */
export function downloadSave(raw, filename) {
  try {
    const blob = new Blob([raw], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (e) {
    console.warn('[SaveFile] pobranie pliku nieudane:', e?.message);
    return false;
  }
}

/**
 * Otwiera natywny dialog wyboru pliku i zwraca jego treść jako tekst.
 * Natywny dialog robi całe UI — nie potrzeba własnego overlaya.
 * @returns {Promise<string|null>} treść pliku albo null (anulowano / błąd odczytu)
 */
export function pickSaveFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = 'application/json,.json';

    let settled = false;
    let reading = false;                                // trwa odczyt — nie przerywaj go timeoutem
    const finish = (val) => { if (!settled) { settled = true; resolve(val); } };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) { finish(null); return; }
      reading = true;
      const reader = new FileReader();
      reader.onload  = () => finish(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => { console.warn('[SaveFile] odczyt pliku nieudany'); finish(null); };
      reader.readAsText(file);
    });

    // Anulowanie natywnego dialogu NIE emituje 'change' → bez tego Promise wisiałby wiecznie.
    // Powrót fokusu do okna = dialog zamknięty; grace period przepuszcza 'change' przy wyborze
    // pliku, a flaga `reading` chroni odczyt dużych zapisów przed przedwczesnym null.
    window.addEventListener('focus', () => {
      setTimeout(() => { if (!reading) finish(null); }, PICK_GRACE_MS);
    }, { once: true });

    input.click();
  });
}
