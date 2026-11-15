import { useEffect, useMemo, useState } from 'react'
import { Chart } from './components/Chart.jsx'
import { toCsv } from './lib/csv.js'
import { evaluate } from './lib/engine.js'
import { DEFAULT_METRIC, METRICS } from './lib/metrics.js'
import { COMMS_DELAY_MIN, generateMission, SCENARIOS } from './lib/telemetry.js'

const STATUS_LABEL = { ready: 'READY', degraded: 'DEGRADED', risk: 'AT RISK' }

function loadDone() {
  try {
    return JSON.parse(localStorage.getItem('astropulse-done') || '{}')
  } catch {
    return {}
  }
}

function toneOf(score) {
  if (score >= 80) return 'ready'
  if (score >= 60) return 'degraded'
  return 'risk'
}

export default function App() {
  const [scenario, setScenario] = useState('nominal')
  const [metricId, setMetricId] = useState('hrv')
  const [overrides, setOverrides] = useState({})
  const [done, setDone] = useState(loadDone)
  const [clock, setClock] = useState(6 * 3600 + 12 * 60)

  const mission = useMemo(() => generateMission(scenario), [scenario])
  const today = mission.days[mission.days.length - 1]
  const self = {
    mood: overrides[scenario]?.mood ?? today.mood,
    focus: overrides[scenario]?.focus ?? today.focus,
    fatigue: overrides[scenario]?.fatigue ?? today.fatigue,
  }
  const report = useMemo(
    () => evaluate(mission.days, self),
    [mission, self.mood, self.focus, self.fatigue],
  )
  const metric = METRICS.find((item) => item.id === metricId) ?? METRICS[0]

  useEffect(() => {
    const id = setInterval(() => setClock((value) => value + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    setMetricId(DEFAULT_METRIC[scenario])
  }, [scenario])

  useEffect(() => {
    const onKey = (event) => {
      if (event.target instanceof HTMLInputElement && event.target.type !== 'range') return
      const match = SCENARIOS.find((item) => item.key === event.key)
      if (match) setScenario(match.id)
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

  function setSelf(field, value) {
    setOverrides((current) => ({
      ...current,
      [scenario]: { ...self, ...current[scenario], [field]: value },
    }))
  }

  function toggleProtocol(id) {
    const key = `${scenario}:${id}`
    setDone((current) => ({ ...current, [key]: !current[key] }))
  }

  function download() {
    const blob = new Blob([toCsv(mission.days, scenario)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `astro-pulse-${scenario}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const hh = String(Math.floor(clock / 3600)).padStart(2, '0')
  const mm = String(Math.floor((clock % 3600) / 60)).padStart(2, '0')
  const ss = String(clock % 60).padStart(2, '0')

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 32 32">
              <path d="M3 17h6l2.4-6 3.2 10 2.5-7H29" fill="none" stroke="#79e4ff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h1>ASTRO-PULSE</h1>
            <p>OFFLINE HEALTH OS · {mission.vehicle.toUpperCase()}</p>
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
              className={item.id === scenario ? 'scenario active' : 'scenario'}
              data-id={item.id}
              role="radio"
              aria-checked={item.id === scenario}
              onClick={() => setScenario(item.id)}
            >
              <b>{item.key} {item.label}</b>
              <small>{item.hint}</small>
            </button>
          ))}
        </div>
      </header>

      <main className="workspace resettle" key={scenario}>
        <section className="panel" aria-label="Mission readiness">
          <h2>Mission readiness</h2>
          <div className="score-block">
            <em className={`status-${report.status}`}>{report.score}</em>
            <div className={`status-${report.status}`} style={{ fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.16em', marginTop: 4 }}>
              {STATUS_LABEL[report.status]}
            </div>
            <div className="score-meta">
              <span>ANOMALY {report.anomaly}</span>
              <span>{report.penalty > 0 ? `CROSS −${report.penalty}` : 'CROSS 0'}</span>
            </div>
          </div>
          {report.axes.map((axis) => (
            <div className="axis" key={axis.id}>
              <div className="axis-top">
                <span>{axis.label}</span>
                <b className={`status-${toneOf(axis.score)}`}>{axis.score}</b>
              </div>
              <div className={`bar ${toneOf(axis.score)}`}>
                <i style={{ width: `${axis.score}%` }} />
              </div>
              <p>{axis.detail}</p>
            </div>
          ))}
        </section>

        <section className="panel trends" aria-label="Thirty sol trends">
          <div className="section-head">
            <h2 style={{ margin: 0 }}>30-sol record · SOL {mission.days[0].sol}–{today.sol}</h2>
            <button className="ghost" onClick={download}>Download CSV</button>
          </div>
          <div className="chips">
            {METRICS.map((item) => (
              <button
                key={item.id}
                className={item.id === metric.id ? 'on' : ''}
                onClick={() => setMetricId(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <Chart days={mission.days} metric={metric} />
          <div className="readout">
            {report.readout.map((cell) => (
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
          {report.alerts.length === 0 && (
            <div className="alert calm">
              <b>No cross-factor alert</b>
              <p>The four axes are inside the cruise set-points. Continue the daily plan.</p>
            </div>
          )}
          {report.alerts.slice(0, 3).map((alert) => (
            <div className={`alert ${alert.severity}`} key={alert.id}>
              <b>{alert.title}</b>
              <p>{alert.detail}</p>
            </div>
          ))}
          {report.protocols.map((protocol) => {
            const key = `${scenario}:${protocol.id}`
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
          </div>

          <div className="self-check">
            <div className="section-head">
              <span>Self-check · 3 questions</span>
            </div>
            <Slider label="Mood" low="Low" high="Steady" value={self.mood} onChange={(value) => setSelf('mood', value)} />
            <Slider label="Sharpness" low="Foggy" high="Sharp" value={self.focus} onChange={(value) => setSelf('focus', value)} />
            <Slider label="Exhaustion" low="Fresh" high="Depleted" value={self.fatigue} onChange={(value) => setSelf('fatigue', value)} />
          </div>
        </section>
      </main>

      <footer className="foot">
        <span>Simulated 30-sol record · MSL RAD 1.84 mSv/day (Zeitlin 2013) · HRP bone 1–1.5%/month · ARED 60 min · sleep 8 h · Not a medical device.</span>
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
