export type Starter = {
  id: string
  file: string
  label: string
  detail: string
}

/**
 * Training set for the four cockpit axes that have a public per-person series.
 * Neuro, immune, nutrition, renal, muscle, RadLab, and cabin air stay on disk
 * and are not in this menu. Bone and radiation have no public table here.
 * Nothing is fetched from the network at runtime.
 */
export const STARTERS: Starter[] = [
  { id: 'agbresa', file: 'agbresa-cardio.csv', label: 'AGBRESA heart', detail: 'Bed rest · hr, sbp, dbp' },
  { id: 'pmdata', file: 'pmdata-wellness.csv', label: 'PMData wellness', detail: 'Sleep, mood, fatigue' },
]
