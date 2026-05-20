# Plan: Multi-save + IndexedDB + Export/Import

**Status:** plan zatwierdzony, implementacja odłożona.
**Data planu:** 2026-05-20
**Powiązany commit fixów:** `77740c2` (save: try/catch + prune battles + size warning)

## Kontekst

Obecny system zapisu ma 3 problemy:
1. **1 save slot** — `localStorage['kosmos_save_v1']` jednorazowy
2. **localStorage quota ~5 MB** — w endgame z wielu kolonii + bitew + AI imperia łatwo przekroczyć
3. **Brak backupu na dysku gracza** — wszystko żyje w przeglądarce, czyszczenie cache = utrata save'a

**Cel:** multi-save (5 slotów), 10× większa quota (IndexedDB), opcjonalny eksport do pliku JSON na dysku.

## Decyzje (zatwierdzone przez gracza)

| Pytanie | Decyzja |
|---------|---------|
| Liczba slotów | **5** |
| Auto-nazwa | `${homePlanet?.name ?? 'Bezdomny'} — r. ${Math.round(year)}` |
| Edycja nazwy | TAK — ikona ✏ obok nazwy w slot picker |
| Backupy migracji | Zostają w localStorage (małe, rzadkie) + auto-cleanup last 3 |
| Istniejący `kosmos_save_v1` | Auto-import do slotu 1 przy pierwszym uruchomieniu |
| Scope | **Etap 1 + 2 razem** (IndexedDB + Export/Import) |

## Co NIE wchodzi (out-of-scope)

- **File System Access API** (auto-save bezpośrednio na dysk) — Chrome-only, wymaga zgody co sesję, zbyt skomplikowane
- **Save na chmurę** (Firebase) — wymaga kont/infrastruktury
- **Kompresja LZ-string** — niepotrzebna przy IndexedDB ~50 MB quota
- **AI opponents save shape changes** — osobny temat (na razie AI imperia są abstrakcyjne w `gameState.empires`, save się tym nie martwi; jeśli kiedyś dasz im pełną symulację — to osobny plan)

---

## Etap 1 — IndexedDB + sloty (~4h)

### Nowe pliki

**`src/systems/SaveStorage.js`** — wrapper async dla IndexedDB

```js
// Schemat: database 'kosmos_saves' (v1), object store 'slots' (keyPath: 'id')
// Slot record: { id: 1-5, name, saveData, metadata: { planetName, year, savedAt, sizeBytes } }

class SaveStorage {
  static async init() { /* otwiera/tworzy DB */ }
  static async listSlots() { /* zwraca [{ id, name, metadata }] dla wszystkich 5 */ }
  static async loadSlot(id) { /* zwraca pełny saveData albo null */ }
  static async saveSlot(id, saveData, name) { /* zapisuje + metadata */ }
  static async deleteSlot(id) { /* czyści slot */ }
  static async renameSlot(id, newName) { /* tylko metadata.name */ }
  static async getActiveSlot() { /* z localStorage 'kosmos_active_slot' */ }
  static async setActiveSlot(id) { /* localStorage */ }
}
```

**`src/scenes/SaveSlotPicker.js`** (lub komponent w TitleScene) — UI

```
┌────────────────────────────────────────────────────┐
│  WYBIERZ SLOT                                       │
├────────────────────────────────────────────────────┤
│  [1] Terra-3 — r. 39          1.2 MB  ✏ 📥 🗑      │
│      Zapisano: 2026-05-20 14:32                    │
│      [Wczytaj] [Nadpisz]                           │
├────────────────────────────────────────────────────┤
│  [2] (pusty)                                       │
│      [Nowa gra]                                    │
├────────────────────────────────────────────────────┤
│  [3] Nox-Prime — r. 156      4.8 MB  ✏ 📥 🗑      │
│      ...                                           │
└────────────────────────────────────────────────────┘
[📤 Importuj plik JSON]    [Anuluj]
```

### Zmienione pliki

- **`SaveSystem.js`**
  - `save()` async — woła `SaveStorage.saveSlot(activeId, data, autoName)`
  - Auto-nazwa generowana z `window.KOSMOS.homePlanet?.name + gameTime`
  - `loadData()` static → async, woła `SaveStorage.loadSlot(activeId)`

- **`TitleScene.js`**
  - "Kontynuuj" → aktywny slot (jeśli pusty — pokaż picker)
  - "Wczytaj" → slot picker w trybie load
  - "Nowa gra" → slot picker w trybie new (wybór pustego lub nadpisanie z confirm)

- **`BootScene.js`**
  - `hasSave()` async sprawdza IndexedDB
  - Pierwsza migracja: jeśli `kosmos_save_v1` istnieje w localStorage I IndexedDB pusty → import do slotu 1 + delete starego klucza

### Logika auto-nazewnictwa

Nazwa aktualizuje się **przy każdym save** o ile gracz nie nazwał ręcznie:
- Auto: `${homePlanet?.name ?? 'Bezdomny'} — r. ${Math.round(gameTime)}`
- Po edycji ręcznej: flag `metadata.customName: true`, auto przestaje nadpisywać
- Reset do auto: gracz może wymazać nazwę → znów auto

### Fallback bezpieczeństwa

- IndexedDB niedostępny (Safari private mode, błąd) → fallback do localStorage z toast notice
- Slot 1 nieczytelny → pokaż przy nim "⚠ Uszkodzony" zamiast crashu

---

## Etap 2 — Export/Import .json (~2h)

### Eksport

- Przycisk **📥** przy każdym slocie w picker
- Pobiera saveData + metadata, dodaje header z game version, exportedAt
- `Blob([json], { type: 'application/json' })` → `URL.createObjectURL` → `<a download>` click
- Filename: `kosmos-save-{planetName}-y{year}-{YYYYMMDD}.json`

### Import

- Przycisk **📤 Importuj plik JSON** w slot picker
- `<input type="file" accept=".json">` → FileReader
- Walidacja: czy struktura ma `version, savedAt, civ4x, ...`
- Wybór slotu docelowego (lub nadpisanie z confirm jeśli zajęty)
- Save do IndexedDB przez SaveStorage

### Format eksportowanego pliku

```json
{
  "kosmosExport": true,
  "exportedAt": 1731234567890,
  "exportVersion": 1,
  "slotMetadata": {
    "name": "Terra-3 — r. 39",
    "planetName": "Terra-3",
    "year": 39,
    "savedAt": 1731234567890
  },
  "saveData": {
    "version": 72,
    "gameTime": 39.11,
    "star": { ... },
    "planets": [ ... ],
    "civ4x": { ... },
    ...
  }
}
```

---

## Migracja istniejącego save'a

Pierwszy uruchom po update (oneshot):

```
1. SaveStorage.init() → otwórz DB
2. const existingV1 = localStorage.getItem('kosmos_save_v1')
3. const slots = await SaveStorage.listSlots()
4. const allEmpty = slots.every(s => !s.metadata)
5. if (existingV1 && allEmpty) {
     parsedSave = JSON.parse(existingV1)
     name = `${parsedSave.civ4x?.colonies?.[0]?.planetName ?? 'Bezdomny'} — r. ${Math.round(parsedSave.gameTime)}`
     await SaveStorage.saveSlot(1, parsedSave, name)
     await SaveStorage.setActiveSlot(1)
     localStorage.removeItem('kosmos_save_v1')
     toast: "Save zaimportowany do slotu 1"
   }
```

## Auto-cleanup backupów migracji

`SaveMigration.migrate()` po udanej migracji → usuń wszystkie backupy starsze niż **3 najnowsze** (po wersji).

```js
const backupKeys = Object.keys(localStorage)
  .filter(k => k.startsWith('kosmos_save_backup_v'))
  .sort((a, b) => {
    const va = parseInt(a.replace('kosmos_save_backup_v', ''), 10);
    const vb = parseInt(b.replace('kosmos_save_backup_v', ''), 10);
    return vb - va; // desc
  });
// Usuń wszystko poza pierwszymi 3
for (const key of backupKeys.slice(3)) localStorage.removeItem(key);
```

---

## Wpływ na inne systemy

- **SaveMigration.js** — bez zmian (migracja działa na saveData, niezależnie od storage)
- **AutoPauseSystem, scenes** — niezmienione
- **Headless test harness (`testing/headless/`)** — używa własnego SaveSystem path, może nadal pisać do mocka

---

## Ryzyka

| Ryzyko | Mitigation |
|--------|-----------|
| Async save() rzuca race condition z autosave | Mutex flag `_saveInProgress`, kolejka jeśli zbiega się |
| Pierwszy save w pustym slocie tworzy "(nienazwany)" | Auto-nazwa z homePlanet zawsze dostępna w civMode |
| Gracz przypadkowo nadpisuje slot z zaawansowaną grą | Confirm dialog dla nadpisywania zajętego slotu |
| Import pliku z innej wersji gry | SaveMigration przepuszcza przez łańcuch v→CURRENT |
| Slot z save'em > 50 MB (skrajny endgame) | Pokaż ostrzeżenie, możliwe slow load, ale działa |
| IndexedDB cleared by browser cache eviction | Auto-eksport do JSON co N minut (out-of-scope, na potem) |

---

## Po implementacji — aktualizacja docs

- **MEMORY.md** — nowy wpis `multi-save-indexeddb.md` ze szczegółami
- **CLAUDE.md** — sekcja "Pliki krytyczne" + opis storage strategy
- **README** (jeśli istnieje) — wzmianka o eksporcie/imporcie

---

## Kolejność pracy

1. `SaveStorage.js` — implementacja + test ręczny w konsoli
2. Migracja istniejącego `kosmos_save_v1` → slot 1
3. SaveSystem.js — async save/load przez SaveStorage
4. SaveSlotPicker UI (najbardziej UX-heavy część)
5. TitleScene integration (przyciski Kontynuuj / Wczytaj / Nowa gra)
6. BootScene async hasSave()
7. Eksport JSON (przycisk + filename)
8. Import JSON (file picker + walidacja + slot select)
9. Auto-cleanup backupów migracji
10. Smoke test cały flow: nowa gra → save → restart → load → eksport → wyczyść → importuj → load
11. Commit + push + update MEMORY.md
