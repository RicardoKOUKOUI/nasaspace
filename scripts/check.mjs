import { mkdirSync, writeFileSync } from 'node:fs'
import { toCsv } from '../src/lib/csv.js'
import { evaluate } from '../src/lib/engine.js'
import { generateMission } from '../src/lib/telemetry.js'

const ids = ['nominal', 'storm', 'fatigue']
const missions = ids.map((id) => generateMission(id))
mkdirSync(new URL('../data/', import.meta.url), { recursive: true })

const payload = missions.map((mission) => ({
  scenario: mission.scenario,
  vehicle: mission.vehicle,
  commsDelayMin: mission.commsDelayMin,
  days: mission.days,
}))
writeFileSync(new URL('../data/telemetry_data.json', import.meta.url), `${JSON.stringify(payload, null, 2)}\n`)

const csv = ['scenario,sol,day,hr_bpm,hrv_ms,sbp_mmhg,dbp_mmhg,ared_min,bmd_pct_preflight,dose_msv,cum_dose_msv,crp_mg_l,sleep_h,mood_1_5,focus_1_5,fatigue_1_5']
for (const mission of missions) {
  const body = toCsv(mission.days, mission.scenario).split('\n').slice(1)
  csv.push(...body)
}
writeFileSync(new URL('../data/telemetry_data.csv', import.meta.url), `${csv.join('\n')}\n`)

let failed = false
function assert(condition, message) {
  if (!condition) {
    failed = true
    console.error('FAIL', message)
  }
}

for (const mission of missions) {
  const report = evaluate(mission.days)
  const today = mission.days.at(-1)
  console.log(
    mission.scenario.padEnd(8),
    'score',
    report.score,
    report.status,
    'axes',
    report.axes.map((axis) => `${axis.id}:${axis.score}`).join(' '),
    'alerts',
    report.alerts.map((alert) => alert.id).join(',') || '-',
    'today',
    `hr ${today.hr} hrv ${today.hrv} ared ${today.aredMin} dose ${today.dose} sleep ${today.sleep} bmd ${today.bmd} crp ${today.crp}`,
  )
}

const nominal = evaluate(generateMission('nominal').days)
const storm = evaluate(generateMission('storm').days)
const fatigue = evaluate(generateMission('fatigue').days)
const acute = evaluate(generateMission('nominal').days, { mood: 1, focus: 1, fatigue: 5 })

assert(nominal.score >= 80, `nominal score ${nominal.score}`)
assert(nominal.alerts.length === 0, `nominal alerts ${nominal.alerts.map((a) => a.id)}`)
assert(storm.score < 60, `storm score ${storm.score}`)
assert(storm.alerts.some((alert) => alert.id === 'spe'), 'storm missing spe')
assert(fatigue.score < 60, `fatigue score ${fatigue.score}`)
assert(fatigue.alerts.some((alert) => alert.id === 'fatigue-cascade'), 'fatigue missing cascade')
assert(acute.score < nominal.score, 'self-check did not lower the score')
assert(acute.alerts.some((alert) => alert.id === 'acute'), 'self-check missing acute flag')

if (failed) process.exit(1)
console.log('check ok')
