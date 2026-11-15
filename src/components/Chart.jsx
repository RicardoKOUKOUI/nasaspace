function readValue(day, id) {
  if (day.values) {
    const value = day.values[id]
    return typeof value === 'number' ? value : null
  }
  const value = day[id]
  return typeof value === 'number' ? value : null
}

export function Chart({ days, metric }) {
  const width = 720
  const height = 248
  const pad = { l: 44, r: 16, t: 18, b: 28 }
  const values = days.map((day) => readValue(day, metric.id))
  const finite = values.filter((value) => typeof value === 'number')
  if (finite.length === 0) {
    return (
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metric.label} has no values`}>
        <text x={width / 2} y={height / 2} className="chart-tick" textAnchor="middle">No values</text>
      </svg>
    )
  }
  let min = Math.min(...finite)
  let max = Math.max(...finite)
  if (metric.zero) min = Math.min(0, min)
  if (metric.ref != null) {
    min = Math.min(min, metric.ref)
    max = Math.max(max, metric.ref)
  }
  const span = max - min || 1
  if (metric.zero) min = 0
  else min -= span * 0.12
  max += span * 0.18

  const x = (index) => {
    if (days.length <= 1) return pad.l + (width - pad.l - pad.r) / 2
    return pad.l + (index / (days.length - 1)) * (width - pad.l - pad.r)
  }
  const y = (value) => pad.t + (1 - (value - min) / (max - min)) * (height - pad.t - pad.b)
  const complete = values.every((value) => typeof value === 'number')
  const line = complete
    ? values
      .map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`)
      .join(' ')
    : values
      .map((value, index) => (typeof value === 'number' ? `${index === 0 || typeof values[index - 1] !== 'number' ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(value).toFixed(1)}` : null))
      .filter(Boolean)
      .join(' ')
  const area = `${line} L ${x(values.length - 1).toFixed(1)} ${(height - pad.b).toFixed(1)} L ${x(0).toFixed(1)} ${(height - pad.b).toFixed(1)} Z`
  const ticks = 4
  const grid = Array.from({ length: ticks + 1 }, (_, index) => {
    const value = min + ((max - min) * index) / ticks
    return { value, y: y(value) }
  })
  const last = [...values.keys()].reverse().find((index) => typeof values[index] === 'number') ?? 0
  const tickIndexes = days.length <= 1
    ? [[0, 'middle']]
    : days.length === 2
      ? [[0, 'start'], [1, 'end']]
      : [[0, 'start'], [Math.floor((days.length - 1) / 2), 'middle'], [days.length - 1, 'end']]

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metric.label} over ${days.length} sols`}>
      {grid.map((tick) => (
        <g key={tick.y}>
          <line x1={pad.l} x2={width - pad.r} y1={tick.y} y2={tick.y} className="chart-grid" />
          <text x={pad.l - 8} y={tick.y + 3} className="chart-tick" textAnchor="end">
            {formatTick(tick.value)}
          </text>
        </g>
      ))}
      {metric.ref != null && (
        <line
          x1={pad.l}
          x2={width - pad.r}
          y1={y(metric.ref)}
          y2={y(metric.ref)}
          className="chart-ref"
        />
      )}
      <path d={area} fill={metric.color} opacity="0.16" />
      <path d={line} fill="none" stroke={metric.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r="4.5" fill={metric.color} />
      <circle cx={x(last)} cy={y(values[last])} r="9" fill={metric.color} opacity="0.25" />
      {tickIndexes.map(([index, anchor]) => (
        <text key={index} x={x(index)} y={height - 8} className="chart-tick" textAnchor={anchor}>
          SOL {days[index].sol}
        </text>
      ))}
    </svg>
  )
}

function formatTick(value) {
  if (Math.abs(value) < 0.05) return '0'
  const abs = Math.abs(value)
  if (abs >= 100) return Math.round(value).toString()
  if (abs >= 10) return value.toFixed(0)
  return value.toFixed(1)
}
