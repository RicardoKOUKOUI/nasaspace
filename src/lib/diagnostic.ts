/**
 * Rule thresholds for the clinic demo. They follow the cruise set-points already
 * used by evaluate() (dose, CRP, sleep, ARED, HRV) plus published-style HRP
 * nutrition floors. This is not a model trained on astronaut data and it is
 * not a medical device.
 */
export const HRP_RULES = {
  doseRateMsvDay: 8,
  crpMgL: 3,
  fatigueAcute: 7,
  hrvDropMs: 10,
  hrvLowMs: 40,
  hrRiseBpm: 8,
  aredDropMin: 15,
  aredLowMin: 30,
  aredStreakMin: 45,
  aredStreakDays: 5,
  vitaminDIu: 800,
  calciumMg: 1000,
  sleepHours: 6,
  stress: 7,
  vigilance: 4,
  hrDehydration: 85,
  sbpLow: 105,
  hydration: 4,
} as const

export type ClinicDay = {
  hr: number
  hrv: number
  sbp: number
  dbp: number
  spo2: number
  aredMin: number
  loadKg: number
  boneLossPctMonth: number
  vitaminDIu: number
  calciumMg: number
  cumDoseMsv: number
  doseRate: number
  crp: number
  sleepH: number
  sleepQuality: number
  stress: number
  fatigue: number
  vigilance: number
  hydration: number
}

export type DiagnosisId = 'spe' | 'cardio-decond' | 'bone' | 'isolation' | 'dehydration'

export type ClinicAction = {
  id: string
  diagnosisId: DiagnosisId
  label: string
  recovery: number
}

export type Diagnosis = {
  id: DiagnosisId
  name: string
  severity: 'vigilance' | 'critique'
  severityLabel: string
  biomarkers: string
  projection: string
  penalty: number
  projectionDrop: number
  actions: ClinicAction[]
}

export type ClinicGroup = {
  id: 'cardio' | 'muscle' | 'radiation' | 'behavior'
  label: string
  score: number
  lines: string[]
}

export type ClinicReport = {
  score: number
  band: 'nominal' | 'vigilance' | 'critique'
  bandLabel: string
  blend: number
  penalty: number
  recovered: number
  projectedScore: number
  diagnoses: Diagnosis[]
  actions: ClinicAction[]
  groups: ClinicGroup[]
}

export type ClinicScenario = {
  id: 'nominal' | 'storm' | 'decond' | 'isolation'
  label: string
  days: ClinicDay[]
}

const NOMINAL_DAY: ClinicDay = {
  hr: 58,
  hrv: 62,
  sbp: 118,
  dbp: 74,
  spo2: 98,
  aredMin: 60,
  loadKg: 80,
  boneLossPctMonth: 1,
  vitaminDIu: 1000,
  calciumMg: 1100,
  cumDoseMsv: 42,
  doseRate: 1.84,
  crp: 0.8,
  sleepH: 7.4,
  sleepQuality: 84,
  stress: 3,
  fatigue: 2,
  vigilance: 8,
  hydration: 8,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}

function avg(days: ClinicDay[], key: keyof ClinicDay) {
  return days.reduce((sum, day) => sum + Number(day[key]), 0) / days.length
}

/** 100 at `good`, 15 at `bad`. */
function toward(value: number, good: number, bad: number) {
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

function week(edit: (index: number) => Partial<ClinicDay> = () => ({})): ClinicDay[] {
  return Array.from({ length: 7 }, (_, index) => ({
    ...NOMINAL_DAY,
    cumDoseMsv: round1(42 + index * NOMINAL_DAY.doseRate),
    ...edit(index),
  }))
}

export function manualSeries(
  today: ClinicDay,
  trend: { hrAgo: number; hrvAgo: number; aredAgo: number },
): ClinicDay[] {
  return Array.from({ length: 7 }, (_, index) => ({
    ...today,
    hr: index < 3 ? trend.hrAgo : today.hr,
    hrv: index < 3 ? trend.hrvAgo : today.hrv,
    aredMin: index >= 2 ? today.aredMin : trend.aredAgo,
    cumDoseMsv: round1(today.cumDoseMsv + index * today.doseRate),
  }))
}

const ACTIONS: Record<DiagnosisId, ClinicAction[]> = {
  spe: [
    { id: 'spe-shelter', diagnosisId: 'spe', label: 'Mise à l’abri dans le module blindé', recovery: 8 },
    { id: 'spe-immune', diagnosisId: 'spe', label: 'Repas anti-inflammatoire et nouveau contrôle du marqueur', recovery: 6 },
    { id: 'spe-lytes', diagnosisId: 'spe', label: 'Hydratation +500 ml avec électrolytes', recovery: 4 },
  ],
  'cardio-decond': [
    { id: 'cardio-breathe', diagnosisId: 'cardio-decond', label: 'Respiration guidée 4-7-8', recovery: 5 },
    { id: 'cardio-fluids', diagnosisId: 'cardio-decond', label: 'Hydratation avant le prochain bloc de travail', recovery: 4 },
    { id: 'cardio-ared', diagnosisId: 'cardio-decond', label: 'Reprise ARED tolérée, 30 min', recovery: 5 },
  ],
  bone: [
    { id: 'bone-ared', diagnosisId: 'bone', label: 'Protocole ARED 60 min', recovery: 7 },
    { id: 'bone-nutrition', diagnosisId: 'bone', label: 'Vitamine D 800 UI et calcium 1 000 mg', recovery: 5 },
  ],
  isolation: [
    { id: 'iso-sleep', diagnosisId: 'isolation', label: 'Verrouiller la prochaine fenêtre de 8 h', recovery: 4 },
    { id: 'iso-light', diagnosisId: 'isolation', label: 'Luminothérapie', recovery: 3 },
    { id: 'iso-breathe', diagnosisId: 'isolation', label: 'Respiration guidée 4-7-8', recovery: 3 },
  ],
  dehydration: [
    { id: 'dehyd-lytes', diagnosisId: 'dehydration', label: '+500 ml d’électrolytes', recovery: 8 },
    { id: 'dehyd-rest', diagnosisId: 'dehydration', label: 'Pause et recontrôle FC / tension', recovery: 4 },
  ],
}

function severity(critique: boolean): Pick<Diagnosis, 'severity' | 'severityLabel'> {
  return critique
    ? { severity: 'critique', severityLabel: 'Critique' }
    : { severity: 'vigilance', severityLabel: 'Vigilance' }
}

function detect(days: ClinicDay[]): Diagnosis[] {
  const today = days[days.length - 1]
  const early = days.slice(0, 3)
  const recent = days.slice(-3)
  const streak = days.slice(-HRP_RULES.aredStreakDays)
  const found: Diagnosis[] = []

  if (
    today.doseRate >= HRP_RULES.doseRateMsvDay &&
    today.crp >= HRP_RULES.crpMgL &&
    today.fatigue >= HRP_RULES.fatigueAcute
  ) {
    found.push({
      id: 'spe',
      name: 'Syndrome d’exposition aux radiations / tempête solaire',
      ...severity(today.doseRate >= 10 || today.crp >= 5 || today.fatigue >= 8),
      biomarkers: `Débit ${round1(today.doseRate)} mSv/jour (seuil ${HRP_RULES.doseRateMsvDay}), CRP ${round1(today.crp)} mg/L (seuil ${HRP_RULES.crpMgL}) et fatigue ${today.fatigue}/10 (seuil ${HRP_RULES.fatigueAcute}). Les trois sont croisés.`,
      projection: 'À +7 jours sans mise à l’abri, le débit reste au-dessus du seuil de tempête, le marqueur inflammatoire ne redescend pas et la fatigue aiguë se prolonge.',
      penalty: 20,
      projectionDrop: 14,
      actions: ACTIONS.spe,
    })
  }

  if (days.length >= 6 && early.length === 3 && recent.length === 3) {
    const hrvEarly = avg(early, 'hrv')
    const hrvRecent = avg(recent, 'hrv')
    const hrEarly = avg(early, 'hr')
    const aredEarly = avg(early, 'aredMin')
    const aredRecent = avg(recent, 'aredMin')
    const hrvFell = hrvRecent <= hrvEarly - HRP_RULES.hrvDropMs || (today.hrv < HRP_RULES.hrvLowMs && hrvEarly >= 50)
    const hrRose = today.hr >= hrEarly + HRP_RULES.hrRiseBpm || today.hr >= 80
    const aredFell = aredRecent <= aredEarly - HRP_RULES.aredDropMin || aredRecent < HRP_RULES.aredLowMin
    if (hrvFell && hrRose && aredFell) {
      found.push({
        id: 'cardio-decond',
        name: 'Déconditionnement cardiovasculaire et intolérance orthostatique',
        ...severity(today.hrv < 35 && today.hr >= 80),
        biomarkers: `HRV ${round1(hrvEarly)} → ${round1(hrvRecent)} ms, FC au repos ${round1(hrEarly)} → ${today.hr} bpm, ARED ${round1(aredEarly)} → ${round1(aredRecent)} min/jour. La baisse de variabilité, la hausse de FC et la baisse d’activité sont croisées.`,
        projection: 'À +7 jours sans reprise d’activité, la HRV continue de baisser, la fréquence au repos monte et l’intolérance orthostatique se creuse.',
        penalty: 14,
        projectionDrop: 10,
        actions: ACTIONS['cardio-decond'],
      })
    }
  }

  if (
    streak.length === HRP_RULES.aredStreakDays &&
    streak.every((day) => day.aredMin < HRP_RULES.aredStreakMin) &&
    (today.vitaminDIu < HRP_RULES.vitaminDIu || today.calciumMg < HRP_RULES.calciumMg)
  ) {
    found.push({
      id: 'bone',
      name: 'Déminéralisation osseuse et atrophie musculaire accélérée',
      ...severity(today.boneLossPctMonth >= 2 || today.vitaminDIu < 500),
      biomarkers: `ARED sous ${HRP_RULES.aredStreakMin} min/jour sur ${streak.length} jours (dernier jour ${today.aredMin} min), vitamine D ${today.vitaminDIu} UI (seuil ${HRP_RULES.vitaminDIu}) et calcium ${today.calciumMg} mg (seuil ${HRP_RULES.calciumMg}).`,
      projection: 'À +7 jours sans charge ARED ni correction vitamine D / calcium, la perte osseuse mensuelle s’accélère.',
      penalty: 12,
      projectionDrop: 8,
      actions: ACTIONS.bone,
    })
  }

  if (today.sleepH < HRP_RULES.sleepHours && today.stress >= HRP_RULES.stress && today.vigilance <= HRP_RULES.vigilance) {
    found.push({
      id: 'isolation',
      name: 'Syndrome d’isolement, stress chronique et fatigue cognitive',
      ...severity(today.sleepH < 5.5 && today.stress >= 8 && today.vigilance <= 3),
      biomarkers: `Sommeil ${round1(today.sleepH)} h (seuil ${HRP_RULES.sleepHours}), stress ${today.stress}/10 (seuil ${HRP_RULES.stress}) et vigilance ${today.vigilance}/10 (seuil ${HRP_RULES.vigilance}). Les trois sont croisés.`,
      projection: 'À +7 jours sans sommeil protégé, le stress chronique et la baisse de vigilance se maintiennent.',
      penalty: 10,
      projectionDrop: 8,
      actions: ACTIONS.isolation,
    })
  }

  if (today.hr >= HRP_RULES.hrDehydration && today.sbp < HRP_RULES.sbpLow && today.hydration <= HRP_RULES.hydration) {
    found.push({
      id: 'dehydration',
      name: 'Déshydratation et déséquilibre électrolytique en microgravité',
      ...severity(today.hydration <= 3 && today.sbp < 100),
      biomarkers: `FC ${today.hr} bpm (seuil ${HRP_RULES.hrDehydration}), tension ${today.sbp}/${today.dbp} mmHg (systolique sous ${HRP_RULES.sbpLow}) et hydratation déclarée ${today.hydration}/10 (seuil ${HRP_RULES.hydration}).`,
      projection: 'À +7 jours sans remplacement, la fréquence reste haute, la tension basse, et le déficit hydrique s’aggrave.',
      penalty: 12,
      projectionDrop: 8,
      actions: ACTIONS.dehydration,
    })
  }

  return found
}

function groupScores(today: ClinicDay): ClinicGroup[] {
  const hrScore = today.hr <= 64 ? toward(today.hr, 58, 42) : toward(today.hr, 64, 96)
  const cardio = clamp(
    0.34 * hrScore +
      0.34 * toward(today.hrv, 55, 18) +
      0.16 * toward(today.spo2, 98, 90) +
      0.16 * (today.sbp > 130 ? toward(today.sbp, 120, 160) : toward(today.sbp, 108, 90)),
    0,
    100,
  )
  const muscle = clamp(
    0.4 * toward(today.aredMin, 60, 15) +
      0.2 * toward(today.loadKg, 80, 20) +
      0.15 * toward(today.boneLossPctMonth, 1, 3.2) +
      0.15 * toward(today.vitaminDIu, 800, 200) +
      0.1 * toward(today.calciumMg, 1000, 400),
    0,
    100,
  )
  const radiation = clamp(
    0.45 * toward(today.doseRate, 1.84, 12) +
      0.2 * toward(today.cumDoseMsv, 50, 180) +
      0.35 * toward(today.crp, 1, 6.5),
    0,
    100,
  )
  const behavior = clamp(
    0.28 * toward(today.sleepH, 7.5, 4) +
      0.16 * toward(today.sleepQuality, 80, 30) +
      0.16 * toward(today.stress, 2, 9) +
      0.14 * toward(today.fatigue, 2, 8) +
      0.14 * toward(today.vigilance, 8, 3) +
      0.12 * toward(today.hydration, 8, 2),
    0,
    100,
  )
  return [
    {
      id: 'cardio',
      label: 'Cardiovasculaire',
      score: cardio,
      lines: [
        `FC repos ${today.hr} bpm`,
        `HRV ${today.hrv} ms`,
        `Tension ${today.sbp}/${today.dbp} mmHg`,
        `SpO2 ${today.spo2} %`,
      ],
    },
    {
      id: 'muscle',
      label: 'Musculo-squelettique',
      score: muscle,
      lines: [
        `ARED ${today.aredMin} min`,
        `Charge ${today.loadKg} kg`,
        `Perte osseuse ${round1(today.boneLossPctMonth)} %/mois`,
        `Vitamine D ${today.vitaminDIu} UI · calcium ${today.calciumMg} mg`,
      ],
    },
    {
      id: 'radiation',
      label: 'Radiations et immunité',
      score: radiation,
      lines: [
        `Débit ${round1(today.doseRate)} mSv/jour`,
        `Dose cumulée ${round1(today.cumDoseMsv)} mSv`,
        `CRP ${round1(today.crp)} mg/L`,
      ],
    },
    {
      id: 'behavior',
      label: 'Comportement et sommeil',
      score: behavior,
      lines: [
        `Sommeil ${round1(today.sleepH)} h · qualité ${today.sleepQuality}`,
        `Stress ${today.stress}/10 · fatigue ${today.fatigue}/10`,
        `Vigilance ${today.vigilance}/10 · hydratation ${today.hydration}/10`,
      ],
    },
  ]
}

function bandFor(score: number): Pick<ClinicReport, 'band' | 'bandLabel'> {
  if (score >= 80) return { band: 'nominal', bandLabel: 'Nominal' }
  if (score >= 60) return { band: 'vigilance', bandLabel: 'Vigilance' }
  return { band: 'critique', bandLabel: 'Critique' }
}

export function diagnose(days: ClinicDay[], checked: readonly string[] = []): ClinicReport {
  const today = days[days.length - 1]
  const groups = groupScores(today)
  const blend = 0.3 * groups[0].score + 0.22 * groups[1].score + 0.28 * groups[2].score + 0.2 * groups[3].score
  const diagnoses = detect(days)
  const penalty = diagnoses.reduce((sum, item) => sum + item.penalty, 0)
  const checkedSet = new Set(checked)
  let recovered = 0
  for (const item of diagnoses) {
    const gained = item.actions.reduce((sum, action) => sum + (checkedSet.has(action.id) ? action.recovery : 0), 0)
    recovered += Math.min(item.penalty, gained)
  }
  const score = clamp(Math.round(blend - penalty + recovered), 0, 100)
  const projectedScore = clamp(
    Math.round(blend - penalty - diagnoses.reduce((sum, item) => sum + item.projectionDrop, 0)),
    0,
    100,
  )
  return {
    score,
    ...bandFor(score),
    blend,
    penalty,
    recovered,
    projectedScore,
    diagnoses,
    actions: diagnoses.flatMap((item) => item.actions),
    groups: groups.map((group) => ({ ...group, score: Math.round(group.score) })),
  }
}

export const CLINIC_SCENARIOS: ClinicScenario[] = [
  { id: 'nominal', label: 'État nominal', days: week() },
  {
    id: 'storm',
    label: 'Alerte tempête solaire',
    days: week((index) => {
      if (index < 4) return {}
      if (index === 4) return { doseRate: 6.2, crp: 2.1, fatigue: 5, cumDoseMsv: 62 }
      if (index === 5) return { doseRate: 14, crp: 4.6, fatigue: 7, cumDoseMsv: 76 }
      return { doseRate: 11, crp: 5.4, fatigue: 8, cumDoseMsv: 87, spo2: 96 }
    }),
  },
  {
    id: 'decond',
    label: 'Déconditionnement osseux et cardio',
    days: week((index) => ({
      hr: [58, 60, 64, 70, 76, 82, 88][index],
      hrv: [64, 60, 54, 48, 42, 36, 30][index],
      aredMin: [58, 50, 42, 36, 32, 28, 24][index],
      loadKg: [78, 70, 60, 52, 46, 40, 36][index],
      boneLossPctMonth: 2.4,
      vitaminDIu: 400,
      calciumMg: 650,
      sbp: 116,
      hydration: 7,
      fatigue: 4,
    })),
  },
  {
    id: 'isolation',
    label: 'Stress et isolement profond',
    days: week(() => ({
      sleepH: 5.1,
      sleepQuality: 36,
      stress: 8,
      fatigue: 6,
      vigilance: 3,
      hydration: 7,
      hr: 70,
      hrv: 52,
      aredMin: 52,
      sbp: 116,
    })),
  },
]

export function dehydrationSeries(): ClinicDay[] {
  return week(() => ({
    hr: 96,
    hrv: 48,
    sbp: 96,
    dbp: 58,
    spo2: 96,
    hydration: 3,
    aredMin: 55,
    fatigue: 4,
    stress: 4,
    sleepH: 7.1,
    vigilance: 7,
    doseRate: 1.9,
    crp: 0.9,
  }))
}
