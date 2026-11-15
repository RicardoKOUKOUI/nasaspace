import { referenceSlice } from './baseline.ts'
import type { DayRecord, MeasureMeta } from './domains.ts'
import { scoreForest, type ForestDriver } from './forest.ts'

/** One cutoff on the forest percentage. Below it: en bonne santé. At or above it: à consulter. */
export const HEALTH_CUTOFF = 40
export const HEALTH_CUTOFF_NAME = 'Seuil 40'

export type HealthDecision = 'en bonne santé' | 'à consulter'

export type WatchPayload = {
  /** Local script shaped like a watch packet. Not a paired Bluetooth device. */
  source: 'local-watch-shape'
  hr: number
  sbp: number
  dbp: number
}

export function healthDecision(percent: number): HealthDecision {
  return percent < HEALTH_CUTOFF ? 'en bonne santé' : 'à consulter'
}

function payloadFrom(day: DayRecord | undefined): WatchPayload | null {
  const hr = day?.values.hr
  const sbp = day?.values.sbp
  const dbp = day?.values.dbp
  if (typeof hr !== 'number' || typeof sbp !== 'number' || typeof dbp !== 'number') return null
  return { source: 'local-watch-shape', hr, sbp, dbp }
}

/** Reference vitals, then the latest training row when it differs. No network and no radio. */
export function localWatchStream(days: DayRecord[]): WatchPayload[] {
  const samples = [payloadFrom(referenceSlice(days)[0]), payloadFrom(days[days.length - 1])]
  const stream: WatchPayload[] = []
  for (const sample of samples) {
    if (!sample) continue
    const seen = stream.some((item) => item.hr === sample.hr && item.sbp === sample.sbp && item.dbp === sample.dbp)
    if (!seen) stream.push(sample)
  }
  return stream
}

/** Heart rate and blood pressure come from the watch packet. Every other column stays on the latest training row. */
export function applyWatch(days: DayRecord[], payload: WatchPayload): DayRecord[] {
  if (days.length === 0) return days
  return days.map((day, index) => {
    if (index !== days.length - 1) return day
    return {
      ...day,
      values: {
        ...day.values,
        hr: payload.hr,
        sbp: payload.sbp,
        dbp: payload.dbp,
      },
    }
  })
}

export function scoreWatch(
  days: DayRecord[],
  measures: MeasureMeta[],
  payload: WatchPayload,
): { anomaly: number | null; drivers: ForestDriver[]; decision: HealthDecision | null } {
  const report = scoreForest(applyWatch(days, payload), measures)
  if (report.anomaly == null) return { anomaly: null, drivers: [], decision: null }
  return {
    anomaly: report.anomaly,
    drivers: report.drivers,
    decision: healthDecision(report.anomaly),
  }
}
