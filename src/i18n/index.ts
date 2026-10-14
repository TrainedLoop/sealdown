import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { readPref, writePref } from '../ui/prefs.ts'
import en from './locales/en.ts'
import pt from './locales/pt.ts'

export type Lang = 'pt' | 'en'

const KEY = 'rendermd.lang'

function initialLang(): Lang {
  const saved = readPref(KEY)
  if (saved === 'pt' || saved === 'en') return saved
  return navigator.language.toLowerCase().startsWith('pt') ? 'pt' : 'en'
}

/** Messages ship in the bundle, so initialization is synchronous. */
export const i18n = i18next.createInstance()

i18n.use(initReactI18next).init({
  resources: { pt: { translation: pt }, en: { translation: en } },
  lng: initialLang(),
  fallbackLng: 'en',
  initAsync: false,
  interpolation: { escapeValue: false }, // React already escapes
})
document.documentElement.lang = i18n.language

export function setLang(lang: Lang) {
  writePref(KEY, lang)
  document.documentElement.lang = lang
  void i18n.changeLanguage(lang)
}
