// EmpireName — nazwa imperium w meldunkach o TRAKTACIE i jego skutkach (pokój, wycofanie wojsk) — JEDNO źródło
// (G2-4 F6, bramka live 2026-10-04).
//
// ⚠ Dwa wpisy tej samej chwili czytały nazwę na dwa sposoby: wpis pokoju (`UIManager`, `log.diplo.peaceSigned`) brał
//   nazwę z rejestru imperiów bez warunku wywiadu, a wpis wycofania (`NotificationCenter`) — z regułą „nazwa dopiero
//   przy wywiadzie `detailed`” ⇒ na bramce „Peace with Unknown empire” tuż obok „Peace with Konsorcjum Siódmego Kręgu”.
//   Strona traktatu jest znana z samego traktatu, więc meldunki o traktacie nazywają ją ZAWSZE — reguła wpisu pokoju.
// ⚠ Reguła mgły wojny dla OBSERWACJI imperium (mobilizacja W2-7, utrata kafli) zostaje w
//   `NotificationCenter._empireLabel` — tamte meldunki opisują to, co gracz widzi u obcych, nie umowę z nimi.
// ⚠ `namePL` przed `name` — jak dotąd w `UIManager` (Finding 295: `nameEN` nie jest czytane). Poprawka języka nazwy
//   imperium to osobna decyzja, a ta funkcja jest JEDYNYM miejscem, w którym trzeba ją wtedy wprowadzić.
// ⚠ Zero importów — odczyt przez `window.KOSMOS` (moduł node-testowalny).

/**
 * Nazwa imperium do meldunku o traktacie (pokój, wycofanie).
 * @param {string|null|undefined} empireId
 * @returns {string} nazwa z rejestru, inaczej id, inaczej „?”
 */
export function empireLogName(empireId) {
  const reg = (typeof window !== 'undefined') ? window.KOSMOS?.empireRegistry : null;
  const emp = empireId ? reg?.get?.(empireId) : null;
  return emp?.namePL ?? emp?.name ?? empireId ?? '?';
}
