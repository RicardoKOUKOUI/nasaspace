import { readFileSync } from 'node:fs'
import { parseAppleHealth } from './earthDemo.ts'
import { describe, expect, it } from 'vitest'
import { evaluate, evaluateImported } from './engine.js'
import { FOREST_CONTAMINATION, FOREST_TREES, scoreForest } from './forest.ts'
import { parseImport, parseNumber } from './import.ts'
import { generateMission } from './telemetry.js'

function read(name: string): string {
  return readFileSync(new URL(`../../public/starters/${name}`, import.meta.url), 'utf8')
}

describe('parseNumber', () => {
  it('keeps blanks and ND empty', () => {
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('NA')).toBeNull()
    expect(parseNumber('ND*')).toBeNull()
    expect(parseNumber('-')).toBeNull()
    expect(parseNumber('1,5')).toBe(1.5)
    expect(parseNumber('0')).toBe(0)
  })
})

describe('starter files', () => {
  it('maps spine DXA without filling ARED or percent BMD', () => {
    const result = parseImport(read('mr035g-spine.csv'), 'mr035g-spine.csv')
    expect(result.ok).toBe(true)
    expect(result.days).toHaveLength(1)
    expect(result.duplicates.length).toBeGreaterThan(0)
    const day = result.days[0]
    expect(day?.date).toBe('2008-08-18')
    expect(day?.values.totBmd).toBe(1.055)
    expect(day?.values.aredMin).toBeUndefined()
    expect(day?.bmd).toBeUndefined()
    expect(day?.hr).toBeUndefined()
  })

  it('maps isokinetic torque in Nm', () => {
    const result = parseImport(read('mr079g-isokinetic.csv'), 'mr079g-isokinetic.csv')
    const day = result.days.find((item) => item.subject === '5240')
    expect(day?.values.kes0).toBe(186.1)
    expect(result.measures.find((item) => item.key === 'kes0')?.unit).toBe('Nm')
    expect(day?.values.aredMin).toBeUndefined()
  })

  it('keeps a missing ataxia cell empty', () => {
    const result = parseImport(read('brsmfmt.csv'), 'brsmfmt.csv')
    expect(result.days.length).toBeGreaterThan(1)
    const first = result.days[0]
    expect(first?.subject).toBe('224')
    expect(first?.values.avgTime).toBe(13.94)
    expect(first?.values.ataxia).toBeUndefined()
  })

  it('averages reflex torque by muscle, phase, and bed-rest day', () => {
    const result = parseImport(read('brsmfsr.csv'), 'brsmfsr.csv')
    expect(result.subjects).toEqual(['8779'])
    expect(result.days.length).toBeGreaterThan(1)
    const pre = result.days.find((day) => day.phase === 'PRE_TEST' && typeof day.values.fsrTorque_med_gast === 'number')
    expect(pre?.values.fsrTorque_med_gast).toBeGreaterThan(10)
    expect(pre?.values.amp_med_gast).toBeUndefined()
  })

  it('averages RadLab to calendar days and does not invent mSv', () => {
    const result = parseImport(read('radlab.csv'), 'radlab.csv')
    expect(result.subjects.length).toBeGreaterThan(0)
    for (const subject of result.subjects) {
      const dates = result.days.filter((day) => day.subject === subject).map((day) => day.date).sort()
      expect(dates).toEqual(['2022-04-01', '2022-04-02'])
    }
    expect(result.days[0]?.values.absorbedDoseRate).toEqual(expect.any(Number))
    expect(result.days[0]?.dose).toBeUndefined()
    expect(result.days[0]?.values.dose).toBeUndefined()
  })

  it('reads shuttle cabin concentrations and leaves ND empty', () => {
    const result = parseImport(read('dto623-cabin-air.csv'), 'dto623-cabin-air.csv')
    const sts37 = result.days.filter((day) => day.subject === 'STS-37')
    expect(sts37.length).toBeGreaterThan(0)
    const hit = sts37.find((day) => typeof day.values.trifluorobromomethane === 'number')
    expect(hit?.values.trifluorobromomethane).toBeCloseTo(0.019)
    expect(result.measures.every((item) => item.domain === 'environment')).toBe(true)
  })

  it('maps viral immunity and leaves NA empty', () => {
    const result = parseImport(read('brsmvsi.csv'), 'brsmvsi.csv')
    const first = result.days.find((day) => day.subject === '7326')
    expect(first?.values.cortisol).toBe(29.03)
    expect(first?.values.cmvTet).toBeUndefined()
    expect(first?.crp).toBeUndefined()
  })

  it('melts the CD8 table and skips NA timepoints', () => {
    const result = parseImport(read('brsmimmune-cd8.csv'), 'brsmimmune-cd8.csv')
    const rows = result.days.filter((day) => day.subject === '7127')
    expect(rows.map((day) => day.sol).sort((a, b) => a - b)).toEqual([-10, -2, 28])
    expect(rows.every((day) => typeof day.values.cd8Cd69 === 'number')).toBe(true)
  })

  it('maps Apollo intake per crew role and keeps a dash empty', () => {
    const result = parseImport(read('ap010-nutrition.csv'), 'ap010-nutrition.csv')
    const row = result.days.find((day) => day.subject === 'CDR' && day.sol === 7)
    expect(row?.values.protein).toBe(81)
    expect(row?.values.fiber).toBeUndefined()
    expect(row?.date).toBeUndefined()
  })

  it('maps acetaminophen kinetics and renal clearance', () => {
    const acet = parseImport(read('brsmacet.csv'), 'brsmacet.csv')
    const renal = parseImport(read('brsmrf.csv'), 'brsmrf.csv')
    expect(acet.days.find((day) => day.subject === 'C1G0001')?.values.clearance).toBeCloseTo(0.3907)
    expect(renal.days.find((day) => day.subject === 'C1G0001')?.values.albumin).toBe(4.3)
    expect(renal.days.find((day) => day.subject === 'C1G0001')?.values.creatinineClearance).toBe(141)
  })
})

describe('scores', () => {
  it('sums a missing cumulative dose and leaves an absent dose empty', () => {
    const summed = parseImport('sol,dose_msv\n1,1.5\n2,2\n', 'dose.csv')
    expect(summed.days[0]?.values.cumDose).toBe(1.5)
    expect(summed.days[1]?.values.cumDose).toBe(3.5)
    const heart = parseImport('sol,hr_bpm\n1,60\n', 'hr.csv')
    expect(heart.days[0]?.hr).toBe(60)
    expect(heart.days[0]?.values.dose).toBeUndefined()
    expect(heart.days[0]?.values.cumDose).toBeUndefined()
  })

  it('reads the format example and an Apple Health snippet', () => {
    const example = parseImport(readFileSync(new URL('../../public/exemple-import.csv', import.meta.url), 'utf8'), 'exemple-import.csv')
    expect(example.days).toHaveLength(2)
    expect(example.days[0]?.hr).toBe(57)
    expect(example.days[0]?.values.cumDose).toBe(1.87)
    const earth = parseAppleHealth(`
      <HealthData>
        <Record type="HKQuantityTypeIdentifierHeartRate" startDate="2024-01-02 08:00:00 -0000" endDate="2024-01-02 08:00:00 -0000" value="61" unit="count/min"/>
        <Record type="HKCategoryTypeIdentifierSleepAnalysis" startDate="2024-01-01 22:00:00 -0000" endDate="2024-01-02 05:00:00 -0000" value="HKCategoryValueSleepAnalysisAsleep"/>
      </HealthData>`)
    expect(earth.days.some((day) => day.hr === 61)).toBe(true)
    expect(earth.days.some((day) => day.sleep === 7)).toBe(true)
    expect(earth.days.every((day) => day.dose == null)).toBe(true)
  })

  it('keeps the demo clinical thresholds', () => {
    const nominal = evaluate(generateMission('nominal').days)
    const storm = evaluate(generateMission('storm').days)
    const fatigue = evaluate(generateMission('fatigue').days)
    const acute = evaluate(generateMission('nominal').days, { mood: 1, focus: 1, fatigue: 5 })
    expect(nominal.score).toBeGreaterThanOrEqual(80)
    expect(nominal.alerts).toHaveLength(0)
    expect(storm.score).toBeLessThan(60)
    expect(storm.alerts.some((alert) => alert.id === 'spe')).toBe(true)
    expect(fatigue.score).toBeLessThan(60)
    expect(fatigue.alerts.some((alert) => alert.id === 'fatigue-cascade')).toBe(true)
    expect(acute.score).toBeLessThan(nominal.score)
    expect(acute.alerts.some((alert) => alert.id === 'acute')).toBe(true)
  })

  it('does not score a missing dose as zero or raise a solar alert', () => {
    const days = [
      { sol: 1, hr: 58, hrv: 62, sbp: 110, dbp: 70, sleep: 7.4, mood: 4, focus: 4, fatigue: 2 },
      { sol: 2, hr: 59, hrv: 60, sbp: 112, dbp: 72, sleep: 7.2, mood: 4, focus: 4, fatigue: 2 },
    ]
    const report = evaluateImported(days)
    expect(report.unmeasured).toBe(false)
    expect(report.alerts.some((alert) => alert.id === 'spe')).toBe(false)
    expect(report.axes.some((axis) => axis.id === 'radiation')).toBe(false)
    expect(report.score).not.toBe(0)
  })

  it('leaves the clinical score unmeasured when no scored column exists', () => {
    const imported = parseImport(read('mr035g-spine.csv'), 'mr035g-spine.csv')
    const report = evaluateImported(imported.days)
    expect(report.unmeasured).toBe(true)
    expect(report.score).toBeNull()
    expect(report.alerts).toHaveLength(0)
  })

  it('flags the spiked measure and ignores a missing one', () => {
    const measures = [
      { key: 'totBmd', label: 'Spine BMD', domain: 'muscle' as const, unit: 'g/cm²', stdFloor: 0.01 },
      { key: 'kes0', label: 'KES0', domain: 'muscle' as const, unit: 'Nm', stdFloor: 5 },
    ]
    const days = Array.from({ length: 16 }, (_, index) => ({
      sol: index + 1,
      day: index + 1,
      subject: 'A',
      values: {
        totBmd: 1.05,
        ...(index === 15 ? {} : { kes0: 100 }),
      },
    }))
    const last = days[15]
    if (last) last.values.totBmd = 1.4
    const report = scoreForest(days, measures)
    expect(report.anomaly).not.toBeNull()
    expect(report.perSol.at(-1)?.drivers[0]?.feature).toBe('totBmd')
    expect(report.perSol.at(-1)?.drivers.some((driver) => driver.feature === 'kes0')).toBe(false)
    expect(days[15]?.values.kes0).toBeUndefined()
  })

  it('trains on PRE_TEST and flags the acetaminophen half-life shift', () => {
    const acet = parseImport(read('brsmacet.csv'), 'brsmacet.csv')
    const days = acet.days.filter((day) => day.subject === 'C1G0001')
    expect(days.filter((day) => day.phase === 'PRE_TEST')).toHaveLength(1)
    expect(days.find((day) => day.sol === 56)?.values.halfLife).toBeCloseTo(372.754)
    const report = scoreForest(days, acet.measures)
    expect(FOREST_TREES).toBe(200)
    expect(FOREST_CONTAMINATION).toBe(0.02)
    expect(report.referenceKind).toBe('pre')
    expect(report.referenceSols).toBe(1)
    const pre = report.perSol.find((item) => item.phase === 'PRE_TEST')
    const spike = report.perSol.find((item) => item.phase === 'IN_TEST' && item.sol === 56)
    expect(pre?.anomaly).toBeLessThan(40)
    expect(spike?.anomaly).toBeGreaterThanOrEqual(40)
    expect(spike?.drivers[0]?.feature).toBe('halfLife')
    expect(days.find((day) => day.sol === 56)?.values.halfLife).not.toBe(0)
  })

  it('flags renal clearance from the personal baseline', () => {
    const renal = parseImport(read('brsmrf.csv'), 'brsmrf.csv')
    const days = renal.days.filter((day) => day.subject === 'C1G0001')
    const report = scoreForest(days, renal.measures)
    const spike = report.perSol.find((item) => item.phase === 'IN_TEST' && item.sol === 7)
    expect(spike?.anomaly).toBeGreaterThanOrEqual(40)
    expect(spike?.drivers[0]?.feature).toBe('creatinineClearance')
    expect(spike?.drivers[0]?.z).toBeGreaterThan(10)
  })
})
