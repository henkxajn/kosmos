// ColonyDevScore — JEDNA miara „jak rozwinięte jest to ciało" (WOJNA I POKÓJ 1.0, WP-2).
//
// Wzór żył dotąd INLINE w `TerritoryService._rebuild` i miał tam jedynego czytelnika.
// WP-2 potrzebuje go drugi raz (wartość ciała przy stole pokoju), a DRUGA KOPIA wzoru
// rozjechałaby się przy pierwszej zmianie definicji rozwoju — strefa wpływów na mapie
// i cena kolonii przy stole zaczęłyby opisywać dwa różne światy. Stąd wariant (C) planu:
// helper + JEDNA linia w `TerritoryService`, z pinem RÓWNOŚCI WYKONANIOWEJ w keeperze
// (`wp_territorial_terms_smoke` T14c), nie z obietnicą w komentarzu.
//
// ⚠ ZERO importów (wzór `ColonyOwnership.js` / `SystemExploration.js`): moduł ma być
//   node-testowalny i wolny od cykli — wołają go i system mapy, i silnik akceptacji.
//
// ⚠ DEGRADUJE DO 0, NIE RZUCA. Przy stole pokoju cesja może dotyczyć ciała BEZ kolonii
//   (goła skała, placówka po zniszczeniu), a `TerritoryService` woła to w pętli przebudowy
//   indeksu, która biegnie po ŻYWYM rejestrze w trakcie zmian własności. W obu miejscach
//   wyjątek byłby gorszy od zera: tam brak kolonii jest STANEM GRY, nie błędem wpięcia.

/**
 * Rozwój kolonii = populacja + liczba AKTYWNYCH budynków.
 *
 * ⚠ Skala: dojrzała stolica osiąga ~195 (zmierzone na `GATE-S4-fresh-gy60`: pop ~170 +
 *   ~25 budynków). Jest to istotne dla wołających, którzy porównują devScore ze stałą —
 *   `GameConfig.TERRITORY.DEV_FULL` (20) nasyca się już przy ~10 % rozwiniętej kolonii.
 *
 * @param {Object|null|undefined} colony — stan kolonii z ColonyManager
 * @returns {number} devScore ≥ 0
 */
export function colonyDevScore(colony) {
  return (colony?.civSystem?.population ?? 0) + (colony?.buildingSystem?._active?.size ?? 0);
}
