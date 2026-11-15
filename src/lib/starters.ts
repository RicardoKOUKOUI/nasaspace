export type SourceKind = 'flight' | 'bedrest' | 'wearable'

export type Starter = {
  id: string
  file: string
  label: string
  detail: string
  source: SourceKind
  reference: string
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
  { id: 'agbresa', file: 'agbresa-cardio.csv', label: 'Cardiovasculaire · AGBRESA', detail: 'hr, sbp, dbp', source: 'bedrest', reference: 'https://doi.org/10.1371/journal.pone.0239228' },
  { id: 'fmt', file: 'brsmfmt.csv', label: 'Neurologie · BRSMFMT', detail: 'Course time', source: 'bedrest', reference: 'https://nlsp.nasa.gov/search/data/details/dcff3b64-7700-5441-b4c3-2af31b9bb7b0?dataType=EXPERIMENTS' },
  { id: 'fsr', file: 'brsmfsr.csv', label: 'Neurologie · BRSMFSR', detail: 'FSR torque', source: 'bedrest', reference: 'https://nlsp.nasa.gov/search/data/details/99479246-dbfe-5e92-bb6b-8ff96457a0b5?dataType=EXPERIMENTS' },
  { id: 'vsi', file: 'brsmvsi.csv', label: 'Immunité · BRSMVSI', detail: 'Viral markers', source: 'bedrest', reference: 'https://nlsp.nasa.gov/search/data/details/82e288d5-82d9-51a0-8e33-bc9bef232dfe?dataType=EXPERIMENTS' },
  { id: 'cd8', file: 'brsmimmune-cd8.csv', label: 'Immunité · BRSMImmune', detail: 'CD8+ CD69+', source: 'bedrest', reference: 'https://nlsp.nasa.gov/search/data/details/e21cc209-b6c4-5b47-b33b-6e31f51b784f?dataType=EXPERIMENTS' },
  { id: 'pmdata', file: 'pmdata-wellness.csv', label: 'Psychologie · PMData', detail: 'Sleep, mood, fatigue', source: 'wearable', reference: 'https://osf.io/vx4bk' },
  { id: 'apollo', file: 'ap010-nutrition.csv', label: 'Nutrition · Apollo AP010', detail: 'Crew role · grams', source: 'flight', reference: 'https://nlsp.nasa.gov/search/data/details/a010ee1a-3a7e-5cc7-b519-edc1361beaf7?dataType=EXPERIMENTS' },
  { id: 'acet', file: 'brsmacet.csv', label: 'Nutrition · BRSMAcet', detail: 'Acetaminophen', source: 'bedrest', reference: 'https://nlsp.nasa.gov/search/data/details/7ab565bb-f9d6-510f-bd07-407caccaeb9f?dataType=EXPERIMENTS' },
  { id: 'renal', file: 'brsmrf.csv', label: 'Santé rénale · BRSMRF', detail: 'Albumin, clearance', source: 'bedrest', reference: 'https://nlsp.nasa.gov/search/data/details/f1a74e0f-dad5-5109-992c-7271f39da690?dataType=EXPERIMENTS' },
]

export function starterForFile(filename: string): Starter | undefined {
  const base = filename.split(/[/\\]/).pop() ?? filename
  return STARTERS.find((item) => item.file === base)
}
