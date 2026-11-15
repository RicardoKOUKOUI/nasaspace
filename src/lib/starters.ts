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
  { id: 'agbresa', file: 'agbresa-cardio.csv', label: 'AGBRESA heart', detail: 'hr, sbp, dbp' },
  { id: 'fmt', file: 'brsmfmt.csv', label: 'BRSMFMT mobility', detail: 'Sensorimotor · course time' },
  { id: 'fsr', file: 'brsmfsr.csv', label: 'BRSMFSR reflex', detail: 'Sensorimotor · FSR torque' },
  { id: 'vsi', file: 'brsmvsi.csv', label: 'BRSMVSI immune', detail: 'Viral markers' },
  { id: 'cd8', file: 'brsmimmune-cd8.csv', label: 'BRSMImmune CD8', detail: 'CD8+ CD69+' },
  { id: 'apollo', file: 'ap010-nutrition.csv', label: 'Apollo AP010 intake', detail: 'Crew role · grams' },
  { id: 'acet', file: 'brsmacet.csv', label: 'BRSMAcet metabolism', detail: 'Acetaminophen' },
  { id: 'renal', file: 'brsmrf.csv', label: 'BRSMRF renal', detail: 'Albumin, clearance' },
  { id: 'pmdata', file: 'pmdata-wellness.csv', label: 'PMData wellness', detail: 'Sleep, mood, fatigue' },
]
