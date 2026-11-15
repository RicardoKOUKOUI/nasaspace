import { useEffect, useState } from 'react'
import { en, type MessageKey } from './en.ts'
import { fr } from './fr.ts'

export type Locale = 'en' | 'fr'

const catalogs = { en, fr }
const STORAGE_KEY = 'astropulse-locale'
let locale: Locale = readStored()
const listeners = new Set<() => void>()

function readStored(): Locale {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'fr' ? 'fr' : 'en'
  } catch {
    return 'en'
  }
}

export function getLocale(): Locale {
  return locale
}

export function setLocale(next: Locale) {
  locale = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* private mode */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = next
  for (const listener of listeners) listener()
}

export function useLocale(): Locale {
  const [value, setValue] = useState(locale)
  useEffect(() => {
    document.documentElement.lang = getLocale()
    const listener = () => setValue(getLocale())
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return value
}

export function t(key: MessageKey, vars: Record<string, string | number> = {}): string {
  const template = catalogs[locale][key] ?? en[key]
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ''))
}
