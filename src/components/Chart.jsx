export function Chart({ days, metric }) {
  const width = 720
  const height = 248
  const pad = { l: 44, r: 16, t: 18, b: 28 }
  const values = days.map((day) => day[metric.id])
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (metric.zero) min = Math.min(0, min)
  if (metric.ref != null) {
    min = Math.min(min, metric.ref)
    max = Math.max(max, metric.ref)
  }
  const span = max - min || 1
  if (metric.zero) min = 0
  else min -= span * 0.12
  max += span * 0.18

  const x = (index) => pad.l + (index / (days.length - 1)) * (width - pad.l - pad.r)
  const y = (value) => pad.t + (1 - (value - min) / (max - min)) * (height - pad.t - pad.b)
  const line = values
    .map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`)
    .join(' ')
  const area = `${line} L ${x(values.length - 1).toFixed(1)} ${(height - pad.b).toFixed(1)} L ${x(0).toFixed(1)} ${(height - pad.b).toFixed(1)} Z`
  const ticks = 4
  const grid = Array.from({ length: ticks + 1 }, (_, index) => {
    const value = min + ((max - min) * index) / ticks
    return { value, y: y(value) }
  })
  const last = values.length - 1

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metric.label} over 30 sols`}>
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
      {[
        [0, 'start'],
        [14, 'middle'],
        [29, 'end'],
      ].map(([index, anchor]) => (
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
