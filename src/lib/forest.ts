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
  flagged: boolean
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
  /** `pre` for a PRE phase, `first` for the opening sols, `nominal` for a whole Nominal scenario. */
  referenceKind: 'pre' | 'first' | 'nominal'
  /** 98% quantile of the training scores, on the 0–100 scale. Null when the model does not run. */
  threshold: number | null
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

const NOT_IN_FOREST = new Set(['bmd', 'cumDose'])

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

function toHundred(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score * 100)))
}

function isPre(phase: string | undefined): boolean {
  return typeof phase === 'string' && (/^PRE/i.test(phase) || /pre[-\s]?flight/i.test(phase))
}

/** PRE_TEST or pre-flight when present, otherwise the first 7 sols. */
export function forestReference(days: DayRecord[]): { rows: DayRecord[]; kind: 'pre' | 'first' } {
  const pre = days.filter((day) => isPre(day.phase))
  if (pre.length > 0) return { rows: pre, kind: 'pre' }
  return { rows: days.slice(0, 7), kind: 'first' }
}

function presentMeasures(reference: DayRecord[], measures: MeasureMeta[]): MeasureMeta[] {
  return measures.filter((measure) => {
    if (NOT_IN_FOREST.has(measure.key)) return false
    return reference.some((day) => {
      const value = day.values[measure.key]
      return typeof value === 'number' && Number.isFinite(value)
    })
  }).slice(0, 40)
}

function columnStats(reference: DayRecord[], key: string): { mean: number; std: number } {
  const values: number[] = []
  for (const day of reference) {
    const value = day.values[key]
    if (typeof value === 'number' && Number.isFinite(value)) values.push(value)
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(values.length, 1)
  return { mean, std: Math.sqrt(variance) }
}

function zRow(day: DayRecord, measures: MeasureMeta[], stats: { mean: number; std: number }[]): number[] {
  return measures.map((measure, index) => {
    const value = day.values[measure.key]
    const mean = stats[index]?.mean ?? 0
    const std = stats[index]?.std ?? 0
    const filled = typeof value === 'number' && Number.isFinite(value) ? value : mean
    const scale = std > 1e-9 ? std : Math.max(measure.stdFloor, 1e-6)
    return (filled - mean) / scale
  })
}

function topDrivers(day: DayRecord, measures: MeasureMeta[], stats: { mean: number; std: number }[]): ForestDriver[] {
  const drivers: ForestDriver[] = []
  measures.forEach((measure, index) => {
    const value = day.values[measure.key]
    if (typeof value !== 'number' || !Number.isFinite(value)) return
    const mean = stats[index]?.mean ?? 0
    const std = stats[index]?.std ?? 0
    const scale = std > 1e-9 ? std : Math.max(measure.stdFloor, 1e-6)
    const z = Math.abs((value - mean) / scale)
    drivers.push({
      feature: measure.key,
      label: measure.label,
      domain: measure.domain,
      z: Math.round(z * 100) / 100,
    })
  })
  drivers.sort((a, b) => b.z - a.z)
  return drivers.slice(0, 3)
}

/**
 * Z-score the numeric columns on the reference and score every loaded sol.
 * A loaded file uses PRE / pre-flight when present, otherwise its first 7
 * sols. Pass `trainOn` for a simulated scenario: the whole Nominal series is
 * the reference. A sol is flagged when its 0–100 score is above the 98%
 * quantile of the training scores. Fewer than 10 rows, or fewer than 2
 * numeric columns, returns no score.
 */
export function scoreForest(
  days: DayRecord[],
  measures: MeasureMeta[],
  options: { trainOn?: DayRecord[] } = {},
): ForestReport {
  const wholeNominal = options.trainOn != null
  const source = options.trainOn ?? days
  const { rows: reference, kind } = wholeNominal
    ? { rows: source, kind: 'nominal' as const }
    : forestReference(source)
  const empty: ForestReport = {
    anomaly: null,
    ready: false,
    flaggedSols: 0,
    sols: days.length,
    drivers: [],
    series: [],
    perSol: [],
    referenceSols: reference.length,
    referenceKind: kind,
    threshold: null,
  }
  const selected = presentMeasures(reference, measures)
  if (days.length < FOREST_MIN_ROWS || selected.length < FOREST_MIN_VARIABLES || reference.length === 0) return empty
  const stats = selected.map((measure) => columnStats(reference, measure.key))
  const train = reference.map((day) => zRow(day, selected, stats))
  const matrix = days.map((day) => zRow(day, selected, stats))
  const model = trainIsolationForest(train, {
    trees: FOREST_TREES,
    subsample: FOREST_SUBSAMPLE,
    contamination: FOREST_CONTAMINATION,
    seed: FOREST_SEED,
  })
  const rawScores = isolationScores(model, matrix)
  const trainScores = isolationScores(model, train).map(toHundred).sort((a, b) => a - b)
  const threshold = percentile(trainScores, 100 * (1 - FOREST_CONTAMINATION))
  const series = rawScores.map(toHundred)
  const perSol: ForestSol[] = days.map((day, index) => {
    const anomaly = series[index] ?? 0
    const flagged = anomaly > threshold
    return {
      sol: day.sol,
      day: day.day,
      ...(day.phase ? { phase: day.phase } : {}),
      anomaly,
      flagged,
      drivers: flagged ? topDrivers(day, selected, stats) : [],
    }
  })
  const last = days.length - 1
  return {
    anomaly: series[last] ?? null,
    ready: true,
    flaggedSols: perSol.filter((item) => item.flagged).length,
    sols: days.length,
    drivers: perSol[last]?.drivers ?? [],
    series,
    perSol,
    referenceSols: reference.length,
    referenceKind: kind,
    threshold,
  }
}
