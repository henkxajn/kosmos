// PeaceOfferModal — DEPESZA DYPLOMATYCZNA: wyczerpane AI samo prosi o pokój.
// (WOJNA I POKÓJ 1.0, WP-4 / C3, podpis D-WP-3 z 27.09.)
//
// PO CO: do tej pory wyczerpane AI nie miało jak poprosić. `WarSystem._triggerAutoPeace`
// PODPISYWAŁO pokój w imieniu gracza — bez pytania, bez modalu, bez możliwości odmowy.
// Wojna kończyła się (albo nie) w tle, a jedynym śladem był wpis `war:autoPeaceRefused`.
// Teraz decyzja wraca do gracza: przyjmij, odrzuć albo siądź do stołu (C1).
//
// ⚠ BUILDER WOŁANY WPROST, NIE PRZEZ `queueMissionEvent` — i to nie jest preferencja.
//   Powód jest zapisany w źródle `DiplomacyRefusalModal` (:15-18) i zmierzony: kanał
//   `MissionEventModal` dokleja `dismiss()` KAŻDEMU przyciskowi bez `_hasCustomClick`
//   (`MissionEventModal:209-213`), a `buildScheduledEventPopup` nie czyta `onClick`
//   z konfiguracji przycisku. Trzy WYBORY w tamtym kanale byłyby trzema przyciskami
//   „zamknij". Wzór wołania wprost: `GameScene` (popup zdarzenia zaplanowanego).
//
// ⚠ ŚWIADOMIE BEZ IMPORTU `Acceptance*` (pin P14): wszystko, czego ten plik potrzebuje,
//   daje fasada `DiplomacySystem`. Wycena i progi zostają w silniku.
//
// ⚠ TRZY WYBORY SĄ WYEKSPORTOWANYMI FUNKCJAMI, nie ciałami handlerów DOM. Dwa powody:
//   (1) logika decyzji nie ma prawa mieszkać w callbacku przycisku (wzór `FleetActions`);
//   (2) pod node `addEventListener` i `click` atrapy są no-opami, więc inaczej żaden
//       keeper nie dotknąłby tych ścieżek — pinowałby wyłącznie obecność napisów.
//
// ⚠ ZAMKNIĘCIE ZAWSZE MELDUJE. `onDismiss` emituje `war:aiPeaceOfferResolved` na KAŻDEJ
//   ścieżce wyjścia (także ESC / zamknięcie bez odpowiedzi), bo na tym zdarzeniu stoi
//   bramka „żadna depesza nie jest otwarta" w `WarSystem`. Gdyby któraś ścieżka milczała,
//   AI przestałoby prosić o pokój do końca partii — i to po CICHU.

import EventBus from '../core/EventBus.js';
import { t } from '../i18n/i18n.js';
import { buildScheduledEventPopup } from './ScheduledEventPopup.js';
import { formatSectionTitle, formatStatLine } from './TerminalPopupBase.js';

// ⚠ KLUCZA COOLDOWNU TU NIE MA — I NIE MOŻE BYĆ. Pin P14 (`acceptance_engine_smoke`)
//   dopuszcza import modułów `Acceptance*` WYŁĄCZNIE w `DiplomacySystem`, a klucz
//   `ai_peace_offer` i jego okno mieszkają w katalogu wag. Dlatego cooldown zapisujemy
//   metodą INTENCJI fasady (`noteAiPeaceOfferAnswered`), a nie własnym literałem: druga
//   kopia klucza byłaby nieutwardzonym bliźniakiem dokładnie tej klasy, którą C4 właśnie
//   zdjęło z okna odmowy.

/**
 * Nazwa imperium. ⚠ Imperia AI mają JEDNO pole `name` (nazwa generowana proceduralnie,
 * rzeczownik własny) — `namePL`/`nameEN` w `EmpireData` opisują ARCHETYPY, nie imperia,
 * więc nie ma tu czego tłumaczyć i nie udajemy, że jest.
 */
const _empName = (empireId) =>
  window.KOSMOS?.empireRegistry?.get?.(empireId)?.name ?? empireId ?? '?';

/**
 * Treść depeszy — warunki oferty. Wydzielona, żeby keeper sprawdzał UŻYTE KLUCZE bez DOM.
 *
 * Oferta C3 to zawsze STATUS QUO (D-WP-13): zdobycze zostają tam, gdzie są, a pokój niesie
 * wymuszony pakt o nieagresji (D-WP-10 z WP-3). Warunki terytorialne negocjuje się przy
 * stole pokoju w panelu Wojny — stąd trzeci wybór.
 *
 * @param {Object} [opts]
 * @param {Function} [opts.translate] — wstrzykiwane `t` (headless test bez i18n runtime)
 */
export function buildPeaceOfferContent({ translate = t } = {}) {
  const tr = translate;
  return formatSectionTitle(tr('peaceOffer.termsTitle'))
    + formatStatLine(tr('peaceOffer.statusQuo'), '✓', 'at-stat-pos')
    + formatStatLine(tr('peaceOffer.napNote'),   '✓', 'at-stat-pos');
}

/** ☮ Akceptuj — przyjmij pokój na warunkach status quo. Zwraca `true`, gdy podpisany. */
export function acceptPeaceOffer(empireId, warId) {
  const dipl = window.KOSMOS?.diplomacySystem;
  if (!dipl) return false;
  // `terms: null` ⇒ ścieżka silnika bit w bit jak przed WP-4 C1 (status quo, D-WP-13);
  // NAP podpisuje się sam w `offerPeace`.
  // `stampRefusal: false` (D-WP-16) ⇒ jeśli świat zdążył się zmienić i ocena wypadnie
  // odmownie, gracz NIE traci własnego przycisku pokoju. Nie płaci za cudzą propozycję.
  return dipl.offerPeace(empireId, 'ai_peace_offer_accept', {
    terms: null, playerInitiated: true, stampRefusal: false,
  }) === true;
}

/** ⚔ Odrzuć — wojna trwa, AI milczy przez rok. */
export function rejectPeaceOffer(empireId, warId) {
  const dipl = window.KOSMOS?.diplomacySystem;
  if (!dipl) return;
  // ⚠ WYŁĄCZNIE cooldown DEPESZY. `offer_peace` (przycisk gracza) zostaje wolny — odmowa
  //   CUDZEJ oferty nie jest spamowaniem własnym przyciskiem. Podpis D-WP-3, nie odczyt.
  //   Zero wpisów pamięci i zero zmian opinii: to nie jest incydent dyplomatyczny.
  dipl.noteAiPeaceOfferAnswered(empireId);
}

/** ⇄ Kontrpropozycja — depesza odpowiedziana, gracz siada do stołu pokoju (C1). */
export function counterPeaceOffer(empireId, warId) {
  const dipl = window.KOSMOS?.diplomacySystem;
  // Depesza ZOSTAŁA odpowiedziana, więc AI nie ponawia jej od razu — dalej ruch gracza.
  dipl?.noteAiPeaceOfferAnswered?.(empireId);
  // Panel Wojny NA TEJ WOJNIE. Bez `warId` `show()` wybrałby pierwszą aktywną z listy,
  // czyli przy dwóch wojnach potencjalnie nie tę, o której jest depesza.
  window.KOSMOS?.overlayManager?.openPanel?.('war', { warId });
}

/**
 * Pokaż depeszę. Zwraca uchwyt buildera (`{ overlay, dismiss, btnElements }`) albo `null`,
 * gdy nie ma czego pokazać — keeper ćwiczy nim prawdziwą ścieżkę zamknięcia.
 */
export function showPeaceOffer(empireId, warId) {
  const name = _empName(empireId);
  let choice = null;
  let resolved = false;

  EventBus.emit('time:pause');
  const { overlay, dismiss, btnElements } = buildScheduledEventPopup({
    severity:    'info',
    // ⚠ BEZ WIDEO (pusta tablica omija auto-dobór z `svgKey`): karta popupu nie przewija
    //   się, a ramka wideo zjada miejsce, którego potrzebują warunki i trzy przyciski.
    //   To jest depesza, nie zdarzenie z obrazkiem — ta sama decyzja co w modalu odmowy.
    videoSrc:    [],
    barTitle:    t('peaceOffer.barTitle'),
    headline:    t('peaceOffer.headline', name),
    description: t('peaceOffer.desc'),
    contentHTML: buildPeaceOfferContent(),
    gameYear:    window.KOSMOS?.timeSystem?.gameTime ?? 0,
    buttons: [
      { label: t('peaceOffer.accept'),  primary: true },
      { label: t('peaceOffer.reject') },
      { label: t('peaceOffer.counter') },
    ],
    onDismiss: () => {
      if (resolved) return;               // `dismiss` bywa wołane więcej niż raz
      resolved = true;
      EventBus.emit('time:resume');
      // Bramka „żadna depesza nie jest otwarta" (WarSystem) gaśnie TUTAJ i tylko tutaj.
      EventBus.emit('war:aiPeaceOfferResolved', { empireId, warId, choice: choice ?? 'dismissed' });
    },
  });

  btnElements[0]?.addEventListener('click', () => {
    const ok = acceptPeaceOffer(empireId, warId);
    // Dryf świata: propozycja była ważna, gdy przyszła, a przestała być, gdy gracz kliknął.
    // Mówimy to WPROST, zamiast zamykać modal bez śladu (klasa „odmowa bez powodu").
    choice = ok ? 'accept' : 'stale';
    dismiss();
    if (!ok) showStaleOffer(empireId);
  });
  btnElements[1]?.addEventListener('click', () => {
    choice = 'reject';
    rejectPeaceOffer(empireId, warId);
    dismiss();
  });
  btnElements[2]?.addEventListener('click', () => {
    choice = 'counter';
    dismiss();                            // najpierw zamknij i wznów czas…
    counterPeaceOffer(empireId, warId);   // …potem otwórz panel Wojny ze stołem
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => { btnElements[0]?.focus?.(); });
  return { overlay, dismiss, btnElements };
}

/** „Oferta straciła ważność" — jedyny wynik przyjęcia, który nie kończy wojny. */
export function showStaleOffer(empireId) {
  EventBus.emit('time:pause');
  let done = false;
  const { overlay, dismiss, btnElements } = buildScheduledEventPopup({
    severity:    'warning',
    videoSrc:    [],
    barTitle:    t('peaceOffer.barTitle'),
    headline:    t('peaceOffer.staleTitle'),
    description: t('diploRefusal.descPeace', _empName(empireId)),
    contentHTML: '',
    gameYear:    window.KOSMOS?.timeSystem?.gameTime ?? 0,
    buttons: [{ label: t('diploRefusal.ok'), primary: true }],
    onDismiss: () => { if (done) return; done = true; EventBus.emit('time:resume'); },
  });
  btnElements[0]?.addEventListener('click', () => dismiss());
  document.body.appendChild(overlay);
  requestAnimationFrame(() => { btnElements[0]?.focus?.(); });
  return { overlay, dismiss, btnElements };
}

/**
 * Wpięcie kanału depesz. Wołane raz, obok `initDiplomacyRefusals`.
 *
 * Zdarzeniowo, nie z handlera — `WarSystem` decyduje KIEDY, ten plik decyduje JAK to wygląda.
 */
export function initPeaceOffers() {
  EventBus.on('war:aiPeaceOffer', ({ empireId, warId }) => showPeaceOffer(empireId, warId));
}
