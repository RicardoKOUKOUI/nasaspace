import type { DayRecord, MeasureMeta } from './domains.ts'

export const REFERENCE_SOLS = 14
export const ROLLING_SOLS = 7

/** How many opening sols are the reference when the file has no PRE phase. */
export function unlabeledReferenceCount(length: number): number {
  if (length <= 1) return length
  const later = Math.ceil(length / 2)
  return Math.min(REFERENCE_SOLS, length - later)
}

export function referenceSlice(days: DayRecord[]): DayRecord[] {
  const pre = days.filter((day) => typeof day.phase === 'string' && /^PRE/i.test(day.phase))
  if (pre.length > 0) return pre
  return days.slice(0, unlabeledReferenceCount(days.length))
}

export function columnStats(values: number[]): { mean: number; std: number } | null {
  if (values.length === 0) return null
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return { mean, std: Math.sqrt(variance) }
}

export function valuesOf(days: DayRecord[], key: string): number[] {
  const values: number[] = []
  for (const day of days) {
    const value = day.values[key]
    if (typeof value === 'number' && Number.isFinite(value)) values.push(value)
  }
  return values
}

/**
 * |z| against the person's own baseline.
 * Uses the rolling mean and std of the previous sols when at least two exist.
 * Otherwise uses the reference window (PRE_TEST when the file has it, else the first sols).
 * A missing value stays null. The NASA cruise constants are not used here.
 */
export function personalZ(days: DayRecord[], index: number, measure: MeasureMeta): number | null {
  const value = days[index]?.values[measure.key]
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rolling = rollingBaseline(days, index, measure.key)
  if (rolling && rolling.n >= 2) {
    return Math.abs(value - rolling.mean) / Math.max(rolling.std, measure.stdFloor)
  }
  const others = referenceSlice(days).filter((day) => day !== days[index])
  const pool = others.length > 0 ? others : referenceSlice(days)
  const stats = columnStats(valuesOf(pool, measure.key))
  if (!stats) return null
  return Math.abs(value - stats.mean) / Math.max(stats.std, measure.stdFloor)
}

/** |z| against the person's reference window. Missing value → null, never 0. */
export function referenceZ(
  days: DayRecord[],
  index: number,
  measure: MeasureMeta,
): number | null {
  const day = days[index]
  const value = day?.values[measure.key]
  if (typeof value !== 'number') return null
  const stats = columnStats(valuesOf(referenceSlice(days), measure.key))
  if (!stats) return null
  return Math.abs(value - stats.mean) / Math.max(stats.std, measure.stdFloor)
}

/** Mean and std of the previous 7 sols. No previous sol → null. */
export function rollingBaseline(
  days: DayRecord[],
  index: number,
  key: string,
): { mean: number; std: number; n: number } | null {
  const previous = days.slice(Math.max(0, index - ROLLING_SOLS), index)
  const values = valuesOf(previous, key)
  const stats = columnStats(values)
  if (!stats) return null
  return { ...stats, n: values.length }
}

export type DomainPeak = { domain: string; z: number; key: string }

export function domainPeaks(days: DayRecord[], index: number, measures: MeasureMeta[]): DomainPeak[] {
  const best = new Map<string, DomainPeak>()
  for (const measure of measures) {
    const z = referenceZ(days, index, measure)
    if (z == null) continue
    const current = best.get(measure.domain)
    if (!current || z > current.z) best.set(measure.domain, { domain: measure.domain, z, key: measure.key })
  }
  return [...best.values()]
}
