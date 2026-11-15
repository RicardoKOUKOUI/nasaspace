import { readFileSync } from 'node:fs'
import { parseAppleHealth } from './earthDemo.ts'
import { describe, expect, it } from 'vitest'
import { dashboardDomains, mergeDashboard, missingDomainIds } from './domainView.ts'
import { evaluate, evaluateImported } from './engine.js'
import { FOREST_CONTAMINATION, FOREST_MIN_ROWS, FOREST_SUBSAMPLE, FOREST_TREES, scoreForest } from './forest.ts'
import { daysForSubject, headerReference, parseImport, parseNumber } from './import.ts'
import { en } from '../i18n/en.ts'
import { SOURCE_LABEL, STARTERS } from './starters.ts'
import { clampFeeling, metricReadings, scoreFeeling, seriesInterval } from './selfReport.ts'
import { applyWatch, healthDecision, localWatchStream, scoreWatch } from './watch.ts'
import { trainSubject } from './train.ts'
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
  it('labels each starter with its source and a header reference', () => {
    const kinds = new Set(STARTERS.map((item) => item.source))
    expect(kinds).toEqual(new Set(['flight', 'bedrest', 'wearable']))
    expect(SOURCE_LABEL.flight).toBe('Vol spatial')
    expect(SOURCE_LABEL.bedrest).toBe('Analogue au sol - alitement')
    expect(SOURCE_LABEL.wearable).toBe('Population terrestre - montre connectée')
    for (const starter of STARTERS) {
      const text = read(starter.file)
      const result = parseImport(text, starter.file)
      expect(result.ok, starter.id).toBe(true)
      expect(result.days.length, starter.id).toBeGreaterThan(0)
      expect(result.subjects.length, starter.id).toBeGreaterThan(0)
      expect(headerReference(text), starter.id).toMatch(/^https?:\/\//)
      expect(result.reference, starter.id).toBe(headerReference(text))
      const missing = missingDomainIds(result.measures, daysForSubject(result.days, result.subjects[0] ?? ''))
      expect(missing.length, starter.id).toBeGreaterThan(0)
    }
    expect(en['import.missingColumns']).toContain('{list}')
  })

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
    expect((acute.score ?? 0)).toBeLessThan(nominal.score ?? 0)
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
        totBmd: 1.05 + (index % 3) * 0.01,
        ...(index === 15 ? {} : { kes0: 100 + (index % 2) }),
      },
    }))
    const last = days[15]
    if (last) last.values.totBmd = 4
    const report = scoreForest(days, measures)
    expect(report.ready).toBe(true)
    expect(report.anomaly).not.toBeNull()
    const early = report.series.slice(0, 7)
    const earlyMean = early.reduce((sum, score) => sum + score, 0) / early.length
    expect(report.anomaly ?? 0).toBeGreaterThan(earlyMean)
    const scored = report.perSol.at(-1)
    if (scored?.flagged) expect(scored.drivers[0]?.feature).toBe('totBmd')
    expect(scored?.drivers.some((driver) => driver.feature === 'kes0')).toBe(false)
    expect(days[15]?.values.kes0).toBeUndefined()
  })

  it('does not invent a forest score for a short acetaminophen series', () => {
    const acet = parseImport(read('brsmacet.csv'), 'brsmacet.csv')
    const days = acet.days.filter((day) => day.subject === 'C1G0001')
    expect(days.filter((day) => day.phase === 'PRE_TEST')).toHaveLength(1)
    expect(days.find((day) => day.sol === 56)?.values.halfLife).toBeCloseTo(372.754)
    const report = scoreForest(days, acet.measures)
    expect(FOREST_TREES).toBe(200)
    expect(FOREST_CONTAMINATION).toBe(0.02)
    expect(FOREST_SUBSAMPLE).toBe(256)
    expect(days.length).toBeLessThan(FOREST_MIN_ROWS)
    expect(report.ready).toBe(false)
    expect(report.anomaly).toBeNull()
    expect(report.referenceKind).toBe('pre')
    expect(days.find((day) => day.sol === 56)?.values.halfLife).not.toBe(0)
  })

  it('does not invent a forest score for a short renal series', () => {
    const renal = parseImport(read('brsmrf.csv'), 'brsmrf.csv')
    const days = renal.days.filter((day) => day.subject === 'C1G0001')
    const report = scoreForest(days, renal.measures)
    expect(days.length).toBeLessThan(FOREST_MIN_ROWS)
    expect(report.ready).toBe(false)
    expect(report.anomaly).toBeNull()
    expect(days.find((day) => day.phase === 'IN_TEST' && day.sol === 7)?.values.creatinineClearance).toEqual(expect.any(Number))
  })

  it('shows only domains that have a measured series', () => {
    const heart = parseImport(read('agbresa-cardio.csv'), 'agbresa-cardio.csv')
    const heartDays = heart.days.filter((day) => day.subject === 'A')
    const heartView = dashboardDomains(heart.measures, heartDays)
    expect(heartView.map((item) => item.label)).toEqual([
      'Cardiovasculaire',
      'Neurologie',
      'Immunité',
      'Psychologie',
      'Nutrition',
      'Santé rénale',
    ])
    expect(heartView[0]?.detail).toContain('Heart rate')
    expect(heartView[0]?.detail).not.toContain('HRV')
    expect(heartView.slice(1).every((item) => item.detail === '—')).toBe(true)
    const neuro = parseImport(read('brsmfmt.csv'), 'brsmfmt.csv')
    const neuroDays = neuro.days.filter((day) => day.subject === '224')
    const neuroView = dashboardDomains(neuro.measures, neuroDays)
    expect(neuroView.find((item) => item.id === 'neuro')?.detail).toContain('Average time')
    expect(neuroView.find((item) => item.id === 'cardio')?.detail).toBe('—')
    const muscle = parseImport(read('mr035g-spine.csv'), 'mr035g-spine.csv')
    expect(dashboardDomains(muscle.measures, muscle.days).every((item) => item.detail === '—')).toBe(true)
    const dose = parseImport(read('radlab.csv'), 'radlab.csv')
    expect(dashboardDomains(dose.measures, dose.days).every((item) => item.detail === '—')).toBe(true)
    const cabin = parseImport(read('dto623-cabin-air.csv'), 'dto623-cabin-air.csv')
    expect(dashboardDomains(cabin.measures, cabin.days).every((item) => item.detail === '—')).toBe(true)
    const wellness = parseImport(read('pmdata-wellness.csv'), 'pmdata-wellness.csv')
    const person = wellness.days.filter((day) => day.subject === 'p01')
    const behavior = dashboardDomains(wellness.measures, person)
    expect(behavior.find((item) => item.id === 'behavior')?.detail).toContain('Sleep')
    expect(behavior.find((item) => item.id === 'behavior')?.detail).not.toContain('Focus')
    const landing = mergeDashboard([heartView, neuroView, behavior])
    expect(landing.map((item) => item.label)).toEqual([
      'Cardiovasculaire',
      'Neurologie',
      'Immunité',
      'Psychologie',
      'Nutrition',
      'Santé rénale',
    ])
    expect(landing.find((item) => item.id === 'cardio')?.detail).toContain('Heart rate')
    expect(landing.find((item) => item.id === 'neuro')?.detail).toContain('Average time')
    expect(landing.find((item) => item.id === 'behavior')?.detail).toContain('Sleep')
    expect(landing.some((item) => /bone|radiation|ARED|mSv/i.test(item.label))).toBe(false)
  })

  it('keeps the astronaut value inside each training interval and rescores it', () => {
    const files = [
      ['agbresa-cardio.csv', 'A', 'cardio'],
      ['brsmfmt.csv', '224', 'neuro'],
      ['brsmvsi.csv', '7326', 'immune'],
      ['pmdata-wellness.csv', 'p01', 'behavior'],
      ['ap010-nutrition.csv', 'CDR', 'nutrition'],
      ['brsmrf.csv', 'C1G0001', 'renal'],
    ] as const
    for (const [file, subject, id] of files) {
      const parsed = parseImport(read(file), file)
      const days = parsed.days.filter((day) => day.subject === subject)
      const interval = seriesInterval(days, parsed.measures, id)
      expect(interval?.id).toBe(id)
      expect(interval!.low).toBeLessThanOrEqual(interval!.typical)
      expect(interval!.typical).toBeLessThanOrEqual(interval!.high)
      expect(interval!.key).not.toBe('hrv')
      expect(interval!.key).not.toBe('focus')
      const seen = days.map((day) => day.values[interval!.key]).filter((value) => typeof value === 'number')
      expect(interval!.low).toBeGreaterThanOrEqual(Math.min(...seen))
      expect(interval!.high).toBeLessThanOrEqual(Math.max(...seen))
      const before = days[days.length - 1]?.values[interval!.key]
      const typical = scoreFeeling(days, parsed.measures, id, interval!.typical)
      const edge = scoreFeeling(days, parsed.measures, id, interval!.high === interval!.typical ? interval!.low : interval!.high)
      expect(days[days.length - 1]?.values[interval!.key]).toBe(before)
      if (days.length < FOREST_MIN_ROWS) {
        expect(typical.anomaly).toBeNull()
        expect(edge.anomaly).toBeNull()
      } else {
        expect(typical.anomaly).toEqual(expect.any(Number))
        expect(typical.drivers.length).toBeLessThanOrEqual(3)
        expect(edge.drivers.length).toBeLessThanOrEqual(3)
      }
      expect(clampFeeling(interval!, interval!.high + 10)).toBe(interval!.high)
    }
    const heart = parseImport(read('agbresa-cardio.csv'), 'agbresa-cardio.csv')
    const days = heart.days.filter((day) => day.subject === 'A')
    const interval = seriesInterval(days, heart.measures, 'cardio')
    const typical = scoreFeeling(days, heart.measures, 'cardio', interval!.typical)
    const high = scoreFeeling(days, heart.measures, 'cardio', interval!.high)
    expect(typical.anomaly).toBeNull()
    expect(high.anomaly).toBeNull()
  })

  it('scores a local watch packet and applies the seuil 40 decision', () => {
    const heart = parseImport(read('agbresa-cardio.csv'), 'agbresa-cardio.csv')
    const days = heart.days.filter((day) => day.subject === 'V')
    const stream = localWatchStream(days)
    expect(stream.length).toBe(2)
    expect(stream.every((sample) => sample.source === 'local-watch-shape')).toBe(true)
    const resting = scoreWatch(days, heart.measures, stream[0]!)
    const latest = scoreWatch(days, heart.measures, stream[1]!)
    expect(days.length).toBeLessThan(FOREST_MIN_ROWS)
    expect(resting.anomaly).toBeNull()
    expect(resting.decision).toBeNull()
    expect(latest.anomaly).toBeNull()
    expect(latest.decision).toBeNull()
    expect(healthDecision(39)).toBe('en bonne santé')
    expect(healthDecision(40)).toBe('à consulter')
    const neuro = parseImport(read('brsmfmt.csv'), 'brsmfmt.csv')
    const neuroDays = neuro.days.filter((day) => day.subject === '224')
    const kept = neuroDays[neuroDays.length - 1]?.values.avgTime
    const filled = applyWatch(neuroDays, stream[0]!)
    expect(filled[filled.length - 1]?.values.hr).toBe(stream[0]!.hr)
    expect(filled[filled.length - 1]?.values.avgTime).toBe(kept)
    expect(filled[0]).toBe(neuroDays[0])
  })

  it('reads a measured value and its training interval for each metric page', () => {
    const files = [
      ['agbresa-cardio.csv', 'cardio', ['hr', 'sbp', 'dbp']],
      ['brsmfmt.csv', 'neuro', ['avgTime']],
      ['brsmvsi.csv', 'immune', ['vca']],
      ['pmdata-wellness.csv', 'behavior', ['sleep']],
      ['ap010-nutrition.csv', 'nutrition', ['carbohydrate']],
      ['brsmrf.csv', 'renal', ['creatinineClearance']],
    ] as const
    for (const [file, id, keys] of files) {
      const parsed = parseImport(read(file), file)
      const days = parsed.days.filter((day) => day.subject === parsed.subjects[0])
      const readings = metricReadings(days, parsed.measures, id)
      expect(readings.length).toBeGreaterThan(0)
      for (const reading of readings) {
        expect(typeof reading.value).toBe('number')
        expect(reading.low).toBeLessThanOrEqual(reading.typical)
        expect(reading.typical).toBeLessThanOrEqual(reading.high)
      }
      for (const key of keys) expect(readings.some((reading) => reading.key === key)).toBe(true)
    }
  })

  it('trains the domains that have a public series and scores the later sols', () => {
    expect(STARTERS.map((item) => item.file)).toEqual([
      'agbresa-cardio.csv',
      'brsmfmt.csv',
      'brsmfsr.csv',
      'brsmvsi.csv',
      'brsmimmune-cd8.csv',
      'pmdata-wellness.csv',
      'ap010-nutrition.csv',
      'brsmacet.csv',
      'brsmrf.csv',
    ])
    const heart = parseImport(read('agbresa-cardio.csv'), 'agbresa-cardio.csv')
    const days = heart.days.filter((day) => day.subject === 'A')
    expect(days.map((day) => day.sol)).toEqual([1, 30, 60])
    expect(days[0]?.hr).toEqual(expect.any(Number))
    expect(days[0]?.sbp).toEqual(expect.any(Number))
    expect(days[0]?.dbp).toEqual(expect.any(Number))
    expect(days[0]?.hrv).toBeUndefined()
    expect(days[0]?.values.dose).toBeUndefined()
    const trained = trainSubject(days, heart.measures)
    expect(days.length).toBeLessThan(FOREST_MIN_ROWS)
    expect(trained.referenceSols).toBe(3)
    expect(trained.later).toEqual([])
    const wellness = parseImport(read('pmdata-wellness.csv'), 'pmdata-wellness.csv')
    const person = wellness.days.filter((day) => day.subject === 'p01')
    expect(person[0]?.sleep).toEqual(expect.any(Number))
    expect(person[0]?.mood).toBeGreaterThanOrEqual(1)
    expect(person[0]?.fatigue).toBeLessThanOrEqual(5)
    expect(person[0]?.focus).toBeUndefined()
    expect(person[0]?.values.readiness).toBeUndefined()
    const behavior = trainSubject(person, wellness.measures)
    expect(behavior.referenceSols).toBe(7)
    expect(behavior.later.length).toBe(person.length - 7)
    expect(behavior.later.every((item) => item.drivers.every((driver) => ['sleep', 'mood', 'fatigue', 'sleepQuality', 'stress', 'soreness'].includes(driver.feature)))).toBe(true)
  })
})
