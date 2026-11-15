import { readFileSync } from 'node:fs'
import { daysForSubject, parseImport } from '../src/lib/import.ts'
import { STARTERS } from '../src/lib/starters.ts'
import { FOREST_CONTAMINATION, FOREST_TREES } from '../src/lib/forest.ts'
import { trainSubject } from '../src/lib/train.ts'

const root = new URL('..', import.meta.url)

console.log(`Isolation Forest · ${FOREST_TREES} trees · contamination ${FOREST_CONTAMINATION}`)
console.log('Reference: PRE_TEST when present, otherwise the first half (at most 14 sols).')
console.log('Each later sol: anomaly score and the 3 strongest rolling-baseline drivers.')
console.log('Shown: Cardiovasculaire, Neurologie, Immunité, Psychologie, Nutrition, Santé rénale.')
console.log('Left off the imported dashboard: bone, radiation, environment, one-session muscle tables.')
console.log('HRV and focus are not columns in these tables, so they are not scored.')

for (const starter of STARTERS) {
  const text = readFileSync(new URL(`public/starters/${starter.file}`, root), 'utf8')
  const parsed = parseImport(text, starter.file)
  console.log(`\n${starter.label} · ${starter.file} · ${parsed.subjects.length} subjects`)
  if (!parsed.ok) {
    console.log(`  skipped: ${parsed.errors.join(' ')}`)
    continue
  }
  for (const subject of parsed.subjects) {
    const days = daysForSubject(parsed.days, subject)
    const trained = trainSubject(days, parsed.measures)
    if (trained.later.length === 0) {
      console.log(`  ${subject}: reference ${trained.referenceKind} ${trained.referenceSols}, no later sol`)
      continue
    }
    console.log(`  ${subject}: reference ${trained.referenceKind} ${trained.referenceSols}, later ${trained.later.length}`)
    for (const sol of trained.later) {
      const drivers = sol.drivers.map((driver) => `${driver.feature} ${driver.z}`).join(', ')
      const phase = sol.phase ? `${sol.phase} ` : ''
      console.log(`    ${phase}sol ${sol.sol} score ${sol.anomaly} · ${drivers}`)
    }
  }
}
