export type Starter = {
  id: string
  file: string
  label: string
  detail: string
}

/** Small public files shipped with the app. Nothing here is fetched from NASA at runtime. */
export const STARTERS: Starter[] = [
  { id: 'mr035g', file: 'mr035g-spine.csv', label: 'MR035G spine DXA', detail: 'Bed rest · BMD g/cm²' },
  { id: 'mr079g', file: 'mr079g-isokinetic.csv', label: 'MR079G strength', detail: 'Bed rest · Nm' },
  { id: 'fmt', file: 'brsmfmt.csv', label: 'BRSMFMT mobility', detail: 'Bed rest · course time' },
  { id: 'fsr', file: 'brsmfsr.csv', label: 'BRSMFSR reflex', detail: 'Bed rest · amplitude' },
  { id: 'radlab', file: 'radlab.csv', label: 'RadLab ISS dose', detail: 'ISS DosTel · 1–2 Apr 2022' },
  { id: 'cabin', file: 'dto623-cabin-air.csv', label: 'DTO 623 cabin air', detail: 'Shuttle · mg/m³' },
  { id: 'vsi', file: 'brsmvsi.csv', label: 'BRSMVSI immune', detail: 'Bed rest · viral markers' },
  { id: 'cd8', file: 'brsmimmune-cd8.csv', label: 'BRSMImmune CD8', detail: 'Bed rest · CD8+ CD69+' },
  { id: 'apollo', file: 'ap010-nutrition.csv', label: 'Apollo AP010 intake', detail: 'Crew role · grams' },
  { id: 'acet', file: 'brsmacet.csv', label: 'BRSMAcet metabolism', detail: 'Bed rest · acetaminophen' },
  { id: 'renal', file: 'brsmrf.csv', label: 'BRSMRF renal', detail: 'Bed rest · albumin, clearance' },
]
