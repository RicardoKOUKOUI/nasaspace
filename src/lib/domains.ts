export const DOMAINS = [
  { id: 'cardio', label: 'Cardiovascular' },
  { id: 'muscle', label: 'Bone & muscle' },
  { id: 'sleep', label: 'Sleep' },
  { id: 'neuro', label: 'Sensorimotor' },
  { id: 'immune', label: 'Immune' },
  { id: 'radiation', label: 'Radiation' },
  { id: 'behavior', label: 'Behavior' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'renal', label: 'Renal' },
  { id: 'environment', label: 'Cabin' },
] as const

export type DomainId = (typeof DOMAINS)[number]['id']

export type MeasureMeta = {
  key: string
  label: string
  domain: DomainId
  unit?: string
  stdFloor: number
}

export type DayRecord = {
  sol: number
  day: number
  date?: string
  subject: string
  /** Study phase when the file has one, such as PRE_TEST. Not a measure. */
  phase?: string
  values: Record<string, number>
  hr?: number
  hrv?: number
  sbp?: number
  dbp?: number
  aredMin?: number
  bmd?: number
  dose?: number
  cumDose?: number
  crp?: number
  sleep?: number
  mood?: number
  focus?: number
  fatigue?: number
}

export const CLINICAL_KEYS = [
  'hr',
  'hrv',
  'sbp',
  'dbp',
  'aredMin',
  'bmd',
  'dose',
  'cumDose',
  'crp',
  'sleep',
  'mood',
  'focus',
  'fatigue',
] as const

export type ClinicalKey = (typeof CLINICAL_KEYS)[number]
