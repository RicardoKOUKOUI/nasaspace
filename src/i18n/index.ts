import { en, type MessageKey } from './en.ts'
import { fr } from './fr.ts'

export type Locale = 'en' | 'fr'

const catalogs = { en, fr }
let locale: Locale = 'en'

export function getLocale(): Locale {
  return locale
}

export function setLocale(next: Locale) {
  locale = next
}

export function t(key: MessageKey, vars: Record<string, string | number> = {}): string {
  const template = catalogs[locale][key] ?? en[key]
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ''))
}
