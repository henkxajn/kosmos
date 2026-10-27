// FleetCommandPanel — STAN i AKCJE panelu dowodzenia WYBRANĄ flotą (Slice 8b; od REFORMY ZAKŁADEK T4 bez rysunku).
//
// UWAGA nazewnictwo: w grze FLOTY statków = FleetSystem („Floty"); „Grupa Bojowa"/BattleGroupPanel
// to ODDZIELNY system jednostek naziemnych. Ten panel dotyczy FLOT (vessel), stąd nazwa FleetCommand.
//
// Dawny pływający panel floty (lewy-dolny róg mapy) zastąpił panel floty w idiomie etykiet przy prawym outlinerze (T6 —
// `FleetPanelHudLogic` / `FleetPanelHudLayer`): treść i chipy rysuje tamten renderer, a KLIK chipa trafia TUTAJ
// (`runFleetPanelAction` → `_onHit(zone)`). Ten moduł trzyma flotę z `UIManager.getSelectedFleetId()` (`_fleetId`),
// zwinięcie (`_minimized`) i cele rozkazów floty: doktryna (cykl), nazwa, ◀ ▶ (flota sąsiednia), członek (focus / usuń
// z floty), Rusz (picker punktu) / Atak (picker najbliższego wroga) / Powrót (nearest friendly + auto-dock) / Stop
// (cancelFleetOrder) / Rozwiąż / Odcumuj / Dokuj. Rysunek, klik w prostokąt i stronicowanie dawnego panelu usunięte w T4
// (nazwa klasy i uchwyt `KOSMOS.fleetCommandPanel` bez zmian — decyzja właściciela T4, Q3).

import { THEME }           from '../config/ThemeConfig.js';
import { GAME_CONFIG }     from '../config/GameConfig.js';
import EventBus            from '../core/EventBus.js';
import { t }               from '../i18n/i18n.js';
import { showRenameModal } from './ModalInput.js';
import { isEnemyVessel }   from '../entities/Vessel.js';
import { ALL_DOCTRINES, doctrineNameKey } from '../data/FleetDoctrines.js';
import { nextFleetId, nextDoctrine, nearestEnemyToPoint } from './FleetCommandPanelLogic.js';
import { openDockPicker } from './VesselGroupActions.js';
// D-255a (Finding 154) — JEDNO źródło doboru celu POWROTU: własna kolonia W UKŁADZIE STATKU.
import { buildFleetReturnPlan } from '../utils/FleetReturnPlan.js';
import { fleetOffendersOutOfFrame, describeOrderFail, describeFleetOrderRefusal } from '../utils/CameraFrame.js';
import { systemIdOf }      from '../utils/SystemScope.js';

export class FleetCommandPanel {
  constructor() {
    this.visible = false;      // flota wybrana (stan; panel T6 czyta flotę z `UIManager`, nie z tego pola)
    this._fleetId = null;
    this._minimized = false;   // zwinięcie panelu floty T6 (chipy „—” / „+” → `_onHit`)

    EventBus.on('ui:fleetSelectionChanged', (e) => {
      this._fleetId = e?.fleetId ?? null;
      if (this._fleetId) this.show();
      else { this.hide(); this._minimized = false; }
      this._markDirty();
    });
    EventBus.on('fleet:disbanded', (e) => {
      if (e?.fleetId && e.fleetId === this._fleetId) {
        window.KOSMOS?.uiManager?.setSelectedFleetId?.(null);  // → fleetSelectionChanged(null) → hide
      }
    });
    for (const ev of ['fleet:memberAdded', 'fleet:memberRemoved', 'fleet:renamed', 'fleet:doctrineChanged', 'fleet:orderIssued', 'fleet:orderCancelled']) {
      EventBus.on(ev, () => { if (this.visible) this._markDirty(); });
    }
  }

  show() { this.visible = true; }
  hide() { this.visible = false; }

  _markDirty() {
    const um = window.KOSMOS?.uiManager;
    if (um) um._dirty = true;
  }

  _fs()    { return window.KOSMOS?.fleetSystem ?? null; }
  _fleet() { return this._fleetId ? (this._fs()?.getFleet?.(this._fleetId) ?? null) : null; }

  // ── Akcje pomocnicze ─────────────────────────────────────────────────────
  _announce(res) {
    if (!res) return;
    const acc = res.accepted?.length ?? 0;
    const tot = acc + (res.rejected?.length ?? 0);
    EventBus.emit('ui:toast', {
      text: res.ok ? t('fleet.orderResult', acc, tot) : t('fleet.orderResultFailed', acc, tot),
      color: res.ok ? (THEME.accent) : '#ff4466',
      durationMs: 2500,
    });
    // D-E2 (Finding 166) — ODMOWA NIESIE POWÓD (bliźniak `FleetManagerOverlay._announceFleetOrderResult`,
    //   jedno źródło `describeFleetOrderRefusal`). Sukces nadal MILCZY (D-256d).
    const refusal = describeFleetOrderRefusal(res);
    if (refusal) window.KOSMOS?.eventLogSystem?.push?.({ channel: 'fleet', severity: 'warn', ...refusal });
  }

  _armMovePicker(fleetId) {
    const um = window.KOSMOS?.uiManager;
    if (!um?.setPickerMode) return;
    if (um.isPickerActive?.()) um.cancelPickerMode?.();
    um.setPickerMode('targetPoint', (point) => {
      if (!point) return;
      // ── Finding 255, WIERSZ 9 — bliźniak `FMO._handleFleetMoveToPoint` (D-89a/D-89b) ──
      // Termin ramki kamery przy FINALIZACJI, całą flotą albo wcale, powód nazywa KAŻDEGO
      // winowajcę. Pełne uzasadnienie: nagłówek `src/utils/CameraFrame.js`.
      // ⚠ `_announce` ma `if (!res) return` — przy odmowie nie powie NIC, więc głośność
      //   musi być tutaj jawna (to jest dokładnie ten trap, który pinuje F3).
      const offenders = fleetOffendersOutOfFrame(fleetId);
      if (offenders.length > 0) {
        window.KOSMOS?.eventLogSystem?.push?.({
          text: t('vessel.orderNoneMoved', offenders.map(describeOrderFail).join(', ')),
          channel: 'fleet',
          severity: 'warn',
          entityRef: offenders[0].vesselId,
        });
        return;
      }
      const res = this._fs()?.issueFleetOrder?.(fleetId, { type: 'moveToPoint', targetPoint: { x: point.x, y: point.y } });
      this._announce(res);
      this._markDirty();
    }, { intent: 'fleetcmd_move', fleetId });
  }

  _armEngagePicker(fleetId) {
    const um = window.KOSMOS?.uiManager;
    if (!um?.setPickerMode) return;
    if (um.isPickerActive?.()) um.cancelPickerMode?.();
    um.setPickerMode('targetPoint', (point) => {
      if (!point) return;
      // ── Finding 268 (rodzina CameraFrame, D-89c) — punkt pochodzi z kliku w mapę 3D, czyli z ramki
      //   KAMERY, a szukanie wroga szło po CAŁYM rejestrze (`vm.getAllVessels()`), bez terminu układu.
      //   Gwiazda każdego układu stoi w (0,0), więc ZMIERZONE (probe 166/268, 2026-09-16):
      //   (M2a) flota `sys_020`, kamera `sys_home`, wrogowie w OBU ⇒ pick brał wroga z ramki kamery,
      //         MOS odrzucał obu (`target_other_system`), a `issueFleetOrder:119` ZDĄŻYŁ skasować
      //         poprzedni rozkaz floty (Finding 275);
      //   (M2b) 🔴 kamera PUSTA, wróg w układzie FLOTY pod współrzędnymi kliknięcia ⇒ pick trafiał
      //         w NIEGO, `isSameSystem` prawdziwe, „2/2 wykonuje" ⇒ STARCIE DSCS z celem, którego
      //         gracz NIE widział — z kliknięcia w cudzej ramce (bramka strict poprawnie milczy);
      //   (M2c) kamera == flota: obcy wróg 0,2 AU od kliku (w SWOJEJ ramce) PRZEJMOWAŁ pick nad
      //         legalnym 1,0 AU ⇒ odmowa zamiast rozkazu;
      //   (M2d) tylko obcy w 1,5 AU ⇒ „0/1 (część odrzucona)" zamiast „Brak wroga w tym miejscu".
      // Dwie bramki, obie przy FINALIZACJI (nigdy przy ARM — nic nie kasuje pickera na
      //   `system:switched`; pełne uzasadnienie: nagłówek `src/utils/CameraFrame.js`):
      //   (b) ADMISJA FLOTY — bliźniak `_armMovePicker` (D-LD2: cała flota albo nic, powód nazywa
      //       KAŻDEGO winowajcę; wracamy PRZED `issueFleetOrder`, więc klik odrzucony TĄ bramką nie
      //       kasuje bieżącego rozkazu floty — 275 zostaje żywy dla odmów MOS niżej). ⚠ `_announce` ma
      //       `if (!res) return` — głośność musi być tu jawna.
      //   (a) ZAKRES SZUKANIA = układ KAMERY — to picker KAMEROWY (punkt jest z definicji w jej ramce),
      //       więc tylko wróg z tej ramki jest „pod kliknięciem". Kanon `systemIdOf` w formie listowej
      //       (jak `_handleFleetEngage`): brak stempla → `sys_home`; `null` (tranzyt warp) ⇒ pominięty.
      //       Nieznana kamera ⇒ pusty zbiór (punkt bez ramki nie ma „tutaj"), nie cały rejestr.
      //   Pusto ⇒ istniejący `fleetCmd.noEnemyHere`, zero rozkazu (M2d). Zero nowych kluczy i18n.
      const offenders = fleetOffendersOutOfFrame(fleetId);
      if (offenders.length > 0) {
        window.KOSMOS?.eventLogSystem?.push?.({
          text: t('vessel.orderNoneMoved', offenders.map(describeOrderFail).join(', ')),
          channel: 'fleet',
          severity: 'warn',
          entityRef: offenders[0].vesselId,
        });
        return;
      }
      const vm  = window.KOSMOS?.vesselManager;
      const cam = window.KOSMOS?.activeSystemId ?? null;
      const thresh = (GAME_CONFIG.AU_TO_PX ?? 110) * 1.5;   // ~1.5 AU tolerancji kliknięcia
      const inFrame = cam == null ? [] : (vm?.getAllVessels?.() ?? []).filter(v => systemIdOf(v) === cam);
      const targetId = nearestEnemyToPoint(inFrame, point, thresh, isEnemyVessel);
      if (!targetId) {
        EventBus.emit('ui:toast', { text: t('fleetCmd.noEnemyHere'), color: '#ffaa22', durationMs: 2500 });
        return;
      }
      const res = this._fs()?.issueFleetOrder?.(fleetId, { type: 'engage', targetEntityId: targetId });
      this._announce(res);
      this._markDirty();
    }, { intent: 'fleetcmd_engage', fleetId });
  }

  // ⚠ D-255a (Finding 154) — cel POWROTU dobiera `nearestOwnColonyBodyInSystem`, nie
  //   `AutoRetreatSystem._findNearestFriendlyPlanet`. Tamta nie miała TERMINU UKŁADU i przy
  //   gwiazdach stojących w (0,0) wygrywała dystansem kolonia z OBCEGO układu (zmierzone:
  //   „2.00 AU" do `sys_home` dla statku w `sys_020`). Ta powierzchnia miała ten defekt
  //   znak-w-znak jak `FleetManagerOverlay._handleFleetReturnBase` — i to był jej PIERWSZY pomiar.
  // ⚠ Finding 272 (opcja A) — cel PER CZŁONEK przez `utils/FleetReturnPlan` (jedno źródło dla obu
  //   producentów; pełny opis przy `FleetManagerOverlay._handleFleetReturnBase`).
  _fleetReturn(fleetId) {
    const fs = this._fs();
    const vm = window.KOSMOS?.vesselManager;
    const fleet = fs?.getFleet?.(fleetId);
    if (!fleet || !vm) return;
    const members = fleet.memberIds.map((id) => vm.getVessel(id)).filter((v) => v && !v.isWreck);
    const plan = buildFleetReturnPlan(members, window.KOSMOS?.colonyManager);
    if (!plan.representative) {
      EventBus.emit('ui:toast', { text: t('fleet.noFriendlyPlanet'), color: '#ff4466', durationMs: 3000 });
      return;
    }
    const res = fs.issueFleetOrder(fleetId, {
      type: 'moveToPoint',
      targetPoint:    { ...plan.representative.targetPoint },   // INFORMACYJNE (D-272-3)
      memberTargets:  plan.memberTargets,
      memberRefusals: plan.memberRefusals,
    });
    // ⚠ D-255b (Finding 263) — marker PO rozkazie i tylko dla PRZYJĘTYCH; Finding 272 (D-272-7) —
    //   w WŁASNE ciało członka (bliźniak `FleetManagerOverlay._handleFleetReturnBase`; powód opisany tam).
    for (const id of (res?.accepted ?? [])) {
      const m = vm.getVessel(id);
      if (m) m._pendingReturnDock = plan.memberTargets[id]?.targetBodyId ?? null;   // auto-dock przy dotarciu
    }
    this._announce(res);
    this._markDirty();
  }

  // ── Interakcja ──────────────────────────────────────────────────────────────
  _onHit(zone) {
    if (!zone) return;
    const fs = this._fs();
    const um = window.KOSMOS?.uiManager;
    const fleetId = this._fleetId;
    if (!fleetId && zone.type !== 'restore') return;

    switch (zone.type) {
      case 'minimize': this._minimized = true;  this._markDirty(); return;
      case 'restore':  this._minimized = false; this._markDirty(); return;
      case 'prevFleet': {
        const id = nextFleetId(fs?.listFleets?.() ?? [], fleetId, -1);
        if (id) um?.setSelectedFleetId?.(id);
        return;
      }
      case 'nextFleet': {
        const id = nextFleetId(fs?.listFleets?.() ?? [], fleetId, +1);
        if (id) um?.setSelectedFleetId?.(id);
        return;
      }
      case 'closeFleet': um?.setSelectedFleetId?.(null); return;
      case 'renameFleet': {
        const fleet = this._fleet();
        if (!fleet) return;
        showRenameModal(fleet.name ?? '').then((n) => {
          const nm = n?.trim();
          if (nm) fs?.setName?.(fleetId, nm);
          this._markDirty();
        });
        return;
      }
      case 'doctrine': {
        const fleet = this._fleet();
        if (!fleet) return;
        const next = nextDoctrine(fleet.doctrine, +1, ALL_DOCTRINES);
        fs?.setDoctrine?.(fleetId, next);
        EventBus.emit('ui:toast', { text: t(doctrineNameKey(next)), color: THEME.accent, durationMs: 1800 });
        this._markDirty();
        return;
      }
      case 'memberFocus':
        if (zone.data?.id) EventBus.emit('vessel:focus', { vesselId: zone.data.id });
        return;
      case 'memberRemove':
        if (zone.data?.id) { fs?.removeMember?.(zone.data.id, 'manual'); this._markDirty(); }
        return;
      case 'bgMove':    this._armMovePicker(fleetId);   return;
      case 'bgEngage':  this._armEngagePicker(fleetId); return;
      case 'bgReturn':  this._fleetReturn(fleetId);     return;
      case 'bgStop':    fs?.cancelFleetOrder?.(fleetId, 'manual'); this._markDirty(); return;
      case 'bgDisband': fs?.disbandFleet?.(fleetId, 'manual'); return;
      case 'bgUndock': {
        // Undock — zadokowani członkowie startują i ORBITUJĄ swoje ciało (instant).
        const vm = window.KOSMOS?.vesselManager;
        const fleet = this._fleet();
        for (const id of (fleet?.memberIds ?? [])) {
          const v = vm?.getVessel?.(id);
          if (v?.position?.state === 'docked') vm.undockToOrbit(id);
        }
        this._markDirty();
        return;
      }
      case 'bgDock': {
        // Dock — picker kolonii gracza → rozkaz dock per członek (issueFleetOrder nie zna 'dock').
        // ⚠ Slice 258: JEDNO źródło (`VesselGroupActions.openDockPicker`) — ta pętla była niemal
        //   znak-w-znak kopią `FleetGroupPanel.grpDock`.
        // ⚠ Finding 256, połowa OFERTOWA — kształt (a) REPREZENTANT (podpis właściciela „A + C"),
        //   bliźniak `FleetGroupPanel.grpDock`. Reprezentant = PIERWSZY ŻYWY członek, ten sam idiom
        //   co `_fleetReturn` niżej. Członkowie spoza jego układu dostają GŁOŚNĄ odmowę przy
        //   wysyłce (D-256a + raport w `dispatchDockTo`), a nie ciche pominięcie.
        const fleet = this._fleet();
        if (!fleet) return;
        const vm = window.KOSMOS?.vesselManager;
        const ids = [...(fleet.memberIds ?? [])];
        const first = ids.map((id) => vm?.getVessel?.(id)).find((v) => v && !v.isWreck) ?? null;
        openDockPicker(ids, { sameSystemOnly: true, vessel: first, onDone: () => this._markDirty() });
        return;
      }
      // inne typy — nic
    }
  }
}
