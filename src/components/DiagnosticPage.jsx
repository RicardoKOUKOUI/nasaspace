import { useMemo, useState } from 'react'
import { CLINIC_SCENARIOS, diagnose, manualSeries } from '../lib/diagnostic.ts'

const FIELDS = [
  ['hr', 'FC repos', 'bpm', 1],
  ['hrv', 'HRV', 'ms', 1],
  ['sbp', 'Systolique', 'mmHg', 1],
  ['dbp', 'Diastolique', 'mmHg', 1],
  ['spo2', 'SpO2', '%', 1],
  ['aredMin', 'ARED', 'min', 1],
  ['loadKg', 'Charge', 'kg', 1],
  ['boneLossPctMonth', 'Perte osseuse', '%/mois', 0.1],
  ['vitaminDIu', 'Vitamine D', 'UI', 10],
  ['calciumMg', 'Calcium', 'mg', 10],
  ['doseRate', 'Débit', 'mSv/j', 0.1],
  ['cumDoseMsv', 'Dose cumulée', 'mSv', 0.1],
  ['crp', 'CRP', 'mg/L', 0.1],
  ['sleepH', 'Sommeil', 'h', 0.1],
  ['sleepQuality', 'Qualité sommeil', '0-100', 1],
  ['stress', 'Stress', '1-10', 1],
  ['fatigue', 'Fatigue', '1-10', 1],
  ['vigilance', 'Vigilance', '1-10', 1],
  ['hydration', 'Hydratation', '1-10', 1],
]

function draftFrom(days) {
  const today = days[days.length - 1]
  return {
    today: { ...today },
    hrAgo: days[0].hr,
    hrvAgo: days[0].hrv,
    aredAgo: days[0].aredMin,
  }
}

export function DiagnosticPage() {
  const initial = new URLSearchParams(window.location.search).get('clinic')
  const [clinicId, setClinicId] = useState(CLINIC_SCENARIOS.some((item) => item.id === initial) ? initial : 'nominal')
  const [checked, setChecked] = useState([])
  const [manual, setManual] = useState(false)
  const [draft, setDraft] = useState(() => draftFrom(CLINIC_SCENARIOS[0].days))

  const days = useMemo(() => {
    if (manual) return manualSeries(draft.today, draft)
    return CLINIC_SCENARIOS.find((item) => item.id === clinicId).days
  }, [manual, draft, clinicId])
  const report = useMemo(() => diagnose(days, checked), [days, checked])

  function selectScenario(id) {
    const next = CLINIC_SCENARIOS.find((item) => item.id === id)
    setClinicId(id)
    setChecked([])
    setManual(false)
    setDraft(draftFrom(next.days))
  }

  function openManual() {
    const source = CLINIC_SCENARIOS.find((item) => item.id === clinicId)
    setDraft(draftFrom(source.days))
    setChecked([])
    setManual(true)
  }

  function toggle(id) {
    setChecked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  function editToday(key, raw) {
    const value = Number(raw)
    if (!Number.isFinite(value)) return
    setDraft((current) => ({ ...current, today: { ...current.today, [key]: value } }))
  }

  return (
    <section className="panel clinic" aria-label="Diagnostic">
      <h2>Diagnostic</h2>
      <p className="hint">
        Scénario simulé. Seuils de règles HRP, pas un modèle entraîné sur des données d’astronautes. Not a medical device.
      </p>
      <div className="clinic-bar" role="toolbar" aria-label="Scénarios simulés">
        {CLINIC_SCENARIOS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={!manual && clinicId === item.id ? 'scenario active' : 'scenario'}
            aria-pressed={!manual && clinicId === item.id}
            onClick={() => selectScenario(item.id)}
          >
            <b>{item.label}</b>
          </button>
        ))}
        <button type="button" className={manual ? 'scenario active' : 'scenario'} aria-pressed={manual} onClick={openManual}>
          <b>Saisir mes constantes manuellement</b>
        </button>
      </div>

      <div className="clinic-grid">
        <div>
          <div className={`score-block status-${report.band === 'nominal' ? 'ready' : report.band === 'vigilance' ? 'degraded' : 'risk'}`}>
            <em>{report.score}</em>
            <div className={report.band === 'nominal' ? 'status-ready' : report.band === 'vigilance' ? 'status-degraded' : 'status-risk'}>
              {report.bandLabel}
            </div>
            <p>Préparation mission 0–100. Nominal dès 80, vigilance dès 60, critique en dessous.</p>
            <p className="hint">Si rien n’est fait, +7 jours : {report.projectedScore}.</p>
          </div>

          {report.diagnoses.length === 0 ? (
            <p>Aucune des cinq règles croisées n’est active.</p>
          ) : (
            report.diagnoses.map((item) => (
              <article className="dx-card" key={item.id}>
                <div className="axis-top">
                  <span>{item.name}</span>
                  <b className={item.severity === 'critique' ? 'status-risk' : 'status-degraded'}>{item.severityLabel}</b>
                </div>
                <p>{item.biomarkers}</p>
                <p className="hint">{item.projection}</p>
              </article>
            ))
          )}
        </div>

        <div>
          <h3>Contre-mesures</h3>
          {report.actions.length === 0 ? (
            <p className="hint">Aucune contre-mesure d’urgence. Le plan quotidien suffit.</p>
          ) : (
            report.actions.map((action) => (
              <label className="check-row" key={action.id}>
                <input type="checkbox" checked={checked.includes(action.id)} onChange={() => toggle(action.id)} />
                <span>
                  <b>{action.label}</b>
                  <small> +{action.recovery} sur le score</small>
                </span>
              </label>
            ))
          )}

          <div className="reading-grid clinic-groups">
            {report.groups.map((group) => (
              <article className="reading" key={group.id}>
                <span>{group.label}</span>
                <strong>{group.score}</strong>
                {group.lines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </article>
            ))}
          </div>
        </div>
      </div>

      {manual && (
        <form className="manual-grid" onSubmit={(event) => event.preventDefault()}>
          {FIELDS.map(([key, label, unit, step]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                step={step}
                value={draft.today[key]}
                aria-label={label}
                onChange={(event) => editToday(key, event.target.value)}
              />
              <small>{unit}</small>
            </label>
          ))}
          <label>
            FC il y a 3 jours
            <input type="number" value={draft.hrAgo} aria-label="FC il y a 3 jours" onChange={(event) => setDraft((current) => ({ ...current, hrAgo: Number(event.target.value) }))} />
            <small>bpm</small>
          </label>
          <label>
            HRV il y a 3 jours
            <input type="number" value={draft.hrvAgo} aria-label="HRV il y a 3 jours" onChange={(event) => setDraft((current) => ({ ...current, hrvAgo: Number(event.target.value) }))} />
            <small>ms</small>
          </label>
          <label>
            ARED il y a 3 jours
            <input type="number" value={draft.aredAgo} aria-label="ARED il y a 3 jours" onChange={(event) => setDraft((current) => ({ ...current, aredAgo: Number(event.target.value) }))} />
            <small>min</small>
          </label>
        </form>
      )}
    </section>
  )
}
