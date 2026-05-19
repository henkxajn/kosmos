// NotificationCenter — centralny rejestr "silent" notyfikacji
//
// Niektóre eventy (odkrycia ciał z misji recon, pasywne skanowanie obserwatorium)
// nie powinny pauzować gry i pokazywać pełnoekranowego popup. Zamiast tego:
//   1. Trafiają tutaj jako notyfikacje z payloadem.
//   2. BottomBar pokazuje dzwonek 🔔 z badge count.
//   3. Klik bell → NotificationDropdown z listą grup (auto-grupowanie po typie).
//   4. Klik wiersza → emit 'notify:openDetail' → MissionEventModal w trybie noPause.
//   5. Równolegle wpis trafia do EventLogSystem (searchable history).
//
// Architektura skalowalna: dodanie nowej kategorii = nowy _handleX + grupa.

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { t } from '../i18n/i18n.js';

const MAX_ITEMS = 50;

export class NotificationCenter {
  constructor() {
    this._items = [];        // {id, type, severity, source, timestamp, year, title, subtitle, payload, dismissed}
    this._nextId = 1;

    // Subskrypcje — silent events (NIE pauzują gry)
    EventBus.on('expedition:reconProgress',  e => this._handleReconProgress(e));
    EventBus.on('expedition:reconComplete',  e => this._handleReconComplete(e));
    EventBus.on('observatory:discovered',    e => this._handleObservatoryDiscovered(e));
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Wszystkie aktywne (nie odrzucone) notyfikacje, najnowsze na początku. */
  getActive() {
    return this._items.filter(n => !n.dismissed);
  }

  /** Aktywne pogrupowane po `type`. Returns [{type, items[]}, …] po recency. */
  getGrouped() {
    const groups = new Map();
    for (const n of this.getActive()) {
      if (!groups.has(n.type)) groups.set(n.type, []);
      groups.get(n.type).push(n);
    }
    // Posortuj grupy po recency najnowszej notyfikacji
    return Array.from(groups.entries())
      .map(([type, items]) => ({ type, items }))
      .sort((a, b) => (b.items[0]?.timestamp ?? 0) - (a.items[0]?.timestamp ?? 0));
  }

  /** Liczba aktywnych — dla badge count w BottomBar. */
  getActiveCount() {
    return this.getActive().length;
  }

  /** Pobierz notyfikację po ID (do otwarcia detail modal). */
  getById(id) {
    return this._items.find(n => n.id === id) ?? null;
  }

  /** Oznacz pojedynczą jako odrzuconą. */
  dismiss(id) {
    const n = this._items.find(x => x.id === id);
    if (!n || n.dismissed) return false;
    n.dismissed = true;
    EventBus.emit('notify:dismissed', { id });
    EventBus.emit('notify:listChanged', { count: this.getActiveCount() });
    return true;
  }

  /** Odrzuć wszystkie. */
  dismissAll() {
    let changed = 0;
    for (const n of this._items) {
      if (!n.dismissed) { n.dismissed = true; changed++; }
    }
    if (changed > 0) {
      EventBus.emit('notify:listChanged', { count: 0 });
    }
    return changed;
  }

  /** Dodaj notyfikację (publiczne — można wołać z zewnątrz dla nowych kategorii). */
  add(notif) {
    // Dedupe: jeśli ten sam type+bodyId w ostatnich 200ms — pomiń.
    // ObservatorySystem emituje JEDNOCZEŚNIE 'observatory:discovered' + 'expedition:reconProgress'
    // (vide ObservatorySystem.js L232 + L239) — bez dedupe odkrycie = 2 notyfikacje.
    const bodyId = notif.payload?.bodyId;
    if (bodyId) {
      const now = Date.now();
      const dup = this._items.find(n =>
        !n.dismissed
        && n.type === notif.type
        && n.payload?.bodyId === bodyId
        && (now - (n.timestamp ?? 0)) < 200
      );
      if (dup) return null;
    }

    notif.id = `notif_${this._nextId++}`;
    notif.timestamp = Date.now();
    notif.year = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    notif.dismissed = false;
    this._items.unshift(notif);
    if (this._items.length > MAX_ITEMS) this._items.length = MAX_ITEMS;

    EventBus.emit('notify:added', { notif });
    EventBus.emit('notify:listChanged', { count: this.getActiveCount() });

    // Równolegle do EventLog (searchable history) — EventLogSystem.push() emituje 'eventLog:push'
    const logChannel = notif.logChannel ?? 'intel';
    const logSeverity = (notif.severity === 'danger' || notif.severity === 'alert') ? 'alert'
                      : (notif.severity === 'warning' || notif.severity === 'warn') ? 'warn'
                      : 'info';
    window.KOSMOS?.eventLogSystem?.push({
      text: notif.logText ?? notif.title,
      channel: logChannel,
      severity: logSeverity,
      entityRef: notif.payload?.bodyId ?? null,
    });

    return notif.id;
  }

  // ── Save / restore ──────────────────────────────────────────────────────

  serialize() {
    // Nie zapisujemy odrzuconych — clean state po reload
    const active = this._items.filter(n => !n.dismissed);
    return {
      nextId: this._nextId,
      items: active.map(n => ({
        id: n.id,
        type: n.type,
        severity: n.severity,
        source: n.source,
        timestamp: n.timestamp,
        year: n.year,
        title: n.title,
        subtitle: n.subtitle,
        payload: n.payload,
      })),
    };
  }

  restore(data) {
    if (!data) return;
    this._items = (data.items ?? []).map(n => ({ ...n, dismissed: false }));
    this._nextId = data.nextId ?? (this._items.length + 1);
    EventBus.emit('notify:listChanged', { count: this.getActiveCount() });
  }

  // ── Handlery silent events ──────────────────────────────────────────────

  _handleReconProgress({ expedition, body, discovered }) {
    if (!body) return;
    this.add({
      type: 'discovery_body',
      severity: 'info',
      source: 'reconProgress',
      title: t('notif.discoveryTitle', body.name ?? '?'),
      subtitle: this._bodySubtitle(body),
      payload: {
        bodyId: body.id,
        bodyType: body.type,
        bodyName: body.name,
        expeditionId: expedition?.id ?? null,
        vesselId: expedition?.vesselId ?? null,
        discoveredCount: Array.isArray(discovered) ? discovered.length : 0,
      },
    });
  }

  _handleReconComplete({ expedition, scope, discovered }) {
    // full_system → jedno podsumowanie misji (wciąż grupowane jako discovery_body)
    if (scope === 'full_system') {
      const count = Array.isArray(discovered) ? discovered.length : 0;
      this.add({
        type: 'discovery_body',
        severity: 'info',
        source: 'reconComplete',
        title: t('notif.reconCompleteTitle', count),
        subtitle: expedition?.vesselId
          ? t('notif.reconCompleteSubtitle', window.KOSMOS?.vesselManager?.getVessel(expedition.vesselId)?.name ?? '?')
          : '',
        payload: {
          scope: 'full_system',
          discoveredIds: Array.isArray(discovered) ? [...discovered] : [],
          expeditionId: expedition?.id ?? null,
          vesselId: expedition?.vesselId ?? null,
          targetName: expedition?.targetName ?? null,
        },
      });
      return;
    }

    // target / nearest — pojedyncze ciało
    if (Array.isArray(discovered) && discovered.length > 0) {
      const bodyId = discovered[0];
      const body = this._findBody(bodyId);
      this.add({
        type: 'discovery_body',
        severity: 'info',
        source: 'reconCompleteTarget',
        title: t('notif.discoveryTitle', body?.name ?? bodyId),
        subtitle: this._bodySubtitle(body),
        payload: {
          scope: scope ?? 'target',
          bodyId,
          bodyType: body?.type,
          bodyName: body?.name,
          expeditionId: expedition?.id ?? null,
          vesselId: expedition?.vesselId ?? null,
        },
      });
    }
  }

  _handleObservatoryDiscovered({ body, discovered, colonyName }) {
    if (!body) return;
    // Dedupe robi this.add() (ObservatorySystem emituje observatory:discovered + expedition:reconProgress).
    this.add({
      type: 'discovery_body',
      severity: 'info',
      source: 'observatoryDiscovered',
      title: t('notif.discoveryTitle', body.name ?? '?'),
      subtitle: this._bodySubtitle(body),
      payload: {
        bodyId: body.id,
        bodyType: body.type,
        bodyName: body.name,
        colonyName: colonyName ?? null,
      },
    });
  }

  // ── Helpery ──────────────────────────────────────────────────────────────

  _bodySubtitle(body) {
    if (!body) return '';
    const type = body.planetType ?? body.type ?? '?';
    const orbit = body.orbital?.a;
    return orbit != null ? `${type} • ${orbit.toFixed(2)} AU` : `${type}`;
  }

  _findBody(bodyId) {
    if (!bodyId) return null;
    const TYPES = ['planet', 'moon', 'asteroid', 'comet', 'planetoid'];
    for (const t of TYPES) {
      const found = EntityManager.getByType(t).find(b => b.id === bodyId);
      if (found) return found;
    }
    return null;
  }
}
