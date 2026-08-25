// SystemScope — JEDNO źródło prawdy dla pytania „czy te dwie rzeczy są w TYM SAMYM układzie?".
//
// PO CO TO ISTNIEJE (W3-4b, defekt złapany na GATE 2): rozkazy ruchu operują we
// współrzędnych WEWNĄTRZ układu — gwiazda każdego układu stoi w (0,0) — ale identyfikatory ciał
// i statków są GLOBALNE (`EntityManager.get` przeszukuje całą galaktykę). Kto rozwiąże cel po
// samym id i poleci do jego `x/y`, ten poleci do współrzędnych CUDZEGO układu odmierzonych od
// SWOJEJ gwiazdy — i wyląduje w losowym miejscu własnego układu, „zadokowany" przy ciele, które
// tam nie istnieje. Zmierzone: wrogi okręt z `sys_061` dostał rozkaz uderzenia na planetę gracza
// w `sys_home`, doleciał do (−219.6, 12.2) WEWNĄTRZ `sys_061` i zameldował się jako zadokowany
// przy `entity_3`. Bitwa i dominacja orbitalna zaksięgowały się dla `sys_061`.
//
// Porównanie jest dwuliniowe, ale ma DWIE pułapki, i właśnie dlatego mieszka w jednym miejscu
// zamiast być wklejane przy każdej bramce:
//   1. `undefined` znaczy „stary zapis / statek sprzed multi-system" ⇒ `sys_home`.
//   2. `null` znaczy coś INNEGO niż brak: statek jest W TRANZYCIE międzygwiezdnym, czyli
//      pomiędzy układami (`VesselManager._resolveSystemId`, W3-slice A). Sklejenie obu na
//      `?? 'sys_home'` twierdziłoby, że statek w warpie jest w domu.
//
// Bramki są FAIL-OPEN: gdy którejkolwiek strony nie da się rozstrzygnąć, `isSameSystem` mówi
// „tak". Blokowanie rozkazu na podstawie niewiedzy zamieniłoby ten defekt na cichy paraliż floty.

/**
 * Układ, w którym „jest" encja (ciało / statek / kolonia).
 * @param {object|null|undefined} x
 * @returns {string|null} id układu · `null` gdy nieznany albo tranzyt międzygwiezdny
 */
export function systemIdOf(x) {
  if (!x) return null;
  // ⚠ `undefined` (brak pola) ≠ `null` (świadome „między układami") — patrz nagłówek.
  return x.systemId === undefined ? 'sys_home' : x.systemId;
}

/**
 * Czy obie rzeczy są w tym samym układzie? Fail-open przy nieznanym układzie po którejś stronie.
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
export function isSameSystem(a, b) {
  const sa = systemIdOf(a);
  const sb = systemIdOf(b);
  if (sa == null || sb == null) return true;   // nie wiemy → nie blokujemy
  return sa === sb;
}

/**
 * WARIANT FAIL-CLOSED — WYŁĄCZNIE DLA WARSTWY WALKI (`DeepSpaceCombatSystem`,
 * `VesselCombatSystem`). Nie używać w bramkach wydawania rozkazów.
 *
 * ⚠ DLACZEGO ISTNIEJE OSOBNO, ZAMIAST ZMIENIĆ `isSameSystem`: bilans kosztu błędu jest tu
 * ODWROTNY. Przy rozkazie cena fałszywego NEGATYWU to cichy paraliż floty (patrz nagłówek),
 * więc fail-open jest właściwy. W WALCE cena fałszywego POZYTYWU to trwale stracone kadłuby,
 * wraki w międzyukładowym punkcie i zatruty klucz `orbitalDominance` W ZAPISIE — a cena
 * fałszywego negatywu to jedna niestoczona bitwa. Dlatego tu blokujemy przy niewiedzy.
 *
 * ⚠ `null` NIE ZNACZY TU „NIE WIEMY". `systemIdOf` mapuje `undefined` → `'sys_home'`, więc
 * statek ze starego zapisu (sprzed multi-system) przechodzi normalnie. Do `null` dochodzi
 * WYŁĄCZNIE prawdziwy tranzyt międzygwiezdny (`VesselManager._resolveSystemId`), a statek
 * w warpie nie ma prawa walczyć: jest fizycznie pomiędzy układami, a jego `x/y` to
 * współrzędne sprzed skoku.
 *
 * Powód istnienia (ZMIERZONE w żywej grze): starcie ze stemplem `sys_024` łączyło statek
 * gracza z `sys_024` ze statkami z `sys_061` i `sys_home`, bo gwiazda każdego układu stoi
 * w (0,0), a rejestr statków jest płaski. Patrz `combat_system_scope_smoke.mjs`.
 *
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
export function isSameSystemStrict(a, b) {
  const sa = systemIdOf(a);
  const sb = systemIdOf(b);
  if (sa == null || sb == null) return false;  // nie wiemy / tranzyt warp → NIE walczymy
  return sa === sb;
}
