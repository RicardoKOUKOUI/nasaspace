export const en = {
  'forest.insufficient': 'Not enough data for the model. Clinical rules only.',
  'forest.provenance': 'Isolation Forest trained live on {n} reference sols from {dataset}.',
} as const

export type MessageKey = keyof typeof en
