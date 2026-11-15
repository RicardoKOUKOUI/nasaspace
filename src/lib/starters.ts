export type Starter = {
  id: string
  file: string
  label: string
  detail: string
}

/**
 * Imported dashboard and training set. Bone, radiation, cabin air, and the
 * one-session muscle tables stay on disk and are not shown here.
 * Nothing is fetched from the network at runtime.
 */
export const STARTERS: Starter[] = [
  { id: 'agbresa', file: 'agbresa-cardio.csv', label: 'Cardiovasculaire · AGBRESA', detail: 'hr, sbp, dbp' },
  { id: 'fmt', file: 'brsmfmt.csv', label: 'Neurologie · BRSMFMT', detail: 'Course time' },
  { id: 'fsr', file: 'brsmfsr.csv', label: 'Neurologie · BRSMFSR', detail: 'FSR torque' },
  { id: 'vsi', file: 'brsmvsi.csv', label: 'Immunité · BRSMVSI', detail: 'Viral markers' },
  { id: 'cd8', file: 'brsmimmune-cd8.csv', label: 'Immunité · BRSMImmune', detail: 'CD8+ CD69+' },
  { id: 'pmdata', file: 'pmdata-wellness.csv', label: 'Psychologie · PMData', detail: 'Sleep, mood, fatigue' },
  { id: 'apollo', file: 'ap010-nutrition.csv', label: 'Nutrition · Apollo AP010', detail: 'Crew role · grams' },
  { id: 'acet', file: 'brsmacet.csv', label: 'Nutrition · BRSMAcet', detail: 'Acetaminophen' },
  { id: 'renal', file: 'brsmrf.csv', label: 'Santé rénale · BRSMRF', detail: 'Albumin, clearance' },
]
