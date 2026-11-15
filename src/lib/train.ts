import { scoreForest, type ForestReport, type ForestSol } from './forest.ts'
import type { DayRecord, MeasureMeta } from './domains.ts'

export type TrainedSubject = {
  referenceSols: number
  referenceKind: ForestReport['referenceKind']
  /** Sols after the reference window. The reference itself is not a prediction. */
  later: ForestSol[]
}

/** Train on the reference period and return a score plus 3 drivers for every later sol. */
export function trainSubject(days: DayRecord[], measures: MeasureMeta[]): TrainedSubject {
  const report = scoreForest(days, measures)
  return {
    referenceSols: report.referenceSols,
    referenceKind: report.referenceKind,
    later: report.perSol.slice(report.referenceSols),
  }
}
