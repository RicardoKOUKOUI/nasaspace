export type Starter = {
  id: string
  file: string
  label: string
  detail: string
}

/**
 * Starter menu and training set. Muscle DXA, isokinetic strength, RadLab,
 * and cabin air stay in public/starters but are not trained: one session or
 * two similar days is not a reference plus later sols.
 * Nothing here is fetched from NASA at runtime.
 */
export const STARTERS: Starter[] = [
  { id: 'fmt', file: 'brsmfmt.csv', label: 'BRSMFMT mobility', detail: 'Bed rest · course time' },
  { id: 'fsr', file: 'brsmfsr.csv', label: 'BRSMFSR reflex', detail: 'Bed rest · FSR torque' },
  { id: 'vsi', file: 'brsmvsi.csv', label: 'BRSMVSI immune', detail: 'Bed rest · viral markers' },
  { id: 'cd8', file: 'brsmimmune-cd8.csv', label: 'BRSMImmune CD8', detail: 'Bed rest · CD8+ CD69+' },
  { id: 'apollo', file: 'ap010-nutrition.csv', label: 'Apollo AP010 intake', detail: 'Crew role · grams' },
  { id: 'acet', file: 'brsmacet.csv', label: 'BRSMAcet metabolism', detail: 'Bed rest · acetaminophen' },
  { id: 'renal', file: 'brsmrf.csv', label: 'BRSMRF renal', detail: 'Bed rest · albumin, clearance' },
]
