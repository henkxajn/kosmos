# D2 / E3 — live gate · skrypt jednej sesji

**Arc:** WOJNA I POKÓJ 1.0 · faza **D2** (Acceptance Engine) · commit **E3** `e011017`
**Zakres:** WYŁĄCZNIE E3 — pokój i emisariusz dostają pierwsze w historii sprawdzenie.
E1/E7/E2 przeszły bramki headless; E4-E6 i E8-E9 jeszcze nie istnieją.
**Plan fazy:** `docs/design/D2_PLAN.md`

Sedno: **do wczoraj `offerPeace` ustawiał rozejm ZAWSZE** (jedyna bramka: „trwa wojna"),
a emisariusz zawsze dowoził +10 opinii. Dziś decyduje silnik. Gate ma zobaczyć
**pierwszą odmowę pokoju w historii tej gry** — i sprawdzić, że to, co ma dalej działać,
działa.

Osiem punktów, jeden przebieg, ~20 min.

### ⚠ DWA RÓŻNE MIEJSCA WKLEJANIA — nie pomyl ich

| znacznik | gdzie | jak rozpoznać |
|---|---|---|
| **`>_ TERMINAL`** | PowerShell / Git Bash w katalogu repo | polecenie zaczyna się od **`node`**, `git` |
| **`>< KONSOLA`** | DevTools przeglądarki (F12 → Console) | polecenie odwołuje się do **`KOSMOS.`** |

> **Zanim wkleisz cokolwiek do konsoli Chrome:** przy pierwszej wklejce DevTools żąda
> wpisania `allow pasting` i zatwierdzenia Enterem. Zrób to raz na początku sesji.

**pogrubione** = wartość oczekiwana. Wszystkie liczby poniżej są **zmierzone na żywym
boocie**, nie wypisane z pamięci — jeśli u Ciebie wyjdą inne, to jest sygnał, nie szum.

---

## §0 — Który zapis wziąć i jak przygotować scenę

- ✅ **BIERZ:** dowolny zapis **w trybie 4X** (masz kolonię, działa panel dyplomacji),
  wersja **v100**. Wojna NIE jest potrzebna — §1 ją wywoła.
- ❌ **NIE BIERZ:** zapisu sprzed trybu 4X (brak imperiów = nie ma z kim rozmawiać).
- Możesz też po prostu kliknąć **`NOWA GRA`** i zagrać do momentu, w którym panel
  dyplomacji (klawisz **`Y`**) pokazuje imperia. To wystarczy.

- [ ] Otwórz konsolę (**F12**), zatwierdź `allow pasting`.
- [ ] `>< KONSOLA` — kto jest na mapie i jakie ma id:

```
console.table(KOSMOS.empireRegistry.listAll().map(e=>({id:e.id,nazwa:e.name,archetyp:e.archetype,objective:e.objective})));
```

- [ ] Widzisz **dwa** imperia: **`emp_001` (industrialist)** i **`emp_002` (expansionist)**.
      Nazwy będą inne w każdej partii (GALAXY_SEED) — **id są stałe** i ich używamy.

> ℹ Jeśli imperia nie są jeszcze odkryte, panel `Y` może ich nie pokazywać. Konsola widzi
> je zawsze — gate operuje na konsoli, a panel sprawdzamy tylko tam, gdzie to napisane.

---

## §1 — Wojna (punkt startowy dla pokoju)

- [ ] `>< KONSOLA` — wypowiedz wojnę i zobacz, jaki casus belli dobrała gra:

```
KOSMOS.diplomacySystem.declareWar('emp_001','player_action'); const w=KOSMOS.warSystem.getWarWith('emp_001'); console.log('wojna:',w.id,'| casus belli:',w.casusBelli,'| wyczerpanie:',JSON.stringify(w.exhaustion),'| status:',KOSMOS.diplomacySystem.getStatus('emp_001'),'| napięcie:',KOSMOS.diplomacySystem.getTension('emp_001'),'| opinia:',KOSMOS.diplomacySystem.getOpinionOfPlayer('emp_001'));
```

- [ ] `casus belli:` → **`border_incident`** (cena pokoju **30**)
- [ ] `wyczerpanie:` → **`{"player":0,"emp_001":0}`** · `status:` → **`war`**
- [ ] `napięcie:` → **80** · `opinia:` → **−40** (modyfikator `at_war`)

---

## §2 — ⭐ PIERWSZA ODMOWA POKOJU W HISTORII GRY

To jest punkt, dla którego istnieje ten gate. Wojna trwa od chwili, nikt się nie zmęczył,
a cena pokoju z `border_incident` wynosi 30 — więc propozycja **musi** odpaść.

- [ ] `>< KONSOLA` — najpierw sama OCENA (nic nie zmienia):

```
const r=KOSMOS.diplomacySystem.evaluatePeace('emp_001'); console.log('decyzja:',r.decision,'| wynik:',r.score,'| próg:',r.threshold); console.table(r.breakdown.filter(b=>b.value!==0).map(b=>({term:b.term,wklad:b.value,waga:b.weight,raw:b.raw})));
```

- [ ] `decyzja:` → **false** · `wynik:` → **−6.5** · `próg:` → **0**
- [ ] Tabela rozbicia (dokładnie te cztery wiersze):

| term | wkład |
|---|---|
| `war_status` | **−16.5** ← wyczerpanie 0 kontra cena 30 |
| `personality` | **+10** |
| `tension` | **+8** ← napięcie SPRZYJA pokojowi (backbone §2.1) |
| `opinion` | **−8** |

- [ ] `>< KONSOLA` — teraz REALNA propozycja:

```
console.log('offerPeace →',KOSMOS.diplomacySystem.offerPeace('emp_001','player_action'),'| status po:',KOSMOS.diplomacySystem.getStatus('emp_001'));
```

- [ ] `offerPeace →` **false** · `status po:` → **`war`** (wojna trwa!)
- [ ] **Dziennik zdarzeń** (lewy dolny róg / EventLog): wpis
      **`🚫 <nazwa imperium> odrzucili propozycję pokoju`**
- [ ] Pokazał się **toast** w tym samym brzmieniu (pomarańczowy)
- [ ] To samo klikiem w UI: panel dyplomacji (**`Y`**) → wybierz imperium →
      **`☮ ZAPROPONUJ POKÓJ`** → przycisk daje się kliknąć, ale **pokoju nie ma**
      i w Dzienniku pojawia się druga taka linia

> ⚠ Przycisk pokoju jest AKTYWNY mimo pewnej odmowy — to jest zamierzone w E3.
> Wyszarzenie przycisku i modal z rozbiciem („dlaczego nie") to **E4**, nie usterka.

---

## §3 — Pokój PRZYJĘTY (kontrast)

Ta sama wojna, ten sam casus belli — zmienia się tylko zmęczenie obu stron.

- [ ] `>< KONSOLA`:

```
const w=KOSMOS.warSystem.getWarWith('emp_001'); KOSMOS.warSystem.changeExhaustion(w.id,'player',70,'gate'); KOSMOS.warSystem.changeExhaustion(w.id,'emp_001',70,'gate'); const r=KOSMOS.diplomacySystem.evaluatePeace('emp_001'); console.log('wyczerpanie:',JSON.stringify(KOSMOS.warSystem.getWarWith('emp_001').exhaustion),'| wynik:',r.score,'| decyzja:',r.decision);
```

- [ ] `wyczerpanie:` → **`{"player":70,"emp_001":70}`** · `wynik:` → **32** · `decyzja:` → **true**
- [ ] `>< KONSOLA` — podpisz:

```
console.log('offerPeace →',KOSMOS.diplomacySystem.offerPeace('emp_001','player_action'),'| status:',KOSMOS.diplomacySystem.getStatus('emp_001'),'| rozejm lat:',KOSMOS.diplomacySystem.getTruceYearsLeft('emp_001'));
```

- [ ] **true** · `status:` → **`truce`** · `rozejm lat:` → **10**
- [ ] Dziennik: normalny wpis o zawarciu pokoju (bez 🚫)

**Co właśnie zobaczyłeś:** ta sama propozycja, raz odrzucona, raz przyjęta — różnica jest
w wyczerpaniu wojną mierzonym względem **ceny pokoju z casus belli**. To pole
(`casusBelli.peaceCost`) leżało w danych od dawna i **do wczoraj nie miało w kodzie ani
jednego czytelnika**.

---

## §4 — Auto-pokój przestał być obejściem

Dawniej wyczerpanie 100 **wymuszało** pokój bez pytania. Teraz idzie tą samą ścieżką.

⚠ **Wymaga mutacji przez konsolę i to jest udokumentowane, nie ukryte:** wojnę
eksterminacyjną (cena pokoju 100) dobiera `inferCasusBelli` **wyłącznie** dla archetypu
xenofag/rój, a gra generuje tylko industrialist + expansionist. Zamieniamy więc `emp_002`
na xenofaga **przed** wypowiedzeniem wojny — casus belli dobierze się wtedy sam.

- [ ] `>< KONSOLA` — mutacja + wojna:

```
KOSMOS.gameState.set('empires.emp_002.archetype','xenophage','gate'); KOSMOS.gameState.set('empires.emp_002.personality',{aggression:0.9,expansion:0.8,secrecy:0.3,trade:0.1,science:0.4},'gate'); KOSMOS.diplomacySystem.declareWar('emp_002','player_action'); const w2=KOSMOS.warSystem.getWarWith('emp_002'); console.log('archetyp:',KOSMOS.empireRegistry.get('emp_002').archetype,'| wojna:',w2.id,'| casus belli:',w2.casusBelli);
```

- [ ] `archetyp:` → **`xenophage`** · `casus belli:` → **`extermination`** (cena **100**)
- [ ] `>< KONSOLA` — dobij wyczerpanie do sufitu:

```
const w2=KOSMOS.warSystem.getWarWith('emp_002'); KOSMOS.warSystem.changeExhaustion(w2.id,'player',100,'gate'); KOSMOS.warSystem.changeExhaustion(w2.id,'emp_002',100,'gate'); const r=KOSMOS.diplomacySystem.evaluatePeace('emp_002'); console.log('wyczerpanie 100 → wynik:',r.score,'| próg:',r.threshold,'| decyzja:',r.decision,'| status wojny:',KOSMOS.diplomacySystem.getStatus('emp_002'));
```

- [ ] `wynik:` → **−14.4** · `próg:` → **20** · `decyzja:` → **false**
- [ ] `status wojny:` → **`war`** ← **wojna NIE zakończyła się sama**
- [ ] Dziennik: **`⚠ Wojna z <nazwa> trwa mimo wyczerpania — casus belli: extermination`**
- [ ] `>< KONSOLA` — kolejna bitwa PONAWIA próbę (bez tego wojna byłaby zakleszczona,
      bo wyczerpanie jest już na suficie i nic by go nie ruszyło):

```
const w2=KOSMOS.warSystem.getWarWith('emp_002'); KOSMOS.warSystem.changeExhaustion(w2.id,'player',15,'kolejna bitwa'); console.log('sprawdź Dziennik — powinna dojść DRUGA linia „trwa mimo wyczerpania"');
```

- [ ] W Dzienniku jest **druga** taka linia

> ⚠ **Świadome ograniczenie, NIE zgłaszaj go:** samo `peaceCost 100` nie wystarcza, żeby
> pokój był nieosiągalny. Przy spokojnym archetypie pełne wyczerpanie i tak przeważa
> (industrialist + eksterminacja @100 → wynik **+10**, pokój zawarty). Obietnica katalogu
> („praktycznie brak pokoju") wychodzi z **pary cena × natura** i tak działa w grze,
> bo eksterminację dostają wyłącznie xenofag i rój.

---

## §5 — Emisariusz ODRZUCONY (statek wraca pusty)

Zostajemy przy zmutowanym `emp_002` (xenofag, stan wojny).

- [ ] `>< KONSOLA` — najpierw ocena, potem statek:

```
KOSMOS.intelSystem.advanceIntel('emp_002','contact','gate'); const r=KOSMOS.diplomacySystem.evaluateEnvoy('emp_002'); console.log('evaluateEnvoy → decyzja:',r.decision,'| wynik:',r.score,'| próg:',r.threshold);
```

- [ ] `decyzja:` → **false** · `wynik:` → **−29.4** · `próg:` → **10**
- [ ] `>< KONSOLA` — statek z modułem dyplomatycznym + wyślij delegację:

```
const v=KOSMOS.vesselManager.createAndRegister('hull_small',KOSMOS.homePlanet.id,{modules:['diplomatic_module']}); console.log('statek:',v.id,'| status:',v.status); KOSMOS.missionSystem._launchEnvoy('emp_002',v.id); const m=KOSMOS.missionSystem.getActive().find(x=>x.targetEmpireId==='emp_002'); console.log('misja:',m&&m.type,'| dotarcie w roku:',m&&m.arrivalYear,'| powrót:',m&&m.returnYear,'| opinia teraz:',KOSMOS.diplomacySystem.getOpinionOfPlayer('emp_002'));
```

- [ ] `misja:` → **`envoy`** · `opinia teraz:` → **−40**
- [ ] **Puść czas** (przyspiesz), aż misja doleci i wróci (`dotarcie` i `powrót` to lata GRY,
      widoczne na pasku u góry). Możesz też pominąć czekanie poleceniem niżej.

```
const m=KOSMOS.missionSystem.getActive().find(x=>x.targetEmpireId==='emp_002'); KOSMOS.missionSystem._processEnvoyArrival(m); KOSMOS.missionSystem._completeEnvoy(m); console.log('odmowa?:',m.refused,'| opinia po CAŁYM kursie:',KOSMOS.diplomacySystem.getOpinionOfPlayer('emp_002'),'| statek:',KOSMOS.vesselManager.getVessel(m.vesselId).status);
```

- [ ] `odmowa?:` → **true**
- [ ] `opinia po CAŁYM kursie:` → **−40** ← **bez zmian: ani +5 przy dotarciu, ani +5 przy powrocie**
- [ ] `statek:` → **`idle`** ← **wrócił i jest wolny** (Decyzja 4 fazy: statek wraca normalnie)
- [ ] Dziennik: **`🚫 <nazwa> nie przyjęli naszej delegacji`** + toast
- [ ] Dziennik **NIE** zawiera „Emisariusz wrócił od…" dla tego kursu (bezowocny powrót ma
      własny komunikat i nie udaje sukcesu)

---

## §6 — Emisariusz PRZYJĘTY (parytet — ścieżka sprzed D2 bez zmian)

- [ ] `>< KONSOLA` (cel: `emp_001`, po rozejmie z §3):

```
KOSMOS.intelSystem.advanceIntel('emp_001','contact','gate'); const v=KOSMOS.vesselManager.createAndRegister('hull_small',KOSMOS.homePlanet.id,{modules:['diplomatic_module']}); KOSMOS.missionSystem._launchEnvoy('emp_001',v.id); const m=KOSMOS.missionSystem.getActive().find(x=>x.targetEmpireId==='emp_001'); const before=KOSMOS.diplomacySystem.getOpinionOfPlayer('emp_001'); KOSMOS.missionSystem._processEnvoyArrival(m); const mid=KOSMOS.diplomacySystem.getOpinionOfPlayer('emp_001'); KOSMOS.missionSystem._completeEnvoy(m); console.log('opinia:',before,'→ po dotarciu',mid,'→ po powrocie',KOSMOS.diplomacySystem.getOpinionOfPlayer('emp_001'),'| odmowa?:',!!m.refused);
```

- [ ] `odmowa?:` → **false**
- [ ] Opinia rośnie **+5 przy dotarciu i +5 przy powrocie** (np. **−10 → −5 → 0**;
      wartość startowa zależy od tego, co działo się w §1-§3 — liczy się **przyrost +10**)
- [ ] Dziennik: normalne wpisy „Emisariusz dotarł…" i „Emisariusz wrócił od…"

> ⚠ **Świadome ograniczenie, NIE zgłaszaj go:** imperium o SPOKOJNYM archetypie przyjmie
> delegację **nawet w stanie wojny** (industrialist w wojnie: wynik −6 przy progu −10).
> Odmowa wymaga natury wrogiej ALBO bardzo złej opinii. Czy to za łagodnie — ocenimy
> macierzami w E6, gdzie i tak stroimy tempo.

---

## §7 — Regresja: traktaty nadal działają (i to przez silnik)

- [ ] `>< KONSOLA` — po dwóch emisariuszach z §6 opinia `emp_001` powinna sięgać **10**,
      czyli DOKŁADNIE dawnego progu umowy handlowej (dawny trust 60):

```
const r=KOSMOS.diplomacySystem.evaluateTreaty('emp_001','trade_agreement'); console.log('opinia:',KOSMOS.diplomacySystem.getOpinionOfPlayer('emp_001'),'| wynik:',r.score,'| próg:',r.threshold,'| decyzja:',r.decision); console.log('proposeTreaty →',KOSMOS.diplomacySystem.proposeTreaty('emp_001','trade_agreement'),'| ma traktat:',KOSMOS.diplomacySystem.hasTreaty('emp_001','trade_agreement'));
```

- [ ] Przy opinii **10**: `wynik:` **4** · `próg:` **4** · `decyzja:` **true**
      ← granica wypada co do punktu tam, gdzie przed D2
- [ ] `proposeTreaty →` **true** · `ma traktat:` **true**
- [ ] Dziennik: wpis o zawarciu umowy handlowej
- [ ] Panel dyplomacji (**`Y`**): slot umowy handlowej zamienia się w przełącznik
      **`Auto-handel: WŁ`** (zachowanie sprzed D2)

> ℹ Gdy opinia jest **9**, `decyzja` = **false**. To jest kotwica parytetu: dawny próg
> trustu 60 = opinia 10, i tam dokładnie leży granica.

---

## §8 — Diagnostyka: dlaczego silnik tak zdecydował

- [ ] `>< KONSOLA` — pełny zrzut relacji + rozbicie akceptacji dla wszystkich trzech traktatów:

```
KOSMOS.debug.dumpRelation('emp_001');
```

- [ ] Widzisz `[debug] relacja {…}` (opinia, pasmo, napięcie, status, rozejm, traktaty, reputacja)
- [ ] Widzisz tabelę **rozbicia opinii** (skąd się wzięła)
- [ ] Widzisz **trzy linie** `[debug] akceptacja <traktat>: TAK/NIE — wynik X / próg Y`
      **oraz tabelę rozbicia pod każdą z nich**
- [ ] Dla `non_aggression` i `alliance` wynik jest niższy niż próg (opinia 10 to za mało —
      dawne progi to 25 i 30)

---

## §9 — Harness (2 min, `>_ TERMINAL`)

- [ ] `node src/testing/smoke/run-all.mjs` → **`109/109 OK, 0 FAIL`**
- [ ] `node src/testing/smoke/acceptance_peace_envoy_smoke.mjs` → **`33 PASS / 0 FAIL`**
- [ ] `node src/testing/smoke/acceptance_retrofit_smoke.mjs` → **`38 PASS / 0 FAIL`**
- [ ] `node src/testing/smoke/diplomacy_d1_smoke.mjs` → **`83 PASS / 0 FAIL`**
      (suita napisana PRZED silnikiem — przechodzi bez jednej poprawki, to jest dowód parytetu)
- [ ] `node tools/check-i18n.mjs` → **`WYNIK: PASS`**

---

## §10 — Świadome NIE-defekty (potwierdź, że je widzisz i akceptujesz)

To NIE są błędy. Gate polega na tym, żeby je zobaczyć i **nie zgłosić**.

- [ ] **Przycisk „ZAPROPONUJ POKÓJ" jest aktywny nawet gdy propozycja na pewno padnie.**
      Wyszarzanie i modal z rozbiciem to **E4**.
- [ ] **Brak modala „dlaczego nie"** — odmowa mówi na razie wyłącznie przez Dziennik i toast (E4).
- [ ] **Spokojne imperium przyjmuje delegację w czasie wojny** (§6) — kalibracja do E6.
- [ ] **Sama cena pokoju 100 nie blokuje pokoju** bez wrogiej natury (§4) — para cena × natura.
- [ ] **Mutacje z §4/§5 (`gameState.set` na archetypie) to narzędzie GATE'U**, nie ścieżka
      rozgrywki — xenofag nie jest generowany w grze. Po gate'cie **nie zapisuj tej partii**
      albo wczytaj ją ponownie.
- [ ] **Nadal nie ma zanikania modyfikatorów** (`FEATURES.diplomacyDecay` = OFF) — flip to **E6**.

---

## Wynik gate'u

- [ ] **§1-§2 PASS** — pierwsza odmowa pokoju + wpis w Dzienniku
- [ ] **§3 PASS** — pokój przyjęty po wzroście wyczerpania
- [ ] **§4 PASS** — auto-pokój odmówiony, wojna trwa, retry przy kolejnej bitwie
- [ ] **§5 PASS** — delegacja odrzucona, statek wrócił pusty, zero opinii
- [ ] **§6 PASS** — delegacja przyjęta, +5/+5 jak dotąd
- [ ] **§7-§8 PASS** — traktat przez silnik, granica na dawnym progu, diagnostyka czytelna
- [ ] **§9 PASS** — harness zielony
- [ ] **§10** — przejrzane i zaakceptowane

**Gdy wszystko PASS:** E3 zamknięty → **E4** (UI odmowy z rozbiciem + term `recent_refusal`)
w świeżej sesji, bootstrap z dokumentów w repo.

**Gdy coś FAIL:** zanotuj numer paragrafu, WKLEJONE polecenie i CAŁY wynik z konsoli
(łącznie z tabelą rozbicia — to ona mówi, który term poszedł nie tak). Świeża sesja naprawcza.
