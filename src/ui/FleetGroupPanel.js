// FleetGroupPanel — STAN i AKCJE zaznaczonej grupy statków N ≥ 2 (Slice 8b; od REFORMY ZAKŁADEK T4 bez rysunku).
//
// Dawny pływający panel grupy (lewy-dolny róg mapy) zastąpił panel grupy w idiomie etykiet przy wierszu lidera w prawym
// outlinerze (T6 — `FleetPanelHudLogic` / `FleetPanelHudLayer`): treść i chipy rysuje tamten renderer, a KLIK chipa trafia
// TUTAJ (`runFleetPanelAction` → `_onHit(zone)`). Ten moduł trzyma transientne zaznaczenie mapy z `ui:selectionChanged`
// (`_ids` — NIEZALEŻNE od trwałych flot), zwinięcie (`_minimized`) i cele akcji grupy: focus / zmiana nazwy / usunięcie
// z zaznaczenia, „→ Flota”, rozkazy grupowe BEZ celu (Dokuj / Odcumuj / Tankuj / Stop / Odwrót). Self-managed cykl życia:
// `ui:selectionChanged` → stan; `vessel:wrecked` → zniszczony statek zdjęty z zaznaczenia (UIManager sam nie czyści zbioru).
// Rysunek, klik w prostokąt i stronicowanie dawnego panelu usunięte w T4 (nazwa klasy i uchwyt `KOSMOS.fleetGroupPanel` bez
// zmian — decyzja właściciela T4, Q3).

import EventBus            from '../core/EventBus.js';
import { showRenameModal } from './ModalInput.js';
import { isEnemyVessel }   from '../entities/Vessel.js';
import { assignVesselsToFleet, openDockPicker } from './VesselGroupActions.js';

export class FleetGroupPanel {
  constructor() {
    this.visible = false;      // zaznaczenie niepuste (stan; panel T6 czyta zaznaczenie z `UIManager`)
    /** @type {string[]} — id-ki z ui:selectionChanged (NIGDY nie cache'ujemy encji). */
    this._ids = [];
    this._minimized = false;   // zwinięcie panelu grupy T6 (chipy „—” / „+” → `_onHit`)

    // Self-managed cykl życia — źródło prawdy = ui:selectionChanged (lead + zbiór).
    EventBus.on('ui:selectionChanged', (e) => {
      this._ids = Array.isArray(e?.vesselIds) ? [...e.vesselIds] : [];
      if (this._ids.length) this.show();
      else { this.hide(); this._minimized = false; }
      this._markDirty();
    });
    // Statek zniszczony w trakcie zaznaczenia — UIManager NIE czyści zbioru, więc
    // czyścimy kanoniczny Set (re-emit selectionChanged zaktualizuje _ids + ramki).
    EventBus.on('vessel:wrecked', (e) => {
      const id = e?.vesselId;
      if (id && this._ids.includes(id)) {
        window.KOSMOS?.uiManager?.removeFromSelection?.(id);
      }
    });
  }

  show() { this.visible = true; }
  hide() { this.visible = false; }

  _markDirty() {
    const um = window.KOSMOS?.uiManager;
    if (um) um._dirty = true;
  }

  /** Żywe statki gracza z bieżącego zaznaczenia (samonaprawa: bez wraków/wrogów/nieistniejących). */
  _liveVessels() {
    const vm = window.KOSMOS?.vesselManager;
    if (!vm) return [];
    const out = [];
    for (const id of this._ids) {
      const v = vm.getVessel(id);
      if (v && !v.isWreck && !isEnemyVessel(v)) out.push(v);
    }
    return out;
  }

  // ── Interakcja ──────────────────────────────────────────────────────────────
  _onHit(zone) {
    if (!zone) return;
    const vm  = window.KOSMOS?.vesselManager;
    const mos = window.KOSMOS?.movementOrderSystem;
    const um  = window.KOSMOS?.uiManager;

    switch (zone.type) {
      case 'minimize': this._minimized = true;  this._markDirty(); return;
      case 'restore':  this._minimized = false; this._markDirty(); return;
      case 'focus':
        if (zone.data?.id) EventBus.emit('vessel:focus', { vesselId: zone.data.id });
        return;
      case 'remove':
        if (zone.data?.id) { um?.removeFromSelection?.(zone.data.id); this._markDirty(); }
        return;
      case 'rename': {
        const id = zone.data?.id;
        const v = id ? vm?.getVessel?.(id) : null;
        if (!v) return;
        showRenameModal(v.name ?? '').then((n) => {
          const nm = n?.trim();
          if (nm) EventBus.emit('vessel:rename', { vesselId: id, name: nm });
          this._markDirty();
        });
        return;
      }
      case 'assignFleet': {
        // Przypisz całe zaznaczenie do floty (battlegroup) — popup: istniejąca / nowa.
        // ⚠ Slice 258: JEDNO źródło (`VesselGroupActions`), współdzielone z panelem statku nad
        //   mapą. Wcześniej ta logika żyła TYLKO tutaj; footer panelu mapy zrobiłby z niej DRUGĄ
        //   kopię. Czysty przerzut — zachowanie bez zmian.
        assignVesselsToFleet(this._liveVessels().map((v) => v.id), { onDone: () => this._markDirty() });
        return;
      }
      case 'grpRefuel':
        for (const v of this._liveVessels()) {
          if (v.position?.state === 'docked') vm?.manualRefuel?.(v.id);
        }
        this._markDirty(); return;
      case 'grpStop':
        for (const v of this._liveVessels()) mos?.cancelOrder?.(v.id, 'player');
        this._markDirty(); return;
      case 'grpRetreat':
        for (const v of this._liveVessels()) mos?.issueOrder?.(v.id, { type: 'retreat' });
        this._markDirty(); return;
      case 'grpUndock':
        // Undock — zadokowany statek startuje i ORBITUJE ciało, na którym był (instant).
        for (const v of this._liveVessels()) {
          if (v.position?.state === 'docked') vm?.undockToOrbit?.(v.id);
        }
        this._markDirty(); return;
      case 'grpDock': {
        // Dock — picker celów: kolonie z PORTEM + orbitalne stacje gracza.
        // ⚠ Slice 258: JEDNO źródło (`VesselGroupActions.openDockPicker`). Ta logika istniała
        //   w DWÓCH niemal znak-w-znak kopiach (tu i `FleetCommandPanel.bgDock`) — teraz w jednej.
        // ⚠ Finding 256, połowa OFERTOWA — kształt (a) REPREZENTANT (podpis właściciela „A + C").
        //   Picker jest GRUPOWY, a `filterDockTargets` bierze JEDEN statek, więc ktoś musi być
        //   reprezentantem. Wybrany jest PIERWSZY ŻYWY — ten sam idiom co „Powrót do bazy"
        //   (`_fleetReturn` / `_handleFleetReturnBase`). ⚠ ZMIERZONE: „pierwszy żywy" to kolejność
        //   DODANIA do zbioru, nie odległość ani kamera — więc dla grupy rozpiętej na dwa układy
        //   oferta jest jednego z nich, a członkowie spoza niego dostają GŁOŚNĄ odmowę przy wysyłce
        //   (bramka admisyjna D-256a + raport w `dispatchDockTo`). Wariant PRZECIĘCIA odrzucony
        //   świadomie: pusty picker odbierałby graczowi legalną akcję (dok tych, którzy MOGĄ).
        const live = this._liveVessels();
        openDockPicker(live.map((v) => v.id),
          { sameSystemOnly: true, vessel: live[0] ?? null, onDone: () => this._markDirty() });
        return;
      }
      // inne typy — nic
    }
  }
}
