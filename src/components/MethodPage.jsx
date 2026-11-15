import { COMMS_DELAY_MIN } from '../lib/telemetry.js'
import { STARTERS } from '../lib/starters.ts'
import { t, useLocale } from '../i18n/index.ts'

export function MethodPage() {
  useLocale()
  return (
    <section className="panel method" aria-label={t('method.title')}>
      <h2>{t('method.title')}</h2>
      <p className="hint">{t('method.notDevice')}</p>
      <h3>{t('method.archTitle')}</h3>
      <p>{t('method.archBody')}</p>
      <h3>{t('method.offlineTitle')}</h3>
      <p>{t('method.offlineBody', { min: COMMS_DELAY_MIN })}</p>
      <h3>{t('method.rulesTitle')}</h3>
      <p>{t('method.rulesBody')}</p>
      <h3>{t('method.forestTitle')}</h3>
      <p>{t('method.forestBody')}</p>
      <h3>{t('method.sourcesTitle')}</h3>
      <ul className="method-sources">
        {STARTERS.map((item) => (
          <li key={item.id}>
            <strong className="source-badge">{t(`source.${item.source}`)}</strong>
            {item.label}
            {' · '}
            <a href={item.reference}>{item.reference}</a>
          </li>
        ))}
      </ul>
      <h3>{t('method.limitsTitle')}</h3>
      <p>{t('method.limitsBody')}</p>
    </section>
  )
}
