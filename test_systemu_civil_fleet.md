# Test Systemu Handlu Cywilnego (Etap 39)

## Wymagania wstepne
- [ ] Gra uruchamia sie bez bledow w konsoli (brak crash przy imporcie nowych plikow)
- [ ] Stary save laduje sie poprawnie (migracja v22 -> v23 bez bledow)
- [ ] Nowa gra startuje bez bledow

---

## ETAP 1: Dane (TechData, BuildingsData, HexTile)

### Tech: advanced_trade
- [ ] W drzewie technologii (klawisz T) widoczna technologia "Zaawansowany Handel" / "Advanced Trade"
- [ ] Wymaga: interplanetary_logistics (galaz civil, tier 4, koszt 350 research)
- [ ] Po zbadaniu odblokowane budynki: trade_beacon, commodity_nexus

### Budynki market (4 nowe)
- [ ] Po zbadaniu interplanetary_logistics: w panelu budowy pojawiaja sie trade_hub i free_market
- [ ] Po zbadaniu advanced_trade: w panelu budowy pojawiaja sie trade_beacon i commodity_nexus
- [ ] Budynki widoczne w nowej kategorii "Handel" / "Trade" w panelu budowy
- [ ] Mozna je postawic na: rowninach, pustyni, tundrze, wulkanie
- [ ] NIE mozna postawic na: gorach, oceanie, lodowcu, kraterze, lesie, pustkowiach
- [ ] trade_hub: ikona sklepowa, koszt Fe:40 C:20 Cu:5 + commodities
- [ ] free_market: ikona wykresu, koszt Fe:30 C:15 + commodities
- [ ] trade_beacon: ikona anteny, wymaga advanced_trade, terrainAny=true
- [ ] commodity_nexus: ikona globu, wymaga advanced_trade, isUnique=true (max 1/kolonia)
- [ ] Kazdy budynek ma czas budowy (buildTime > 0) — nie pojawia sie natychmiast

### Kategoria market w HexTile
- [ ] Na mapie planety hexy pustynne, tundrowe, wulkaniczne i rowniny akceptuja kategorie 'market'

---

## ETAP 2: CivilianTradeSystem — logika rdzeniowa

### Warunki uruchomienia
- [ ] System NIE dziala przy 1 kolonii (brak transferow, brak Kr)
- [ ] System startuje gdy sa 2+ kolonie z portami kosmicznymi
- [ ] System NIE handluje jesli kolonia nie ma portu kosmicznego (launch_pad / autonomous_spaceport)

### Auto-routing
- [ ] Towary plyna z kolonii z nadwyzka do kolonii z niedoborem
- [ ] Prefabrykaty (prefab_*) NIE sa handlowane
- [ ] Research NIE jest handlowany
- [ ] Transfer ograniczony przez Trade Capacity (TC) obu stron
- [ ] Priorytet: food/water (5) > T3+ commodities (4) > functioning goods (3) > T2/raw (2) > T1/luxury (0-1)

### Kredyty (Kr)
- [ ] Eksporter otrzymuje 6% wartosci transferu w Kr
- [ ] Importer otrzymuje 3% wartosci transferu w Kr
- [ ] Kredyty kumuluja sie na koncie kolonii (colony.credits)
- [ ] W konsoli: window.KOSMOS.civilianTradeSystem.getCredits(planetId) zwraca wartosc > 0

### Zasieg handlu
- [ ] Bazowy zasieg: 10 AU
- [ ] trade_hub dodaje +5 AU per level
- [ ] trade_beacon mnozy zasieg x1.5
- [ ] commodity_nexus daje nieograniczony zasieg
- [ ] Kolonie dalej niz zasieg NIE handluja (chyba ze commodity_nexus)

### Trade overrides
- [ ] setOverride(colonyId, goodId, 'block') — kolonia nie eksportuje tego towaru
- [ ] setOverride(colonyId, goodId, null) — usuwa blokade
- [ ] setIsolation(colonyId, true) — kolonia calkowicie wylaczona z handlu

### Tick frequency
- [ ] System tickuje co 0.5 civYear (nie co realny rok gry)
- [ ] Przy 1m/s przerwa miedzy tikami ok 0.5s (plynne transfery)

---

## ETAP 3: Integracja ProsperitySystem

### Trade network bonus
- [ ] Kolonia z 3 bliskimi polaczeniami (<5 AU): prosperity floor rosnie o ~+3
- [ ] Bonus max +15 (cap na 5 polaczen * 3)
- [ ] Dalekie polaczenia (>15 AU): upkeep 2*2.0=4 per polaczenie — moze obnizac floor
- [ ] Kolonia bez polaczen: brak bonusu/kary (trade network = 0)
- [ ] Sprawdz w konsoli: prosperity kolonii z handlem vs bez handlu

---

## ETAP 4: SaveMigration + GameScene

### Migracja save v22 -> v23
- [ ] Stary save (v22) laduje sie bez bledow
- [ ] Po zaladowaniu: kolonie maja pola credits=0, tradeOverrides={}, activeTradeConnections=[]
- [ ] Backup starego save'a w localStorage (klucz kosmos_save_backup_v22)

### Persystencja
- [ ] Zapisz gre z aktywnymi polaczeniami i kredytami
- [ ] Zaladuj — credits zachowane, tradeOverrides zachowane
- [ ] activeTradeConnections i creditsPerYear regeneruja sie z systemu (nie musza byc identyczne po load)
- [ ] tradeCapacity regeneruje sie z systemu

### Inicjalizacja
- [ ] window.KOSMOS.civilianTradeSystem istnieje po starcie gry
- [ ] System zarejestrowany na EventBus (time:tick, trade:spendCredits, trade:setOverride)

---

## ETAP 5: UI — panel Handel w EconomyOverlay

### Sekcja handlu cywilnego (zakladka TRADE w panelu E)
- [ ] Naglowek "HANDEL CYWILNY" / "CIVILIAN TRADE" widoczny na gorze zakladki
- [ ] Wyswietla: Kredyty: X Kr (+Y/rok) z kolorowym delta (zielony/czerwony)
- [ ] Wyswietla: Trade Capacity: X Kr/rok
- [ ] Lista polaczen: nazwa partnera, odleglosc AU, transfery w tiku
- [ ] Brak polaczen: komunikat "Brak aktywnych polaczen"
- [ ] Ceny lokalne: lista drogich (czerwone) i tanich (zielone) towarow z mnoznikiem
- [ ] Przewijanie dziala (scroll center column)

### Brak handlu
- [ ] Przy 1 kolonii: "Brak handlu cywilnego (potrzebne 2+ kolonie z portem)"
- [ ] Przy 0 kredytow i 0 polaczen: ten sam komunikat

### Istniejace funkcje
- [ ] Wykresy eksport/import (TradeLog) nadal dzialaja pod sekcja handlu cywilnego
- [ ] Trasy handlowe (TradeRouteManager) nadal widoczne
- [ ] Log transakcji nadal widoczny

---

## ETAP 6: Wizualizacja 3D

### Linie handlowe (subtelne)
- [ ] Miedzy koloniami handlujacymi widac przerywane linie (bardzo blade)
- [ ] Linie podazaja za ruszajacymi sie planetami
- [ ] Kolor zalezy od gradientu prosperity (bardziej zielone = wiekszy gradient)
- [ ] Linie znikaja gdy handel ustaje

### Swietliki handlowe (Trade Fireflies)
- [ ] Male swiecace punkty lataja po lukach miedzy handlujacymi koloniami
- [ ] Ilosc swietlikow proporcjonalna do wolumenu handlu (1-12 per trasa)
- [ ] Ruch po luku parabolicznym (unosza sie nad plaszczyzna orbitaln)
- [ ] Bursztynowy kolor z poswiat (additive blending)
- [ ] Migotanie jasnosci — kazdy swietlik pulsuje niezaleznie
- [ ] Rozmiar dynamiczny: mniejszy na krancach trasy, wiekszy w apogeum luku
- [ ] Swietliki podazaja za planetami (endpoint aktualizowany co frame)
- [ ] Przy 1 kolonii: brak swietlikow
- [ ] Przy 2 koloniach z malym handlem: 1-2 swietliki
- [ ] Przy 5 koloniach z duzym handlem: 20-40 swietlikow (widoczny ruch)
- [ ] Max 60 swietlikow globalnie (cap na wydajnosc)
- [ ] Swietliki nie koliduja z vessel sprites (lataja nizej/wyzej)

### Wydajnosc
- [ ] Brak spadku FPS przy 60 swietlikach na ekranie
- [ ] Brak memory leak: po zniszczeniu systemu (np. powrot do menu) tekstury i sprite'y usuwane

---

## Testy regresji

### Istniejace systemy
- [ ] Budowa zwyklych budynkow (kopalnia, farma, habitat) dziala bez zmian
- [ ] Drzewo technologii: inne technologie nie naruszone
- [ ] System ekspedycji/misji dziala normalnie
- [ ] Stocznia i budowa statkow dziala normalnie
- [ ] TradeRouteManager (reczne trasy handlowe) dziala rownolegle z handlem cywilnym
- [ ] Prosperity system: warstwa survival/infrastructure/functioning/comfort/luxury bez zmian
- [ ] Save/Load nie psuje istniejacych danych (budynki, tech, flota, ekspedycje)
- [ ] Power Test startuje bez bledow

### Nowe budynki nie psuja starych
- [ ] Kolonia bez budynkow market dziala identycznie jak przed zmiana
- [ ] Rozbiórka budynku market nie crashuje gry
- [ ] Upgrade poziomu trade_hub zwieksza TC proporcjonalnie

---

## Scenariusz pelnego testu

1. Nowa gra (scenariusz Cywilizacja)
2. Zbuduj research_station, zbadaj: metallurgy -> rocketry -> exploration -> colonization
3. Zbuduj launch_pad + shipyard + colony_ship
4. Kolonizuj druga planete
5. Na obu koloniach zbuduj porty kosmiczne
6. Poczekaj na tick handlu cywilnego (~0.5 civYear)
7. Sprawdz: panel E -> zakladka TRADE -> sekcja handlu cywilnego
8. Sprawdz: na mapie 3D widac swietliki i blade linie
9. Zbadaj bureaucracy -> interplanetary_logistics
10. Zbuduj trade_hub na jednej z kolonii
11. Sprawdz: zasieg handlu wzrosl, TC wzroslo
12. Zbadaj advanced_trade
13. Zbuduj trade_beacon
14. Sprawdz: zasieg x1.5
15. Zbuduj commodity_nexus
16. Sprawdz: brak limitu zasiegu
17. Zapisz gre -> Zaladuj -> sprawdz czy credits zachowane
18. Sprawdz FPS w widoku kosmicznym z wieloma polaczeniami
