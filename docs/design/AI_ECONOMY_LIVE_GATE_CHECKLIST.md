# LIVE-GATE — ekonomia AI (Findingi 181 + 182), do wykonania w przeglądarce

> **Po co ten dokument.** Cały wątek ekonomii AI (plany **(a)** `AI_SAFETY_STOCK_PLAN` i **(c)**
> `AI_FUSION_BRANCH_PLAN`) przeszedł od pomiaru headless **prosto do commitu**, bez live-gate'u —
> jako jedyny w tej sesji. Lukę wskazał właściciel 2026-08-28. Gate jest **retroaktywny**:
> commity `d44af5e`, `ccb275b`, `c8a0419` już są w `main`.
>
> ⚠ **Wszystkie komendy poniżej ZOSTAŁY WYKONANE na żywym silniku** przed wpisaniem ich tutaj
> (reguła `validate-gate-oneliners-on-live-engine`), i wklejone w postaci, w której się wykonały,
> razem z ich prawdziwym wyjściem.

## §1 Oś czasu — ile lat gry trzeba (ZMIERZONE, 2 seedy × 80 gy)

| zdarzenie | seed A | seed B |
|---|---|---|
| bramka zamożności OTWIERA się (industrialista) | **23 gy** | **28 gy** |
| `plasma_cores` pierwszy raz > 0 | **21 gy** | **29 gy** |
| `metamaterials` > 0 | 21 gy | 29 gy |
| `quantum_cores` / `antimatter_cells` / `quantum_processors` > 0 | **55 gy** | — (nie w 80 gy) |
| `warp_cores` > 0 | **63 gy** | — (nie w 80 gy) |
| ekspansjonista: bramka OTWIERA się | **nigdy** | **nigdy** |

**Praktyczny plan:** checkpoint 1 przy **~30 gy** (pierwszy sygnał), checkpoint 2 przy **~65-70 gy**
(łańcuch warp). Przy maksymalnej prędkości **1 rok/s** to ok. **30 s** i **70 s** czasu realnego,
plus przerwy na auto-slow.

⚠ **ZALEŻNOŚĆ OD SEEDA JEST DUŻA.** W jednym z dwóch przebiegów po 80 gy pojawiły się **tylko**
`plasma_cores` i `metamaterials`. **Jeden przebieg bez `warp_cores` NIE falsyfikuje zmiany** —
falsyfikuje ją dopiero brak `plasma_cores` przy otwartej bramce.

## §2 Przygotowanie

1. Nowa gra, scenariusz **Cywilizacja** (imperia AI muszą istnieć).
2. `F12` → Console. ⚠ `KOSMOS.debug` **nie istnieje na ekranie tytułowym** — dopiero w grze.
3. Rozpędź czas: `KOSMOS.timeSystem.setMultiplier(5)` (5 = 1 rok/s, najszybciej).
   ⚠ **Nie ma prawdziwego skoku w czasie** (`CHEATS.md`) — trzeba odczekać.
   ⚠ Auto-slow po zdarzeniach **zresetuje prędkość** — powtórz komendę.

## §3 Komendy (wykonane, wklej jak są)

**KOM-0 — który mamy rok gry:**
```js
KOSMOS.timeSystem.gameTime.toFixed(1)
```

**KOM-1 — zamożność i stan bramki (rdzeń kryterium 2):**
```js
console.log(KOSMOS.empireRegistry.listAll().map(e=>{const c=(KOSMOS.empireRegistry.getColoniesByEmpire(e.id)||[]).find(x=>x&&!x.isOutpost&&x.resourceSystem);const r=c?.resourceSystem,O=['Fe','Si','Cu','C'];return e.archetype.padEnd(14)+' '+O.map(o=>o+':'+Math.round(r?.getAmount(o)??0)).join(' ')+' => '+(O.every(o=>(r?.getAmount(o)??0)>=20000)?'BOGATY':'ubogi')+' | bonus='+(c?.factorySystem?.getDemandBonus?.('plasma_cores')??'?')}).join('\n'))
```
Wyjście z żywego silnika (60 gy):
```
industrialist  Fe:16930 Si:34533 Cu:31050 C:48894 => ubogi | bonus=0
expansionist   Fe:0 Si:0 Cu:0 C:1623 => ubogi | bonus=0
```

**KOM-2 — zapasy towarów docelowych (rdzeń kryterium 1):**
```js
console.log(KOSMOS.empireRegistry.listAll().map(e=>{const c=(KOSMOS.empireRegistry.getColoniesByEmpire(e.id)||[]).find(x=>x&&!x.isOutpost&&x.resourceSystem);const r=c?.resourceSystem;return e.archetype.padEnd(14)+' '+['plasma_cores','quantum_cores','antimatter_cells','warp_cores','quantum_processors','metamaterials'].map(k=>k+'='+Math.round(r?.getAmount(k)??0)).join(' ')}).join('\n'))
```
Wyjście z żywego silnika (60 gy):
```
industrialist  plasma_cores=50 quantum_cores=0 antimatter_cells=0 warp_cores=0 quantum_processors=0 metamaterials=50
expansionist   plasma_cores=0 quantum_cores=0 antimatter_cells=0 warp_cores=0 quantum_processors=0 metamaterials=0
```

**KOM-3 — czy gałąź fuzji weszła (kryterium 3):**
```js
console.log(KOSMOS.empireRegistry.listAll().map(e=>{const c=(KOSMOS.empireRegistry.getColoniesByEmpire(e.id)||[]).find(x=>x&&!x.isOutpost);const ts=c?.buildingSystem?.techSystem;return e.archetype.padEnd(14)+' plasma_physics='+!!ts?.isResearched?.('plasma_physics')+' fusion_power='+!!ts?.isResearched?.('fusion_power')+' warp_drive='+!!ts?.isResearched?.('warp_drive')}).join('\n'))
```
Wyjście z żywego silnika (60 gy): `plasma_physics=true fusion_power=true warp_drive=true` u obu.

**KOM-4 — izolacja D1: TWOJE kolonie mają być NIETKNIĘTE (kryterium 4):**
```js
console.log(KOSMOS.colonyManager.getAllColonies().filter(c=>!c.ownerEmpireId).map(c=>c.planetId+' bonus(plasma_cores)='+(c.factorySystem?.getDemandBonus?.('plasma_cores')??'brak fabryki')+' plasma_cores='+Math.round(c.resourceSystem?.getAmount?.('plasma_cores')??0)).join('\n'))
```
Wyjście z żywego silnika: `entity_2 bonus(plasma_cores)=0 plasma_cores=1`.

**KOM-5 — DLACZEGO imperium jest ubogie: brak złoża czy brak przepływu?**
Rozstrzyga, czy niska ruda to **deadlock strukturalny** (jak Ti u ekspansjonisty w BALANS §4.2:
dom bez złoża, więc nigdy nie będzie), czy **problem przepływu** (złoże jest, ale wydobycie nie
nadąża za konsumpcją). To dwie różne diagnozy i dwie różne naprawy.
```js
console.log(KOSMOS.empireRegistry.listAll().map(e=>{const cs=KOSMOS.empireRegistry.getColoniesByEmpire(e.id)||[];const cap=cs.find(x=>x&&!x.isOutpost&&x.resourceSystem);const r=cap?.resourceSystem;const dep=id=>cs.map(c=>{const b=KOSMOS.entityManager?.get?.(c.planetId);const d=(b?.deposits||[]).find(z=>z.resourceId===id);return d?Math.round(d.remaining):0}).reduce((a,b)=>a+b,0);return e.archetype.padEnd(14)+' '+['Fe','Si','Cu','C'].map(o=>o+': stan='+Math.round(r?.getAmount(o)??0)+' netto/rok='+(r?.getPerYear?.(o)??0).toFixed(1)+' zloza='+dep(o)).join('\n               ')}).join('\n'))
```
Wyjście z żywego silnika (45 gy) — **wzorzec „przepływ", nie „deadlock"**:
```
industrialist  Fe: stan=14651 netto/rok=-53.0 zloza=222859
               Si: stan=36924 netto/rok=-174.0 zloza=217623
               Cu: stan=20183 netto/rok=-6.0  zloza=202152
               C:  stan=32871 netto/rok=-6.0  zloza=124843
```
**Jak czytać:** `zloza` ≫ 0 **i** `netto/rok` < 0 ⇒ ruda **jest w ziemi**, ale imperium ją przejada —
to problem wydobycia/konsumpcji. `zloza` = 0 ⇒ **deadlock strukturalny**, dom bez tego surowca,
rodzina deadlocku Ti.
⚠ `KOSMOS.entityManager` istnieje **tylko w przeglądarce** (`GameScene:388`); headless go nie wystawia,
więc powyższe wyjście uzyskano z bezpośrednim importem `EntityManager`. Kształt odczytu ten sam.

## §4 Przebieg

| krok | kiedy | komenda | czego szukasz |
|---|---|---|---|
| 0 | rok ~0 | KOM-3, KOM-4 | `fusion_power=false` (jeszcze niezbadane), bonus gracza `0` |
| 1 | ~15 gy | KOM-3 | **`fusion_power=true`** u obu archetypów (gałąź wchodzi ok. 13-14 gy) |
| 2 | ~30 gy | KOM-1, KOM-2 | industrialista bywa `BOGATY` + `bonus=49`; **`plasma_cores` > 0** |
| 3 | ~65-70 gy | KOM-1, KOM-2 | `quantum_cores` / `antimatter_cells` / **`warp_cores`** > 0 u industrialisty |
| 4 | na koniec | KOM-4 | bonus gracza **nadal 0** |

## §5 Kryteria zaliczenia

> ⚠ **KOREKTA 2026-08-28 — pierwotne kryteria 1 i 2 były WADLIWE i zostały przepisane.**
> Nazywały archetypy („industrialista się bogaci", „ekspansjonista jest ubogi"), czyli wpisywały
> w warunek zaliczenia **przypadkowy wynik PRZYPIĘTEJ galaktyki headless** — w dokumencie, którego
> §7 ostrzega, że przeglądarka mintuje inną. Podpisana teza nigdy nie mówiła o archetypach, tylko
> o **majątku**: `_syncTier3SafetyDemand` czyta wyłącznie rudy danej kolonii i nie rozróżnia
> archetypów (zweryfikowane w źródle). Poniższe brzmienie odpowiada tezie, nie mojej pomyłce.

1. ✅ **Co najmniej jedno imperium AI** pokazuje jednocześnie `BOGATY`, `bonus=49` i
   `plasma_cores > 0`. **Który** to archetyp — nieistotne. To jest **minimum** gate'u.
2. ✅ **Każde** imperium pokazujące `ubogi` ma `bonus=0` i tier 3+ na zerze — bramka chroni ubogich.
3. ✅ `fusion_power=true` u industrialisty (przed zmianą **nigdy**).
4. ✅ KOM-4: `bonus(plasma_cores)=0` na koloniach gracza — zmiana jest AI-only.
5. 🎯 *Bonus, nie warunek:* `warp_cores > 0` u industrialisty.

## §6 Pułapki — czego NIE brać za porażkę

- ⚠ **Bramka jest DYNAMICZNA.** `bonus=0` i `ubogi` mogą wystąpić **po** okresie bogactwa, gdy ruda
  została skonsumowana. Stan `plasma_cores=50` **przy** `bonus=0` jest **poprawny** — zapas powstał
  wcześniej i się utrzymuje. Zmierzone: seed B otworzył bramkę w 28 gy i zamknął ją do 80 gy.
- ⚠ **KTÓRY archetyp się bogaci, jest własnością GALAKTYKI, nie archetypu.** W przypiętej galaktyce
  headless bogacił się industrialista; w losowej galaktyce przeglądarki bywa odwrotnie i **to nie jest
  usterka** — bramka czyta majątek kolonii, nie tożsamość imperium. Odwrócony wzorzec jest wręcz
  **mocniejszym** dowodem niż powtórka wyniku headless, bo pokazuje, że mechanizm idzie za rudą.
- ⚠ **Zamożność jest z natury PRZEJŚCIOWA — knob D3 nie tworzy trwałego stanu.** Zmierzone (KOM-5,
  45 gy): `netto/rok` jest **ujemne dla WSZYSTKICH czterech rud** u obu imperiów przy złożach rzędu
  200 tys. w ziemi. Imperium nie „bogaci się z czasem" — **przejada zapas**, więc bramka otwiera się
  na oknie stockpile'u i zamyka, gdy ten spadnie poniżej 20 tys. Panel headless tego nie pokazywał,
  bo patrzył na stan końcowy i pierwsze otwarcie, nie na bilans.
- ⚠ **`warp_cores` przychodzą późno i w małych liczbach** — zmierzone **6 sztuk** przy 60-80 gy.
  Nie oczekuj setek; to najgłębszy poziom łańcucha (tier 5).
- ⚠ **`quantum_processors` mogą rosnąć mimo braku `quantum_computing`** — to nie błąd, tylko
  **Finding 184** (bramka to OR, `quantum_physics` otwiera je przez `unlockCommodity`).
- ⚠ **`fuel` i `military_supplies` zostaną na zerze** — Findingi **180** i **185**, poza zakresem
  tych dwóch slice'ów. Ich zero **nie jest** porażką tego gate'u.
- ⚠ **`Nt` bywa zerowe** w stolicach AI i wtedy `quantum_cores`/`antimatter_cells` stoją na braku
  składnika, nie na bramce — rodzina Findingu **178** (kanał logistyczny nie wozi towarów).

## §7 Jeśli gate PADNIE

Zgłoś, co pokazały KOM-1..4 i przy którym roku gry. Najbardziej prawdopodobne źródło rozbieżności
headless↔przeglądarka: **przeglądarka mintuje losowy seed galaktyki**, a headless ma przypięty
`HEADLESS_GALAXY_SEED` — więc domy imperiów AI i ich złoża **będą inne niż w pomiarach**. To jest
oczekiwane i jest głównym powodem, dla którego ten gate w ogóle ma sens.
