import { columnStats, referenceSlice, valuesOf } from './baseline.ts'
import { dashboardGroup, DASHBOARD_LABELS, DASHBOARD_ORDER } from './domainView.ts'
import type { DayRecord, MeasureMeta } from './domains.ts'
import { scoreForest, type ForestDriver } from './forest.ts'

export type MetricId = (typeof DASHBOARD_ORDER)[number]

export type SeriesInterval = {
  id: MetricId
  label: string
  key: string
  measure: string
  unit: string
  low: number
  typical: number
  high: number
}

export type FeelingModel = {
  id: MetricId
  label: string
  subject: string
  days: DayRecord[]
  measures: MeasureMeta[]
  interval: SeriesInterval
}

export type FeelingScore = {
  anomaly: number | null
  drivers: ForestDriver[]
}

/** Reference window when it has a spread, otherwise the whole series. NASA set-points are not used. */
function trainingValues(days: DayRecord[], key: string): number[] {
  const reference = valuesOf(referenceSlice(days), key)
  if (reference.length >= 2 && new Set(reference).size >= 2) return reference
  return valuesOf(days, key)
}

function percentile(sorted: number[], percent: number): number {
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

function bandOf(values: number[]): { low: number; typical: number; high: number } | null {
  if (values.length === 0) return null
  const sorted = values.slice().sort((a, b) => a - b)
  const low = sorted[0] ?? 0
  const high = sorted[sorted.length - 1] ?? low
  return { low, typical: percentile(sorted, 50), high }
}

function measuresFor(measures: MeasureMeta[], id: MetricId): MeasureMeta[] {
  return measures.filter((measure) => dashboardGroup(measure.domain) === id)
}

function chooseMeasure(days: DayRecord[], measures: MeasureMeta[]): MeasureMeta | null {
  let best: MeasureMeta | null = null
  let bestCount = -1
  let bestVariance = -1
  for (const measure of measures) {
    const values = trainingValues(days, measure.key)
    if (values.length === 0) continue
    const stats = columnStats(values)
    const variance = stats ? stats.std ** 2 : 0
    const span = Math.max(...values) - Math.min(...values)
    const rank = span * 1000 + variance
    if (rank > bestVariance || (rank === bestVariance && values.length > bestCount)) {
      best = measure
      bestCount = values.length
      bestVariance = rank
    }
  }
  return best
}

/** Low, typical, and high from the training distribution of this metric's series. */
export function seriesInterval(days: DayRecord[], measures: MeasureMeta[], id: MetricId): SeriesInterval | null {
  const chosen = chooseMeasure(days, measuresFor(measures, id))
  if (!chosen) return null
  const band = bandOf(trainingValues(days, chosen.key))
  if (!band) return null
  return {
    id,
    label: DASHBOARD_LABELS[id],
    key: chosen.key,
    measure: chosen.label,
    unit: chosen.unit ?? '',
    low: band.low,
    typical: band.typical,
    high: band.high,
  }
}

export function metricReadings(days: DayRecord[], measures: MeasureMeta[], id: MetricId): MetricReading[] {
  const readings: MetricReading[] = []
  for (const measure of measuresFor(measures, id)) {
    let value: number | null = null
    for (let index = days.length - 1; index >= 0; index -= 1) {
      const current = days[index]?.values[measure.key]
      if (typeof current === 'number' && Number.isFinite(current)) {
        value = current
        break
      }
    }
    const band = bandOf(trainingValues(days, measure.key))
    if (value == null || !band) continue
    readings.push({
      key: measure.key,
      label: measure.label,
      unit: measure.unit ?? '',
      value,
      low: band.low,
      typical: band.typical,
      high: band.high,
    })
  }
  return readings
}

export type MetricReading = {
  key: string
  label: string
  unit: string
  value: number
  low: number
  typical: number
  high: number
}

export function feelingModels(measures: MeasureMeta[], days: DayRecord[]): FeelingModel[] {
  if (days.length === 0) return []
  const models: FeelingModel[] = []
  for (const id of DASHBOARD_ORDER) {
    const interval = seriesInterval(days, measures, id)
    if (!interval) continue
    models.push({
      id,
      label: DASHBOARD_LABELS[id],
      subject: days[0]?.subject ?? '',
      days,
      measures,
      interval,
    })
  }
  return models
}

function position(interval: SeriesInterval, value: number): number {
  if (interval.high === interval.low) return 0.5
  const clamped = Math.min(interval.high, Math.max(interval.low, value))
  if (clamped <= interval.typical) {
    const span = interval.typical - interval.low
    if (span === 0) return 0.5
    return 0.5 * ((clamped - interval.low) / span)
  }
  const span = interval.high - interval.typical
  if (span === 0) return 0.5
  return 0.5 + 0.5 * ((clamped - interval.typical) / span)
}

function mix(band: { low: number; typical: number; high: number }, t: number): number {
  if (t <= 0.5) return band.low + (band.typical - band.low) * (t / 0.5)
  return band.typical + (band.high - band.typical) * ((t - 0.5) / 0.5)
}

/** Copy the last sol and set this metric from the astronaut's value. Earlier sols stay as recorded. */
export function applyFeeling(
  days: DayRecord[],
  measures: MeasureMeta[],
  id: MetricId,
  value: number,
): DayRecord[] {
  const interval = seriesInterval(days, measures, id)
  if (!interval || days.length === 0) return days
  const t = position(interval, value)
  const next = days.map((day, index) => (
    index === days.length - 1 ? { ...day, values: { ...day.values } } : day
  ))
  const last = next[next.length - 1]
  if (!last) return days
  for (const measure of measuresFor(measures, id)) {
    const band = bandOf(trainingValues(days, measure.key))
    if (!band) continue
    last.values[measure.key] = mix(band, t)
  }
  return next
}

/** Train on the reference period, then score the astronaut's value on the latest sol. */
export function scoreFeeling(
  days: DayRecord[],
  measures: MeasureMeta[],
  id: MetricId,
  value: number,
): FeelingScore {
  const report = scoreForest(applyFeeling(days, measures, id, value), measures)
  return { anomaly: report.anomaly, drivers: report.drivers }
}

export function clampFeeling(interval: SeriesInterval, value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return interval.typical
  return Math.min(interval.high, Math.max(interval.low, value))
}
