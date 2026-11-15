export const en = {
  'forest.insufficient': 'Not enough data for the model. Only the clinical rules apply.',
  'forest.provenance': 'Isolation Forest trained live on {n} reference sols of {dataset}.',
} as const

export type MessageKey = keyof typeof en
