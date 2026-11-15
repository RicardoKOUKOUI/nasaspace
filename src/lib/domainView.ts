import type { DayRecord, DomainId, MeasureMeta } from './domains.ts'

/** Domains with no usable per-person series. They stay off the imported dashboard. */
export const HIDDEN_DASHBOARD_DOMAINS = new Set<DomainId>(['muscle', 'radiation', 'environment'])

const ORDER = ['cardio', 'neuro', 'immune', 'behavior', 'nutrition', 'renal'] as const

const LABELS: Record<(typeof ORDER)[number], string> = {
  cardio: 'Cardiovasculaire',
  neuro: 'Neurologie',
  immune: 'Immunité',
  behavior: 'Psychologie',
  nutrition: 'Nutrition',
  renal: 'Santé rénale',
}

export type DashboardDomain = {
  id: (typeof ORDER)[number]
  label: string
  detail: string
}

export const DASHBOARD_ORDER = ORDER
export const DASHBOARD_LABELS = LABELS

export function dashboardGroup(domain: DomainId): (typeof ORDER)[number] | null {
  if (HIDDEN_DASHBOARD_DOMAINS.has(domain)) return null
  if (domain === 'sleep' || domain === 'behavior') return 'behavior'
  if (domain === 'cardio' || domain === 'neuro' || domain === 'immune' || domain === 'nutrition' || domain === 'renal') {
    return domain
  }
  return null
}

/** Latest measured values, grouped into the domains that actually have numbers. */
export function dashboardDomains(measures: MeasureMeta[], days: DayRecord[]): DashboardDomain[] {
  const parts = new Map<(typeof ORDER)[number], string[]>()
  for (const measure of measures) {
    const id = dashboardGroup(measure.domain)
    if (!id) continue
    const value = latestNumber(days, measure.key)
    if (value == null) continue
    const text = `${measure.label} ${formatValue(value)}${measure.unit ? ` ${measure.unit}` : ''}`
    const list = parts.get(id) ?? []
    list.push(text)
    parts.set(id, list)
  }
  return ORDER.map((id) => {
    const list = parts.get(id)
    if (!list?.length) return { id, label: LABELS[id], detail: '—' }
    const shown = list.slice(0, 4)
    const extra = list.length - shown.length
    return {
      id,
      label: LABELS[id],
      detail: extra > 0 ? `${shown.join(' · ')} · +${extra}` : shown.join(' · '),
    }
  })
}

/** One row per category. A category with no number in any view stays blank. */
export function mergeDashboard(views: DashboardDomain[][]): DashboardDomain[] {
  const parts = new Map<(typeof ORDER)[number], string[]>()
  for (const view of views) {
    for (const row of view) {
      if (!row.detail || row.detail === '—') continue
      const list = parts.get(row.id) ?? []
      for (const piece of row.detail.split(' · ')) {
        if (piece && !list.includes(piece)) list.push(piece)
      }
      parts.set(row.id, list)
    }
  }
  return ORDER.map((id) => {
    const list = parts.get(id)
    if (!list?.length) return { id, label: LABELS[id], detail: '—' }
    const shown = list.slice(0, 4)
    const extra = list.length - shown.length
    return {
      id,
      label: LABELS[id],
      detail: extra > 0 ? `${shown.join(' · ')} · +${extra}` : shown.join(' · '),
    }
  })
}

function latestNumber(days: DayRecord[], key: string): number | null {
  for (let index = days.length - 1; index >= 0; index -= 1) {
    const value = days[index]?.values[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

function formatValue(value: number): string {
  if (Math.abs(value) >= 10) return String(Math.round(value * 10) / 10)
  return String(Math.round(value * 1000) / 1000)
}
