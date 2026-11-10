// CombatNarration — ARC COMBAT VISUALS, krok CV-6b2 (Finding 639, COMBAT_VISUALS_PLAN.md §4 CV-6b2): narrator Dziennika bitew
// deep-space pod flagą `cvStrip` — JEDNA linia bitwy i JEDNA linia potyczki na KLASTER starć, nie na starcie.
//
// Dlaczego: DSCS nie łączy starć — jedna bitwa na ekranie to zwykle kilka starć w jednym miejscu (Finding 638), a Dziennik pisał
// linię bitwy (`log.battleLine`, `GameScene`) i linię potyczki (`log.skirmish`, `UIManager` — starcie bez stanu wojny) dla KAŻDEGO
// starcia (zmierzone: 4 bitwy → 4 banery, 4 linie bitwy, 4 linie potyczki — #639). Baner liczy się od CV-3a2 raz na klaster;
// tu ta sama reguła grupy (`clusterGroupStep` — łańcuch starć w czasie = jedna bitwa, czekanie na pozostałe AKTYWNE starcia
// klastra) daje Dziennikowi jedną linię bitwy z wynikiem scalonym jak baner (`mergeClusterBattles`: werdykt z liczby wygranych
// starć, straty sumą, tury maks.) i jedną linię potyczki na imperium klastra — przed linią bitwy (kolejność jak dotąd). Semantyka
// linii potyczki bez zmian (starcie bez wojny — napięcie rośnie, wyczerpanie bez zmian); mechanika potyczki (`WarSystem` —
// napięcie i pamięć NA STARCIE) nietknięta.
//
// Treść linii zostaje u dotychczasowych autorów: linię bitwy buduje `GameScene._battleLogEntry` (jedyny producent `log.battleLine`),
// linię potyczki — `UIManager.skirmishLineText`; narrator dostaje je jako funkcje i decyduje wyłącznie KIEDY i ILE razy.
// Czysty (bez DOM i bez `window`) — wykonuje się pod node (keeper `cv_strip_smoke`).
import { clusterGroupStep, mergeClusterBattles } from './BattleClusterLogic.js';
import { resolveBattleSides } from '../utils/BattleSides.js';

const DONE_CAP = 400;      // pamięć rozstrzygniętych bitew (spóźniona potyczka) — najstarsze wypadają
const PENDING_CAP = 400;   // potyczki czekające na swoją bitwę

/** Bitwa narratora klastra: starcie DSCS (`battle_ds_…` — tylko te łączą się w klastry; reszta ma linię jak dotąd). */
export function isClusterNarrated(battleId) {
  return typeof battleId === 'string' && battleId.startsWith('battle_ds_');
}

/** Id starcia DSCS z id bitwy (`battle_ds_X` → `encounter_X`) — klucz klastra (jak baner w `GameScene._clusterBattleBanners`). */
export function encounterIdOfBattle(battleId) {
  return String(battleId ?? '').replace(/^battle_ds_/, 'encounter_');
}

export class ClusterNarrator {
  /**
   * @param {{ lineFor:(result:object)=>object|null, skirmishTextFor:(empireId:string)=>string }} o
   *   lineFor — wpis Dziennika dla wyniku bitwy (`{ text, channel, severity, entityRef }`) albo null (bitwa bez linii);
   *   skirmishTextFor — tekst linii potyczki z imperium.
   */
  constructor({ lineFor, skirmishTextFor }) {
    this._lineFor = lineFor;
    this._skirmishTextFor = skirmishTextFor;
    this._hold = [];               // grupy czekające na resztę klastra (`clusterGroupStep`)
    this._pending = new Map();     // battleId → empireId: potyczka bitwy, której grupa jeszcze trwa
    this._done = new Map();        // battleId → { empires: Set }: grupa opowiedziana (spóźniona potyczka — bez dubla)
  }

  _remember(map, key, val, cap) {
    map.set(key, val);
    if (map.size > cap) map.delete(map.keys().next().value);
  }

  /**
   * `war:skirmish` bitwy narratora. Zwykle przychodzi PRZED `battle:resolved` tej bitwy w Dzienniku (`WarSystem` słucha
   * `battle:resolved` wcześniej niż `GameScene`) — wtedy czeka na swoją grupę i nic nie zwraca. Spóźniona (grupa już
   * opowiedziana) — jedna linia na imperium grupy, druga nigdy.
   * @returns {string[]} linie potyczki do zapisania teraz
   */
  onSkirmish({ empireId, battleId }) {
    if (!isClusterNarrated(battleId) || empireId == null) return [];
    const rec = this._done.get(battleId);
    if (rec) {
      if (rec.empires.has(empireId)) return [];
      rec.empires.add(empireId);
      return [this._skirmishTextFor(empireId)];
    }
    this._remember(this._pending, battleId, empireId, PENDING_CAP);
    return [];
  }

  /**
   * `battle:resolved` bitwy narratora. Grupa klastra trwa (inne starcie w tym samym miejscu jeszcze aktywne) — nic; grupa
   * gotowa — linie potyczki (jedna na imperium) i JEDNA linia bitwy z wynikiem scalonym.
   * @param {{ battleId:string, result:object, peerIds?:string[], isActive?:(encounterId:string)=>boolean }} p
   * @returns {Array<{kind:'skirmish', text:string, empireId:string} | {kind:'battle', entry:object, size:number}>}
   */
  onBattleResolved({ battleId, result, peerIds = [], isActive = () => false }) {
    if (!result) return [];
    const item = { battleId, result, playerSide: resolveBattleSides(result).playerSide ?? null };
    const groups = clusterGroupStep(this._hold, { encounterId: encounterIdOfBattle(battleId), item, peerIds, isActive });
    const out = [];
    for (const items of groups) {
      const rec = { empires: new Set() };
      for (const it of items) {
        const emp = this._pending.get(it.battleId);
        if (emp == null) continue;
        this._pending.delete(it.battleId);
        if (rec.empires.has(emp)) continue;
        rec.empires.add(emp);
        out.push({ kind: 'skirmish', text: this._skirmishTextFor(emp), empireId: emp });
      }
      for (const it of items) this._remember(this._done, it.battleId, rec, DONE_CAP);
      const merged = mergeClusterBattles(items);
      const entry = merged?.result ? this._lineFor(merged.result) : null;
      if (entry) out.push({ kind: 'battle', entry, size: items.length });
    }
    return out;
  }
}
