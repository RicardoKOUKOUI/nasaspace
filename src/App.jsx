import { useEffect, useMemo, useRef, useState } from 'react'
import { Chart } from './components/Chart.jsx'
import { DiagnosticPage } from './components/DiagnosticPage.jsx'
import { MethodPage } from './components/MethodPage.jsx'
import { columnStats, referenceSlice, rollingBaseline, valuesOf } from './lib/baseline.ts'
import { toCsv } from './lib/csv.js'
import { evaluate, evaluateImported } from './lib/engine.js'
import { CRUISE_MEASURES, cruiseRecords, scoreForest } from './lib/forest.ts'
import { daysForSubject, parseImport } from './lib/import.ts'
import { clearStoredImport, loadImport, saveImport } from './lib/localStore.ts'
import { DEFAULT_METRIC, METRICS } from './lib/metrics.js'
import { dashboardDomains, mergeDashboard } from './lib/domainView.ts'
import { feelingModels, metricReadings } from './lib/selfReport.ts'
import { localWatchStream } from './lib/watch.ts'
import { STARTERS, starterForFile } from './lib/starters.ts'
import { COMMS_DELAY_MIN, generateMission, SCENARIOS } from './lib/telemetry.js'
import { setLocale, t, useLocale } from './i18n/index.ts'

const PALETTE = ['#79e4ff', '#7dcec8', '#f0c14a', '#c3b4ff', '#ffb086', '#9fd0ff', '#ff8fa3', '#5ee0a8']
const METRIC_SECTIONS = new Set(['cardio', 'neuro', 'immune', 'behavior', 'nutrition', 'renal'])
const NAV = [
  { id: 'decision', label: 'nav.decision' },
  { id: 'diagnostic', label: 'nav.diagnostic' },
  { id: 'cardio', label: 'nav.cardio' },
  { id: 'neuro', label: 'nav.neuro' },
  { id: 'immune', label: 'nav.immune' },
  { id: 'behavior', label: 'nav.behavior' },
  { id: 'nutrition', label: 'nav.nutrition' },
  { id: 'renal', label: 'nav.renal' },
  { id: 'method', label: 'nav.method' },
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
  const locale = useLocale()
  const [scenario, setScenario] = useState('nominal')
  const [metricId, setMetricId] = useState('hrv')
  const [overrides, setOverrides] = useState({})
  const [done, setDone] = useState(loadDone)
  const [clock, setClock] = useState(6 * 3600 + 12 * 60)
  const [mode, setMode] = useState('demo')
  const [overview, setOverview] = useState(() => dashboardDomains([], []))
  const [landingModels, setLandingModels] = useState([])
  const [watchTick, setWatchTick] = useState(0)
  const [section, setSection] = useState(() => {
    const page = new URLSearchParams(window.location.search).get('page')
    return NAV.some((item) => item.id === page) ? page : 'decision'
  })
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
  const nominalRecords = useMemo(() => cruiseRecords(generateMission('nominal').days), [])
  const demoRecords = useMemo(() => cruiseRecords(mission.days), [mission])
  const demoForest = useMemo(
    () => scoreForest(demoRecords, CRUISE_MEASURES, { trainOn: nominalRecords }),
    [demoRecords, nominalRecords],
  )
  const importForest = useMemo(
    () => (showingDemo || !bundle ? null : scoreForest(importedDays, bundle.measures)),
    [showingDemo, importedDays, bundle],
  )
  const forest = showingDemo ? demoForest : importForest
  const datasetLabel = showingDemo ? 'Nominal' : (bundle?.label || subject || 'import')
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
    loadImport()
      .then((saved) => {
        if (cancel || !saved) return
        const result = parseImport(saved.text, saved.name)
        if (!result.ok || result.days.length === 0) return
        setBundle(result)
        setSubject(result.subjects[0] ?? '')
        setMode('imported')
        const first = result.measures[0]
        if (first) setMetricId(first.key)
      })
      .catch(() => {})
    return () => {
      cancel = true
    }
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
      setNotice(t('import.tooBig'))
    } else {
      setNotice('')
    }
    const result = parseImport(text, name)
    if (!result.ok || result.days.length === 0) {
      setNotice(result.errors[0] || t('import.empty'))
      return
    }
    setBundle(result)
    setSubject(result.subjects[0] ?? '')
    setImportSelf({})
    setMode('imported')
    const first = result.measures[0]
    if (first) setMetricId(first.key)
    saveImport(name, text).catch(() => {})
  }

  function clearData() {
    clearStoredImport()
      .catch(() => {})
      .finally(() => {
        try {
          localStorage.removeItem('astropulse-done')
        } catch {
          /* private mode */
        }
        setDone({})
        setBundle(null)
        setSubject('')
        setImportSelf({})
        setMode('demo')
        setNotice(t('data.cleared'))
      })
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
      setNotice(t('import.missingFile'))
      return
    }
    acceptText(await response.text(), starter.file, 0)
  }

  const hh = String(Math.floor(clock / 3600)).padStart(2, '0')
  const mm = String(Math.floor((clock % 3600) / 60)).padStart(2, '0')
  const ss = String(clock % 60).padStart(2, '0')
  const refStats = !showingDemo && metric ? columnStats(valuesOf(referenceSlice(days), metric.id)) : null
  const roll = !showingDemo && metric ? rollingBaseline(days, days.length - 1, metric.id) : null
  const flaggedSols = forest?.perSol
    ? forest.perSol
        .filter((item) => item.flagged)
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
  useEffect(() => {
    if (watchStream.length < 2) return undefined
    const id = setInterval(() => setWatchTick((value) => value + 1), 5000)
    return () => clearInterval(id)
  }, [watchStream.length])
  const domainAxes = !showingDemo && bundle ? dashboardDomains(bundle.measures, days) : overview
  const pageModel = feeling.find((item) => item.id === section) ?? null
  const pageReadings = pageModel
    ? metricReadings(pageModel.days, pageModel.measures, pageModel.id)
        .map((reading) => {
          if (pageModel.id !== 'cardio' || !watchPayload) return reading
          if (reading.key === 'hr') return { ...reading, value: watchPayload.hr }
          if (reading.key === 'sbp') return { ...reading, value: watchPayload.sbp }
          if (reading.key === 'dbp') return { ...reading, value: watchPayload.dbp }
          return reading
        })
        .filter((reading) => pageModel.id !== 'cardio' || ['hr', 'sbp', 'dbp'].includes(reading.key))
    : []
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
      <nav className="side-nav" aria-label={t('aria.sections')}>
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={section === item.id ? 'nav-item on' : 'nav-item'}
            aria-current={section === item.id ? 'page' : undefined}
            onClick={() => setSection(item.id)}
          >
            {t(item.label)}
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
            <p>{showingDemo ? t('brand.demo') : t('brand.imported', { name: (bundle?.label || 'FILE').toUpperCase() })}</p>
          </div>
        </div>
        <div className="clock">
          <strong>{t('clock.sol', { sol: today.sol, time: `${hh}:${mm}:${ss}` })}</strong>
          <p>{t('clock.delay', { min: COMMS_DELAY_MIN })}</p>
        </div>
        <div className="lang-toggle" role="group" aria-label={t('aria.language')}>
          <button type="button" className={locale === 'en' ? 'on' : ''} aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</button>
          <button type="button" className={locale === 'fr' ? 'on' : ''} aria-pressed={locale === 'fr'} onClick={() => setLocale('fr')}>FR</button>
        </div>
        <div className="scenarios" role="radiogroup" aria-label={t('aria.scenarios')}>
          {SCENARIOS.map((item) => (
            <button
              key={item.id}
              className={showingDemo && item.id === scenario ? 'scenario active' : 'scenario'}
              data-id={item.id}
              role="radio"
              aria-checked={showingDemo && item.id === scenario}
              onClick={() => returnToDemo(item.id)}
            >
              <b>{item.key} {t(`scenario.${item.id}`)}</b>
              <small>{t(`scenario.${item.id}Hint`)}</small>
            </button>
          ))}
        </div>
      </header>

      <main className={section === 'decision' ? 'workspace resettle' : 'workspace metric-page resettle'} key={section}>
        {section === 'diagnostic' && <DiagnosticPage />}
        {section === 'method' && <MethodPage />}
        {METRIC_SECTIONS.has(section) && (
          <section className="panel metric-sheet" aria-label={t(`nav.${section}`)}>
            <h2>{t(`nav.${section}`)}</h2>
            <p className="hint">{section === 'cardio' ? t('metric.watch') : t('metric.latest')}</p>
            {pageReadings.length === 0 ? (
              <p>{t('page.missing', { page: t(`nav.${section}`) })}</p>
            ) : (
            <div className="reading-grid">
              {pageReadings.map((reading) => (
                <article className="reading" key={reading.key}>
                  <span>{reading.label}</span>
                  <strong>{formatMeasure(reading.value)}{reading.unit ? <small> {reading.unit}</small> : null}</strong>
                  <p>{t('metric.range', { low: formatMeasure(reading.low), typical: formatMeasure(reading.typical), high: formatMeasure(reading.high), unit: reading.unit ? ` ${reading.unit}` : '' })}</p>
                </article>
              ))}
            </div>
            )}
          </section>
        )}
        {section === 'decision' && (
        <>
        <section className="panel" aria-label={t('aria.decision')}>
          <h2>{t('nav.decision')}</h2>
          {forest?.ready && forest.anomaly != null ? (
            <div className="score-block">
              <em className={forest.perSol.at(-1)?.flagged ? 'status-risk' : 'status-ready'}>{forest.anomaly}%</em>
              <div className={forest.perSol.at(-1)?.flagged ? 'status-risk' : 'status-ready'} style={{ fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.16em', marginTop: 4 }}>
                {forest.perSol.at(-1)?.flagged ? t('decision.consult') : t('decision.healthy')}
              </div>
              <p>
                {t('decision.threshold', { threshold: Number(forest.threshold).toFixed(1) })}
              </p>
              <p className="hint">{t('forest.provenance', { n: forest.referenceSols, dataset: datasetLabel })}</p>
              {forest.drivers.length > 0 && (
                <p className="hint">{forest.drivers.map((driver) => `${driver.label || driver.feature} ${driver.z}`).join(' · ')}</p>
              )}
            </div>
          ) : (
            <p>{t('forest.insufficient')}</p>
          )}
          {watchPayload && (
            <p className="hint">
              {t('watch.local', { hr: watchPayload.hr, sbp: watchPayload.sbp, dbp: watchPayload.dbp })}
            </p>
          )}
        </section>

        <section
          className={dragOver ? 'panel trends drag' : 'panel trends'}
          aria-label={t('aria.record')}
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
                ? t('record.demo', { from: mission.days[0].sol, to: today.sol })
                : t('record.rows', { n: days.length, from: days[0].sol, to: today.sol })}
            </h2>
            <button className="ghost" onClick={download}>{t('record.download')}</button>
          </div>
          <div className="import-bar">
            <button className="ghost" onClick={() => fileRef.current?.click()}>{t('record.import')}</button>
            <button className="ghost" type="button" onClick={clearData}>{t('data.clear')}</button>
            <a className="ghost" href="/exemple-import.csv" download>{t('record.example')}</a>
            <select aria-label={t('record.starter')} defaultValue="" onChange={(event) => { loadStarter(event.target.value); event.target.value = '' }}>
              <option value="">{t('record.starter')}</option>
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
          {showingDemo ? (
            <p className="import-note">{t('record.simulation')}</p>
          ) : bundle && (
            <p className="import-note">
              {starterForFile(bundle.label) && (
                <strong className="source-badge">{t(`source.${starterForFile(bundle.label).source}`)}</strong>
              )}
              {t('record.counts', { rows: bundle.days.length, subjects: bundle.subjects.length })}
              {bundle.reference && (
                <>
                  {' · '}
                  <a href={bundle.reference}>{bundle.reference}</a>
                </>
              )}
            </p>
          )}
          {!showingDemo && bundle && bundle.subjects.length > 1 && (
            <label className="import-note">
              {t('record.subject')}
              <select aria-label={t('aria.subject')} value={subject} onChange={(event) => setSubject(event.target.value)}>
                {bundle.subjects.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
          )}
          {notice && <p className="import-note">{notice}</p>}
          {!showingDemo && bundle?.notes?.[0] && <p className="import-note">{bundle.notes[0]}</p>}
          {!showingDemo && bundle?.unassigned?.length > 0 && (
            <p className="import-note">{t('record.unassigned', { list: `${bundle.unassigned.slice(0, 8).join(', ')}${bundle.unassigned.length > 8 ? ` +${bundle.unassigned.length - 8}` : ''}` })}</p>
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
            <select aria-label={t('aria.measure')} value={metric.id} onChange={(event) => setMetricId(event.target.value)}>
              {metrics.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          )}
          <Chart days={days} metric={metric} />
          {!showingDemo && (
            <p className="import-note">
              {refStats ? t('record.referenceMean', { mean: refStats.mean.toFixed(2), std: refStats.std.toFixed(2) }) : t('record.noReference')}
              {roll ? ` · ${t('record.previous', { n: roll.n, mean: roll.mean.toFixed(2), std: roll.std.toFixed(2) })}` : ` · ${t('record.noPrevious')}`}
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

        <section className="panel copilot" aria-label={t('aria.copilot')}>
          <div className="copilot-scroll">
          <h2>{t('copilot.title')}</h2>
          <p className="delay">
            {t('copilot.delay', { min: COMMS_DELAY_MIN })}
          </p>
          {!showingDemo && report.unmeasured && (
            <div className="alert calm">
              <b>{t('copilot.clinicalOff')}</b>
              <p>
                {domainAxes.some((axis) => axis.detail !== '—')
                  ? t('copilot.fills', { list: domainAxes.filter((axis) => axis.detail !== '—').map((axis) => t(`nav.${axis.id}`)).join(', ') })
                  : t('copilot.none')}
              </p>
            </div>
          )}
          {showingDemo && !report.unmeasured && report.alerts.length === 0 && (
            <div className="alert calm">
              <b>{t('copilot.categories')}</b>
              <p>{t('copilot.categoriesList')}</p>
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
                  {checked ? t('protocol.done') : t('protocol.mark')}
                </button>
              </article>
            )
          })}
          {flaggedSols.length > 0 && (
            <div className="alert degraded">
              <b>{t('copilot.drivers')}</b>
              {flaggedSols.map((item) => (
                <p key={`${item.phase ?? ''}:${item.day}`}>
                  {t('copilot.sol', {
                    sol: item.sol,
                    phase: item.phase ? ` · ${item.phase}` : '',
                    score: item.anomaly,
                    drivers: item.drivers.filter((driver) => driver.z >= 2).map((driver) => `${driver.label || driver.feature} (${driver.domain}) |z| ${driver.z}`).join(' · '),
                  })}
                </p>
              ))}
            </div>
          )}
          </div>

          {hasSelf && (
            <div className="self-check">
              <div className="section-head">
                <span>{t('self.title')}</span>
              </div>
              <Slider label={t('self.mood')} low={t('self.moodLow')} high={t('self.moodHigh')} value={self.mood} onChange={(value) => setSelf('mood', value)} />
              <Slider label={t('self.focus')} low={t('self.focusLow')} high={t('self.focusHigh')} value={self.focus} onChange={(value) => setSelf('focus', value)} />
              <Slider label={t('self.fatigue')} low={t('self.fatigueLow')} high={t('self.fatigueHigh')} value={self.fatigue} onChange={(value) => setSelf('fatigue', value)} />
            </div>
          )}
        </section>
        </>
        )}
      </main>

      <footer className="foot">
        <span>{t('footer.note')}</span>
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
