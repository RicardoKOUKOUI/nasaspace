/** Synthetic 30-sol crew record. Numbers are seeded, not random, so the demo is repeatable. */

export const CRUISE_DOSE_MSV = 1.84
export const BONE_LOSS_MONTH_PCT = 1.2
export const ARED_TARGET_MIN = 60
export const SLEEP_ALLOTMENT_H = 8
export const COMMS_DELAY_MIN = 20

export const SCENARIOS = [
  { id: 'nominal', key: '1', label: 'Nominal', hint: 'Cruise baseline' },
  { id: 'storm', key: '2', label: 'Solar storm', hint: 'Particle event' },
  { id: 'fatigue', key: '3', label: 'Isolation', hint: 'Fatigue and bone' },
]

const SEED = { nominal: 20261015, storm: 20261016, fatigue: 20261017 }

function mulberry32(seed) {
  let a = seed >>> 0
  return function rand() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gauss(rand) {
  const u = Math.max(1e-9, rand())
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function round(value, digits = 0) {
  const p = 10 ** digits
  return Math.round(value * p) / p
}

function ramp(day, start, end) {
  if (day <= start) return 0
  if (day >= end) return 1
  return (day - start) / (end - start)
}

export function generateMission(scenario = 'nominal') {
  const rand = mulberry32(SEED[scenario] ?? SEED.nominal)
  const g = () => gauss(rand)
  const days = []
  let bmdExact = 100
  let cum = 0

  for (let i = 0; i < 30; i += 1) {
    const day = i + 1
    const sol = 154 + day
    const t = scenario === 'fatigue' ? ramp(day, 8, 30) : 0
    const stormT = scenario === 'storm' && day >= 27 ? (day - 26) / 4 : 0
    const noise = [g(), g(), g(), g(), g(), g()]

    let hr = 58 + noise[0] * 1.1 + Math.sin(day / 6) * 1.5
    let hrv = 63 + noise[1] * 1.4 + Math.sin(day / 5) * 2
    let sleep = 7.25 + noise[2] * 0.12 + Math.sin(day / 4) * 0.2
    let ared = 64 + noise[3] * 3 + Math.sin(day / 3) * 4
    let crp = 0.55 + Math.abs(noise[4]) * 0.08
    let sbp = 117 + noise[5] * 1.5

    if (scenario === 'fatigue') {
      hr = 56 + t * 20 + noise[0] * 0.8
      hrv = 66 - t * 40 + noise[1] * 0.8
      sleep = 7.35 - t * 2.95 + noise[2] * 0.08
      ared = 68 - t * 56 + noise[3] * 1.5
      crp = 0.5 + t * 1.7 + Math.abs(noise[4]) * 0.05
      sbp = 114 + t * 12 + noise[5]
    } else if (scenario === 'storm') {
      hr = 58 + stormT * 18 + noise[0] * 0.7
      hrv = 64 - stormT * 36 + noise[1] * 0.7
      if (day >= 28) crp = 0.55 + (day - 27) * 1.75
    }

    hr = round(clamp(hr, 42, 120))
    hrv = round(clamp(hrv, 10, 120))
    sleep = round(clamp(sleep, 3, 9), 1)
    ared = round(clamp(ared, 0, 120))
    crp = round(clamp(crp, 0.15, 14), 2)
    sbp = round(clamp(sbp, 88, 170))
    const dbp = round(clamp(sbp * 0.63 + g() * 0.4, 54, 105))

    let dose = round(clamp(CRUISE_DOSE_MSV + g() * 0.05, 1.55, 2.15), 2)
    if (scenario === 'storm' && day === 28) dose = 6.4
    if (scenario === 'storm' && day === 29) dose = 28
    if (scenario === 'storm' && day === 30) dose = 3.6

    let dailyLoss = BONE_LOSS_MONTH_PCT / 30
    if (ared < 30) dailyLoss += 0.085
    else if (ared < 45) dailyLoss += 0.02
    bmdExact -= dailyLoss
    cum = round(cum + dose, 2)

    let mood = 4
    let focus = 4
    let fatigue = 2
    if (scenario === 'fatigue') {
      mood = clamp(Math.round(5 - t * 3.2), 1, 5)
      focus = clamp(Math.round(5 - t * 3.2), 1, 5)
      fatigue = clamp(Math.round(1 + t * 4), 1, 5)
    } else if (scenario === 'storm' && day >= 29) {
      mood = 3
      focus = 3
      fatigue = 3
    }

    days.push({
      day,
      sol,
      hr,
      hrv,
      sbp,
      dbp,
      aredMin: ared,
      bmd: round(bmdExact, 2),
      dose,
      cumDose: cum,
      crp,
      sleep,
      mood,
      focus,
      fatigue,
    })
  }

  return {
    scenario,
    vehicle: 'Mars transit habitat',
    commsDelayMin: COMMS_DELAY_MIN,
    days,
  }
}
