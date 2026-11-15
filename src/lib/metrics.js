export const METRICS = [
  { id: 'hrv', label: 'HRV', unit: 'ms', color: '#79e4ff', ref: 55 },
  { id: 'hr', label: 'Heart rate', unit: 'bpm', color: '#ff8fa3', ref: 75 },
  { id: 'dose', label: 'Dose', unit: 'mSv', color: '#f0c14a', ref: 1.84, zero: true },
  { id: 'aredMin', label: 'ARED', unit: 'min', color: '#7dcec8', ref: 60 },
  { id: 'sleep', label: 'Sleep', unit: 'h', color: '#c3b4ff', ref: 8 },
  { id: 'bmd', label: 'BMD', unit: '% preflight', color: '#9fd0ff' },
  { id: 'crp', label: 'CRP proxy', unit: 'mg/L', color: '#ffb086', ref: 1.2, zero: true },
]

export const DEFAULT_METRIC = {
  nominal: 'hrv',
  storm: 'dose',
  fatigue: 'sleep',
}
