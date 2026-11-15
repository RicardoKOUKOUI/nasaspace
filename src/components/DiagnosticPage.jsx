import { useMemo, useState } from 'react'
import { CLINIC_SCENARIOS, diagnose, manualSeries } from '../lib/diagnostic.ts'
import { t, useLocale } from '../i18n/index.ts'

const FIELD_KEYS = [
  ['hr', 'bpm', 1],
  ['hrv', 'ms', 1],
  ['sbp', 'mmHg', 1],
  ['dbp', 'mmHg', 1],
  ['spo2', '%', 1],
  ['aredMin', 'min', 1],
  ['loadKg', 'kg', 1],
  ['boneLossPctMonth', '%/mo', 0.1],
  ['vitaminDIu', 'IU', 10],
  ['calciumMg', 'mg', 10],
  ['doseRate', 'mSv/d', 0.1],
  ['cumDoseMsv', 'mSv', 0.1],
  ['crp', 'mg/L', 0.1],
  ['sleepH', 'h', 0.1],
  ['sleepQuality', '0-100', 1],
  ['stress', '1-10', 1],
  ['fatigue', '1-10', 1],
  ['vigilance', '1-10', 1],
  ['hydration', '1-10', 1],
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
  useLocale()
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
    <section className="panel clinic" aria-label={t('clinic.title')}>
      <h2>{t('clinic.title')}</h2>
      <p className="hint">{t('clinic.disclaimer')}</p>
      <div className="clinic-bar" role="toolbar" aria-label={t('clinic.toolbar')}>
        {CLINIC_SCENARIOS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={!manual && clinicId === item.id ? 'scenario active' : 'scenario'}
            aria-pressed={!manual && clinicId === item.id}
            onClick={() => selectScenario(item.id)}
          >
            <b>{t(`clinic.scenario.${item.id}`)}</b>
          </button>
        ))}
        <button type="button" className={manual ? 'scenario active' : 'scenario'} aria-pressed={manual} onClick={openManual}>
          <b>{t('clinic.manual')}</b>
        </button>
      </div>

      <div className="clinic-grid">
        <div>
          <div className={`score-block status-${report.band === 'nominal' ? 'ready' : report.band === 'vigilance' ? 'degraded' : 'risk'}`}>
            <em>{report.score}</em>
            <div className={report.band === 'nominal' ? 'status-ready' : report.band === 'vigilance' ? 'status-degraded' : 'status-risk'}>
              {t(`clinic.band.${report.band}`)}
            </div>
            <p>{t('clinic.scoreHelp')}</p>
            <p className="hint">{t('clinic.projection', { score: report.projectedScore })}</p>
          </div>

          {report.diagnoses.length === 0 ? (
            <p>{t('clinic.none')}</p>
          ) : (
            report.diagnoses.map((item) => (
              <article className="dx-card" key={item.id}>
                <div className="axis-top">
                  <span>{t(`clinic.dx.${item.id}`)}</span>
                  <b className={item.severity === 'critique' ? 'status-risk' : 'status-degraded'}>{t(`clinic.severity.${item.severity}`)}</b>
                </div>
                <p>{item.biomarkers}</p>
                <p className="hint">{item.projection}</p>
              </article>
            ))
          )}
        </div>

        <div>
          <h3>{t('clinic.actions')}</h3>
          {report.actions.length === 0 ? (
            <p className="hint">{t('clinic.noActions')}</p>
          ) : (
            report.actions.map((action) => (
              <label className="check-row" key={action.id}>
                <input type="checkbox" checked={checked.includes(action.id)} onChange={() => toggle(action.id)} />
                <span>
                  <b>{t(`clinic.action.${action.id}`)}</b>
                  <small>{t('clinic.recovery', { n: action.recovery })}</small>
                </span>
              </label>
            ))
          )}

          <div className="reading-grid clinic-groups">
            {report.groups.map((group) => (
              <article className="reading" key={group.id}>
                <span>{t(`clinic.group.${group.id}`)}</span>
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
          {FIELD_KEYS.map(([key, unit, step]) => (
            <label key={key}>
              {t(`clinic.field.${key}`)}
              <input
                type="number"
                step={step}
                value={draft.today[key]}
                aria-label={t(`clinic.field.${key}`)}
                onChange={(event) => editToday(key, event.target.value)}
              />
              <small>{unit}</small>
            </label>
          ))}
          <label>
            {t('clinic.hrAgo')}
            <input type="number" value={draft.hrAgo} aria-label={t('clinic.hrAgo')} onChange={(event) => setDraft((current) => ({ ...current, hrAgo: Number(event.target.value) }))} />
            <small>bpm</small>
          </label>
          <label>
            {t('clinic.hrvAgo')}
            <input type="number" value={draft.hrvAgo} aria-label={t('clinic.hrvAgo')} onChange={(event) => setDraft((current) => ({ ...current, hrvAgo: Number(event.target.value) }))} />
            <small>ms</small>
          </label>
          <label>
            {t('clinic.aredAgo')}
            <input type="number" value={draft.aredAgo} aria-label={t('clinic.aredAgo')} onChange={(event) => setDraft((current) => ({ ...current, aredAgo: Number(event.target.value) }))} />
            <small>min</small>
          </label>
        </form>
      )}
    </section>
  )
}
