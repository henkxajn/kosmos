// KANON „CO GRACZ WIDZI O UKŁADZIE" — jedno źródło prawdy dla mgły wojny w STRATCOM.
//
// Powstało przy zamykaniu Findingu 188 (`docs/design/STRATCOM_REVEAL_PLAN.md`, decyzje
// D-188-1..8 w wariancie W1).
//
// ⚠ PRZYCZYNA ŹRÓDŁOWA BYŁA SUMĄ DWÓCH OSI, NIE ZA NISKIM PROGIEM. `FleetManagerOverlay`
//   liczył jedną flagę `known = isHome || explored || isAtLeast(empireId, 'rumor')` i wydawał
//   pod nią SZEŚĆ różnych faktów. Gra ma jednak dwie NIEZALEŻNE osie wiedzy:
//
//     oś MIEJSCA      — `isSystemExplored` / skan STRATCOM — „byłem tam albo to zmierzyłem":
//                       nazwa układu, liczby ciał, życie na planetach, infrastruktura.
//     oś WŁAŚCICIELA  — `intel.<empireId>`: rumor → contact → detailed — „co wiem o TYM,
//                       KTO tam mieszka": tożsamość, archetyp, wrogość, liczby o imperium.
//
//   Suma dwóch osi wydaje KAŻDY fakt przy SŁABSZYM z dwóch warunków. Skutek zmierzony w żywej
//   grze: jeden przelot cudzej sondy (najniższy szczebel osi właściciela) otwierał komplet
//   faktów o miejscu dla KAŻDEGO układu tego imperium — bez wizyty, teleskopu i skanu.
//   Panel pokazywał „Niezbadany" obok nazwy imperium, jego wrogości i realnej populacji 55.
//
// ⚠ FAIL-CLOSED, jak `SystemExploration`, a ODWROTNIE niż `SystemScope.isSameSystem`. Tam brak
//   stempla znaczy „przepuść", bo cena fałszywego NEGATYWU to cichy paraliż floty. Tu cena
//   fałszywego POZYTYWU to trwały wyciek wywiadowczy. Przy mgle wojny „nie wiem" musi znaczyć
//   „nie znam". Brak układu albo brak akcesorów ⇒ WSZYSTKO `false`.
//
// ⚠ REKORD, NIE RODZINA PREDYKATÓW. Pytań jest sześć i mają różne argumenty; jeden rekord
//   znosi ryzyko, że konsument zapyta o co innego, niż sądzi. Każda powierzchnia (panel detalu,
//   etykieta gwiazdy 2D, jasność gwiazdy 3D, pierścień wrogości) czyta TO SAMO POLE — i to jest
//   cały mechanizm obrony przed lustrem, które ten plik zamyka: nazwa układu miała DWA
//   niezgodne predykaty (mapa wydawała ją na `rumor`, panel dopiero po zbadaniu).
//
// ⚠ TEN PLIK NIE IMPORTUJE NICZEGO. Wszystkie trzy kanały (`explored`, `scanned`, `intelAtLeast`)
//   są WSTRZYKIWANE przez konsumenta, więc moduł testuje się bez `window.KOSMOS`, a kierunek
//   zależności zostaje jednokierunkowy: UI → wywiad, nigdy odwrotnie.

/** Rekord „nic nie wiem" — wynik fail-closed. */
const NOTHING = Object.freeze({
  place: false, name: false, ownerExists: false,
  ownerIdentity: false, hostility: false, population: false, life: false,
});

/**
 * Co wolno pokazać o tym układzie.
 *
 * @param {Object} sys — gwiazda z `galaxyData.systems` (BIERZE OBIEKT, nie identyfikator).
 * @param {Object} deps
 * @param {boolean}  deps.explored     — `isSystemExplored(sys)` (oś MIEJSCA).
 * @param {boolean}  deps.scanned      — ukończony skan STRATCOM (oś MIEJSCA).
 * @param {Function} deps.intelAtLeast — `(level) => bool` dla WŁAŚCICIELA tego układu (oś WŁAŚCICIELA).
 * @returns {{place:boolean, name:boolean, ownerExists:boolean, ownerIdentity:boolean,
 *            hostility:boolean, population:boolean, life:boolean}}
 */
export function resolveSystemReveal(sys, deps = {}) {
  if (!sys || typeof sys !== 'object') return NOTHING;

  const isHome   = sys.isHome === true;
  const explored = isHome || deps.explored === true;
  const scanned  = deps.scanned === true;
  const hasOwner = !!sys.empireId;

  const atLeast = (lvl) =>
    hasOwner && typeof deps.intelAtLeast === 'function' && deps.intelAtLeast(lvl) === true;

  // Oś MIEJSCA — fakty fizyczne o układzie.
  const place = explored || scanned;

  // D-188-3/4: tożsamość i wrogość dopiero na `contact`. To NIE jest wymyślony próg — dokładnie
  // tak działa drabina (`IntelSystem.advanceIntel` wydaje archetyp na `contact`), a w samym
  // `FleetManagerOverlay` stały już DWA poprawne precedensy: `_drawStratcomOwnerGlyph` i wiersz
  // terytorium, oba pytające o `contact`, zanim nazwą imperium.
  const ownerIdentity = atLeast('contact');

  return {
    place,
    // D-188-1: nazwa układu schodzi na `rumor` (podpisane) — to kartografia, nie wywiad.
    //   JEDNO źródło dla etykiety gwiazdy na mapie I nagłówka panelu; rozjazd tych dwóch
    //   predykatów był połową Findingu 188 i jest pinowany tripwire'em w keeperze.
    name: place || atLeast('rumor'),

    // D-188-2: sam fakt „to czyjeś" — bez wskazania, CZYJE.
    ownerExists: atLeast('rumor'),

    ownerIdentity,
    hostility: ownerIdentity,

    // D-188-5: populacja obcego imperium to LICZBA O IMPERIUM, a wszystkie takie liczby
    //   (`knownMilitary`, `knownReserve`, `knownCrewCapacity`) siedzą na `detailed`.
    // ⚠ Gałąź `!hasOwner` jest KONIECZNA, nie kosmetyczna: układ skolonizowany przez GRACZA nie
    //   ma `empireId`, więc bez niej gracz przestałby widzieć populację WŁASNEJ kolonii poza
    //   domem. Tam populacja jest faktem o miejscu, nie o obcym wywiadzie.
    // ⚠ Przyjęty przypadek brzegowy: w układzie SPORNYM (kolonia gracza obok kolonii AI) odczyt
    //   jest sumą, więc chowa się za `detailed` razem z liczbą obcych.
    population: hasOwner ? atLeast('detailed') : explored,

    // D-188-6: życie to fakt o PLANETACH, nie o imperium — oś właściciela wypada całkowicie.
    //   Skan STRATCOM świadomie NIE liczy się: jego ładunek to liczby ciał, nie biosfera
    //   (rozszerzenie skanu o życie = zmiana treści, poza zakresem tego slice'u).
    life: explored,
  };
}
