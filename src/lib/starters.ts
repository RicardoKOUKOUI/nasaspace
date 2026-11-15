export type SourceKind = 'flight' | 'bedrest' | 'wearable'

export type Starter = {
  id: string
  file: string
  label: string
  detail: string
  source: SourceKind
}

export const SOURCE_LABEL: Record<SourceKind, string> = {
  flight: 'Vol spatial',
  bedrest: 'Analogue au sol - alitement',
  wearable: 'Population terrestre - montre connectée',
}

/**
 * Imported dashboard and training set. Bone, radiation, cabin air, and the
 * one-session muscle tables stay on disk and are not shown here.
 * Nothing is fetched from the network at runtime.
 */
export const STARTERS: Starter[] = [
  { id: 'agbresa', file: 'agbresa-cardio.csv', label: 'Cardiovasculaire · AGBRESA', detail: 'hr, sbp, dbp', source: 'bedrest' },
  { id: 'fmt', file: 'brsmfmt.csv', label: 'Neurologie · BRSMFMT', detail: 'Course time', source: 'bedrest' },
  { id: 'fsr', file: 'brsmfsr.csv', label: 'Neurologie · BRSMFSR', detail: 'FSR torque', source: 'bedrest' },
  { id: 'vsi', file: 'brsmvsi.csv', label: 'Immunité · BRSMVSI', detail: 'Viral markers', source: 'bedrest' },
  { id: 'cd8', file: 'brsmimmune-cd8.csv', label: 'Immunité · BRSMImmune', detail: 'CD8+ CD69+', source: 'bedrest' },
  { id: 'pmdata', file: 'pmdata-wellness.csv', label: 'Psychologie · PMData', detail: 'Sleep, mood, fatigue', source: 'wearable' },
  { id: 'apollo', file: 'ap010-nutrition.csv', label: 'Nutrition · Apollo AP010', detail: 'Crew role · grams', source: 'flight' },
  { id: 'acet', file: 'brsmacet.csv', label: 'Nutrition · BRSMAcet', detail: 'Acetaminophen', source: 'bedrest' },
  { id: 'renal', file: 'brsmrf.csv', label: 'Santé rénale · BRSMRF', detail: 'Albumin, clearance', source: 'bedrest' },
]

export function starterForFile(filename: string): Starter | undefined {
  const base = filename.split(/[/\\]/).pop() ?? filename
  return STARTERS.find((item) => item.file === base)
}
