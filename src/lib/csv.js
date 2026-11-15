const COLUMNS = [
  ['scenario', (d, scenario) => scenario],
  ['sol', (d) => d.sol],
  ['day', (d) => d.day],
  ['hr_bpm', (d) => d.hr],
  ['hrv_ms', (d) => d.hrv],
  ['sbp_mmhg', (d) => d.sbp],
  ['dbp_mmhg', (d) => d.dbp],
  ['ared_min', (d) => d.aredMin],
  ['bmd_pct_preflight', (d) => d.bmd],
  ['dose_msv', (d) => d.dose],
  ['cum_dose_msv', (d) => d.cumDose],
  ['crp_mg_l', (d) => d.crp],
  ['sleep_h', (d) => d.sleep],
  ['mood_1_5', (d) => d.mood],
  ['focus_1_5', (d) => d.focus],
  ['fatigue_1_5', (d) => d.fatigue],
]

export function toCsv(days, scenario = 'nominal') {
  const header = COLUMNS.map(([name]) => name).join(',')
  const lines = days.map((day) => COLUMNS.map(([, pick]) => pick(day, scenario)).join(','))
  return [header, ...lines].join('\n')
}
