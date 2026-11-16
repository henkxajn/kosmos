// ShipModuleCategories — kategorie modułów statku (slotType) w pickerach: ikona + klucz i18n etykiety.
// Kanon wspólny dla pickera konsoli Stoczni (K1c-A) i projektanta `UnitDesignOverlay` (K1c-B). Finding 726: `shield` i `troop`
// nie miały ikony ani etykiety (picker rysował surowy slotType). Etykieta: klucz `unitDesign.cat.<slotType>` (PL/EN).

export const MODULE_CATEGORY_ICONS = Object.freeze({
  propulsion: '🔥', cargo: '📦', science: '🔬', special: '🤖', habitat: '🏠',
  armor: '🛡', fuel: '⛽', weapon: '🔫', shield: '🔰', troop: '🪖',
});
export const MODULE_CATEGORIES = Object.freeze(Object.keys(MODULE_CATEGORY_ICONS));
export const categoryLabelKey = (cat) => `unitDesign.cat.${cat}`;
