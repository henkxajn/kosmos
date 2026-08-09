# D2 / E5 — live gate · skrypt jednej sesji

**Status: ⬜ DO PRZEPROWADZENIA** — wypełnia go osoba uruchamiająca (§Wynik gate'u na końcu).

**Arc:** WOJNA I POKÓJ 1.0 · faza **D2** (Acceptance Engine) · commity **E5a** `6c7ea3d` + **E5b** `d7ff7b5`
**Zakres:** WYŁĄCZNIE E5 — oś `objective` (agenda) dostaje LICZBY, a cecha `erratic` dostaje RZUT.
E1/E7/E2/E4/E4e przeszły swoje bramki; E6/E8/E9 jeszcze nie istnieją.
**Plan fazy:** `docs/design/D2_PLAN.md` · **Poprzedni gate:** `D2_E3_GATE_CHECKLIST.md` (PASSED)

Sedno: **do wczoraj agenda imperium nie robiła NIC.** Pole `objective` istnieje od D1, silnik czyta
je od E1, ale tabela nadpisań była pusta — więc sześć agend dawało co do punktu ten sam wynik.
Gate ma zobaczyć **pierwszą w historii tej gry decyzję, którą rozstrzygnęła AGENDA, a nie kultura,
opinia ani napięcie** — i drugą nowość: imperium, które bywa nieobliczalne.

Dziesięć punktów, jeden przebieg, ~20 min.

### ⚠ DWA RÓŻNE MIEJSCA WKLEJANIA — nie pomyl ich

| znacznik | gdzie | jak rozpoznać |
|---|---|---|
| **`>_ TERMINAL`** | PowerShell / Git Bash w katalogu repo | polecenie zaczyna się od **`node`**, `git` |
| **`>< KONSOLA`** | DevTools przeglądarki (F12 → Console) | polecenie odwołuje się do **`KOSMOS.`** |

> **Zanim wkleisz cokolwiek do konsoli Chrome:** przy pierwszej wklejce DevTools żąda
> wpisania `allow pasting` i zatwierdzenia Enterem. Zrób to raz na początku sesji.

**pogrubione** = wartość oczekiwana. Wszystkie liczby poniżej są **zmierzone na żywym silniku**
(headless, ten sam kod co w przeglądarce), nie wypisane z pamięci — jeśli u Ciebie wyjdą inne,
to jest sygnał, nie szum.

**PROGI są niezależne od Twojej opinii i muszą się zgadzać CO DO PUNKTU.** Wyniki (`score`)
zależą od stanu Twojej partii — dla nich liczy się UKŁAD (militarist najtrudniej → diplomat
najłatwiej), nie wartość bezwzględna. Tam, gdzie podaję konkretny `score`, jest napisane,
przy jakiej opinii został zmierzony.

---

## §0 — Który zapis wziąć i jak przygotować scenę

- ✅ **BIERZ:** dowolny zapis **w trybie 4X** (masz kolonię, panel dyplomacji `Y` pokazuje imperia),
  wersja **v100**. Wojna NIE jest potrzebna — E5 nie dotyka wojny.
- ⚠ **DLA CZĘŚCI `erratic` (§5–§8) STARY ZAPIS NIE WYSTARCZY.** Cecha rodzi się wyłącznie przy
  generacji galaktyki, a migracja v99→v100 ustawia `traits: []` i E5 tego świadomie NIE cofa
  (backfill wymagałby rzutu z seeda, którego stary zapis nie zna). Dlatego §5 ustawia cechę
  z konsoli — to jest ZAPLANOWANA ścieżka gate'u, nie obejście. §8 mówi, jak sprawdzić rzut naturalny.

- [ ] Otwórz konsolę (**F12**), zatwierdź `allow pasting`.
- [ ] `>< KONSOLA` — kto jest na mapie, jaką ma kulturę, agendę i cechy:

```
console.table(KOSMOS.empireRegistry.listAll().map(e=>({id:e.id,nazwa:e.name,archetyp:e.archetype,agenda:e.objective,cechy:(e.traits||[]).join(',')||'—'})));
```

- [ ] Widzisz **dwa** imperia: **`emp_001` (industrialist)** i **`emp_002` (expansionist)**.
- [ ] Kolumna **`agenda`** jest wypełniona u obu (jedna z sześciu: militarist, technologist,
      expansionist, diplomat, merchant, ecologist).
- [ ] Kolumna `cechy` pokaże **`—`** dla zapisu sprzed E5. Na NOWEJ GRZE może pokazać `erratic`
      (szansa 25% na imperium) — obie odpowiedzi są poprawne, patrz §8.

> ℹ **Dlaczego gate mutuje agendę z konsoli, a nie szuka dwóch imperiów tego samego archetypu:**
> gra spawnuje dokładnie jedno imperium industrialist i jedno expansionist (`AI_ARCHETYPE_SEQUENCE`),
> więc dwa imperia tej samej kultury NIE MOGĄ wystąpić w normalnej partii. Zmiana agendy JEDNEMU
> imperium jest mocniejszym dowodem: kultura, opinia, napięcie i pamięć zostają identyczne,
> zmienia się dokładnie jedna zmienna. Precedens: §4 gate'u E3 tak samo podmieniał archetyp.

---

## §1 — Agenda rusza PRÓG (dowód deterministyczny, niezależny od Twojej partii)

- [ ] `>< KONSOLA` — ta sama para, sześć agend, jeden czasownik:

```
['militarist','technologist','expansionist','diplomat','merchant','ecologist'].forEach(o=>{KOSMOS.gameState.set('empires.emp_001.objective',o,'gate');const r=KOSMOS.diplomacySystem.evaluateTreaty('emp_001','trade_agreement');console.log(o.padEnd(13),'| próg:',String(r.threshold).padStart(4),'| wynik:',r.score,'| decyzja:',r.decision);});
```

- [ ] Kolumna `próg` (umowa handlowa, próg bazowy 4) — **musi się zgadzać co do punktu**:

| agenda | próg | dlaczego |
|---|---|---|
| `diplomat` | **−2** | relacja JEST agendą |
| `ecologist` | **0** | stabilność jako cel |
| `technologist` | **1** | chcą świętego spokoju |
| `merchant` | **4** | ⭐ **AGENDA REFERENCYJNA — próg bazowy, bez nadpisania** |
| `expansionist` | **9** | traktat ogranicza ruch |
| `militarist` | **12** | dyplomacja to środek, nie cel |

- [ ] Progi są **ROSNĄCE** w tej kolejności. To jest cała teza E5 w jednej kolumnie.

---

## §2 — ⭐ PIERWSZA DECYZJA ROZSTRZYGNIĘTA PRZEZ AGENDĘ

To jest punkt, dla którego istnieje ten gate. Ustawiamy opinię na znaną wartość, żeby liczby
były powtarzalne, i zmieniamy WYŁĄCZNIE agendę.

- [ ] `>< KONSOLA` — ustaw opinię na **+20** i powtórz przegląd:

```
KOSMOS.diplomacySystem.addOpinionModifier('emp_001','player','legacy_relations',{value:20,source:'gate'}); console.log('opinia teraz:',KOSMOS.diplomacySystem.getOpinionOfPlayer('emp_001'));
```

- [ ] `opinia teraz:` → **20** (modyfikator o tym samym id NADPISUJE, więc możesz wkleić kilka razy).

> ℹ Jeśli imperium ma inne modyfikatory (np. `recent_war`), opinia może wyjść inna niż 20.
> Wtedy `score` poniżej będzie inny — **układ decyzji i progi muszą się zgadzać mimo to**.

- [ ] `>< KONSOLA` — ponownie sześć agend (ta sama linia co w §1):

```
['militarist','technologist','expansionist','diplomat','merchant','ecologist'].forEach(o=>{KOSMOS.gameState.set('empires.emp_001.objective',o,'gate');const r=KOSMOS.diplomacySystem.evaluateTreaty('emp_001','trade_agreement');console.log(o.padEnd(13),'| próg:',String(r.threshold).padStart(4),'| wynik:',r.score,'| decyzja:',r.decision);});
```

- [ ] Przy opinii **+20** (zmierzone):

| agenda | wynik | próg | decyzja |
|---|---|---|---|
| `militarist` | **6.4** | 12 | ❌ **false** |
| `expansionist` | **7.2** | 9 | ❌ **false** |
| `merchant` | **8** | 4 | ✅ **true** |
| `technologist` | **8** | 1 | ✅ **true** |
| `ecologist` | **8.8** | 0 | ✅ **true** |
| `diplomat` | **9.6** | −2 | ✅ **true** |

- [ ] **DECYZJA SIĘ ODWRACA** — ta sama kultura, ta sama opinia, ta sama historia relacji,
      a dwie agendy mówią NIE i cztery mówią TAK. **To jest teza gate'u E5.**
- [ ] Zwróć uwagę, że rusza się też `wynik` (6.4 / 8 / 9.6) — to mnożnik `opinion`
      (×0.8 / ×1.0 / ×1.2). Agenda zmienia i poprzeczkę, i wagę sympatii.

---

## §3 — Kotwica parytetu: `merchant` odtwarza DAWNE progi co do punktu

E2 przeliczył stare progi 60/75/80 na wagi i to jest podpisana własność fazy. E5 nie mógł jej
ruszyć — dlatego `merchant` NIE MA nadpisania i służy za punkt odniesienia.

- [ ] `>< KONSOLA` — trzy traktaty pod agendą referencyjną:

```
KOSMOS.gameState.set('empires.emp_001.objective','merchant','gate'); ['trade_agreement','non_aggression','alliance'].forEach(t=>{const r=KOSMOS.diplomacySystem.evaluateTreaty('emp_001',t);console.log(t.padEnd(16),'| próg:',r.threshold);});
```

- [ ] `trade_agreement` → **4** · `non_aggression` → **10** · `alliance` → **15**
- [ ] To są progi BAZOWE z katalogu, niezmienione od E2. Parytet stoi.

---

## §4 — Agenda rusza WSZYSTKIE czasowniki, nie tylko traktaty

- [ ] `>< KONSOLA` — pokój i emisariusz też mają agendę (jedna tabela nadpisań × pięć czasowników):

```
['militarist','merchant','diplomat'].forEach(o=>{KOSMOS.gameState.set('empires.emp_001.objective',o,'gate');const p=KOSMOS.diplomacySystem.evaluatePeace('emp_001'),e=KOSMOS.diplomacySystem.evaluateEnvoy('emp_001');console.log(o.padEnd(11),'| próg pokoju:',String(p.threshold).padStart(3),'| próg emisariusza:',String(e.threshold).padStart(4));});
```

- [ ] `militarist` → pokój **8**, emisariusz **−2**
- [ ] `merchant` → pokój **0**, emisariusz **−10** ← agenda referencyjna = progi bazowe
- [ ] `diplomat` → pokój **−6**, emisariusz **−16**
- [ ] Militarysta jest **trudniejszy do pogodzenia**, dyplomata **łatwiejszy** — ta sama gałka
      działa na cały katalog czasowników, bo tabela nadpisań jest keyowana agendą, nie parą.

---

## §5 — Cecha `erratic`: zero bez niej, wychylenie z nią

- [ ] `>< KONSOLA` — najpierw stan bez cechy (wiersz szumu ma wnosić DOKŁADNIE 0):

```
KOSMOS.gameState.set('empires.emp_001.objective','merchant','gate'); KOSMOS.gameState.set('empires.emp_001.traits',[],'gate'); const a=KOSMOS.diplomacySystem.evaluateTreaty('emp_001','trade_agreement'); console.log('cechy:',KOSMOS.empireRegistry.get('emp_001').traits,'| wynik:',a.score,'| szum:',(a.breakdown.find(b=>b.term==='erratic_noise')||{}).value);
```

- [ ] `szum:` → **0** (term jest LIVE, ale bez cechy nie ma czego liczyć — to poprawny wynik,
      nie brak paliwa)

- [ ] `>< KONSOLA` — teraz nadaj cechę i porównaj:

```
KOSMOS.gameState.set('empires.emp_001.traits',['erratic'],'gate'); const b=KOSMOS.diplomacySystem.evaluateTreaty('emp_001','trade_agreement'); console.log('cechy:',KOSMOS.empireRegistry.get('emp_001').traits,'| wynik:',b.score,'| szum:',(b.breakdown.find(b=>b.term==='erratic_noise')||{}).value);
```

- [ ] `szum:` → **liczba różna od zera**, w przedziale **od −15 do +15** (waga termu = 15).
- [ ] `wynik:` przesunął się **dokładnie o tę liczbę** względem poprzedniego odczytu.

> ℹ Konkretna wartość zależy od pary, czasownika, epoki i seeda galaktyki — dlatego tutaj
> NIE podaję jednej liczby. W przebiegu referencyjnym (headless, rok 0) wyszło **+14.88**.

---

## §6 — Szum jest DETERMINISTYCZNY w obrębie epoki (nie da się go „doklikać")

To jest najważniejsza własność `erratic`: gdyby szum losował się przy każdym kliknięciu,
gracz klikałby ten sam przycisk aż trafi, a odmowa przestałaby cokolwiek znaczyć.

- [ ] `>< KONSOLA` — pięć ocen pod rząd, bez zmiany czegokolwiek:

```
console.log([1,2,3,4,5].map(()=>(KOSMOS.diplomacySystem.evaluateTreaty('emp_001','trade_agreement').breakdown.find(b=>b.term==='erratic_noise')||{}).value));
```

- [ ] **Pięć IDENTYCZNYCH liczb.** Nie „podobnych" — identycznych.
- [ ] `>< KONSOLA` — a ten sam czasownik dla DRUGIEGO imperium ma własny szum:

```
KOSMOS.gameState.set('empires.emp_002.traits',['erratic'],'gate'); console.log('emp_001:',(KOSMOS.diplomacySystem.evaluateTreaty('emp_001','trade_agreement').breakdown.find(b=>b.term==='erratic_noise')||{}).value,'| emp_002:',(KOSMOS.diplomacySystem.evaluateTreaty('emp_002','trade_agreement').breakdown.find(b=>b.term==='erratic_noise')||{}).value);
```

- [ ] Dwie **RÓŻNE** liczby — szum jest per para, nie globalny.

---

## §7 — Odmowa MÓWI o nieobliczalności (spięcie z modalem E4)

- [ ] Otwórz panel dyplomacji (**`Y`**), wybierz `emp_001`.
- [ ] `>< KONSOLA` — zepsuj opinię tak, żeby propozycja odpadła mimo dobrej agendy:

```
KOSMOS.diplomacySystem.addOpinionModifier('emp_001','player','legacy_relations',{value:-30,source:'gate'}); console.log('opinia:',KOSMOS.diplomacySystem.getOpinionOfPlayer('emp_001'));
```

- [ ] Kliknij **Umowa handlowa**. Otwiera się modal odmowy (E4).
- [ ] W tabeli **„CO ZAWAŻYŁO"** widzisz wiersz **„Nieobliczalność"** z wartością różną od zera.
- [ ] Linia **„Wymagany próg"** pokazuje liczbę **BEZ znaku minusa przy zerze** (regresja E4e/A —
      dawniej pokazywała `−0`). Przy agendzie `merchant` i umowie handlowej próg to **4**.

---

## §8 — Rzut naturalny (opcjonalnie, wymaga NOWEJ GRY)

- [ ] Kliknij **`NOWA GRA`**, dojedź do trybu 4X, potem `>< KONSOLA`:

```
console.table(KOSMOS.empireRegistry.listAll().map(e=>({id:e.id,agenda:e.objective,cechy:(e.traits||[]).join(',')||'—'})));
```

- [ ] Kolumna `cechy` bywa pusta, bywa `erratic` — **szansa 25% na imperium**, więc mniej więcej
      co druga partia ma jednego nieobliczalnego sąsiada. Obie odpowiedzi są poprawne;
      to punkt informacyjny, nie warunek zaliczenia.
- [ ] Kolumna `agenda` **różni się między partiami** (GALAXY_SEED). Gdyby była stała — to sygnał.

---

## §9 — Harness (2 min, `>_ TERMINAL`)

```
node src/testing/smoke/run-all.mjs
```

- [ ] **110/110 OK, 0 FAIL**

```
node src/testing/smoke/empire_objective_smoke.mjs && node src/testing/smoke/acceptance_engine_smoke.mjs && node src/testing/smoke/balans_diplomacy_telemetry_smoke.mjs
```

- [ ] `empire_objective` **30/30** · `acceptance_engine` **206/206** · `balans_diplomacy_telemetry` **54/54**
- [ ] W telemetrii przechodzą OBIE tezy naraz: „granica 10/25/30 dla agendy referencyjnej"
      (parytet E2) **oraz** „agenda RUSZA wynik" (teza E5).

---

## §10 — Świadome NIE-defekty (potwierdź, że je widzisz i akceptujesz)

- [ ] **Zapis sprzed E5 nie ma nieobliczalnych imperiów.** `traits` zostaje puste, bo backfill
      wymagałby rzutu z seeda, którego stary zapis nie zna. Cecha wchodzi do gry z NOWĄ GRĄ.
- [ ] **Wiersz „Nieobliczalność" wygląda w modalu na arbitralny** — bo taki jest z założenia
      (ukryte nastawienie). Jest DETERMINISTYCZNY (§6), ale gracz nie zna epoki ani seeda.
      Alternatywa — ukrycie wiersza — byłaby dokładnie tym kłamstwem, które E4 usunęło.
- [ ] **Nastrój `erratic` trwa 10 lat GRY (~120 lat cywilizacyjnych)**, czyli w praktyce
      całą partię. Jednostka zostaje nieruszona w E5 świadomie: **E6 unifikuje jednostki czasu**
      i wtedy ta stała jest przeliczana razem z resztą. Nie zgłaszaj jako błąd.
- [ ] **Agenda nie rusza komórek ZABLOKOWANYCH** (np. xenofag i umowa handlowa). Podłoga
      osobowości to pre-warunek sprawdzany PRZED wagami — gdyby agenda ją ruszała, podłoga
      przestałaby być podłogą (ruling E2).
- [ ] **`objective` i `traits` nie są nigdzie widoczne w UI.** E5 jest zmianą DANYCH; pokazanie
      agendy w panelu wymagałoby nowych kluczy i18n i poszerzenia listy konsumentów osi
      (pin D3 w `empire_objective_smoke`). Świadomie poza zakresem.
- [ ] **Nadpisania agendy dotykają tylko `opinion` i `thresholdDelta`.** `offer`, `reputation`,
      `third_party` i `relative_power` są bezczynne do D4/D5/WAR_BACKBONE — strojenie ich
      byłoby udawaniem strojenia (podpisana decyzja 2).

---

## Wynik gate'u — ⬜ DO WYPEŁNIENIA

- [ ] §0 · [ ] §1 · [ ] §2 ⭐ · [ ] §3 · [ ] §4 · [ ] §5 · [ ] §6 · [ ] §7 · [ ] §8 (opcjonalny) ·
      [ ] §9 · [ ] §10

**Werdykt:** ⬜ PASSED / ⬜ PASSED z rozbieżnościami / ⬜ FAILED

**Rozbieżności (jeśli są):** każdą opisz jak w E3 — czym jest (regresja / over-promise checklisty /
świadoma decyzja), z dowodem, i gdzie ląduje naprawa.

**Następny krok po PASSED:** **E6** — flip `FEATURES.diplomacyDecay` → true + unifikacja jednostek
czasu + przestrojenie. Największe ryzyko fazy, własny gate, tabela §Baseline w `D2_PLAN.md`
do wypełnienia pomiarem PRZED commitem.
