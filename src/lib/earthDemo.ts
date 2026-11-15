import type { DayRecord, MeasureMeta } from './domains.ts'

const HR: MeasureMeta = { key: 'hr', label: 'Heart rate', domain: 'cardio', unit: 'bpm', stdFloor: 3 }
const HRV: MeasureMeta = { key: 'hrv', label: 'HRV', domain: 'cardio', unit: 'ms', stdFloor: 4 }
const SLEEP: MeasureMeta = { key: 'sleep', label: 'Sleep', domain: 'sleep', unit: 'h', stdFloor: 0.35 }

export type EarthDraft = {
  days: DayRecord[]
  measures: MeasureMeta[]
  notes: string[]
  errors: string[]
}

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

function dayStamp(raw: string): string | null {
  const match = raw.match(/(\d{4}-\d{2}-\d{2})/)
  return match?.[1] ?? null
}

function hoursBetween(start: string, end: string): number | null {
  const a = Date.parse(start.replace(' ', 'T').replace(/ ([+-]\d{4})$/, '$1'))
  const b = Date.parse(end.replace(' ', 'T').replace(/ ([+-]\d{4})$/, '$1'))
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null
  return (b - a) / 3_600_000
}

type Bucket = { hr: number[]; hrv: number[]; sleep: number[] }

function finish(byDate: Map<string, Bucket>, notes: string[]): EarthDraft {
  const dates = [...byDate.keys()].sort()
  const days: DayRecord[] = []
  dates.forEach((date, index) => {
    const bucket = byDate.get(date)
    if (!bucket) return
    const values: Record<string, number> = {}
    const day: DayRecord = { sol: index + 1, day: index + 1, date, subject: 'earth-demo', values }
    if (bucket.hr.length) {
      const hr = Math.round(median(bucket.hr))
      values.hr = hr
      day.hr = hr
    }
    if (bucket.hrv.length) {
      const hrv = Math.round((bucket.hrv.reduce((sum, value) => sum + value, 0) / bucket.hrv.length) * 10) / 10
      values.hrv = hrv
      day.hrv = hrv
    }
    if (bucket.sleep.length) {
      const sleep = Math.round(bucket.sleep.reduce((sum, value) => sum + value, 0) * 10) / 10
      values.sleep = sleep
      day.sleep = sleep
    }
    if (Object.keys(values).length) days.push(day)
  })
  if (days.length === 0) {
    return { days: [], measures: [], notes, errors: ['No heart rate, HRV, or sleep records in this Earth export.'] }
  }
  return { days, measures: [HR, HRV, SLEEP], notes, errors: [] }
}

export function parseAppleHealth(xml: string): EarthDraft {
  const notes = ['Earth demo from Apple Health. Only heart rate, HRV, and sleep are read. Other domains stay unmeasured.']
  const buckets = new Map<string, Bucket>()
  const ensure = (date: string) => {
    const found = buckets.get(date)
    if (found) return found
    const created = { hr: [] as number[], hrv: [] as number[], sleep: [] as number[] }
    buckets.set(date, created)
    return created
  }
  const records = xml.matchAll(/<Record\b([^>]*?)\/>/g)
  for (const record of records) {
    const attrs = record[1] ?? ''
    const type = /type="([^"]+)"/.exec(attrs)?.[1] ?? ''
    const start = /startDate="([^"]+)"/.exec(attrs)?.[1] ?? ''
    const end = /endDate="([^"]+)"/.exec(attrs)?.[1] ?? ''
    const value = /value="([^"]+)"/.exec(attrs)?.[1] ?? ''
    const date = dayStamp(start)
    if (!date) continue
    if (type === 'HKQuantityTypeIdentifierHeartRate') {
      const hr = Number(value)
      if (Number.isFinite(hr)) ensure(date).hr.push(hr)
    } else if (type === 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN') {
      const hrv = Number(value)
      if (Number.isFinite(hrv)) ensure(date).hrv.push(hrv)
    } else if (type === 'HKCategoryTypeIdentifierSleepAnalysis' && /Asleep/.test(value) && !/Awake|InBed/.test(value)) {
      const hours = hoursBetween(start, end)
      if (hours != null && hours < 24) ensure(date).sleep.push(hours)
    }
  }
  return finish(buckets, notes)
}

type FitPoint = { date?: string; value?: number }

export function parseGoogleFit(data: unknown): EarthDraft | null {
  if (!data || typeof data !== 'object') return null
  const record = data as { heartRate?: FitPoint[]; hrv?: FitPoint[]; sleepHours?: FitPoint[] }
  if (!record.heartRate && !record.hrv && !record.sleepHours) return null
  const notes = ['Earth demo from a Google Fit summary. Only heart rate, HRV, and sleep hours are read.']
  const buckets = new Map<string, Bucket>()
  const ensure = (date: string) => {
    const found = buckets.get(date)
    if (found) return found
    const created = { hr: [] as number[], hrv: [] as number[], sleep: [] as number[] }
    buckets.set(date, created)
    return created
  }
  const take = (points: FitPoint[] | undefined, into: 'hr' | 'hrv' | 'sleep') => {
    for (const point of points ?? []) {
      if (!point.date || typeof point.value !== 'number') continue
      ensure(point.date)[into].push(point.value)
    }
  }
  take(record.heartRate, 'hr')
  take(record.hrv, 'hrv')
  take(record.sleepHours, 'sleep')
  return finish(buckets, notes)
}
