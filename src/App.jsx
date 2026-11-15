import { useEffect, useMemo, useRef, useState } from 'react'
import { Chart } from './components/Chart.jsx'
import { columnStats, referenceSlice, rollingBaseline, valuesOf } from './lib/baseline.ts'
import { toCsv } from './lib/csv.js'
import { evaluate, evaluateImported } from './lib/engine.js'
import { scoreForest } from './lib/forest.ts'
import { daysForSubject, parseImport } from './lib/import.ts'
import { DEFAULT_METRIC, METRICS } from './lib/metrics.js'
import { dashboardDomains, mergeDashboard } from './lib/domainView.ts'
import { feelingModels } from './lib/selfReport.ts'
import { HEALTH_CUTOFF_NAME, localWatchStream, scoreWatch } from './lib/watch.ts'
import { STARTERS } from './lib/starters.ts'
import { COMMS_DELAY_MIN, generateMission, SCENARIOS } from './lib/telemetry.js'
import modelReport from '../data/model_scores.json'

const STATUS_LABEL = { ready: 'READY', degraded: 'DEGRADED', risk: 'AT RISK', unmeasured: 'NOT MEASURED' }
const PALETTE = ['#79e4ff', '#7dcec8', '#f0c14a', '#c3b4ff', '#ffb086', '#9fd0ff', '#ff8fa3', '#5ee0a8']
const NAV = [
  { id: 'decision', label: 'Décision' },
  { id: 'cardio', label: 'Cardiovasculaire' },
  { id: 'neuro', label: 'Neurologie' },
  { id: 'immune', label: 'Immunité' },
  { id: 'behavior', label: 'Psychologie' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'renal', label: 'Santé rénale' },
]

function loadDone() {
  try {
    return JSON.parse(localStorage.getItem('astropulse-done') || '{}')
  } catch {
    return {}
  }
}

function formatMeasure(value) {
  const abs = Math.abs(value)
  if (abs >= 100) return String(Math.round(value))
  if (abs >= 10) return String(Math.round(value * 10) / 10)
  return String(Math.round(value * 1000) / 1000)
}

function viewOf(measure, index) {
  const known = METRICS.find((item) => item.id === measure.key)
  if (known) return known
  return {
    id: measure.key,
    label: measure.label,
    unit: measure.unit || '',
    color: PALETTE[index % PALETTE.length],
  }
}

export default function App() {
  const [scenario, setScenario] = useState('nominal')
  const [metricId, setMetricId] = useState('hrv')
  const [overrides, setOverrides] = useState({})
  const [done, setDone] = useState(loadDone)
  const [clock, setClock] = useState(6 * 3600 + 12 * 60)
  const [mode, setMode] = useState('demo')
  const [overview, setOverview] = useState(() => dashboardDomains([], []))
  const [landingModels, setLandingModels] = useState([])
  const [watchTick, setWatchTick] = useState(0)
  const [section, setSection] = useState('decision')
  const [bundle, setBundle] = useState(null)
  const [subject, setSubject] = useState('')
  const [notice, setNotice] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [importSelf, setImportSelf] = useState({})
  const fileRef = useRef(null)

  const mission = useMemo(() => generateMission(scenario), [scenario])
  const importedDays = useMemo(
    () => (bundle ? daysForSubject(bundle.days, subject) : []),
    [bundle, subject],
  )
  const showingDemo = mode !== 'imported' || importedDays.length === 0
  const days = showingDemo ? mission.days : importedDays
  const today = days[days.length - 1]
  const self = showingDemo
    ? {
        mood: overrides[scenario]?.mood ?? today.mood,
        focus: overrides[scenario]?.focus ?? today.focus,
        fatigue: overrides[scenario]?.fatigue ?? today.fatigue,
      }
    : {
        mood: importSelf.mood ?? today.mood,
        focus: importSelf.focus ?? today.focus,
        fatigue: importSelf.fatigue ?? today.fatigue,
      }
  const demoReport = useMemo(
    () => evaluate(mission.days, {
      mood: overrides[scenario]?.mood ?? mission.days[mission.days.length - 1].mood,
      focus: overrides[scenario]?.focus ?? mission.days[mission.days.length - 1].focus,
      fatigue: overrides[scenario]?.fatigue ?? mission.days[mission.days.length - 1].fatigue,
    }),
    [mission, scenario, overrides],
  )
  const importReport = useMemo(
    () => (showingDemo ? null : evaluateImported(importedDays, self)),
    [showingDemo, importedDays, self.mood, self.focus, self.fatigue],
  )
  const report = showingDemo ? demoReport : importReport
  const demoForest = modelReport.scenarios[scenario]
  const importForest = useMemo(
    () => (showingDemo || !bundle ? null : scoreForest(importedDays, bundle.measures)),
    [showingDemo, importedDays, bundle],
  )
  const forest = showingDemo ? demoForest : importForest
  const metrics = showingDemo
    ? METRICS.filter((item) => !['dose', 'aredMin', 'bmd', 'crp'].includes(item.id))
    : (bundle?.measures ?? []).map(viewOf)
  const metric = metrics.find((item) => item.id === metricId) ?? metrics[0] ?? METRICS[0]
  const hasSelf = showingDemo || ['mood', 'focus', 'fatigue'].some((key) => typeof today[key] === 'number')

  useEffect(() => {
    const id = setInterval(() => setClock((value) => value + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancel = false
    async function loadOverview() {
      const views = []
      const picked = new Map()
      for (const starter of STARTERS) {
        try {
          const response = await fetch(`/starters/${starter.file}`)
          if (!response.ok) continue
          const parsed = parseImport(await response.text(), starter.file)
          const subjectId = parsed.subjects[0]
          if (!parsed.ok || !subjectId) continue
          const subjectDays = daysForSubject(parsed.days, subjectId)
          views.push(dashboardDomains(parsed.measures, subjectDays))
          for (const model of feelingModels(parsed.measures, subjectDays)) {
            if (!picked.has(model.id)) picked.set(model.id, model)
          }
        } catch {
          // A missing starter leaves that category blank.
        }
      }
      if (!cancel && views.length) {
        setOverview(mergeDashboard(views))
        setLandingModels([...picked.values()])
      }
    }
    loadOverview()
    return () => { cancel = true }
  }, [])

  useEffect(() => {
    if (showingDemo) setMetricId(DEFAULT_METRIC[scenario])
  }, [scenario, showingDemo])

  useEffect(() => {
    setImportSelf({})
  }, [subject])

  useEffect(() => {
    const onKey = (event) => {
      if (event.target instanceof HTMLInputElement && event.target.type !== 'range') return
      if (event.target instanceof HTMLSelectElement) return
      const match = SCENARIOS.find((item) => item.key === event.key)
      if (match) {
        setMode('demo')
        setScenario(match.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('astropulse-done', JSON.stringify(done))
    } catch {
      /* private mode */
    }
  }, [done])

  function returnToDemo(id) {
    setMode('demo')
    setScenario(id)
  }

  function setSelf(field, value) {
    if (!showingDemo) {
      setImportSelf((current) => ({ ...current, [field]: value }))
      return
    }
    setOverrides((current) => ({
      ...current,
      [scenario]: { ...self, ...current[scenario], [field]: value },
    }))
  }

  function toggleProtocol(id) {
    const key = `${showingDemo ? scenario : `import:${subject}`}:${id}`
    setDone((current) => ({ ...current, [key]: !current[key] }))
  }

  function download() {
    const csv = showingDemo || !bundle
      ? toCsv(mission.days, scenario)
      : [
          ['subject', 'sol', 'date', ...bundle.measures.map((measure) => measure.key)].join(','),
          ...days.map((day) => [
            day.subject,
            day.sol,
            day.date ?? '',
            ...bundle.measures.map((measure) => day.values[measure.key] ?? ''),
          ].join(',')),
        ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = showingDemo ? `astro-pulse-${scenario}.csv` : `astro-pulse-${subject || 'import'}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  function acceptText(text, name, size = 0) {
    if (size > 50 * 1024 * 1024) {
      setNotice('File is over 50 MB. An Apple Health export is read only for heart rate, HRV, and sleep.')
    } else {
      setNotice('')
    }
    const result = parseImport(text, name)
    if (!result.ok || result.days.length === 0) {
      setNotice(result.errors[0] || 'Nothing to import. Demo stays on screen.')
      return
    }
    setBundle(result)
    setSubject(result.subjects[0] ?? '')
    setImportSelf({})
    setMode('imported')
    const first = result.measures[0]
    if (first) setMetricId(first.key)
  }

  function onFile(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => acceptText(String(reader.result ?? ''), file.name, file.size)
    reader.readAsText(file)
  }

  async function loadStarter(id) {
    const starter = STARTERS.find((item) => item.id === id)
    if (!starter) return
    const response = await fetch(`/starters/${starter.file}`)
    if (!response.ok) {
      setNotice('That starter file is not in this build.')
      return
    }
    acceptText(await response.text(), starter.file, 0)
  }

  const hh = String(Math.floor(clock / 3600)).padStart(2, '0')
  const mm = String(Math.floor((clock % 3600) / 60)).padStart(2, '0')
  const ss = String(clock % 60).padStart(2, '0')
  const refStats = !showingDemo && metric ? columnStats(valuesOf(referenceSlice(days), metric.id)) : null
  const roll = !showingDemo && metric ? rollingBaseline(days, days.length - 1, metric.id) : null
  const flaggedSols = !showingDemo && forest?.perSol
    ? forest.perSol
        .filter((item) => item.anomaly >= 40 && item.drivers.some((driver) => driver.z >= 2))
        .slice()
        .sort((a, b) => b.anomaly - a.anomaly)
        .slice(0, 3)
    : []
  const importedModels = useMemo(
    () => (showingDemo || !bundle ? [] : feelingModels(bundle.measures, importedDays)),
    [showingDemo, bundle, importedDays],
  )
  const feeling = showingDemo ? landingModels : importedModels
  const cardioModel = feeling.find((item) => item.id === 'cardio') ?? null
  const watchStream = useMemo(
    () => (cardioModel ? localWatchStream(cardioModel.days) : []),
    [cardioModel],
  )
  const watchPayload = watchStream[watchTick % Math.max(watchStream.length, 1)] ?? null
  const watchScore = useMemo(
    () => (cardioModel && watchPayload ? scoreWatch(cardioModel.days, cardioModel.measures, watchPayload) : null),
    [cardioModel, watchPayload],
  )
  useEffect(() => {
    if (watchStream.length < 2) return undefined
    const id = setInterval(() => setWatchTick((value) => value + 1), 5000)
    return () => clearInterval(id)
  }, [watchStream.length])
  const domainAxes = !showingDemo && bundle ? dashboardDomains(bundle.measures, days) : overview
  const readout = report.readout.length
    ? report.readout
    : (bundle?.measures ?? []).slice(0, 6).map((measure) => {
        const value = today.values?.[measure.key]
        return {
          label: measure.label,
          value: typeof value === 'number' ? formatMeasure(value) : '—',
          unit: measure.unit || measure.domain,
          tone: 'ready',
        }
      })
  const visibleReadout = showingDemo
    ? readout.filter((cell) => !['ARED', 'Dose', 'Cumul.', 'BMD', 'CRP'].includes(cell.label))
    : readout

  return (
    <div className="app">
      <nav className="side-nav" aria-label="Sections">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={section === item.id ? 'nav-item on' : 'nav-item'}
            aria-current={section === item.id ? 'page' : undefined}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 32 32">
              <path d="M3 17h6l2.4-6 3.2 10 2.5-7H29" fill="none" stroke="#79e4ff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h1>ASTRO-PULSE</h1>
            <p>{showingDemo ? `OFFLINE HEALTH OS · ${mission.vehicle.toUpperCase()}` : `IMPORTED · ${(bundle?.label || 'FILE').toUpperCase()}`}</p>
          </div>
        </div>
        <div className="clock">
          <strong>SOL {today.sol} · {hh}:{mm}:{ss}</strong>
          <p>EARTH LINK DELAY {COMMS_DELAY_MIN} MIN · LOCAL ONLY</p>
        </div>
        <div className="scenarios" role="radiogroup" aria-label="Demo scenario">
          {SCENARIOS.map((item) => (
            <button
              key={item.id}
              className={showingDemo && item.id === scenario ? 'scenario active' : 'scenario'}
              data-id={item.id}
              role="radio"
              aria-checked={showingDemo && item.id === scenario}
              onClick={() => returnToDemo(item.id)}
            >
              <b>{item.key} {item.label}</b>
              <small>{item.hint}</small>
            </button>
          ))}
        </div>
      </header>

      <main className="workspace resettle" key={showingDemo ? scenario : `${subject}:${bundle?.label}`}>
        <section className="panel" aria-label="Mission readiness">
          <h2>Mission readiness</h2>
          <div className="score-block">
            {report.unmeasured ? (
              <em className="status-unmeasured">—</em>
            ) : (
              <em className={`status-${report.status}`}>{report.score}</em>
            )}
            <div className={`status-${report.status}`} style={{ fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.16em', marginTop: 4 }}>
              {STATUS_LABEL[report.status] || STATUS_LABEL.unmeasured}
            </div>
            <div className="score-meta">
              <span>FOREST {forest?.anomaly ?? '—'}</span>
              <span>ANOMALY {report.anomaly ?? '—'}</span>
              <span>{report.penalty > 0 ? `CROSS −${report.penalty}` : 'CROSS 0'}</span>
            </div>
            <p className="hint">
              Isolation Forest · {forest?.flaggedSols ?? 0}/{forest?.sols ?? days.length} sols
              {forest && forest.anomaly >= 40 && forest.drivers.length > 0
                ? ` · ${forest.drivers.map((item) => item.label || item.feature).join(', ')}`
                : ''}
            </p>
            {!showingDemo && forest?.referenceSols ? (
              <p className="hint">
                Reference: {forest.referenceKind === 'pre' ? `PRE_TEST (${forest.referenceSols} sols)` : `first ${forest.referenceSols} sols`} of this subject.
                Drivers use the rolling mean and SD, or that reference when fewer than two earlier sols exist. Missing cells stay empty.
              </p>
            ) : null}
          </div>
          {watchPayload && watchScore?.anomaly != null && (
            <div className="axis">
              <div className="axis-top">
                <span>{watchScore.anomaly}%</span>
                <b>{watchScore.decision}</b>
              </div>
              <p>
                {HEALTH_CUTOFF_NAME}. en bonne santé sous 40, à consulter à partir de 40.
                Signal local en forme de montre : HR {watchPayload.hr} bpm · SBP {watchPayload.sbp} · DBP {watchPayload.dbp}. Aucun appareil Bluetooth n'est appairé.
              </p>
              {watchScore.drivers.length > 0 && (
                <p className="hint">{watchScore.drivers.map((driver) => `${driver.label || driver.feature} ${driver.z}`).join(' · ')}</p>
              )}
            </div>
          )}
          {domainAxes.filter((axis) => section === 'decision' || axis.id === section).map((axis) => {
            const model = feeling.find((item) => item.id === axis.id)
            const fromWatch = axis.id === 'cardio' && watchPayload
            const detail = fromWatch
              ? `Heart rate ${watchPayload.hr} bpm · Systolic ${watchPayload.sbp} mmHg · Diastolic ${watchPayload.dbp} mmHg`
              : axis.detail
            const band = model?.interval
            return (
              <div className="axis" key={axis.id}>
                <div className="axis-top">
                  <span>{axis.label}</span>
                </div>
                <p>{detail}</p>
                {band ? (
                  <p className="hint">
                    Bas {formatMeasure(band.low)} · Typique {formatMeasure(band.typical)} · Haut {formatMeasure(band.high)}
                    {band.unit ? ` ${band.unit}` : ''} · {band.measure}
                  </p>
                ) : null}
                <p className="hint">{fromWatch ? 'Montre · HR, SBP, DBP' : 'Dernière ligne d’entraînement'}</p>
              </div>
            )
          })}
          {domainAxes.length === 0 && (
            <p className="hint">No heart, sensorimotor, immune, nutrition, renal, or behavior series in this file.</p>
          )}
        </section>

        <section
          className={dragOver ? 'panel trends drag' : 'panel trends'}
          aria-label="Record"
          onDragOver={(event) => {
            event.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragOver(false)
            onFile(event.dataTransfer.files?.[0])
          }}
        >
          <div className="section-head">
            <h2 style={{ margin: 0 }}>
              {showingDemo
                ? `30-sol record · SOL ${mission.days[0].sol}–${today.sol}`
                : `${days.length} rows · SOL ${days[0].sol}–${today.sol}`}
            </h2>
            <button className="ghost" onClick={download}>Download CSV</button>
          </div>
          <div className="import-bar">
            <button className="ghost" onClick={() => fileRef.current?.click()}>Import</button>
            <a className="ghost" href="/exemple-import.csv" download>Example CSV</a>
            <select aria-label="Starter dataset" defaultValue="" onChange={(event) => { loadStarter(event.target.value); event.target.value = '' }}>
              <option value="">Starter dataset</option>
              {STARTERS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,.xml,text/csv,application/json,text/xml"
              hidden
              onChange={(event) => {
                onFile(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </div>
          {!showingDemo && bundle && bundle.subjects.length > 1 && (
            <label className="import-note">
              Subject
              <select aria-label="Subject" value={subject} onChange={(event) => setSubject(event.target.value)}>
                {bundle.subjects.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
          )}
          {notice && <p className="import-note">{notice}</p>}
          {!showingDemo && bundle?.notes?.[0] && <p className="import-note">{bundle.notes[0]}</p>}
          {!showingDemo && bundle?.unassigned?.length > 0 && (
            <p className="import-note">Unassigned: {bundle.unassigned.slice(0, 8).join(', ')}{bundle.unassigned.length > 8 ? ` +${bundle.unassigned.length - 8}` : ''}</p>
          )}
          <div className="chips">
            {metrics.slice(0, 12).map((item) => (
              <button
                key={item.id}
                className={item.id === metric.id ? 'on' : ''}
                onClick={() => setMetricId(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {metrics.length > 12 && (
            <select aria-label="Measure" value={metric.id} onChange={(event) => setMetricId(event.target.value)}>
              {metrics.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          )}
          <Chart days={days} metric={metric} />
          {!showingDemo && (
            <p className="import-note">
              {refStats ? `Personal reference ${refStats.mean.toFixed(2)} ± ${refStats.std.toFixed(2)}` : 'No reference yet'}
              {roll ? ` · previous ${roll.n} sols ${roll.mean.toFixed(2)} ± ${roll.std.toFixed(2)}` : ' · no previous sols'}
              {metric.unit ? ` ${metric.unit}` : ''}
            </p>
          )}
          <div className="readout">
            {visibleReadout.map((cell) => (
              <article key={cell.label} className={cell.tone}>
                <span>{cell.label}</span>
                <strong>{cell.value}</strong>
                <small>{cell.unit}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="panel copilot" aria-label="Copilot">
          <div className="copilot-scroll">
          <h2>Action copilot</h2>
          <p className="delay">
            Ground round-trip is {COMMS_DELAY_MIN} minutes. This plan does not wait for it.
          </p>
          {!showingDemo && report.unmeasured && (
            <div className="alert calm">
              <b>Clinical cruise score off</b>
              <p>
                {domainAxes.some((axis) => axis.detail !== '—')
                  ? `This file fills ${domainAxes.filter((axis) => axis.detail !== '—').map((axis) => axis.label).join(', ')}. The other five labels stay empty.`
                  : 'None of the six labels has a number in this file, so no cruise protocol starts.'}
              </p>
            </div>
          )}
          {showingDemo && !report.unmeasured && report.alerts.length === 0 && (
            <div className="alert calm">
              <b>Six measured categories</b>
              <p>Cardiovasculaire, Neurologie, Immunité, Psychologie, Nutrition, Santé rénale.</p>
            </div>
          )}
          {report.alerts.slice(0, 3).map((alert) => (
            <div className={`alert ${alert.severity}`} key={alert.id}>
              <b>{alert.title}</b>
              <p>{alert.detail}</p>
            </div>
          ))}
          {(showingDemo && scenario === 'nominal' ? [] : report.protocols).map((protocol) => {
            const key = `${showingDemo ? scenario : `import:${subject}`}:${protocol.id}`
            const checked = Boolean(done[key])
            return (
              <article className="protocol" key={protocol.id}>
                <div className="protocol-top">
                  <b>{protocol.title}</b>
                  <span className="hint">{protocol.minutes} MIN</span>
                </div>
                <p>{protocol.why}</p>
                <ol>
                  {protocol.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <button className={checked ? 'mark done' : 'mark'} aria-pressed={checked} onClick={() => toggleProtocol(protocol.id)}>
                  {checked ? 'Validated on board' : 'Mark done'}
                </button>
              </article>
            )
          })}
          {!showingDemo && flaggedSols.length > 0 && (
            <div className="alert degraded">
              <b>Top drivers</b>
              {flaggedSols.map((item) => (
                <p key={`${item.phase ?? ''}:${item.day}`}>
                  Sol {item.sol}{item.phase ? ` · ${item.phase}` : ''} · score {item.anomaly} · {item.drivers.filter((driver) => driver.z >= 2).map((driver) => `${driver.label || driver.feature} (${driver.domain}) |z| ${driver.z}`).join(' · ')}
                </p>
              ))}
            </div>
          )}
          </div>

          {hasSelf && (
            <div className="self-check">
              <div className="section-head">
                <span>Self-check · 3 questions</span>
              </div>
              <Slider label="Mood" low="Low" high="Steady" value={self.mood} onChange={(value) => setSelf('mood', value)} />
              <Slider label="Sharpness" low="Foggy" high="Sharp" value={self.focus} onChange={(value) => setSelf('focus', value)} />
              <Slider label="Exhaustion" low="Fresh" high="Depleted" value={self.fatigue} onChange={(value) => setSelf('fatigue', value)} />
            </div>
          )}
        </section>
      </main>

      <footer className="foot">
        <span>Public starter tables for the six measured categories. Not a medical device.</span>
      </footer>
    </div>
  )
}

function Slider({ label, low, high, value, onChange }) {
  return (
    <label className="slider">
      <span className="slider-top">
        <span>{label}</span>
        <b>{value}/5</b>
      </span>
      <input
        type="range"
        min="1"
        max="5"
        step="1"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="slider-scale">
        <i>{low}</i>
        <i>{high}</i>
      </span>
    </label>
  )
}
