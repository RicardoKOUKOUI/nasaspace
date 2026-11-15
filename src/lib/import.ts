import type { ClinicalKey, DayRecord, DomainId, MeasureMeta } from './domains.ts'
import { CLINICAL_KEYS } from './domains.ts'
import { parseAppleHealth, parseGoogleFit } from './earthDemo.ts'

export type ImportResult = {
  ok: boolean
  label: string
  days: DayRecord[]
  measures: MeasureMeta[]
  subjects: string[]
  errors: string[]
  unassigned: string[]
  duplicates: string[]
  rejectedCells: string[]
  notes: string[]
}

type Mapped = {
  key: string
  label: string
  domain: DomainId
  unit?: string
  stdFloor: number
  min?: number
  max?: number
}

const CLINICAL = new Set<string>(CLINICAL_KEYS)

const MAPPED: Record<string, Mapped> = {
  hr: { key: 'hr', label: 'Heart rate', domain: 'cardio', unit: 'bpm', stdFloor: 3, min: 30, max: 220 },
  hr_bpm: { key: 'hr', label: 'Heart rate', domain: 'cardio', unit: 'bpm', stdFloor: 3, min: 30, max: 220 },
  hrv: { key: 'hrv', label: 'HRV', domain: 'cardio', unit: 'ms', stdFloor: 4, min: 0, max: 300 },
  hrv_ms: { key: 'hrv', label: 'HRV', domain: 'cardio', unit: 'ms', stdFloor: 4, min: 0, max: 300 },
  sbp: { key: 'sbp', label: 'Systolic', domain: 'cardio', unit: 'mmHg', stdFloor: 4, min: 60, max: 250 },
  sbp_mmhg: { key: 'sbp', label: 'Systolic', domain: 'cardio', unit: 'mmHg', stdFloor: 4, min: 60, max: 250 },
  dbp: { key: 'dbp', label: 'Diastolic', domain: 'cardio', unit: 'mmHg', stdFloor: 4, min: 30, max: 150 },
  dbp_mmhg: { key: 'dbp', label: 'Diastolic', domain: 'cardio', unit: 'mmHg', stdFloor: 4, min: 30, max: 150 },
  aredMin: { key: 'aredMin', label: 'ARED', domain: 'muscle', unit: 'min', stdFloor: 6, min: 0, max: 300 },
  ared_min: { key: 'aredMin', label: 'ARED', domain: 'muscle', unit: 'min', stdFloor: 6, min: 0, max: 300 },
  bmd: { key: 'bmd', label: 'BMD', domain: 'muscle', unit: '% preflight', stdFloor: 0.2, min: 50, max: 120 },
  bmd_pct_preflight: { key: 'bmd', label: 'BMD', domain: 'muscle', unit: '% preflight', stdFloor: 0.2, min: 50, max: 120 },
  dose: { key: 'dose', label: 'Dose', domain: 'radiation', unit: 'mSv', stdFloor: 0.25, min: 0, max: 500 },
  dose_msv: { key: 'dose', label: 'Dose', domain: 'radiation', unit: 'mSv', stdFloor: 0.25, min: 0, max: 500 },
  cumDose: { key: 'cumDose', label: 'Cumulative dose', domain: 'radiation', unit: 'mSv', stdFloor: 0.25, min: 0, max: 5000 },
  cum_dose_msv: { key: 'cumDose', label: 'Cumulative dose', domain: 'radiation', unit: 'mSv', stdFloor: 0.25, min: 0, max: 5000 },
  crp: { key: 'crp', label: 'CRP', domain: 'immune', unit: 'mg/L', stdFloor: 0.5, min: 0, max: 50 },
  crp_mg_l: { key: 'crp', label: 'CRP', domain: 'immune', unit: 'mg/L', stdFloor: 0.5, min: 0, max: 50 },
  sleep: { key: 'sleep', label: 'Sleep', domain: 'sleep', unit: 'h', stdFloor: 0.35, min: 0, max: 24 },
  sleep_h: { key: 'sleep', label: 'Sleep', domain: 'sleep', unit: 'h', stdFloor: 0.35, min: 0, max: 24 },
  mood: { key: 'mood', label: 'Mood', domain: 'behavior', unit: '1–5', stdFloor: 0.8, min: 1, max: 5 },
  mood_1_5: { key: 'mood', label: 'Mood', domain: 'behavior', unit: '1–5', stdFloor: 0.8, min: 1, max: 5 },
  focus: { key: 'focus', label: 'Focus', domain: 'behavior', unit: '1–5', stdFloor: 0.8, min: 1, max: 5 },
  focus_1_5: { key: 'focus', label: 'Focus', domain: 'behavior', unit: '1–5', stdFloor: 0.8, min: 1, max: 5 },
  fatigue: { key: 'fatigue', label: 'Fatigue', domain: 'behavior', unit: '1–5', stdFloor: 0.8, min: 1, max: 5 },
  fatigue_1_5: { key: 'fatigue', label: 'Fatigue', domain: 'behavior', unit: '1–5', stdFloor: 0.8, min: 1, max: 5 },
  HR_SAHC_pre_run: { key: 'hr', label: 'Heart rate', domain: 'cardio', unit: 'bpm', stdFloor: 3, min: 30, max: 220 },
  SBP_SAHC_pre_run: { key: 'sbp', label: 'Systolic', domain: 'cardio', unit: 'mmHg', stdFloor: 4, min: 60, max: 250 },
  DBP_SAHC_pre_run: { key: 'dbp', label: 'Diastolic', domain: 'cardio', unit: 'mmHg', stdFloor: 4, min: 30, max: 150 },
  sleep_duration_h: { key: 'sleep', label: 'Sleep', domain: 'sleep', unit: 'h', stdFloor: 0.35, min: 0, max: 24 },
  TOT_BMD: { key: 'totBmd', label: 'Spine BMD', domain: 'muscle', unit: 'g/cm²', stdFloor: 0.01 },
  'Spine T': { key: 'spineT', label: 'Spine T', domain: 'muscle', unit: 'T-score', stdFloor: 0.1 },
  'Spine Z': { key: 'spineZ', label: 'Spine Z', domain: 'muscle', unit: 'Z-score', stdFloor: 0.1 },
  'Min. Time': { key: 'minTime', label: 'Min time', domain: 'neuro', stdFloor: 0.5 },
  'Max. Time': { key: 'maxTime', label: 'Max time', domain: 'neuro', stdFloor: 0.5 },
  'Avg. Time': { key: 'avgTime', label: 'Average time', domain: 'neuro', stdFloor: 0.5 },
  'Obstacles/No. Trials': { key: 'obstacles', label: 'Obstacles / trials', domain: 'neuro', stdFloor: 0.5 },
  Ataxia: { key: 'ataxia', label: 'Ataxia', domain: 'neuro', stdFloor: 0.2 },
  'Stdev Time': { key: 'stdevTime', label: 'Time SD', domain: 'neuro', stdFloor: 0.1 },
  SEM: { key: 'semTime', label: 'Time SEM', domain: 'neuro', stdFloor: 0.1 },
  CI: { key: 'ciTime', label: 'Time CI', domain: 'neuro', stdFloor: 0.1 },
  '%CMV Tet': { key: 'cmvTet', label: 'CMV tetramer', domain: 'immune', unit: '%', stdFloor: 0.5 },
  '%EBV Tet': { key: 'ebvTet', label: 'EBV tetramer', domain: 'immune', unit: '%', stdFloor: 0.5 },
  '%IFN-g CMV': { key: 'ifnCmv', label: 'IFN-g CMV', domain: 'immune', unit: '%', stdFloor: 0.5 },
  '%IFN-g EBV': { key: 'ifnEbv', label: 'IFN-g EBV', domain: 'immune', unit: '%', stdFloor: 0.5 },
  'Cortisol (ug/dL)': { key: 'cortisol', label: 'Cortisol', domain: 'immune', unit: 'ug/dL', stdFloor: 1 },
  VCA: { key: 'vca', label: 'VCA', domain: 'immune', stdFloor: 1 },
  EA: { key: 'ea', label: 'EA', domain: 'immune', stdFloor: 1 },
  CMV: { key: 'cmv', label: 'CMV', domain: 'immune', stdFloor: 1 },
  'EBV DNA*': { key: 'ebvDna', label: 'EBV DNA', domain: 'immune', stdFloor: 1 },
  Protein: { key: 'protein', label: 'Protein', domain: 'nutrition', unit: 'g', stdFloor: 1 },
  Fat: { key: 'fat', label: 'Fat', domain: 'nutrition', unit: 'g', stdFloor: 1 },
  Carbohydrate: { key: 'carbohydrate', label: 'Carbohydrate', domain: 'nutrition', unit: 'g', stdFloor: 1 },
  Fiber: { key: 'fiber', label: 'Fiber', domain: 'nutrition', unit: 'g', stdFloor: 1 },
  'Time to max concentration (minutes)': { key: 'tmax', label: 'Time to max', domain: 'nutrition', unit: 'min', stdFloor: 1 },
  'Max concentration (ug/mL)': { key: 'cmax', label: 'Max concentration', domain: 'nutrition', unit: 'ug/mL', stdFloor: 0.5 },
  'Half life (minutes)': { key: 'halfLife', label: 'Half life', domain: 'nutrition', unit: 'min', stdFloor: 1 },
  'Area under curve': { key: 'auc', label: 'Area under curve', domain: 'nutrition', stdFloor: 10 },
  'Volume of distribution (L)': { key: 'vd', label: 'Volume of distribution', domain: 'nutrition', unit: 'L', stdFloor: 1 },
  'Clearance (L/min)': { key: 'clearance', label: 'Clearance', domain: 'nutrition', unit: 'L/min', stdFloor: 0.01 },
  'Area under curve (min/L)': { key: 'aucNorm', label: 'AUC / dose', domain: 'nutrition', unit: 'min/L', stdFloor: 0.1 },
  'Clearance, predicted (L/min)': { key: 'clearancePred', label: 'Predicted clearance', domain: 'nutrition', unit: 'L/min', stdFloor: 0.01 },
  'Serum Albumin G/DL': { key: 'albumin', label: 'Serum albumin', domain: 'renal', unit: 'g/dL', stdFloor: 0.1 },
  'Creatinine Clearance ML/MIN': { key: 'creatinineClearance', label: 'Creatinine clearance', domain: 'renal', unit: 'mL/min', stdFloor: 1 },
}

const STRENGTH = [
  'KES0', 'KFS0', 'KES60', 'KFS60', 'KES120', 'KFS120', 'KES180', 'KFS180', 'KES300', 'KFS300', 'KES400', 'KFS400',
  'KEE180', 'KFE180', 'APFCS0', 'ADFCS0', 'APFCS30', 'ADFCS30', 'APFCS60', 'ADFCS60', 'APFCS120', 'ADFCS120',
  'APFCS180', 'ADFCS180', 'APFCS300', 'ADFCS300', 'APFES30', 'ADFES30', 'TES60', 'TFS60',
]

for (const name of STRENGTH) {
  MAPPED[name] = { key: name.toLowerCase(), label: name, domain: 'muscle', unit: 'Nm', stdFloor: 5 }
}

const DATE_HEADERS = new Set(['SCAN_DATE', 'Date', 'date', 'timestamp', 'effective_time_frame'])
const SOL_HEADERS = new Set(['BR_DAY', 'BR_Day', 'sol', 'Mission Number', 'Day'])
const SUBJECT_HEADERS = new Set(['SUBJECT', 'Subject', 'subject', 'Crewman', 'instrument_id'])
const SKIP_HEADERS = new Set([
  'scenario', 'day', 'ID', 'Campaign', 'CAMPAIGN', 'TEST_PHASE', 'Test_Phase', 'Group', 'Sex',
  'A2_Status', 'Flight', 'FLIGHT', 'Duration Days', 'Trial_Type', 'Muscle', 'Rep', 'SubRep',
])

const IMMUNE_SOL: Record<string, number> = {
  'L-10': -10,
  'L-2': -2,
  '28/45': 28,
  '60/83': 60,
  '90': 90,
  'R+5/14': 5,
}

const IMMUNE_PHASE: Record<string, string> = {
  'L-10': 'PRE_TEST',
  'L-2': 'PRE_TEST',
  '28/45': 'IN_TEST',
  '60/83': 'IN_TEST',
  '90': 'IN_TEST',
  'R+5/14': 'POST_TEST',
}

type Draft = {
  subject: string
  date?: string
  sol: number | null
  phase?: string
  values: Record<string, number>
  line: number
}

function phaseRank(phase?: string): number {
  if (!phase) return 1
  if (/^PRE/i.test(phase)) return 0
  if (/^POST/i.test(phase)) return 2
  return 1
}

function clean(value: string): string {
  return value.replace(/\u00a0/g, ' ').trim()
}

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const source = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() !== '' && !line.trim().startsWith('#')).join('\n')
  const table: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"'
          index += 1
        } else quoted = false
      } else cell += char ?? ''
    } else if (char === '"') quoted = true
    else if (char === ',') {
      row.push(clean(cell))
      cell = ''
    } else if (char === '\n') {
      row.push(clean(cell))
      table.push(row)
      row = []
      cell = ''
    } else cell += char ?? ''
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(clean(cell))
    table.push(row)
  }
  const headers = table[0] ?? []
  return { headers, rows: table.slice(1).filter((line) => line.some((item) => item !== '')) }
}

export function parseNumber(raw: string): number | null {
  const text = clean(raw)
  if (!text || /^(na|n\/a|nd|nd\*)$/i.test(text) || text === '-' || text === '—') return null
  const normalized = /^-?\d+,\d+$/.test(text) ? text.replace(',', '.') : text
  if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(normalized)) return null
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

export function parseDate(raw: string): string | null {
  const text = clean(raw)
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(text)
  if (iso?.[1]) return iso[1]
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text)
  if (!slash?.[1] || !slash[2] || !slash[3]) return null
  return `${slash[3]}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`
}

function metDay(raw: string): number | null {
  const match = /^(\d+)\s*[•·:./]\s*\d+/.exec(clean(raw))
  if (!match?.[1]) return null
  return Number(match[1])
}

function slug(name: string): string {
  const text = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (!text) return 'measure'
  return /^[0-9]/.test(text) ? `m_${text}` : text
}

function emptyResult(label: string, errors: string[], notes: string[] = []): ImportResult {
  return {
    ok: false,
    label,
    days: [],
    measures: [],
    subjects: [],
    errors,
    unassigned: [],
    duplicates: [],
    rejectedCells: [],
    notes,
  }
}

function attachClinical(day: DayRecord): void {
  for (const key of CLINICAL_KEYS) {
    const value = day.values[key]
    if (typeof value === 'number') day[key] = value
  }
}

function finalize(label: string, drafts: Draft[], measures: MeasureMeta[], notes: string[], unassigned: string[], rejected: string[]): ImportResult {
  if (drafts.length === 0) return emptyResult(label, ['No row has a date or a sol.'], notes)
  const groups = new Map<string, Draft[]>()
  for (const draft of drafts) {
    const list = groups.get(draft.subject) ?? []
    list.push(draft)
    groups.set(draft.subject, list)
  }
  const days: DayRecord[] = []
  const duplicates: string[] = []
  for (const [subject, list] of groups) {
    list.sort((a, b) => {
      const rank = phaseRank(a.phase) - phaseRank(b.phase)
      if (rank) return rank
      if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1
      return (a.sol ?? 0) - (b.sol ?? 0)
    })
    const kept = new Map<string, Draft>()
    for (const draft of list) {
      const key = draft.date ? `${draft.phase ?? ''}|${draft.date}` : `sol:${draft.phase ?? ''}:${draft.sol}`
      if (kept.has(key)) duplicates.push(`${subject || 'row'} ${key} (line ${draft.line})`)
      kept.set(key, draft)
    }
    let index = 1
    for (const draft of kept.values()) {
      const sol = draft.sol ?? index
      const day: DayRecord = {
        sol,
        day: index,
        subject,
        values: { ...draft.values },
      }
      if (draft.date) day.date = draft.date
      if (draft.phase) day.phase = draft.phase
      attachClinical(day)
      days.push(day)
      index += 1
    }
  }
  // Cumulative dose must follow time inside each subject. Recompute now that order is final.
  const bySubject = new Map<string, DayRecord[]>()
  for (const day of days) {
    const list = bySubject.get(day.subject) ?? []
    list.push(day)
    bySubject.set(day.subject, list)
  }
  for (const list of bySubject.values()) {
    let running = 0
    for (const day of list) {
      if (typeof day.values.cumDose === 'number') {
        running = day.values.cumDose
        day.cumDose = day.values.cumDose
      } else if (typeof day.values.dose === 'number') {
        running += day.values.dose
        day.values.cumDose = running
        day.cumDose = running
      }
    }
  }
  const subjects = [...groups.keys()]
  return {
    ok: true,
    label,
    days,
    measures,
    subjects,
    errors: [],
    unassigned,
    duplicates,
    rejectedCells: rejected,
    notes,
  }
}

function measureFrom(mapped: Mapped): MeasureMeta {
  return {
    key: mapped.key,
    label: mapped.label,
    domain: mapped.domain,
    unit: mapped.unit,
    stdFloor: mapped.stdFloor,
  }
}

function pushValue(draft: Draft, mapped: Mapped, value: number, line: number, rejected: string[]): void {
  if (mapped.min != null && mapped.max != null && (value < mapped.min || value > mapped.max)) {
    rejected.push(`Line ${line}: ${mapped.label} ${value} is outside ${mapped.min}–${mapped.max}`)
    return
  }
  draft.values[mapped.key] = value
}

function genericTable(headers: string[], rows: string[][], label: string): ImportResult {
  const notes: string[] = []
  const unassigned: string[] = []
  const rejected: string[] = []
  const measures = new Map<string, MeasureMeta>()
  let dateIndex = -1
  let solIndex = -1
  let subjectIndex = -1
  let phaseIndex = -1
  headers.forEach((header, index) => {
    if (DATE_HEADERS.has(header) && dateIndex < 0) dateIndex = index
    if (SOL_HEADERS.has(header) && solIndex < 0) solIndex = index
    if (SUBJECT_HEADERS.has(header) && subjectIndex < 0) subjectIndex = index
    if ((header === 'Test_Phase' || header === 'TEST_PHASE') && phaseIndex < 0) phaseIndex = index
  })
  const columns: { index: number; mapped: Mapped }[] = []
  headers.forEach((header, index) => {
    if (index === dateIndex || index === solIndex || index === subjectIndex || SKIP_HEADERS.has(header)) return
    const mapped = MAPPED[header]
    if (!mapped) {
      if (!unassigned.includes(header)) unassigned.push(header)
      return
    }
    columns.push({ index, mapped })
    measures.set(mapped.key, measureFrom(mapped))
  })
  const drafts: Draft[] = []
  rows.forEach((row, rowIndex) => {
    const line = rowIndex + 2
    const date = dateIndex >= 0 ? parseDate(row[dateIndex] ?? '') : null
    const solRaw = solIndex >= 0 ? parseNumber(row[solIndex] ?? '') : null
    const sol = solRaw == null ? null : Math.trunc(solRaw)
    if (!date && sol == null) return
    if (solIndex >= 0 && (row[solIndex] ?? '') !== '' && solRaw != null && solRaw !== sol) {
      rejected.push(`Line ${line}: sol must be a whole number`)
      return
    }
    const draft: Draft = {
      subject: subjectIndex >= 0 ? (row[subjectIndex] ?? '') : '',
      sol,
      values: {},
      line,
    }
    if (date) draft.date = date
    const phase = phaseIndex >= 0 ? (row[phaseIndex] ?? '') : ''
    if (phase) draft.phase = phase
    for (const column of columns) {
      const raw = row[column.index] ?? ''
      if (!raw) continue
      const value = parseNumber(raw)
      if (value == null) continue
      pushValue(draft, column.mapped, value, line, rejected)
    }
    if (Object.keys(draft.values).length === 0 && !date && sol == null) return
    drafts.push(draft)
  })
  if (SOL_HEADERS.has('Mission Number') && headers.includes('Mission Number')) {
    notes.push('Apollo intake uses Mission Number as the sol. One row is one crew role on one mission, not a flight day.')
  }
  return finalize(label, drafts, [...measures.values()], notes, unassigned, rejected)
}

function reshapeImmune(headers: string[], rows: string[][], label: string): ImportResult {
  const subjectIndex = headers.indexOf('SUBJECT')
  const points = headers.filter((header) => header in IMMUNE_SOL)
  const measure: MeasureMeta = { key: 'cd8Cd69', label: 'CD8+ CD69+', domain: 'immune', stdFloor: 0.5 }
  const drafts: Draft[] = []
  rows.forEach((row, rowIndex) => {
    const subject = row[subjectIndex] ?? ''
    for (const header of points) {
      const value = parseNumber(row[headers.indexOf(header)] ?? '')
      if (value == null) continue
      drafts.push({
        subject,
        sol: IMMUNE_SOL[header] ?? null,
        phase: IMMUNE_PHASE[header],
        values: { cd8Cd69: value },
        line: rowIndex + 2,
      })
    }
  })
  const notes = [
    'CD8+ CD69+ comes from the file name. Timepoint columns were turned into sols. L-10 and L-2 are the pre-test reference. 28/45, 60/83, and R+5/14 keep the first day written in the header.',
  ]
  return finalize(label, drafts, [measure], notes, [], [])
}

const REFLEX_COLUMNS = [
  { header: 'FSR_Torque', prefix: 'fsrTorque', label: 'FSR torque', stdFloor: 0.5 },
  { header: 'FSR_Latency', prefix: 'fsrLatency', label: 'FSR latency', stdFloor: 1 },
  { header: 'FSR_Amp', prefix: 'fsrAmp', label: 'FSR amplitude', stdFloor: 0.01 },
  { header: 'RMS', prefix: 'rms', label: 'RMS', stdFloor: 0.01 },
] as const

function reshapeReflex(headers: string[], rows: string[][], label: string): ImportResult {
  const subjectIndex = headers.indexOf('Subject')
  const dayIndex = headers.indexOf('BR_Day')
  const dateIndex = headers.indexOf('Date')
  const muscleIndex = headers.indexOf('Muscle')
  const phaseIndex = headers.indexOf('Test_Phase')
  const columns = REFLEX_COLUMNS.flatMap((column) => {
    const index = headers.indexOf(column.header)
    return index < 0 ? [] : [{ ...column, index }]
  })
  const groups = new Map<string, Draft>()
  const measures = new Map<string, MeasureMeta>()
  rows.forEach((row, rowIndex) => {
    const subject = row[subjectIndex] ?? ''
    const solRaw = parseNumber(row[dayIndex] ?? '')
    if (solRaw == null) return
    const sol = Math.trunc(solRaw)
    const phase = phaseIndex >= 0 ? (row[phaseIndex] ?? '') : ''
    const muscle = row[muscleIndex] ?? 'muscle'
    const id = `${subject}|${phase}|${sol}`
    const draft = groups.get(id) ?? {
      subject,
      sol,
      date: parseDate(row[dateIndex] ?? '') ?? undefined,
      ...(phase ? { phase } : {}),
      values: {},
      line: rowIndex + 2,
    }
    for (const column of columns) {
      const value = parseNumber(row[column.index] ?? '')
      if (value == null) continue
      const key = `${column.prefix}_${slug(muscle)}`
      const bucket = draft.values[`${key}__sum`]
      const count = draft.values[`${key}__n`]
      draft.values[`${key}__sum`] = (bucket ?? 0) + value
      draft.values[`${key}__n`] = (count ?? 0) + 1
      measures.set(key, {
        key,
        label: `${column.label} ${muscle}`,
        domain: 'neuro',
        stdFloor: column.stdFloor,
      })
    }
    groups.set(id, draft)
  })
  const drafts: Draft[] = []
  for (const draft of groups.values()) {
    const values: Record<string, number> = {}
    for (const key of measures.keys()) {
      const count = draft.values[`${key}__n`]
      const sum = draft.values[`${key}__sum`]
      if (count && sum != null) values[key] = sum / count
    }
    drafts.push({ ...draft, values })
  }
  const used = new Set(['Subject', 'BR_Day', 'Date', 'Muscle', 'Test_Phase', 'ID', 'Campaign', 'Trial_Type', ...REFLEX_COLUMNS.map((column) => column.header)])
  const unassigned = headers.filter((header) => !used.has(header))
  return finalize(
    label,
    drafts,
    [...measures.values()],
    ['Reflex trials on the same phase and bed-rest day are averaged per muscle. FSR torque, latency, amplitude, and RMS are the numeric series. The Amp column is the stimulus setting and is not scored. A blank cell stays missing.'],
    unassigned,
    [],
  )
}

function reshapeRad(headers: string[], rows: string[][], label: string): ImportResult {
  const timeIndex = headers.indexOf('timestamp')
  const instrumentIndex = headers.indexOf('instrument_id')
  const doseIndex = headers.indexOf('absorbed_dose_rate')
  const equivIndex = headers.indexOf('dose_equivalent_rate')
  const groups = new Map<string, { dose: number[]; equiv: number[]; subject: string; date: string }>()
  rows.forEach((row) => {
    const date = parseDate(row[timeIndex] ?? '')
    if (!date) return
    const subject = row[instrumentIndex] ?? ''
    const id = `${subject}|${date}`
    const group = groups.get(id) ?? { dose: [], equiv: [], subject, date }
    const dose = parseNumber(row[doseIndex] ?? '')
    const equiv = equivIndex >= 0 ? parseNumber(row[equivIndex] ?? '') : null
    if (dose != null) group.dose.push(dose)
    if (equiv != null) group.equiv.push(equiv)
    groups.set(id, group)
  })
  const drafts: Draft[] = []
  let line = 2
  for (const group of groups.values()) {
    const values: Record<string, number> = {}
    if (group.dose.length) values.absorbedDoseRate = group.dose.reduce((sum, value) => sum + value, 0) / group.dose.length
    if (group.equiv.length) values.doseEquivalentRate = group.equiv.reduce((sum, value) => sum + value, 0) / group.equiv.length
    drafts.push({ subject: group.subject, date: group.date, sol: null, values, line })
    line += 1
  }
  const measures: MeasureMeta[] = [
    { key: 'absorbedDoseRate', label: 'Absorbed dose rate', domain: 'radiation', stdFloor: 0.2 },
    { key: 'doseEquivalentRate', label: 'Dose equivalent rate', domain: 'radiation', stdFloor: 0.2 },
  ]
  return finalize(
    label,
    drafts,
    measures.filter((measure) => drafts.some((draft) => typeof draft.values[measure.key] === 'number')),
    ['ISS instrument rows are averaged to one calendar day. The rate is not the cruise dose in mSv, so the clinical dose rule stays off. The unit is not in the CSV header.'],
    [],
    [],
  )
}

function reshapeCabin(headers: string[], rows: string[][], label: string): ImportResult {
  const chemIndex = headers.indexOf('CHEMICAL CONTAMINANT')
  const flightIndex = headers.indexOf('FLIGHT')
  const metIndex = headers.indexOf('MET')
  const tubeIndex = headers.indexOf('TUBE')
  const valueIndex = headers.indexOf('VALUE')
  const groups = new Map<string, Draft>()
  const measures = new Map<string, MeasureMeta>()
  rows.forEach((row, rowIndex) => {
    const flight = row[flightIndex] ?? ''
    const met = metDay(row[metIndex] ?? '')
    const tube = parseNumber(row[tubeIndex] ?? '')
    const sol = met ?? (tube == null ? null : Math.trunc(tube))
    if (!flight || sol == null) return
    const value = parseNumber(row[valueIndex] ?? '')
    if (value == null) return
    const key = slug(row[chemIndex] ?? 'chemical')
    const id = `${flight}|${sol}`
    const draft = groups.get(id) ?? { subject: flight, sol, values: {}, line: rowIndex + 2 }
    const sum = draft.values[`${key}__sum`]
    const count = draft.values[`${key}__n`]
    draft.values[`${key}__sum`] = (sum ?? 0) + value
    draft.values[`${key}__n`] = (count ?? 0) + 1
    measures.set(key, {
      key,
      label: row[chemIndex] || key,
      domain: 'environment',
      unit: 'mg/m³',
      stdFloor: 0.001,
    })
    groups.set(id, draft)
  })
  const drafts: Draft[] = []
  for (const draft of groups.values()) {
    const values: Record<string, number> = {}
    for (const key of measures.keys()) {
      const count = draft.values[`${key}__n`]
      const sum = draft.values[`${key}__sum`]
      if (count && sum != null) values[key] = sum / count
    }
    drafts.push({ ...draft, values })
  }
  return finalize(
    label,
    drafts,
    [...measures.values()],
    ['Cabin concentrations are mg/m³. ND and blank cells stay missing. A mission-elapsed day (the number before the dot) is the sol; a tube number is used only when elapsed time is empty.'],
    [],
    [],
  )
}

function parseCsvImport(text: string, label: string): ImportResult {
  const { headers, rows } = parseCsv(text)
  if (headers.length === 0) return emptyResult(label, ['The file has no header.'])
  if (headers.includes('CHEMICAL CONTAMINANT') && headers.includes('VALUE')) return reshapeCabin(headers, rows, label)
  if (headers.includes('Amp') && headers.includes('Muscle') && headers.includes('BR_Day')) return reshapeReflex(headers, rows, label)
  if (headers.includes('L-10') && headers.includes('SUBJECT')) return reshapeImmune(headers, rows, label)
  if (headers.includes('timestamp') && headers.includes('absorbed_dose_rate')) return reshapeRad(headers, rows, label)
  return genericTable(headers, rows, label)
}

function fromRecords(records: Record<string, unknown>[], label: string): ImportResult {
  if (records.length === 0) return emptyResult(label, ['The JSON has no days.'])
  const headers = [...new Set(records.flatMap((record) => Object.keys(record)))]
  const rows = records.map((record) => headers.map((header) => {
    const value = record[header]
    return value == null ? '' : String(value)
  }))
  return parseCsvImport([headers.join(','), ...rows.map((row) => row.join(','))].join('\n'), label)
}

function parseJsonImport(text: string, label: string): ImportResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return emptyResult(label, ['This JSON could not be read.'])
  }
  const fit = parseGoogleFit(data)
  if (fit) return { ...emptyResult(label, fit.errors, fit.notes), ok: fit.errors.length === 0 && fit.days.length > 0, days: fit.days, measures: fit.measures, subjects: ['earth-demo'] }
  if (Array.isArray(data) && data.every((item) => item && typeof item === 'object' && Array.isArray((item as { days?: unknown }).days))) {
    const drafts: Record<string, unknown>[] = []
    for (const item of data) {
      const bundle = item as { scenario?: string; days: Record<string, unknown>[] }
      for (const day of bundle.days) drafts.push({ ...day, subject: bundle.scenario ?? day.subject })
    }
    const result = fromRecords(drafts, label)
    result.notes.push('Each scenario in the JSON is a separate subject.')
    return result
  }
  const days = Array.isArray(data) ? data : (data as { days?: unknown }).days
  if (!Array.isArray(days)) return emptyResult(label, ['JSON must be a list of days or { "days": [...] }.'])
  return fromRecords(days as Record<string, unknown>[], label)
}

export function parseImport(text: string, filename = 'upload'): ImportResult {
  const trimmed = text.replace(/^\uFEFF/, '').trim()
  if (!trimmed) return emptyResult(filename, ['The file is empty.'])
  if (trimmed.startsWith('<')) {
    const earth = parseAppleHealth(text)
    return {
      ...emptyResult(filename, earth.errors, earth.notes),
      ok: earth.days.length > 0,
      days: earth.days,
      measures: earth.measures,
      subjects: earth.days.length ? ['earth-demo'] : [],
    }
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return parseJsonImport(text, filename)
  return parseCsvImport(text, filename)
}

export function daysForSubject(days: DayRecord[], subject: string): DayRecord[] {
  return days.filter((day) => day.subject === subject)
}

export function isClinicalKey(key: string): key is ClinicalKey {
  return CLINICAL.has(key)
}
