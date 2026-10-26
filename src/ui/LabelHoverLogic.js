// LabelHoverLogic — REFORMA ZAKŁADEK T1 (TABS_REFORM_PLAN.md §5.2; D-TR-1 (a), D-TR-2 (a), D-TR-3 = tabele I7 §3.1 / §3.2 /
// §3.4 / §3.3): czysta logika ROZWINIĘCIA informacyjnego etykiet warstwy HUD i ETYKIETY NA ŻĄDANIE. Rysunek, odczyt świata
// i strefy kliku — `HudLabelLayer` (gałąź za flagą `labelHover`).
//   • stan najechania na CZASIE REALNYM (działa w pauzie): wejście — rozwinięcie rośnie (fade-in `FADE_MS`); zejście
//     kursora — rozwinięcie gaśnie przez `LINGER_MS` i znika; powrót przed końcem — bez ponownego fade-in; przejście na INNY
//     obiekt — od razu nowy (naraz najwyżej JEDNO rozwinięcie z najechania; zaznaczone — osobno, stałe);
//   • wybór obiektu pod kursorem = łańcuch KLIKU (`UIManager.handleClick` → etykiety HUD → `ThreeRenderer.handleClick`):
//     etykieta, chyba że punkt leży na tarczy ciała (487, 503 — tarcza wygrywa z etykietą sąsiada) → statek (na tarczy
//     wyłącznie rdzeń jego sprite'a — 487) → stacja → ciało; tożsamość obiektu wspólna dla tarczy i jego etykiety (bez
//     migotania przy przejściu kursora z tarczy na etykietę tego samego obiektu);
//   • treść rozwinięcia ≤ 4 linie wg I7 — z FAKTÓW zebranych przez warstwę; właściciel i populacja obcej kolonii wg osi
//     WŁAŚCICIELA kanonu mgły wojny (`SystemReveal` — ta sama reguła co Finding 531: nazwa od `contact`, „obce imperium” od
//     `rumor`, „nieznany” niżej, populacja od `detailed`); obcy statek poniżej `contact` — bez nazwy i bez danych (504);
//   • rozkład z PRZYPIĘCIEM (I8.3): etykieta rozwinięta trzyma kandydata położenia sprzed rozwinięcia (górna krawędź po
//     stronie kotwicy bez zmian, pasek rośnie w dół), sąsiedzi ją omijają; jedyny ruch — klamra do kadru obszaru mapy.
// Czysty: bez three, bez DOM i bez `window`; `t` i formatery liczb podaje wołający (keeper woła wszystko pod node).
import { HUD_LABELS, isHudLabelsOn, labelCandidates, placeLabels } from './HudLabelLogic.js';
import { resolveSystemReveal } from '../utils/SystemReveal.js';

/** Flaga kroku — `true` wyłącznie przy `features.labelHover === true` (brak klucza = OFF). */
export const isLabelHoverOn = (features) => features?.labelHover === true;
/** Rozwinięcie działa na warstwie etykiet HUD — wymaga OBU flag (`hudLabels` i `labelHover`). */
export const isLabelHoverActive = (features) => isHudLabelsOn(features) && isLabelHoverOn(features);

// Stałe (ms czasu realnego, px logiczne). Strojenie na bramce.
export const LABEL_HOVER = Object.freeze({
  FADE_MS: 150,            // rozwinięcie — fade-in (D-HUD-12: odpowiedź na akcję gracza → czas realny)
  LINGER_MS: 200,          // po zejściu kursora rozwinięcie gaśnie przez tyle ms i znika
  MAX_LINES: 4,            // linie rozwinięcia (D-TR-3)
  CONTENT_TTL_MS: 250,     // pamięć treści rozwinięcia (jak druga linia statku w H2 — `SUB_TTL_MS`)
  PICK_TTL_MS: 120,        // pamięć wyboru obiektu pod nieruchomym kursorem i kamerą (raycast tarczy gwiazdy, stacje)
  HOVER_PRIO: -1,          // priorytet rozkładu i rysunku etykiety najechanej (przed zaznaczoną — na wierzchu)
  VESSEL_CORE_PICK_PX: 6,  // [px CSS] rdzeń sprite'a statku na tarczy ciała — lustro `ThreeRenderer` (`VESSEL_CORE_PICK_PX`, 487)
});

// ── Stan najechania (czas realny) ─────────────────────────────────────────────────────────────────────────────────

/**
 * Pamięć najechania. `update(raw, now)` — `raw` = tożsamość obiektu pod kursorem w tej klatce (albo `null`), `now` — czas
 * realny (ms). Zwraca stan: `key` (obiekt z rozwinięciem albo `null`), `alpha` (fade-in × wygasanie), `lingering` (kursor
 * zszedł, rozwinięcie gaśnie), `animating` (trwa fade-in albo wygasanie — warstwa rysuje kolejną klatkę).
 */
export function makeHoverMemory() {
  let key = null, born = 0, leftAt = null;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const state = (now) => {
    if (key == null) return { key: null, alpha: 0, fadeIn: 0, fadeOut: 0, lingering: false, animating: false };
    const fadeIn = clamp01((now - born) / LABEL_HOVER.FADE_MS);
    const fadeOut = leftAt == null ? 1 : clamp01(1 - (now - leftAt) / LABEL_HOVER.LINGER_MS);
    return { key, alpha: Math.min(fadeIn, fadeOut), fadeIn, fadeOut, lingering: leftAt != null, animating: fadeIn < 1 || leftAt != null };
  };
  return {
    update(raw, now) {
      const n = Number.isFinite(now) ? now : 0;
      if (key != null && n < born) { born = n; if (leftAt != null) leftAt = n; }   // zegar cofnięty — bez ujemnych czasów
      if (raw != null) {
        if (raw === key) leftAt = null;                       // powrót przed końcem wygasania — bez ponownego fade-in
        else { key = raw; born = n; leftAt = null; }          // nowy obiekt — od razu (poprzedni znika)
      } else if (key != null) {
        if (leftAt == null) leftAt = n;
        if (n - leftAt >= LABEL_HOVER.LINGER_MS) { key = null; leftAt = null; }
      }
      return state(n);
    },
    state,
    clear() { key = null; leftAt = null; },
    get key() { return key; },
  };
}

/** Fade-in rozwinięcia zaznaczonego / najechanego obiektu (czas realny): 0 → 1 w `FADE_MS`. */
export function expansionFade(nowMs, bornMs) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(bornMs)) return 1;
  const d = nowMs - bornMs;
  if (d <= 0) return 0;
  return d >= LABEL_HOVER.FADE_MS ? 1 : d / LABEL_HOVER.FADE_MS;
}

// ── Wybór obiektu pod kursorem i tożsamość ───────────────────────────────────────────────────────────────────────

/**
 * Obiekt pod kursorem — kolejność łańcucha kliku: etykieta (chyba że punkt na tarczy ciała — 487, 503) → statek (na tarczy
 * tylko rdzeń sprite'a — `vesselCoreId`; poza tarczą — picker najechania widocznych sprite'ów, 485) → stacja → ciało.
 * @param {{ labelKey?:string|null, onDisc?:boolean, vesselId?:string|null, vesselCoreId?:string|null,
 *           stationId?:string|null, bodyId?:string|null }} p
 * @returns {{kind:'label', key:string}|{kind:'vessel'|'station'|'body', id:string}|null}
 */
export function resolveHoverTarget({ labelKey = null, onDisc = false, vesselId = null, vesselCoreId = null, stationId = null, bodyId = null } = {}) {
  if (labelKey != null && onDisc !== true) return { kind: 'label', key: labelKey };
  const v = onDisc === true ? vesselCoreId : vesselId;
  if (v != null) return { kind: 'vessel', id: v };
  if (stationId != null) return { kind: 'station', id: stationId };
  if (bodyId != null) return { kind: 'body', id: bodyId };
  return null;
}

/**
 * Tożsamość obiektu etykiety (klucz etykiety → klucz obiektu): kolonia `c:X` i etykieta na żądanie `h:X` → `body:X`; stacja
 * `s:Y` / `hs:Y` → `station:Y`; pojedynczy statek `k:V` / wróg `e:V` → `vessel:V`. Grupa „+N”, szyna i klaster statków —
 * sama etykieta (`lbl:<klucz>`).
 */
export function labelObjectKey(labelKey) {
  const s = String(labelKey ?? '');
  const i = s.indexOf(':');
  if (i <= 0) return null;
  const p = s.slice(0, i), rest = s.slice(i + 1);
  if (!rest) return null;
  if (p === 'c' || p === 'h') return 'body:' + rest;
  if (p === 's' || p === 'hs') return 'station:' + rest;
  if ((p === 'k' || p === 'e') && !rest.includes(',')) return 'vessel:' + rest;
  return 'lbl:' + s;
}

/** Tożsamość obiektu z wyniku `resolveHoverTarget`. */
export function hoverObjectKey(target) {
  if (!target) return null;
  if (target.kind === 'label') return labelObjectKey(target.key);
  if (target.id == null) return null;
  if (target.kind === 'vessel') return 'vessel:' + target.id;
  if (target.kind === 'station') return 'station:' + target.id;
  if (target.kind === 'body') return 'body:' + target.id;
  return null;
}

/**
 * Stacja pod kursorem (px logiczne): tarcza = sfera modelu w rzucie (`objectScreenDisc`), bez minimalnego promienia — przy
 * dalekim widoku model ma ułamek piksela i nie zabiera najechania tarczy planety (lustro kliku: raycast samego modelu).
 * @param {Array<{id:string, disc:{x:number,y:number,r:number}|null}>} stations
 * @returns {string|null} — najbliższa stacja, której tarcza zawiera punkt
 */
export function pickStationAt(stations, lx, ly) {
  if (!Number.isFinite(lx) || !Number.isFinite(ly)) return null;
  let best = null, bestD = Infinity;
  for (const s of stations ?? []) {
    const d = s?.disc;
    if (!d || !(d.r >= 1)) continue;
    const dist = Math.hypot(lx - d.x, ly - d.y);
    if (dist <= d.r && dist < bestD) { bestD = dist; best = s.id; }
  }
  return best;
}

// ── Karta ciała dla ciał bez akcji (d) ───────────────────────────────────────────────────────────────────────────────

/**
 * Akcja karty ciała — LUSTRO `BottomContext._actionLabel` (keeper `label_hover_smoke` pinuje zgodność na tabeli ciał):
 * `takeCiv` (Generator, życie > 80) · `openMap` (dom, kolonia — także AI, ciało `analyzed`) · `null` — ciało bez akcji
 * (w ZF: gwiazda i planetoidy bez placówki). Przy `labelHover` karta ciała bez akcji się nie otwiera (T1 (d)).
 * @param {object} entity
 * @param {object} K — `window.KOSMOS` (jawnie)
 * @returns {'takeCiv'|'openMap'|null}
 */
export function bodyCardAction(entity, K) {
  if (!entity) return null;
  const civMode = K?.civMode;
  const homePl = K?.homePlanet;
  const isHome = !!homePl && entity.id === homePl.id;
  const cm = K?.colonyManager;
  if (!civMode && entity.type === 'planet' && (entity.lifeScore ?? 0) > 80) return 'takeCiv';
  if (civMode && (isHome || cm?.hasColony?.(entity.id))) return 'openMap';
  if (civMode && entity.analyzed && entity.type !== 'star' && !isHome && !cm?.hasColony?.(entity.id)) return 'openMap';
  return null;
}

// ── Treść rozwinięcia (≤ 4 linie, D-TR-3 / I7) ───────────────────────────────────────────────────────────────────────

/** Typ ciała przez słownik (planeta — `planetType.*`, księżyc / planetoida — `bodyType.*`; 538 — nie surowe id). */
export function bodyTypeLabel(body, t) {
  switch (body?.planetType) {
    case 'rocky':    return t('planetType.rocky');
    case 'gas':      return t('planetType.gas');
    case 'ice':      return t('planetType.ice');
    case 'volcanic': return t('planetType.volcanic');
    case 'life':     return t('planetType.life');
    default: break;
  }
  switch (body?.type) {
    case 'planet':    return t('bodyType.Planet');
    case 'moon':      return t('bodyType.Moon');
    case 'planetoid': return t('bodyType.Planetoid');
    case 'asteroid':  return t('bodyType.Asteroid');
    case 'comet':     return t('bodyType.Comet');
    default:          return '';
  }
}

/** Atmosfera przez słownik (klucze `atmosphere.*`); nieznany klucz — surowy (jak karta). */
export function atmosphereLabel(atm, t) {
  switch (atm ?? 'none') {
    case 'none':       return t('atmosphere.none');
    case 'thin':       return t('atmosphere.thin');
    case 'rare':       return t('atmosphere.rare');
    case 'breathable': return t('atmosphere.breathable');
    case 'dense':      return t('atmosphere.dense');
    case 'thick':      return t('atmosphere.thick');
    case 'veryDense':  return t('atmosphere.veryDense');
    default:           return String(atm);
  }
}

/** Klasa gwiazdy przez słownik (`star.*`); klasa spoza słownika — sama litera. */
export function starClassLabel(spectralType, t) {
  switch (spectralType) {
    case 'M': return t('star.M');
    case 'K': return t('star.K');
    case 'G': return t('star.G');
    case 'F': return t('star.F');
    default:  return spectralType ? String(spectralType) : '?';
  }
}

/** Temperatura °C ze znakiem (+13 °C) — `temperatureC`, inaczej z `temperatureK`; brak danych — `null`. */
export function tempCText(body) {
  const c = Number.isFinite(body?.temperatureC) ? body.temperatureC
    : (Number.isFinite(body?.temperatureK) ? body.temperatureK - 273 : null);
  if (c == null) return null;
  const r = Math.round(c);
  return `${r > 0 ? '+' : ''}${r} °C`;
}

/** Skrót złóż: liczba złóż i liczba ★★★ (bogactwo ≥ 0,7 — reguła gwiazdek karty ciała). */
export function depositSummary(deposits) {
  const list = Array.isArray(deposits) ? deposits : [];
  let rich = 0;
  for (const d of list) {
    const pct = d?.totalAmount > 0 ? d.remaining / d.totalAmount : 0;
    if ((d?.richness ?? pct) >= 0.7) rich++;
  }
  return { count: list.length, rich };
}

/** „typ · temp. · atm.” — ciało niezbadane: „typ · ???” (jak zakładka FIZYKA karty). */
function typeTempAtm(body, t, known) {
  const type = bodyTypeLabel(body, t);
  if (!known) return [type, '???'].filter(Boolean).join(' · ');
  const parts = [type, tempCText(body), atmosphereLabel(body?.atmosphere, t)].filter(Boolean);
  return parts.join(' · ');
}

const cap = (lines) => lines.filter((s) => typeof s === 'string' && s.length > 0).slice(0, LABEL_HOVER.MAX_LINES);

/**
 * Właściciel obcej kolonii / stacji wg osi WŁAŚCICIELA (`SystemReveal`, reguła 531): nazwa od `contact`, „obce imperium” od
 * `rumor`, „nieznany” niżej; populacja od `detailed`. Brak wywiadu ⇒ fail-closed.
 * @returns {{ line:string, population:boolean }}
 */
export function foreignOwnerLine({ empireId, empireName, intelAtLeast }, t) {
  const reveal = resolveSystemReveal({ empireId }, { intelAtLeast });
  let line;
  if (reveal.ownerIdentity && empireName) line = `${t('tooltip.planet.owner')}: ${empireName}`;
  else if (reveal.ownerExists) line = t('fleet.stratcomEmpireForeign');
  else line = t('fleet.stratcomEmpireUnknown');
  return { line, population: reveal.population === true };
}

/**
 * Kolonia gracza: dane (POP · wolne · ✦ stolica · wykr.) / typ · temp. · atm. / złoża (skrót) / okupacja albo kolejka.
 * @param {{ sub?:string|null, body?:object, deposits?:{count,rich}|null, occupierName?:string|null, queue?:number }} f
 */
export function colonyExpansionLines(f, t) {
  const out = [];
  if (f?.sub) out.push(f.sub);
  if (f?.body) out.push(typeTempAtm(f.body, t, true));
  if (f?.deposits?.count > 0) out.push(t('labelHover.deposits', f.deposits.count, f.deposits.rich));
  if (f?.occupierName) out.push(t('body.occupiedBy', f.occupierName));
  else if (f?.queue > 0) out.push('⏳ ' + t('leftOutliner.queue', f.queue));
  return cap(out);
}

/**
 * Ciało bez kolonii: typ · temp. · atm. / status zbadania / złoża (skrót — jeśli zbadane) / dystans od gwiazdy.
 * @param {{ body:object, explored:boolean, deposits?:{count,rich}|null, distText?:string|null }} f
 */
export function bodyExpansionLines(f, t) {
  const explored = f?.explored === true;
  const out = [typeTempAtm(f?.body, t, explored), t(explored ? 'fleet.tooltipStatusExplored' : 'fleet.tooltipStatusUnexplored')];
  if (explored && f?.deposits?.count > 0) out.push(t('labelHover.deposits', f.deposits.count, f.deposits.rich));
  if (f?.distText) out.push(t('labelHover.distStar', f.distText));
  return cap(out);
}

/**
 * Gwiazda: klasa · temperatura (K) / strefa życia.
 * @param {{ star:object, tempText?:string|null, hzText?:[string,string]|null }} f
 */
export function starExpansionLines(f, t) {
  const cls = starClassLabel(f?.star?.spectralType, t);
  const out = [[cls, f?.tempText ? `${f.tempText} K` : null].filter(Boolean).join(' · ')];
  if (f?.hzText) out.push(t('labelHover.hz', f.hzText[0], f.hzText[1]));
  return cap(out);
}

/**
 * Obca kolonia: właściciel wg wywiadu (+ populacja od `detailed`) / garnizon (wg wywiadu — `GarrisonReadout`) / okupacja /
 * typ.
 * @param {{ owner:{empireId, empireName, intelAtLeast}, populationText?:string|null, garrisonText?:string|null,
 *           occupierName?:string|null, body?:object }} f
 */
export function foreignColonyExpansionLines(f, t) {
  const o = foreignOwnerLine(f?.owner ?? {}, t);
  const out = [o.population && f?.populationText ? `${o.line} · ${t('hudLabel.pop', f.populationText)}` : o.line];
  if (f?.garrisonText) out.push(`${t('garrison.readout.label')}: ${f.garrisonText}`);
  if (f?.occupierName) out.push(t('body.occupiedBy', f.occupierName));
  const type = bodyTypeLabel(f?.body, t);
  if (type) out.push(type);
  return cap(out);
}

/**
 * Stacja gracza: POP / poj. + plakietki / magazyn / ruch (skrót) / moduły.
 * @param {{ sub?:string|null, storage?:{kind:'pool', head:string, others:number}|{kind:'mother', name:string}|{kind:'cut'}|
 *           {kind:'own', items:number}|null, traffic?:{moving:number, docked:number}|null,
 *           modules?:{n:number, max:number, shipyard:boolean}|null }} f
 */
export function stationExpansionLines(f, t) {
  const out = [];
  if (f?.sub) out.push(f.sub);
  const s = f?.storage;
  if (s?.kind === 'pool') out.push(t('labelHover.pool', s.head, s.others));
  else if (s?.kind === 'mother') out.push(t('labelHover.storage', s.name));
  else if (s?.kind === 'cut') out.push(t('station.cutOffFromSupply'));
  else if (s?.kind === 'own') out.push(t('labelHover.storageOwn', s.items));
  const tr = f?.traffic;
  if (tr) out.push(tr.moving > 0 || tr.docked > 0 ? t('labelHover.traffic', tr.moving, tr.docked) : t('station.tradersNone'));
  const m = f?.modules;
  if (m) out.push(t('labelHover.modules', m.n, m.max) + (m.shipyard ? ' · 🛠' : ''));
  return cap(out);
}

/** Obca stacja: właściciel wg wywiadu. */
export function foreignStationExpansionLines(f, t) {
  return cap([foreignOwnerLine(f?.owner ?? {}, t).line]);
}

/**
 * Własny statek: rola · wykr. · lock / aktywność · ETA (w trybie Y — już w pierwszej linii etykiety, pomijana) / paliwo.
 * @param {{ sub?:string|null, activity?:string|null, etaText?:string|null, fuelText?:string|null, skipActivity?:boolean }} f
 */
export function vesselExpansionLines(f, t) {
  const out = [];
  if (f?.sub) out.push(f.sub);
  if (!f?.skipActivity && f?.activity) out.push([f.activity, f.etaText].filter(Boolean).join(' · '));
  if (f?.fuelText) out.push(f.fuelText);
  return cap(out);
}

/**
 * Obcy statek — treść wg wywiadu (504): poniżej `contact` — wyłącznie „niezidentyfikowany kontakt” (bez nazwy, roli
 * i danych); od `contact` — rola.
 * @param {{ quality:string, roleLabel?:string|null }} f
 */
export function enemyVesselExpansionLines(f, t) {
  const known = f?.quality === 'contact' || f?.quality === 'detailed';
  if (!known) return cap([t('intel.unidentifiedContact')]);
  return cap([f?.roleLabel ?? '']);
}

// ── Rozkład z przypięciem (I8.3) ─────────────────────────────────────────────────────────────────────────────────────

const clampV = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Przypięcie etykiety rozwiniętej: zapamiętane (`pins`), inaczej — pierwsza klatka rozwinięcia — kandydat z poprzedniej klatki
 * (etykieta zwinięta) z jej wysokością (`baseH`); etykieta bez poprzedniej klatki — bez przypięcia (rozkład ją położy, a
 * od następnej klatki stoi).
 * @returns {{ cand:number, baseH:number }|null}
 */
export function pinFor(key, { pins, prev, baseH }) {
  const p = pins?.get?.(key);
  if (p) return p;
  const c = prev?.get?.(key);
  return Number.isInteger(c) && c >= 0 && baseH > 0 ? { cand: c, baseH } : null;
}

/**
 * Pamięć przypięć po rozkładzie: etykiety już nierozwinięte — zapomniane; rozwinięte bez przypięcia — przypięte w miejscu,
 * w którym je położono (górna krawędź tej klatki), z przypięciem — bez zmian.
 * @param {Map<string, {cand, baseH}>} pins — mutowana
 * @param {Array<object>} placed — wynik rozkładu (`key`, `cand`, `h`, `pin?`)
 * @param {Set<string>} expandedKeys — klucze etykiet rozwiniętych w tej klatce
 */
export function updatePins(pins, placed, expandedKeys) {
  for (const k of [...pins.keys()]) if (!expandedKeys.has(k)) pins.delete(k);
  for (const p of placed ?? []) {
    if (!expandedKeys.has(p.key) || pins.has(p.key)) continue;
    pins.set(p.key, p.pin ?? { cand: p.cand, baseH: p.h });
  }
}

/**
 * Powrót sąsiadów (I8.3 — sąsiedzi rozwiniętej etykiety USTĘPUJĄ, nie przeprowadzają się): w pierwszej klatce z rozwinięciem —
 * migawka wyboru kandydatów (`prev`) i epoki ruchu kamery; gdy rozwinięć już nie ma, a kamera stoi od migawki — wybór
 * kandydatów wraca do migawki (rozkład sprawdza go pierwszy: etykieta wraca na dawne miejsce, jeśli tam pasuje). Bez tego
 * lepkość wyboru kandydata (paczka A — bez skoków przy ruchu kamery) zostawia sąsiadów tam, gdzie ustąpili. Kamera ruszona
 * w trakcie rozwinięcia — migawka przepada i nowej nie ma do końca rozwinięć (rozkład i tak ułożył etykiety od nowa).
 * @returns {{ step(prev: Map, anyExpanded: boolean, camEpoch: number): boolean, reset(): void, readonly active: boolean }} —
 *   `step` woła się przed rozkładem klatki; `true` — w tej klatce wybór kandydatów wrócił do migawki (`prev` zmieniony)
 */
export function makeYieldMemory() {
  let snap = null, epoch = null, stale = false;
  return {
    step(prev, anyExpanded, camEpoch) {
      if (anyExpanded) {
        if (!snap && !stale) { snap = new Map(prev ?? []); epoch = camEpoch; }
        else if (snap && camEpoch !== epoch) { snap = null; stale = true; }
        return false;
      }
      const back = !!snap && camEpoch === epoch && !!prev;
      if (back) for (const [k, c] of snap) prev.set(k, c);
      snap = null; epoch = null; stale = false;
      return back;
    },
    reset() { snap = null; epoch = null; stale = false; },
    get active() { return snap !== null; },
  };
}

/**
 * Rozkład etykiet z przypięciem (I8.3): etykieta z `pin` stoi na swoim kandydacie (położenie liczone z wysokością sprzed
 * rozwinięcia — górna krawędź po stronie kotwicy bez zmian, pasek rośnie w dół; strona W — prawa krawędź przy kotwicy),
 * jedyny ruch — klamra do kadru; pozostałe — `placeLabels` z przypiętymi jako przeszkodami (z odstępem `GAP`). Bez etykiet
 * przypiętych — dokładnie `placeLabels`.
 * @returns {{ placed: Array<object>, hidden: string[] }}
 */
export function placeLabelsPinned(items, { rect, obstacles = [], prev = null } = {}) {
  const R = HUD_LABELS;
  const pinned = [], free = [];
  for (const it of items ?? []) (it?.pin ? pinned : free).push(it);
  if (!pinned.length) return placeLabels(free, { rect, obstacles, prev });
  const placedPins = [], hidden = [];
  for (const it of pinned) {
    if (!(it.w > 0 && it.h > 0) || !rect || it.w > rect.w - 2 * R.EDGE || it.h > rect.h - 2 * R.EDGE) { hidden.push(it.key); continue; }
    const cands = labelCandidates({ ...it, h: it.pin.baseH > 0 ? it.pin.baseH : it.h });
    const ci = Number.isInteger(it.pin.cand) && it.pin.cand >= 0 && it.pin.cand < cands.length ? it.pin.cand : 0;
    const c = cands[ci];
    const x = clampV(c.x, rect.x + R.EDGE, rect.x + rect.w - R.EDGE - it.w);
    const y = clampV(c.y, rect.y + R.EDGE, rect.y + rect.h - R.EDGE - it.h);
    const p = { ...it, x, y, side: c.side, below: c.below, cand: ci, overlap: null, pinned: true };
    p.attach = { x: c.side === 'E' ? p.x : p.x + p.w, y: p.y + p.h };
    placedPins.push(p);
  }
  const g = R.GAP;
  const pinObstacles = placedPins.map((p) => ({ x: p.x - g, y: p.y - g, w: p.w + 2 * g, h: p.h + 2 * g }));
  const res = placeLabels(free, { rect, obstacles: [...(obstacles ?? []), ...pinObstacles], prev });
  return { placed: [...placedPins, ...res.placed], hidden: [...hidden, ...res.hidden] };
}
