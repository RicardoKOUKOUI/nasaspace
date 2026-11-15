import { describe, expect, it } from 'vitest'
import { isolationScores, ISOLATION_SEED, ISOLATION_SUBSAMPLE, ISOLATION_TREES, trainIsolationForest } from './isolationForest.ts'
import { en } from '../i18n/en.ts'
import { CRUISE_MEASURES, cruiseRecords, FOREST_MIN_ROWS, scoreForest } from '../lib/forest.ts'
import { generateMission } from '../lib/telemetry.js'

describe('isolation forest', () => {
  it('scores an obvious outlier above the mean of the normal points', () => {
    const rows = Array.from({ length: 40 }, () => [1, 2, 3])
    rows.push([1, 2, 100])
    const model = trainIsolationForest(rows)
    expect(model.trees).toHaveLength(ISOLATION_TREES)
    expect(model.sampleSize).toBe(Math.min(ISOLATION_SUBSAMPLE, rows.length))
    const scores = isolationScores(model, rows)
    const outlier = scores[scores.length - 1] ?? 0
    const normal = scores.slice(0, -1)
    const mean = normal.reduce((sum, score) => sum + score, 0) / normal.length
    expect(outlier).toBeGreaterThan(mean)
  })

  it('returns the same scores for the same seed', () => {
    const rows = Array.from({ length: 20 }, (_, index) => [index, index * 0.5, Math.sin(index)])
    const first = isolationScores(trainIsolationForest(rows, { seed: ISOLATION_SEED }), rows)
    const second = isolationScores(trainIsolationForest(rows, { seed: ISOLATION_SEED }), rows)
    expect(second).toEqual(first)
  })

  it('refuses a score under 10 rows or under 2 numeric columns', () => {
    const measures = [
      { key: 'hr', label: 'Heart rate', domain: 'cardio' as const, unit: 'bpm', stdFloor: 1 },
      { key: 'hrv', label: 'HRV', domain: 'cardio' as const, unit: 'ms', stdFloor: 1 },
    ]
    const short = Array.from({ length: FOREST_MIN_ROWS - 1 }, (_, index) => ({
      sol: index + 1,
      day: index + 1,
      subject: 'A',
      values: { hr: 60, hrv: 50 },
    }))
    expect(scoreForest(short, measures).ready).toBe(false)
    expect(scoreForest(short, measures).anomaly).toBeNull()
    const oneColumn = Array.from({ length: 12 }, (_, index) => ({
      sol: index + 1,
      day: index + 1,
      subject: 'A',
      values: { hr: 60 + index },
    }))
    expect(scoreForest(oneColumn, measures.slice(0, 1)).ready).toBe(false)
    expect(en['forest.insufficient']).toBe('Not enough data for the model. Clinical rules only.')
  })

  it('trains simulated scenarios on the whole Nominal series and flags above the 98% quantile', () => {
    const nominal = cruiseRecords(generateMission('nominal').days)
    const scored = (id: 'nominal' | 'storm' | 'fatigue') =>
      scoreForest(cruiseRecords(generateMission(id).days), CRUISE_MEASURES, { trainOn: nominal })
    const healthy = scored('nominal')
    const storm = scored('storm')
    const fatigue = scored('fatigue')
    expect(healthy.referenceSols).toBe(30)
    expect(healthy.referenceKind).toBe('nominal')
    expect(healthy.perSol.at(-1)?.flagged).toBe(false)
    expect(storm.perSol.at(-1)?.flagged).toBe(true)
    expect(fatigue.flaggedSols).toBeGreaterThan(0)
    expect(storm.threshold).toBe(healthy.threshold)
  })
})
