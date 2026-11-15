import { describe, expect, it } from 'vitest'
import { en } from './en.ts'
import { fr } from './fr.ts'

describe('catalogs', () => {
  it('gives French a string for every English key', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort())
    for (const key of Object.keys(en)) {
      expect(fr[key as keyof typeof fr].length).toBeGreaterThan(0)
    }
  })
})
