// Moduł internacjonalizacji KOSMOS
// Lekki system tłumaczeń (bez bibliotek zewnętrznych)

import plStrings from './pl.js';
import enStrings from './en.js';

// Aktualny język — domyślnie z localStorage, fallback na 'pl'
let _locale = localStorage.getItem('kosmos_lang') || 'pl';

// Słowniki per język
const _dictionaries = {
  pl: { ...plStrings },
  en: { ...enStrings },
};

/**
 * Ustaw aktywny język i zapisz w localStorage.
 * @param {'pl'|'en'} lang
 */
export function setLocale(lang) {
  _locale = lang;
  localStorage.setItem('kosmos_lang', lang);
}

/** Zwróć aktywny język */
export function getLocale() {
  return _locale;
}

/**
 * Pobierz tłumaczenie klucza z interpolacją.
 * Interpolacja: {0}, {1} (pozycyjna) lub {name} (nazwana).
 * Fallback: klucz polski, potem sam klucz.
 *
 * @param {string} key  — klucz tłumaczenia, np. 'ui.build'
 * @param {...*} params — wartości do interpolacji (obiekt lub argumenty pozycyjne)
 * @returns {string}
 */
export function t(key, ...params) {
  let str = _dictionaries[_locale]?.[key]
         ?? _dictionaries['pl']?.[key]
         ?? key;

  if (params.length === 0) return str;

  // Interpolacja nazwana: t('key', { name: 'X', count: 5 })
  if (params.length === 1 && typeof params[0] === 'object' && params[0] !== null) {
    const obj = params[0];
    return str.replace(/\{(\w+)\}/g, (_, k) => obj[k] ?? `{${k}}`);
  }

  // Interpolacja pozycyjna: t('key', val0, val1)
  return str.replace(/\{(\d+)\}/g, (_, i) => params[+i] ?? `{${i}}`);
}

/**
 * Zarejestruj/merge dodatkowe stringi dla języka.
 * @param {'pl'|'en'} lang
 * @param {Object<string,string>} dict
 */
export function registerStrings(lang, dict) {
  if (!_dictionaries[lang]) _dictionaries[lang] = {};
  Object.assign(_dictionaries[lang], dict);
}

/**
 * Pobierz nazwę elementu (budynek/tech/commodity/statek) wg aktualnego locale.
 * Szuka klucza `${prefix}.${item.id}.name` w słowniku.
 * Fallback: item.namePL ?? item.id.
 *
 * @param {Object} item    — obiekt z polem `id` (i opcjonalnie `namePL`)
 * @param {string} prefix  — prefiks klucza, np. 'building', 'tech', 'commodity', 'ship'
 * @returns {string}
 */
export function getName(item, prefix) {
  const key = `${prefix}.${item.id}.name`;
  return _dictionaries[_locale]?.[key]
      ?? _dictionaries['pl']?.[key]
      ?? item.namePL
      ?? item.id;
}

/**
 * Pobierz opis elementu wg aktualnego locale.
 * @param {Object} item
 * @param {string} prefix
 * @returns {string}
 */
export function getDesc(item, prefix) {
  const key = `${prefix}.${item.id}.desc`;
  return _dictionaries[_locale]?.[key]
      ?? _dictionaries['pl']?.[key]
      ?? item.description
      ?? '';
}

/**
 * Pobierz skróconą nazwę towaru wg aktualnego locale.
 * @param {string} commodityId
 * @returns {string}
 */
export function getShort(commodityId) {
  const key = `commodity.${commodityId}.short`;
  return _dictionaries[_locale]?.[key]
      ?? _dictionaries['pl']?.[key]
      ?? commodityId;
}
