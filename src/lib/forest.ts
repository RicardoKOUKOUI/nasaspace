import { referenceSlice, referenceZ } from './baseline.ts'
import type { DayRecord, MeasureMeta } from './domains.ts'
import {
  ISOLATION_CONTAMINATION,
  ISOLATION_SEED,
  ISOLATION_SUBSAMPLE,
  ISOLATION_TREES,
  isolationScores,
  trainIsolationForest,
} from '../ml/isolationForest.ts'

export const FOREST_SEED = ISOLATION_SEED
export const FOREST_TREES = ISOLATION_TREES
export const FOREST_CONTAMINATION = ISOLATION_CONTAMINATION
export const FOREST_SUBSAMPLE = ISOLATION_SUBSAMPLE
export const FOREST_MIN_ROWS = 10
export const FOREST_MIN_VARIABLES = 2

export type ForestDriver = {
  feature: string
  label: string
  domain: string
  z: number
}

export type ForestSol = {
  sol: number
  day: number
  phase?: string
  anomaly: number
  drivers: ForestDriver[]
}

export type ForestReport = {
  anomaly: number | null
  ready: boolean
  flaggedSols: number
  sols: number
  drivers: ForestDriver[]
  series: number[]
  perSol: ForestSol[]
  referenceSols: number
  /** `pre` when the file has a PRE phase; otherwise the opening sols. */
  referenceKind: 'pre' | 'first'
}

export const CRUISE_MEASURES: MeasureMeta[] = [
  { key: 'hr', label: 'Heart rate', domain: 'cardio', unit: 'bpm', stdFloor: 3 },
  { key: 'hrv', label: 'HRV', domain: 'cardio', unit: 'ms', stdFloor: 4 },
  { key: 'sbp', label: 'Systolic', domain: 'cardio', unit: 'mmHg', stdFloor: 4 },
  { key: 'dbp', label: 'Diastolic', domain: 'cardio', unit: 'mmHg', stdFloor: 4 },
  { key: 'aredMin', label: 'ARED', domain: 'muscle', unit: 'min', stdFloor: 6 },
  { key: 'bmd', label: 'BMD', domain: 'muscle', unit: '% preflight', stdFloor: 0.2 },
  { key: 'dose', label: 'Dose', domain: 'radiation', unit: 'mSv', stdFloor: 0.25 },
  { key: 'cumDose', label: 'Cumulative dose', domain: 'radiation', unit: 'mSv', stdFloor: 0.25 },
  { key: 'crp', label: 'CRP', domain: 'immune', unit: 'mg/L', stdFloor: 0.5 },
  { key: 'sleep', label: 'Sleep', domain: 'sleep', unit: 'h', stdFloor: 0.35 },
  { key: 'mood', label: 'Mood', domain: 'behavior', unit: '1–5', stdFloor: 0.8 },
  { key: 'focus', label: 'Focus', domain: 'behavior', unit: '1–5', stdFloor: 0.8 },
  { key: 'fatigue', label: 'Fatigue', domain: 'behavior', unit: '1–5', stdFloor: 0.8 },
]

export function cruiseRecords(days: Array<Record<string, unknown>>): DayRecord[] {
  return days.map((day, index) => {
    const values: Record<string, number> = {}
    for (const measure of CRUISE_MEASURES) {
      const value = day[measure.key]
      if (typeof value === 'number' && Number.isFinite(value)) values[measure.key] = value
    }
    return {
      sol: typeof day.sol === 'number' ? day.sol : index + 1,
      day: typeof day.day === 'number' ? day.day : index + 1,
      subject: 'simulation',
      values,
    }
  })
}

function percentile(sorted: number[], percent: number): number {
  if (sorted.length === 0) return 0
  const first = sorted[0] ?? 0
  if (sorted.length === 1) return first
  const rank = (percent / 100) * (sorted.length - 1)
  const low = Math.floor(rank)
  const high = Math.ceil(rank)
  const left = sorted[low] ?? first
  const right = sorted[high] ?? left
  if (low === high) return left
  return left * (high - rank) + right * (rank - low)
}

function toPercent(score: number, median: number, flagAt: number): number {
  const span = Math.max(flagAt - median, 1e-6)
  const raw = ((score - median) / span) * 40
  return Math.max(0, Math.min(100, Math.round(raw)))
}

function usableMeasures(days: DayRecord[], measures: MeasureMeta[]): MeasureMeta[] {
  const reference = referenceSlice(days)
  if (reference.length === 0) return []
  return measures.filter((measure) => {
    let present = 0
    for (const day of reference) {
      if (typeof day.values[measure.key] === 'number') present += 1
    }
    return present * 2 >= reference.length
  })
}

function solDrivers(days: DayRecord[], index: number, measures: MeasureMeta[]): ForestDriver[] {
  const drivers: ForestDriver[] = []
  for (const measure of measures) {
    const z = referenceZ(days, index, measure)
    if (z == null) continue
    drivers.push({
      feature: measure.key,
      label: measure.label,
      domain: measure.domain,
      z: Math.round(z * 100) / 100,
    })
  }
  drivers.sort((a, b) => b.z - a.z)
  return drivers.slice(0, 3)
}

/**
 * Train on the person's reference rows only (PRE_TEST when present, otherwise
 * the opening sols) and score every later row. No synthetic copies. Fewer than
 * 10 rows, or fewer than 2 numeric columns, returns no score.
 */
export function scoreForest(days: DayRecord[], measures: MeasureMeta[]): ForestReport {
  const hasPre = days.some((day) => typeof day.phase === 'string' && /^PRE/i.test(day.phase))
  const reference = referenceSlice(days)
  const empty: ForestReport = {
    anomaly: null,
    ready: false,
    flaggedSols: 0,
    sols: days.length,
    drivers: [],
    series: [],
    perSol: [],
    referenceSols: reference.length,
    referenceKind: hasPre ? 'pre' : 'first',
  }
  const selected = usableMeasures(days, measures).slice(0, 40)
  if (days.length < FOREST_MIN_ROWS || selected.length < FOREST_MIN_VARIABLES || reference.length === 0) return empty

  const raw: number[][] = days.map((day) => selected.map((measure) => day.values[measure.key] ?? Number.NaN))
  const inReference = days.map((day) => reference.includes(day))
  const refRows = raw.filter((_, index) => inReference[index])
  const fill = selected.map((_, index) => {
    const seen: number[] = []
    for (const row of refRows) {
      const value = row[index]
      if (typeof value === 'number' && Number.isFinite(value)) seen.push(value)
    }
    if (seen.length === 0) return 0
    return seen.reduce((sum, value) => sum + value, 0) / seen.length
  })
  const matrix = raw.map((row) => row.map((value, index) => (Number.isFinite(value) ? value : (fill[index] ?? 0))))
  const nominal = matrix.filter((_, index) => inReference[index])
  if (nominal.length === 0) return empty
  const model = trainIsolationForest(nominal, {
    trees: FOREST_TREES,
    subsample: FOREST_SUBSAMPLE,
    contamination: FOREST_CONTAMINATION,
    seed: FOREST_SEED,
  })
  const rawScores = isolationScores(model, matrix)
  const referenceScores = rawScores.filter((_, index) => inReference[index]).slice().sort((a, b) => a - b)
  const median = percentile(referenceScores, 50)
  const flagAt = percentile(referenceScores, 100 * (1 - FOREST_CONTAMINATION))
  const series = rawScores.map((score) => toPercent(score, median, flagAt))
  const perSol: ForestSol[] = days.map((day, index) => ({
    sol: day.sol,
    day: day.day,
    ...(day.phase ? { phase: day.phase } : {}),
    anomaly: series[index] ?? 0,
    drivers: solDrivers(days, index, selected),
  }))
  const last = days.length - 1
  return {
    anomaly: series[last] ?? null,
    ready: true,
    flaggedSols: series.filter((score) => score >= 40).length,
    sols: days.length,
    drivers: perSol[last]?.drivers ?? [],
    series,
    perSol,
    referenceSols: reference.length,
    referenceKind: hasPre ? 'pre' : 'first',
  }
}
