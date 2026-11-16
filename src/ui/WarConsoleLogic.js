// WarConsoleLogic — czysta logika konsoli Wojen (ARC KONSOLE K2, docs/design/CONSOLES_PLAN.md §1.2) + dźwignie debug (Finding 735).
//
// Lista wojen i liczby to DZISIEJSZE dane panelu Wojen (wyczerpanie obu stron, rok wypowiedzenia, bitwy); nowe są tylko odczyty
// pochodne z tych samych pól: lata wojny (rok gry − rok wypowiedzenia) i przeciąganie liny (różnica wyczerpania).
// Finding 735: «WYMUŚ STARCIE / DESANT (debug)» nie są rysowane na konsoli; te same funkcje woła `KOSMOS.debug.war.*`
// i stara ścieżka (flaga OFF, do KZ) — `forceWarBattle` / `forceWarInvasion` niżej są JEDYNYM kodem obu dźwigni.
//
// Bez DOM i canvas (dźwignie czytają `window.KOSMOS` w chwili wywołania) — testowalne pod node.

export const WAR_MASK = '???';
// Próg „równowagi” przeciągania liny (punkty wyczerpania 0–100): różnica mniejsza → remis w odczycie.
export const TUG_EVEN_PTS = 5;

/** Wojny w dzisiejszej kolejności panelu: aktywne najpierw, w grupie od najnowszej (rok wypowiedzenia malejąco). */
export function warEntries(all) {
  return [...(all ?? [])].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return (b.startYear ?? 0) - (a.startYear ?? 0);
  });
}

/** Imperium po drugiej stronie wojny (fasady są gracz-centryczne). */
export function warOpponent(war) { return war ? (war.aggressor === 'player' ? war.defender : war.aggressor) : null; }

/** Lata wojny (rok gry): aktywna — do teraz, zakończona — do `endYear`; nigdy ujemne. */
export function warYears(war, now) {
  if (!war) return 0;
  const end = war.active ? Number(now) || 0 : Number(war.endYear ?? now) || 0;
  return Math.max(0, end - (Number(war.startYear) || 0));
}

/** Wyczerpanie 0–100 obu stron (jak dziś: `exhaustion.player` / `exhaustion[empireId]`, brak → 0). */
export function warExhaustion(war) {
  const opp = warOpponent(war);
  const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));
  return { mine: clamp(war?.exhaustion?.player), theirs: clamp(war?.exhaustion?.[opp]) };
}

/** Widok wiersza listy: przeciwnik (dziś bez maski — wojna zakłada kontakt; brak wpisu → „???”), status, wyczerpanie, lata. */
export function warRowView(war, { emp = null, arch = null, now = 0 } = {}) {
  const ex = warExhaustion(war);
  return {
    id: war.id,
    empireId: warOpponent(war),
    name: emp?.name ?? WAR_MASK,
    archColor: arch?.color ?? null,
    active: !!war.active,
    statusKey: war.active ? 'warOverlay.statusActive' : 'warOverlay.statusEnded',
    mine: ex.mine, theirs: ex.theirs,
    years: warYears(war, now),
  };
}

/**
 * Przeciąganie liny: `offset` −1…+1 (dodatni = przewaga gracza — przeciwnik bardziej wyczerpany), `edge` 'you' | 'them' | 'even'.
 */
export function tugOfWar(mine, theirs, evenPts = TUG_EVEN_PTS) {
  const d = (Number(theirs) || 0) - (Number(mine) || 0);
  return { offset: Math.max(-1, Math.min(1, d / 100)), edge: Math.abs(d) < evenPts ? 'even' : d > 0 ? 'you' : 'them' };
}

/**
 * Tryb bohatera: 'table' (stół pokoju — negocjacje) albo 'status' (przeciąganie liny). Stół tylko dla aktywnej wojny; wybór gracza
 * (`mode`) wygrywa, bez wyboru — stół, gdy na stole leżą już warunki (zaznaczone ciała / reparacje).
 */
export function warHeroMode(war, mode, termsOnTable) {
  if (!war?.active) return 'status';
  if (mode === 'table' || mode === 'status') return mode;
  return termsOnTable ? 'table' : 'status';
}

/** [ ZAPROPONUJ POKÓJ ] — dzisiejsza reguła (WP-4/C4): aktywna wojna, brak blokady po odmowie; licznik na etykiecie. */
export function peaceActionView(war, cdYears, t) {
  if (!war?.active) return null;
  const ready = !(cdYears > 0);
  return { type: 'offer_peace', enabled: ready, data: { empireId: warOpponent(war) },
    label: ready ? t('warOverlay.btnProposePeace') : t('warOverlay.btnPeaceCooldown', cdYears),
    reason: ready ? null : t('warConsole.reason.peaceCooldown', cdYears) };
}

// ── Dźwignie debug (Finding 735) — jedyny kod «wymuś starcie / desant»; woła je stara ścieżka i KOSMOS.debug.war.* ──

/** Debug: rozstrzygnij bitwę wojny natychmiast (niezależnie od ticku / pauzy). Zwraca wynik `warSystem.forceBattle`. */
export function forceWarBattle(warId) {
  const ws = window.KOSMOS?.warSystem;
  if (!ws) return { success: false, reason: 'no_war_system' };
  const res = ws.forceBattle(warId);
  if (!res.success) {
    console.warn('[WarOverlay] Force battle failed:', res.reason);
  } else {
    console.log('[WarOverlay] Bitwa rozstrzygnięta:',
      `zwycięzca=${res.result.winner}, straty obcy=${res.result.lossesA}, straty gracz=${res.result.lossesB}`);
  }
  return res;
}

/** Debug: desant wrogich jednostek na planecie domowej gracza (pomija bitwę kosmiczną). Zwraca wynik `launchInvasion`. */
export function forceWarInvasion(empireId) {
  const invSys = window.KOSMOS?.invasionSystem;
  const homePlanet = window.KOSMOS?.homePlanet;
  if (!invSys || !homePlanet) {
    console.warn('[WarOverlay] Force invasion: brak invasionSystem lub homePlanet');
    return { success: false, reason: 'no_invasion_system' };
  }
  const result = invSys.launchInvasion(empireId, homePlanet.id, 3);
  if (!result.success) {
    console.warn('[WarOverlay] Force invasion failed:', result.reason);
  } else {
    console.log('[WarOverlay] Desant wykonany:', result.landed.length, 'jednostek');
  }
  return result;
}

/**
 * Wojna, na której działają dźwignie debug: zaznaczona w panelu Wojen (`selectedId`), a bez zaznaczenia — pierwsza aktywna
 * (ta sama, którą panel zaznacza przy otwarciu). Zakończona albo brak → `{ war:null, reason }`.
 */
export function debugWarTarget(selectedId, warSystem) {
  const sel = selectedId ? warSystem?.getWar?.(selectedId) ?? null : null;
  const war = sel ?? (warSystem?.listActive?.() ?? [])[0] ?? null;
  if (!war) return { war: null, reason: 'no_active_war' };
  if (!war.active) return { war: null, reason: 'war_not_active', warId: war.id };
  return { war, via: sel ? 'selected' : 'first_active' };
}
