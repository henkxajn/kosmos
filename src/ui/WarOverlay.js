// WarOverlay — panel Wojny (klawisz W)
//
// ARC KONSOLE K2 / KZ — ekran konsoli (szablon 4-strefowy, `WarConsoleView.js`): lista wojen, bohater = stół pokoju albo
// przeciąganie liny wyczerpania, inspektor = casus belli, bitwy, [ ZAPROPONUJ POKÓJ ]. Overlay trzyma stan stołu pokoju
// (zaznaczenie, reparacje, cache projekcji / oceny) i obsługuje akcje; dawny układ 2-kolumnowy i przyciski debug
// WYMUŚ STARCIE / DESANT usunięte w KZ (dźwignie zostają jako KOSMOS.debug.war.forceBattle() / forceInvasion()).

import { BaseOverlay } from './BaseOverlay.js';
// WP-R — długość blokady zbrojeń. Panel CZYTA stałą, nie wpisuje liczby: przełącznik jest
// binarny (D-WPR-4), więc gracz dostaje dokładnie tyle lat, ile nałoży silnik. Precedens
// importu pokrętła balansu do UI: `DiplomacyOverlay` i `NAP_RENEW_WINDOW_YEARS` (DS-2/C2).
import { REPARATIONS_YEARS } from '../data/OpinionModifierData.js';
import { applyConsoleHalo, withAdaptiveHalo } from './ConsoleKit.js';
import { drawWarConsole } from './WarConsoleView.js';

export class WarOverlay extends BaseOverlay {
  constructor() {
    super(null);
    this._selectedId = null;
    this._scrollLeft = 0;
    this._scrollRight = 0;

    // Warunki na stole — TRANSIENTNE (nie idą do zapisu): zbiór `bodyId` zaznaczonych ciał.
    this._selected = new Set();
    // WP-R — druga połowa warunków: blokada zbrojeń. Też TRANSIENTNA i też per WOJNA,
    // więc kasowana dokładnie tam, gdzie zaznaczenie (zmiana wojny, „Wyczyść stół").
    this._reparations = false;
    // Cache projekcji i oceny. `getPeaceTable`/`evaluatePeace` czytają świat, więc NIE MOGĄ
    // lecieć z `draw()` (60×/s). Klucz projekcji = wojna + rok gry; klucz oceny = wojna
    // + podpis zaznaczenia. Rok w kluczu łapie dryf świata (podbój w trakcie otwartego panelu).
    this._table = null;    this._tableKey = null;
    this._eval  = null;    this._evalKey  = null;
    // Wysokość treści prawej kolumny z POPRZEDNIEJ klatki — pozwala sklampować scroll
    // PRZED rysowaniem (patrz `drawPeaceTable` w WarConsoleView). `null` = jeszcze nie rysowano.
    this._contentHRight = null;
    // K2 — konsola: strefy ostatniej klatki, tryb bohatera (null = wybór automatyczny: stół, gdy na stole są warunki)
    this.consoleZones = null;
    this._consoleListRect = null;
    this._consoleTableRect = null;
    this._consoleTooltip = null;
    this._heroMode = null;
  }

  show(opts = {}) {
    super.show();
    const ws = window.KOSMOS?.warSystem;
    // ⚠ WP-4 / C3: „Kontrpropozycja" w depeszy pokojowej otwiera panel NA TEJ WOJNIE.
    //   Bez tego `show()` wybrałby PIERWSZĄ aktywną z listy, więc przy dwóch wojnach gracz
    //   siadałby do stołu z innym imperium, niż to, które właśnie o pokój poprosiło.
    //   Zmiana wojny czyści stół — lustro gałęzi `case 'select'` w `_onHit`.
    if (opts?.warId && this._selectedId !== opts.warId) {
      this._selectedId = opts.warId;
      this._selected.clear();
      this._reparations = false;
      this._tableKey = null;
      this._evalKey = null;
      this._scrollRight = 0;
    }
    // K2 — depesza „Kontrpropozycja” to negocjacje: konsola otwiera bohatera na stole pokoju
    if (opts?.warId) this._heroMode = 'table';
    if (!this._selectedId && ws) {
      const active = ws.listActive();
      if (active.length > 0) this._selectedId = active[0].id;
    }
    this._tableKey = null;   // otwarcie panelu = świeży odczyt świata
    this._evalKey  = null;
  }

  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];
    // K2 — poświata za całym rysunkiem konsoli; zdjęta przez restore (pasek walki i reszta UI bez niej)
    ctx.save();
    applyConsoleHalo(ctx);
    try { withAdaptiveHalo(ctx, W, H, () => drawWarConsole(this, ctx, W, H)); } finally { ctx.restore(); }
  }

  _fmtVal(v) {
    if (v == null) return '—';
    const n = Number(v) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  /** Projekcja stołu — cache po (wojna, rok gry). NIGDY nie liczona per klatkę. */
  _ensureTable(war, empireId) {
    const year = Math.floor(window.KOSMOS?.timeSystem?.gameTime ?? 0);
    const key  = `${war?.id}|${year}`;
    if (this._tableKey !== key || !this._table) {
      this._table = window.KOSMOS?.diplomacySystem?.getPeaceTable?.(empireId)
        ?? { demand: [], offer: [], heldValue: null, ceiling: null };
      this._tableKey = key;
      // Zaznaczenie mogło wskazywać ciało, które właśnie zmieniło ręce — zdejmujemy sieroty.
      if (this._selected.size > 0) {
        const live = new Set([...this._table.demand, ...this._table.offer].map(r => r.bodyId));
        for (const id of [...this._selected]) if (!live.has(id)) this._selected.delete(id);
      }
    }
    return this._table;
  }

  /** Ocena aktualnego zestawu warunków — cache po (wojna, podpis zaznaczenia). */
  _ensureEval(war, empireId) {
    const sig = [...this._selected].sort().join(',');
    // ⚠ WP-R — PRZEŁĄCZNIK W KLUCZU. Bez tego przestawienie reparacji nie unieważniałoby
    //   cache'u, więc linia ważności warunków (`✗ powód`) pokazywałaby ocenę POPRZEDNIEGO
    //   zestawu — a to jest jedyne miejsce, w którym gracz widzi, że AI odmówi.
    const key = `${war?.id}|${sig}|${this._reparations ? 'R' : '-'}`;
    if (this._evalKey !== key) {
      const terms = this._buildTerms();
      this._eval = window.KOSMOS?.diplomacySystem?.evaluatePeace?.(empireId, terms) ?? null;
      this._evalKey = key;
    }
    return this._eval;
  }

  /**
   * Warunki z zaznaczenia. PUSTY STÓŁ ⇒ `null`, nie `{ cessions: [] }`.
   *
   * ⚠ To nie jest kosmetyka: `null` jest dosłownie dzisiejszym wywołaniem `offerPeace`
   *   (regresja zero), a `_buildTermsContext` nie wykonuje wtedy ANI JEDNEGO odczytu świata.
   * ⚠ KIERUNEK wypełnia panel — silnik go NIE zgaduje (`territorial_terms`: cesja bez stron
   *   nie liczy się do żadnej strony, więc pomyłka wołającego byłaby cichą zmianą ceny pokoju).
   */
  _buildTerms() {
    const empireId = this._empireOfWar();
    if (!empireId) return null;
    const cessions = [];
    if (this._table && this._selected.size > 0) {
      for (const r of this._table.demand) {
        if (this._selected.has(r.bodyId)) cessions.push({ bodyId: r.bodyId, fromEmpireId: empireId, toEmpireId: 'player' });
      }
      for (const r of this._table.offer) {
        if (this._selected.has(r.bodyId)) cessions.push({ bodyId: r.bodyId, fromEmpireId: 'player', toEmpireId: empireId });
      }
    }
    // ⚠ WP-R — DWIE NIEZALEŻNE POŁOWY stołu, więc `null` dopiero gdy OBIE są puste.
    //   Pokój „status quo + blokada zbrojeń" jest najprawdopodobniejszym ruchem gracza,
    //   a stary warunek (`_selected.size === 0` ⇒ `null`) odciąłby go bez śladu.
    // ⚠ PUSTY STÓŁ nadal daje `null` BIT W BIT — to dosłownie dzisiejsze wywołanie
    //   `offerPeace` (regresja zero), a `_buildTermsContext` nie wykonuje wtedy ANI JEDNEGO
    //   odczytu świata.
    const terms = {};
    if (cessions.length > 0) terms.cessions = cessions;
    if (this._reparations) terms.reparations = { years: REPARATIONS_YEARS };
    return Object.keys(terms).length > 0 ? terms : null;
  }

  /** Imperium wybranej wojny (druga strona pary — fasady są gracz-centryczne). */
  _empireOfWar() {
    const war = this._selectedId ? window.KOSMOS?.warSystem?.getWar(this._selectedId) : null;
    if (!war) return null;
    return war.aggressor === 'player' ? war.defender : war.aggressor;
  }

  _onHit(zone) {
    const dipl = window.KOSMOS?.diplomacySystem;
    const ws = window.KOSMOS?.warSystem;

    switch (zone.type) {
      case 'close':
        this.hide();
        break;
      case 'select':
        // Zmiana wojny czyści stół: warunki dotyczą KONKRETNEJ pary, a nie panelu.
        if (this._selectedId !== zone.data.warId) {
          this._selected.clear();
          this._reparations = false;
          this._tableKey = null;
          this._evalKey = null;
          this._scrollRight = 0;
          this._heroMode = null;   // K2 — nowa wojna: tryb bohatera znów automatyczny
        }
        this._selectedId = zone.data.warId;
        break;
      case 'tab':   // K2 — czip podzakładki w nagłówku konsoli (jak klik w pas subnav: przełącz overlay grupy)
        if (zone.data.id && zone.data.id !== 'war') window.KOSMOS?.overlayManager?.openPanel?.(zone.data.id);
        break;
      case 'hero_mode':   // K2 — [ PRZEBIEG WOJNY ] / [ STÓŁ POKOJU ] w bohaterze konsoli
        this._heroMode = zone.data?.mode === 'table' ? 'table' : 'status';
        this._scrollRight = 0;
        break;
      case 'action_blocked':   // K2 — wyłączony czip (blokada po odmowie): strefa tylko dla podpowiedzi, bez skutku
        break;
      case 'peace_toggle': {
        const id = zone.data?.bodyId;
        if (!id) break;
        if (this._selected.has(id)) this._selected.delete(id);
        else this._selected.add(id);
        this._evalKey = null;    // zmiana zaznaczenia = ponowna ocena (D-WP-15b)
        break;
      }
      case 'peace_clear':
        this._selected.clear();
        // WP-R — „Wyczyść stół" czyści CAŁY stół, a reparacje są jego drugą połową.
        this._reparations = false;
        this._evalKey = null;
        break;
      case 'reparations_toggle':
        // D-WPR-4 — przełącznik BINARNY: pełne `REPARATIONS_YEARS` albo nic. Gałka lat jest
        // w silniku gotowa (raw ∝ lata), ale na 1.0 nie ma widżetu — wpis ⚪ „po 1.0".
        this._reparations = !this._reparations;
        this._evalKey = null;    // zmiana warunków = ponowna ocena (jak `peace_toggle`)
        break;
      case 'peace_bg':
        // Absorber tła stołu — świadomy no-op: zatrzymuje klik w panelu, żeby nie leciał
        // do mapy 3D pod overlayem (`handleClick` zwraca true na każdym trafieniu).
        break;
      case 'offer_peace':
        // WP-4 C1 — propozycja niesie WARUNKI ze stołu. Pusty stół ⇒ `terms === null`,
        // czyli dosłownie wywołanie sprzed tego slice'u.
        if (dipl) dipl.offerPeace(zone.data.empireId, 'player_war_panel', { terms: this._buildTerms() });
        break;
    }
  }

  // K2 — kółko na konsoli: geometria wyłącznie ze stref ostatniej klatki (bez window.inner*): lista → _scrollLeft,
  // stół pokoju → _scrollRight.
  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    const f = this.consoleZones?.frame;
    if (!f || x < f.x || x > f.x + f.w || y < f.y || y > f.y + f.h) return false;
    const inR = (r) => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    if (inR(this._consoleListRect)) this._scrollLeft = Math.max(0, this._scrollLeft + delta * 0.5);
    else if (inR(this._consoleTableRect)) this._scrollRight = Math.max(0, this._scrollRight + delta * 0.5);
    return true;
  }
}
