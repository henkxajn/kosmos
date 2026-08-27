// StratcomHitLogic — rozstrzyganie trafien na mapie galaktyki. Plan: docs/design/STRATCOM_CONTROL_PLAN.md
// (Finding 109). Czysty modul, zero importow — pinowalny WYKONANIEM.
//
// PO CO TO ISTNIEJE: `FleetManagerOverlay` nosil DWIE PRZECIWNE reguly rozstrzygania tego samego
// trafienia. Klik iterowal strefy od konca (wygrywa OSTATNIA pushowana), hover od poczatku
// (wygrywa PIERWSZA). Poniewaz `_stratcomVisibleSystems` sortuje rosnaco po odleglosci, a strefy
// gwiazd maja 22x22 px przy promieniu glifu <= 7, dawalo to deterministyczny rozjazd:
// HOVER PODSWIETLAL BLIZSZY UKLAD, A KLIK WYBIERAL DALSZY (zmierzone w grze 15/15).
//
// ⚠ TO KLIK MIAL RACJE, NIE HOVER — ale zadne z nich nie mialo racji DO KONCA. Rysowanie idzie
//   w tej samej kolejnosci co push, wiec „ostatnia pushowana" znaczy „namalowana na wierzchu"
//   i tak wlasnie dziala klik. Tyle ze strefy sa DUZO wieksze od glifow, wiec nakladaja sie takze
//   wtedy, gdy gwiazdy wizualnie sie nie stykaja — a wtedy „na wierzchu" nie jest odpowiedzia
//   na pytanie gracza „w KTORA gwiazde celuje". Odpowiedzia jest NAJBLIZSZY SRODEK.
//
// ⚠ DWIE REGULY, NIE JEDNA — i to jest cala subtelnosc tego pliku:
//     `topMostZoneAt`  — KTO wygrywa miedzy roznymi warstwami UI (panel vs mapa). Kolejnosc
//                        malowania, czyli ostatnia pushowana. Ta regula CHRONI ABSORBERY.
//     `pickStarZone`   — KTORA gwiazda, gdy juz wiadomo, ze wygrala warstwa gwiazd. Odleglosc
//                        od kursora, bo to jest pytanie o celowanie, nie o warstwy.
//   Zlanie ich w jedno (np. pre-pass wybierajacy gwiazde PRZED sprawdzeniem warstw) przebiloby
//   `warp_order_bg` — absorber, ktory istnieje po to, zeby klik w panel rozkazu nie przelatywal
//   na gwiazdy pod spodem. Dlatego rozstrzygacz jest DOPRECYZOWANIEM ZWYCIEZCY (decyzja E3).

/** Czy punkt lezy w strefie (kontrakt prostokata z `_hitZones`). */
export function zoneContains(z, mx, my) {
  return !!z && mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h;
}

/**
 * Strefa WIERZCHNIA pod kursorem — ostatnia pushowana, czyli namalowana na wierzchu
 * (algorytm malarza). To jest regula miedzywarstwowa: panel bije mape, absorber bije gwiazdy.
 *
 * @returns {object|null}
 */
export function topMostZoneAt(zones, mx, my) {
  if (!Array.isArray(zones)) return null;
  for (let i = zones.length - 1; i >= 0; i--) {
    if (zoneContains(zones[i], mx, my)) return zones[i];
  }
  return null;
}

/**
 * KTORA gwiazda, gdy warstwa gwiazd juz wygrala. Najblizszy srodek; przy dokladnym remisie
 * — pozniej pushowana, czyli ta na wierzchu (spojnie z `topMostZoneAt`, deterministycznie).
 *
 * ⚠ Wolac WYLACZNIE wtedy, gdy `topMostZoneAt` zwrocilo `cluster_star`. Wolana bezwarunkowo
 *   znalazlaby gwiazde takze pod panelem — czyli dokladnie ten click-through, ktoremu
 *   sluzy `warp_order_bg`.
 *
 * @returns {object|null}
 */
export function pickStarZone(zones, mx, my) {
  if (!Array.isArray(zones)) return null;
  let best = null, bestD2 = Infinity;
  for (const z of zones) {
    if (z?.type !== 'cluster_star' || !zoneContains(z, mx, my)) continue;
    const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
    const d2 = (cx - mx) * (cx - mx) + (cy - my) * (cy - my);
    // `<=` → przy remisie wygrywa POZNIEJSZA (ta na wierzchu). Zamiana na `<` odwrocilaby
    // tie-break i rozjechala go z `topMostZoneAt`.
    if (d2 <= bestD2) { best = z; bestD2 = d2; }
  }
  return best;
}

/**
 * Pelne rozstrzygniecie trafienia dla mapy STRATCOM — jedno zrodlo dla klika i hovera.
 * Zwraca strefe, ktora ma dostac zdarzenie (albo `null`, gdy pod kursorem nic nie ma).
 */
export function resolveStratcomZone(zones, mx, my) {
  const top = topMostZoneAt(zones, mx, my);
  if (!top) return null;
  if (top.type !== 'cluster_star') return top;
  return pickStarZone(zones, mx, my) ?? top;
}
