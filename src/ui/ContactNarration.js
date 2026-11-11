// ContactNarration — #640 (zalew kontaktów; krok POZA arciem COMBAT VISUALS, COMBAT_VISUALS_PLAN.md §3.2-14, -25, Findings 640):
// Dziennik kontaktów z wrogimi statkami — JEDNA linia na zdarzenie zbiorcze zamiast linii na statek albo na parę statków.
//
// Zmierzone przed kodem (świat headless: DSCS + stager + Wywiad + Obserwatorium + Dzwonek + Dziennik, 4 bitwy 10 na 10 w zasięgu
// kolonii, 13 statków gracza w zasięgu sensorów wroga przy pierwszej): na bitwę 120–130 linii „Kontakt sensoryczny” (para statek
// gracza × wróg — `vessel:proximityEnter`), 10 linii „Wykryto obcy statek (KONTAKT)” i 4–10 linii „Utracono kontakt”
// (`intel:vesselContactChanged` / `intel:vesselContactLost`) — ok. 600 wpisów w 4 bitwach przy buforze Dziennika 500 (zapis
// trzyma 200): wcześniejsza historia gracza wypadała (klasa Findingu 173).
//
// Reguła: zdarzenia jednego RODZAJU w jednym UKŁADZIE zbierane przez krótkie okno czasu prezentacji (`CONTACT_NARRATION.WINDOW_MS`
// — otwiera je pierwsze zdarzenie; pauza zatrzymuje okno), potem JEDNA linia: pojedynczy statek — DOKŁADNIE dzisiejszy tekst (te same
// klucze i pola), kilka statków — tekst zbiorczy z liczbą i listą nazw (najwyżej `LIST_MAX`, dalej „+N”). Ten sam statek w jednym
// oknie liczy się raz (para statek gracza × wróg → wróg). Linia zbiorcza nie pokazuje nic ponad pola linii pojedynczych (bez imperium;
// bez pozycji i odległości przy kilku statkach).
// Mgła wojny (#687, decyzja właściciela 2026-11-11): nazwa obcego statku WYŁĄCZNIE, gdy pozwala reguła kanoniczna
// `VesselReveal.enemyVesselNamed` (wywiad o STATKU ≥ contact — ta sama co etykiety CTRL, rozwinięcie T1 i alert HUD). Decyzję
// podejmuje wołający w chwili zdarzenia (`named` na pozycji — moduł nie zna Wywiadu); pozycja bez `named` jest anonimowa (fail-closed):
// jeden statek — odległość albo ostatnia pozycja, kilka — liczba „niezidentyfikowane: N”, nigdy nazwa ani id.
// Okno pierwszego wykrycia obserwatorium (okno z pauzą + linia „niezidentyfikowany kontakt”) zbiera producent — `ObservatorySystem`,
// jedna partia na tik i układ; tu tylko linie kontaktu sensorycznego, identyfikacji i utraty kontaktu.
//
// ⚠ Czysty: bez DOM i bez `window` (tekst przez `t()`) — wykonuje się pod node (keeper `contact_flood_smoke`).
import { t } from '../i18n/i18n.js';

/**
 * Pokrętła na żywo (`KOSMOS.debug.contactWindow(ms)`): `WINDOW_MS` — okno zbierania w ms czasu prezentacji (0 — linia na klatkę),
 * `LIST_MAX` — ile nazw w linii zbiorczej przed „+N”.
 */
export const CONTACT_NARRATION = { WINDOW_MS: 250, LIST_MAX: 5 };

/** Rodzaje linii: kontakt sensoryczny (`proximity`), identyfikacja (`identified`), utrata kontaktu (`lost`). */
export const CONTACT_KINDS = Object.freeze(['proximity', 'identified', 'lost']);

/**
 * Przerwa linii kontaktu sensorycznego dla JEDNEGO wrogiego statku [lata gry]. Dawniej 10 lat na PARĘ (statek gracza × wróg —
 * M4 P1), więc każdy kolejny statek gracza w zasięgu tego samego wroga dawał nową linię; zdarzeniem jest kontakt z wrogiem.
 */
export const PROXIMITY_COOLDOWN_YEARS = 10;

/**
 * Partie kontaktów: klucz = rodzaj | układ | podklucz (poziom wywiadu przy identyfikacji). Stan wyłącznie w pamięci — zapis gry
 * w trakcie okna zabiera najwyżej linie z ostatnich `WINDOW_MS` (wpis i tak powstaje po oknie w bieżącej sesji).
 */
export class ContactBatcher {
  constructor() {
    this._open = new Map();   // klucz → { kind, systemId, sub, openedAt, items: Map<id, item> }
  }

  /**
   * Zdarzenie kontaktu. Pierwsze w kluczu otwiera okno (`openedAt` = `nowMs`); ten sam statek w otwartym oknie — jedna pozycja
   * (odległość — najmniejsza, nazwa i pozycja — ostatnie znane; `named` — z ostatniego zdarzenia). Pozycja anonimowa
   * (`named` fałszywe albo brak) nie przechowuje nazwy (#687 — obrona w głąb).
   * @param {'proximity'|'identified'|'lost'} kind
   * @param {{ systemId?:string|null, sub?:string, id:string, name?:string|null, named?:boolean, distanceAU?:number|null, position?:{x:number,y:number}|null }} it
   * @param {number} nowMs — czas prezentacji [ms]
   */
  add(kind, { systemId = null, sub = '', id, name = null, named = false, distanceAU = null, position = null } = {}, nowMs = 0) {
    if (id == null || !CONTACT_KINDS.includes(kind)) return;
    const key = `${kind}|${systemId ?? '?'}|${sub ?? ''}`;
    let b = this._open.get(key);
    if (!b) {
      b = { kind, systemId: systemId ?? null, sub: sub ?? '', openedAt: nowMs, items: new Map() };
      this._open.set(key, b);
    }
    const prev = b.items.get(id);
    const d = Number.isFinite(distanceAU) ? distanceAU : null;
    const isNamed = named === true;
    b.items.set(id, {
      id,
      named: isNamed,
      name: isNamed ? (name ?? prev?.name ?? null) : null,
      distanceAU: prev && Number.isFinite(prev.distanceAU) && d != null ? Math.min(prev.distanceAU, d) : (d ?? prev?.distanceAU ?? null),
      position: position ?? prev?.position ?? null,
    });
  }

  /**
   * Partie, którym minęło okno — wychodzą (usunięte ze stanu), w kolejności otwarcia.
   * @param {number} nowMs — czas prezentacji [ms]
   * @param {number} [windowMs]
   * @returns {Array<{ kind:string, systemId:string|null, sub:string, openedAt:number, items:object[] }>}
   */
  due(nowMs, windowMs = CONTACT_NARRATION.WINDOW_MS) {
    const w = Number(windowMs) > 0 ? Number(windowMs) : 0;
    const out = [];
    for (const [key, b] of this._open) {
      if (nowMs - b.openedAt < w) continue;
      this._open.delete(key);
      out.push({ ...b, items: [...b.items.values()] });
    }
    return out;
  }

  /** Wszystkie otwarte partie od razu (np. zamknięcie sceny); stan pusty. */
  flushAll() {
    const out = [...this._open.values()].map((b) => ({ ...b, items: [...b.items.values()] }));
    this._open.clear();
    return out;
  }

  /** Liczba otwartych partii (diagnostyka i keeper). */
  get size() { return this._open.size; }
}

/**
 * Lista nazw: wyłącznie pozycje zidentyfikowane (`named`), najwyżej `listMax`, dalej „+N” (bez słów — ta sama postać w PL i EN);
 * pozycje anonimowe — sama liczba na końcu („niezidentyfikowane: N”, #687), nigdy nazwa ani id.
 */
export function contactNameList(items, listMax = CONTACT_NARRATION.LIST_MAX) {
  const list = items ?? [];
  const names = list.filter((it) => it?.named === true).map((it) => it.name ?? it.id ?? '?');
  const anon = list.length - names.length;
  const max = Math.max(1, Math.floor(Number(listMax) || 1));
  let out = names.slice(0, max).join(', ');
  if (names.length > max) out += ` +${names.length - max}`;
  if (anon > 0) out = out ? `${out}; ${t('log.el.unidentifiedCount', anon)}` : t('log.el.unidentifiedCount', anon);
  return out;
}

/**
 * Wpis Dziennika dla partii: pojedynczy statek — dzisiejszy tekst i pola (`log.m4.proximityContact`, `log.el.vesselDetected`,
 * `log.el.contactLost`); kilka — tekst zbiorczy (`log.m4.proximityContacts`, `log.el.vesselsDetected`, `log.el.contactsLost`).
 * Mgła (#687): statek anonimowy — `log.m4.proximityContactAnon` (odległość) / `log.el.contactLostAnon` (ostatnia pozycja); same
 * anonimowe w partii — `log.m4.proximityContactsAnon` / `log.el.contactsLostAnon` (liczba); mieszane — lista nazw + liczba reszty.
 * Kanał i waga jak dotąd (wywiad; utrata kontaktu — ostrzeżenie). `entityRef` — pierwszy statek partii (klik w wpis — jak dziś).
 * @param {{ kind:string, sub?:string, items:object[] }} batch
 * @param {{ listMax?: number }} [o]
 * @returns {{ text:string, channel:string, severity:string, entityRef:string|null }|null}
 */
export function contactLogEntry(batch, { listMax = CONTACT_NARRATION.LIST_MAX } = {}) {
  const items = [...(batch?.items ?? [])];
  if (!items.length) return null;
  if (batch.kind === 'proximity') {
    // najbliższy pierwszy — zbiorcza lista zaczyna się od statków, które są najbliżej sensorów gracza
    items.sort((a, b) => (a.distanceAU ?? Infinity) - (b.distanceAU ?? Infinity));
  }
  const first = items[0];
  const n = items.length;
  const anyNamed = items.some((it) => it?.named === true);
  let text = null, severity = 'info';
  if (batch.kind === 'proximity') {
    const dist = (first.distanceAU ?? 0).toFixed(2);
    if (n === 1) {
      text = first.named === true
        ? t('log.m4.proximityContact', first.name ?? first.id ?? '?', dist)
        : t('log.m4.proximityContactAnon', dist);
    } else {
      text = anyNamed ? t('log.m4.proximityContacts', n, contactNameList(items, listMax)) : t('log.m4.proximityContactsAnon', n);
    }
  } else if (batch.kind === 'identified') {
    // identyfikacja = wywiad doszedł do `contact`+ (wołający przepuszcza wyłącznie ją), więc pozycja jest zidentyfikowana;
    // pozycja anonimowa (gdyby się trafiła) — bez nazwy, jak wszędzie
    const level = t(batch.sub === 'detailed' ? 'intel.levelDetailed' : 'intel.levelContact');
    text = n === 1
      ? t('log.el.vesselDetected', level, first.named === true ? (first.name ?? first.id) : t('intel.unidentifiedContact'))
      : t('log.el.vesselsDetected', level, n, contactNameList(items, listMax));
  } else if (batch.kind === 'lost') {
    severity = 'warn';
    if (n === 1) {
      const p = first.position;
      const pos = p ? `[${Math.round(p.x)},${Math.round(p.y)}]` : `[${t('log.el.positionUnknown')}]`;
      text = first.named === true ? t('log.el.contactLost', first.name ?? first.id, pos) : t('log.el.contactLostAnon', pos);
    } else {
      text = anyNamed ? t('log.el.contactsLost', n, contactNameList(items, listMax)) : t('log.el.contactsLostAnon', n);
    }
  }
  if (!text) return null;
  return { text, channel: 'intel', severity, entityRef: first.id ?? null };
}
