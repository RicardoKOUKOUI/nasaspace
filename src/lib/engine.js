import { ARED_TARGET_MIN, COMMS_DELAY_MIN } from './telemetry.js'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function mean(days, key) {
  return days.reduce((sum, day) => sum + day[key], 0) / days.length
}

/** 100 when value is at `good`, falling toward 15 at `bad`. */
function scoreToward(value, good, bad) {
  const higherIsBetter = good > bad
  if (higherIsBetter) {
    if (value >= good) return 100
    if (value <= bad) return 15
    return 15 + ((value - bad) / (good - bad)) * 85
  }
  if (value <= good) return 100
  if (value >= bad) return 15
  return 100 - ((value - good) / (bad - good)) * 85
}

function toneFor(score) {
  if (score >= 80) return 'ready'
  if (score >= 60) return 'degraded'
  return 'risk'
}

const PROTOCOLS = {
  shelter: {
    id: 'shelter',
    title: 'Enter the storm shelter',
    minutes: 15,
    why: 'The last three sols delivered far more than the cruise dose. Shield mass helps only if the crew is inside it.',
    steps: [
      'Move into the shielded storm shelter and close the hatch.',
      'Pause EVA and any high-workload task.',
      'Read the dose again in 60 minutes.',
    ],
  },
  immune: {
    id: 'immune',
    title: 'Inflammation watch',
    minutes: 10,
    why: 'The CRP proxy climbed after the particle event. Catch the immune drift before a symptom does.',
    steps: [
      'Use the anti-inflammatory meal pack at the next meal.',
      'Note skin, gut, or fever symptoms in the log.',
      'Repeat the proxy at the next sample window.',
    ],
  },
  hydrate: {
    id: 'hydrate',
    title: 'Electrolyte hydration',
    minutes: 10,
    why: 'A closed loop plus physiological stress shifts fluid. Replace it before the next work block.',
    steps: [
      'Drink 500 ml with one electrolyte pack.',
      'Mark the intake on this checklist.',
    ],
  },
  breathe: {
    id: 'breathe',
    title: '4-7-8 breathing',
    minutes: 5,
    why: 'Heart-rate variability is under the autonomic set-point. A short paced cycle is the first action.',
    steps: [
      'Sit and restrain. Inhale 4 seconds, hold 7, exhale 8.',
      'Repeat four cycles. Recheck heart rate after.',
    ],
  },
  ared: {
    id: 'ared',
    title: 'ARED resistive session',
    minutes: 45,
    why: 'Resistive load is the countermeasure for bone and muscle loss when exercise has slipped.',
    steps: [
      'Squat, heel raise, and deadlift pattern, as tolerated.',
      'Target 45 minutes. Stop for pain, dizziness, or chest symptoms.',
    ],
  },
  sleep: {
    id: 'sleep',
    title: 'Lock the next sleep window',
    minutes: 10,
    why: 'Sleep across the last seven sols is under the 8-hour allotment. Fatigue is already in the heart-rate signal.',
    steps: [
      'Dim the cabin and reserve the next 8-hour block.',
      'Silence noncritical alarms inside that window.',
    ],
  },
  connect: {
    id: 'connect',
    title: 'Crew check-in',
    minutes: 5,
    why: `Mood and exhaustion moved together. Earth cannot answer for ${COMMS_DELAY_MIN} minutes.`,
    steps: [
      'Five minutes with a crewmate, or a written log if you are alone on the shift.',
      'Name one noncritical task to drop today.',
    ],
  },
  routine: {
    id: 'routine',
    title: 'Stay on the daily plan',
    minutes: ARED_TARGET_MIN,
    why: 'No cross-factor rule is active. Keep the counters that protect this score.',
    steps: [
      `Complete the ${ARED_TARGET_MIN}-minute ARED block.`,
      'Keep the 8-hour sleep window tonight.',
    ],
  },
}

const PROTOCOL_FOR = {
  spe: ['shelter', 'immune', 'hydrate'],
  'rad-immune': ['shelter', 'immune', 'hydrate'],
  'fatigue-cascade': ['sleep', 'connect', 'ared'],
  decond: ['ared', 'sleep'],
  isolation: ['connect', 'sleep'],
  acute: ['connect', 'breathe'],
  cardio: ['breathe', 'hydrate'],
}

const PENALTY = {
  spe: 8,
  'rad-immune': 8,
  'fatigue-cascade': 8,
  decond: 6,
  isolation: 6,
  acute: 6,
  cardio: 4,
}

export function evaluate(days, self = {}) {
  const today = days[days.length - 1]
  const last7 = days.slice(-7)
  const last3 = days.slice(-3)
  const mood = self.mood ?? today.mood
  const focus = self.focus ?? today.focus
  const fatigue = self.fatigue ?? today.fatigue

  const hr7 = mean(last7, 'hr')
  const hrv7 = mean(last7, 'hrv')
  const ared7 = mean(last7, 'aredMin')
  const sleep7 = mean(last7, 'sleep')
  const dose3 = mean(last3, 'dose')
  const lossPct = 100 - today.bmd

  const hrNow = today.hr * 0.6 + hr7 * 0.4
  const hrvNow = today.hrv * 0.6 + hrv7 * 0.4
  const hrScore = hrNow <= 64 ? scoreToward(hrNow, 52, 42) : scoreToward(hrNow, 64, 96)
  const hrvScore = scoreToward(hrvNow, 55, 18)
  const bpScore = today.sbp > 128 ? scoreToward(today.sbp, 128, 160) : scoreToward(today.sbp, 108, 90)
  const cardio = clamp(0.4 * hrScore + 0.45 * hrvScore + 0.15 * bpScore, 0, 100)

  const bone = clamp(
    0.55 * scoreToward(ared7, 55, 12) + 0.45 * scoreToward(lossPct, 1.25, 3.2),
    0,
    100,
  )

  const radiation = clamp(
    0.5 * scoreToward(dose3, 2.3, 12) +
      0.2 * scoreToward(today.cumDose, 62, 130) +
      0.3 * scoreToward(today.crp, 1.2, 6.5),
    0,
    100,
  )

  const behavior = clamp(
    0.45 * scoreToward(sleep7, 7.2, 4.2) +
      0.2 * (mood / 5) * 100 +
      0.2 * (focus / 5) * 100 +
      0.15 * ((6 - fatigue) / 5) * 100,
    0,
    100,
  )

  const alerts = []
  if (dose3 >= 8 || today.dose >= 10) {
    alerts.push({
      id: 'spe',
      severity: 'risk',
      title: 'Solar particle event',
      detail:
        'Dose jumped well above the 1.84 mSv/day cruise baseline. Today is lower only if the crew is already sheltered. The three-sol load is still high.',
    })
  }
  if (today.crp >= 3 && dose3 >= 6) {
    alerts.push({
      id: 'rad-immune',
      severity: 'risk',
      title: 'Radiation–immune cascade',
      detail:
        'Inflammation rose with the particle dose. These two drifts together matter more than either one alone.',
    })
  }
  if (sleep7 < 6 && hrv7 < 40 && hr7 > 68) {
    alerts.push({
      id: 'fatigue-cascade',
      severity: 'risk',
      title: 'Fatigue–autonomic cascade',
      detail:
        'Short sleep, low heart-rate variability, and a higher resting rate are moving as one pattern.',
    })
  }
  if (ared7 < 35 && lossPct > 1.6) {
    alerts.push({
      id: 'decond',
      severity: 'degraded',
      title: 'Bone and muscle deconditioning',
      detail: `ARED is under 35 min/day and bone density is down ${lossPct.toFixed(1)}% versus a 1.2% monthly cruise set-point.`,
    })
  }
  if (mood <= 2 && fatigue >= 4 && sleep7 < 6) {
    alerts.push({
      id: 'isolation',
      severity: 'degraded',
      title: 'Behavioral isolation risk',
      detail: 'Self-report and sleep agree: exhaustion and low mood, with no real-time physician on the link.',
    })
  } else if (mood <= 2 && fatigue >= 4) {
    alerts.push({
      id: 'acute',
      severity: 'degraded',
      title: 'Acute behavioral flag',
      detail: 'The three-question check just moved mood and exhaustion into the action range.',
    })
  }
  if (today.hrv < 36 || today.hr > 82) {
    alerts.push({
      id: 'cardio',
      severity: 'degraded',
      title: 'Autonomic strain',
      detail: `HRV ${today.hrv} ms and resting heart rate ${today.hr} bpm are off the cruise set-point.`,
    })
  }

  const penalty = Math.min(
    16,
    alerts.reduce((sum, alert) => sum + (PENALTY[alert.id] ?? 0), 0),
  )
  const blended = 0.3 * cardio + 0.22 * bone + 0.28 * radiation + 0.2 * behavior - penalty
  const score = clamp(Math.round(blended), 1, 99)
  const status = toneFor(score)

  const seen = new Set()
  const protocols = []
  for (const alert of alerts) {
    for (const id of PROTOCOL_FOR[alert.id] ?? []) {
      if (seen.has(id)) continue
      seen.add(id)
      protocols.push(PROTOCOLS[id])
      if (protocols.length === 3) break
    }
    if (protocols.length === 3) break
  }
  if (protocols.length === 0) protocols.push(PROTOCOLS.routine)

  const baselines = [
    [(today.hr - 58) / 8],
    [(today.hrv - 62) / 12],
    [(today.sleep - 7.2) / 0.7],
    [(today.dose - 1.84) / 0.4],
    [(today.crp - 0.7) / 0.45],
    [(today.aredMin - 60) / 12],
  ]
  const rms = Math.sqrt(baselines.reduce((sum, [z]) => sum + z * z, 0) / baselines.length)
  const anomaly = clamp(Math.round(rms * 22), 0, 100)

  return {
    score,
    status,
    anomaly,
    penalty,
    lossPct,
    dose3,
    sleep7,
    ared7,
    alerts,
    protocols,
    self: { mood, focus, fatigue },
    axes: [
      {
        id: 'cardio',
        label: 'Cardiovascular',
        score: Math.round(cardio),
        detail: `HR ${today.hr} bpm · HRV ${today.hrv} ms · ${today.sbp}/${today.dbp}`,
      },
      {
        id: 'bone',
        label: 'Bone & muscle',
        score: Math.round(bone),
        detail: `ARED 7-sol ${Math.round(ared7)} min · BMD −${lossPct.toFixed(1)}%`,
      },
      {
        id: 'radiation',
        label: 'Radiation & immunity',
        score: Math.round(radiation),
        detail: `3-sol ${dose3.toFixed(1)} mSv/d · CRP ${today.crp.toFixed(1)}`,
      },
      {
        id: 'behavior',
        label: 'Behavior',
        score: Math.round(behavior),
        detail: `Sleep 7-sol ${sleep7.toFixed(1)} h · mood ${mood}/5`,
      },
    ],
    readout: [
      { label: 'HR', value: String(today.hr), unit: 'bpm', tone: today.hr > 78 ? 'risk' : today.hr > 70 ? 'degraded' : 'ready' },
      { label: 'HRV', value: String(today.hrv), unit: 'ms', tone: today.hrv < 36 ? 'risk' : today.hrv < 50 ? 'degraded' : 'ready' },
      { label: 'BP', value: `${today.sbp}/${today.dbp}`, unit: 'mmHg', tone: today.sbp > 135 ? 'degraded' : 'ready' },
      { label: 'ARED', value: String(today.aredMin), unit: 'min', tone: today.aredMin < 30 ? 'risk' : today.aredMin < 50 ? 'degraded' : 'ready' },
      { label: 'Dose', value: today.dose.toFixed(2), unit: 'mSv', tone: today.dose > 8 ? 'risk' : today.dose > 3 ? 'degraded' : 'ready' },
      { label: 'Cumul.', value: today.cumDose.toFixed(1), unit: 'mSv', tone: today.cumDose > 90 ? 'degraded' : 'ready' },
      { label: 'Sleep', value: today.sleep.toFixed(1), unit: 'h', tone: today.sleep < 5.5 ? 'risk' : today.sleep < 6.5 ? 'degraded' : 'ready' },
      { label: 'BMD', value: today.bmd.toFixed(1), unit: '%', tone: lossPct > 1.8 ? 'degraded' : 'ready' },
      { label: 'CRP', value: today.crp.toFixed(1), unit: 'mg/L', tone: today.crp >= 3 ? 'risk' : today.crp >= 1.5 ? 'degraded' : 'ready' },
    ],
  }
}
