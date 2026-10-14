import 'i18next'
import type en from './locales/en.ts'

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof en }
  }
}
