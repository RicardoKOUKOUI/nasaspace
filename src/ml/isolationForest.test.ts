import { describe, expect, it } from 'vitest'
import { isolationScores, ISOLATION_SUBSAMPLE, ISOLATION_TREES, trainIsolationForest } from './isolationForest.ts'
import { fr } from '../i18n/fr.ts'

describe('isolation forest', () => {
  it('scores an obvious outlier higher than the normal points', () => {
    const rows = Array.from({ length: 40 }, () => [1, 2, 3])
    rows.push([1, 2, 100])
    const model = trainIsolationForest(rows)
    expect(model.trees).toHaveLength(ISOLATION_TREES)
    expect(model.sampleSize).toBeLessThanOrEqual(ISOLATION_SUBSAMPLE)
    const scores = isolationScores(model, rows)
    const outlier = scores[scores.length - 1] ?? 0
    const normal = Math.max(...scores.slice(0, -1))
    expect(outlier).toBeGreaterThan(normal)
  })

  it('keeps the French insufficient-data sentence for the UI', () => {
    expect(fr['forest.insufficient']).toBe("Pas assez de données pour le modèle, seules les règles cliniques s'appliquent")
  })
})
