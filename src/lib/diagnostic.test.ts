import { describe, expect, it } from 'vitest'
import { CLINIC_SCENARIOS, dehydrationSeries, diagnose, HRP_RULES, type ClinicDay } from './diagnostic.ts'

function scenario(id: (typeof CLINIC_SCENARIOS)[number]['id']) {
  const found = CLINIC_SCENARIOS.find((item) => item.id === id)
  if (!found) throw new Error(id)
  return found.days
}

function withLast(days: ClinicDay[], patch: Partial<ClinicDay>): ClinicDay[] {
  return days.map((day, index) => (index === days.length - 1 ? { ...day, ...patch } : day))
}

describe('clinic rules', () => {
  it('detects a solar particle event only when dose, immune marker, and fatigue cross', () => {
    const storm = diagnose(scenario('storm'))
    expect(storm.diagnoses.map((item) => item.id)).toEqual(['spe'])
    expect(storm.diagnoses[0].biomarkers).toContain('mSv/jour')
    expect(storm.diagnoses[0].projection).toContain('+7 jours')

    const doseOnly = diagnose(withLast(scenario('nominal'), { doseRate: 12 }))
    expect(doseOnly.diagnoses.map((item) => item.id)).not.toContain('spe')
  })

  it('detects cardiovascular deconditioning when HRV, resting HR, and ARED move together', () => {
    const report = diagnose(scenario('decond'))
    expect(report.diagnoses.map((item) => item.id)).toContain('cardio-decond')

    const flat = scenario('decond').map((day) => ({ ...day, hrv: 62, hr: 58, aredMin: 60 }))
    expect(diagnose(flat).diagnoses.map((item) => item.id)).not.toContain('cardio-decond')
  })

  it('detects bone and muscle loss when five ARED days stay under 45 and vitamin D or calcium is low', () => {
    const report = diagnose(scenario('decond'))
    expect(report.diagnoses.map((item) => item.id)).toContain('bone')
    expect(HRP_RULES.aredStreakMin).toBe(45)

    const fed = scenario('decond').map((day) => ({ ...day, vitaminDIu: 1000, calciumMg: 1200 }))
    expect(diagnose(fed).diagnoses.map((item) => item.id)).not.toContain('bone')
  })

  it('detects isolation when short sleep, high stress, and low vigilance cross', () => {
    const report = diagnose(scenario('isolation'))
    expect(report.diagnoses.map((item) => item.id)).toEqual(['isolation'])

    const rested = diagnose(withLast(scenario('isolation'), { sleepH: 7.5 }))
    expect(rested.diagnoses.map((item) => item.id)).not.toContain('isolation')
  })

  it('detects dehydration when heart rate, low pressure, and reported fluids cross', () => {
    const report = diagnose(dehydrationSeries())
    expect(report.diagnoses.map((item) => item.id)).toEqual(['dehydration'])

    const drinking = diagnose(dehydrationSeries().map((day) => ({ ...day, hydration: 8 })))
    expect(drinking.diagnoses.map((item) => item.id)).not.toContain('dehydration')
  })

  it('raises the readiness score when a countermeasure for the active diagnosis is checked', () => {
    const open = diagnose(scenario('storm'), [])
    const sheltered = diagnose(scenario('storm'), ['spe-shelter'])
    const full = diagnose(scenario('storm'), ['spe-shelter', 'spe-immune', 'spe-lytes'])
    expect(sheltered.score).toBeGreaterThan(open.score)
    expect(full.score).toBeGreaterThan(sheltered.score)
    expect(full.score).toBeLessThanOrEqual(100)
    expect(full.diagnoses.map((item) => item.id)).toEqual(['spe'])
    expect(diagnose(scenario('storm'), ['bone-ared']).score).toBe(open.score)
    expect(full.projectedScore).toBeLessThan(open.score)
  })

  it('keeps the nominal cruise clear of the five crossed diagnoses', () => {
    const nominal = diagnose(scenario('nominal'))
    expect(nominal.diagnoses).toEqual([])
    expect(nominal.band).toBe('nominal')
    expect(nominal.score).toBeGreaterThanOrEqual(80)
    expect(nominal.projectedScore).toBe(nominal.score)
  })
})
