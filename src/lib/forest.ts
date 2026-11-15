import { personalZ, referenceSlice } from './baseline.ts'
import type { DayRecord, MeasureMeta } from './domains.ts'

export const FOREST_SEED = 20261115
export const FOREST_TREES = 200
export const FOREST_CONTAMINATION = 0.02
export const FOREST_MAX_SAMPLES = 64

export type ForestDriver = {
  feature: string
  label: string
  domain: string
  z: number
}

export type ForestSol = {
  sol: number
  day: number
  phase?: string
  anomaly: number
  drivers: ForestDriver[]
}

export type ForestReport = {
  anomaly: number | null
  flaggedSols: number
  sols: number
  drivers: ForestDriver[]
  series: number[]
  perSol: ForestSol[]
  referenceSols: number
  /** `pre` when the file has a PRE phase; otherwise the opening sols. */
  referenceKind: 'pre' | 'first'
}

type Tree = {
  feature?: number
  split?: number
  left?: Tree
  right?: Tree
  size: number
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rng: () => number): number {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function averagePath(n: number): number {
  if (n <= 1) return 0
  if (n === 2) return 1
  const height = Math.log(n - 1) + 0.5772156649015329
  return 2 * height - (2 * (n - 1)) / n
}

function columnMeanStd(rows: number[][]): { mean: number[]; std: number[] } {
  const width = rows[0]?.length ?? 0
  const mean = Array.from({ length: width }, () => 0)
  for (const row of rows) {
    for (let index = 0; index < width; index += 1) mean[index] = (mean[index] ?? 0) + (row[index] ?? 0)
  }
  for (let index = 0; index < width; index += 1) mean[index] = (mean[index] ?? 0) / rows.length
  const std = Array.from({ length: width }, () => 0)
  for (const row of rows) {
    for (let index = 0; index < width; index += 1) {
      const delta = (row[index] ?? 0) - (mean[index] ?? 0)
      std[index] = (std[index] ?? 0) + delta * delta
    }
  }
  for (let index = 0; index < width; index += 1) {
    std[index] = Math.sqrt((std[index] ?? 0) / rows.length)
  }
  return { mean, std }
}

function augment(nominal: number[][], rng: () => number): number[][] {
  const { std } = columnMeanStd(nominal)
  const scale = std.map((value) => Math.max(value, 1e-6) * 0.08)
  const copies = nominal.map((row) => row.slice())
  for (let copy = 0; copy < 9; copy += 1) {
    for (const row of nominal) {
      copies.push(row.map((value, index) => value + gaussian(rng) * (scale[index] ?? 0)))
    }
  }
  return copies
}

function buildTree(rows: number[][], depth: number, maxDepth: number, rng: () => number): Tree {
  const first = rows[0]
  if (!first || rows.length <= 1 || depth >= maxDepth) return { size: rows.length }
  const width = first.length
  let feature = -1
  let low = 0
  let high = 0
  for (let attempt = 0; attempt < width; attempt += 1) {
    const candidate = Math.floor(rng() * width)
    let min = Infinity
    let max = -Infinity
    for (const row of rows) {
      const value = row[candidate] ?? 0
      if (value < min) min = value
      if (value > max) max = value
    }
    if (max > min) {
      feature = candidate
      low = min
      high = max
      break
    }
  }
  if (feature < 0) return { size: rows.length }
  const split = low + rng() * (high - low)
  const left: number[][] = []
  const right: number[][] = []
  for (const row of rows) {
    if ((row[feature] ?? 0) < split) left.push(row)
    else right.push(row)
  }
  if (left.length === 0 || right.length === 0) return { size: rows.length }
  return {
    feature,
    split,
    size: rows.length,
    left: buildTree(left, depth + 1, maxDepth, rng),
    right: buildTree(right, depth + 1, maxDepth, rng),
  }
}

function pathLength(node: Tree, row: number[], depth: number): number {
  if (node.feature == null || node.left == null || node.right == null || node.split == null) {
    return depth + averagePath(node.size)
  }
  if ((row[node.feature] ?? 0) < node.split) return pathLength(node.left, row, depth + 1)
  return pathLength(node.right, row, depth + 1)
}

function percentile(sorted: number[], percent: number): number {
  if (sorted.length === 0) return 0
  const first = sorted[0] ?? 0
  if (sorted.length === 1) return first
  const rank = (percent / 100) * (sorted.length - 1)
  const low = Math.floor(rank)
  const high = Math.ceil(rank)
  const left = sorted[low] ?? first
  const right = sorted[high] ?? left
  if (low === high) return left
  return left * (high - rank) + right * (rank - low)
}

function toPercent(score: number, normalLevel: number): number {
  const raw = ((normalLevel - score) / 0.22) * 100
  return Math.max(0, Math.min(100, Math.round(raw)))
}

function usableMeasures(days: DayRecord[], measures: MeasureMeta[]): MeasureMeta[] {
  const reference = referenceSlice(days)
  if (reference.length === 0) return []
  return measures.filter((measure) => {
    let present = 0
    for (const day of reference) {
      if (typeof day.values[measure.key] === 'number') present += 1
    }
    return present * 2 >= reference.length
  })
}

function solDrivers(days: DayRecord[], index: number, measures: MeasureMeta[]): ForestDriver[] {
  const drivers: ForestDriver[] = []
  for (const measure of measures) {
    const z = personalZ(days, index, measure)
    if (z == null) continue
    drivers.push({
      feature: measure.key,
      label: measure.label,
      domain: measure.domain,
      z: Math.round(z * 100) / 100,
    })
  }
  drivers.sort((a, b) => b.z - a.z)
  return drivers.slice(0, 3)
}

/**
 * Isolation forest (200 trees, contamination 0.02) trained on the person's
 * reference period: PRE_TEST rows when the file has them, otherwise the first
 * half of the series (at most 14 sols). Sols after that window are the scored
 * sols. Each sol gets an anomaly score and its 3 strongest drivers from the
 * personal rolling baseline (or that reference window when fewer than two
 * earlier sols exist). A missing cell is filled with the reference mean
 * only inside the matrix. The day record is not rewritten, and a missing
 * measure is not a driver.
 */
export function scoreForest(days: DayRecord[], measures: MeasureMeta[]): ForestReport {
  const hasPre = days.some((day) => typeof day.phase === 'string' && /^PRE/i.test(day.phase))
  const empty: ForestReport = {
    anomaly: null,
    flaggedSols: 0,
    sols: days.length,
    drivers: [],
    series: [],
    perSol: [],
    referenceSols: 0,
    referenceKind: hasPre ? 'pre' : 'first',
  }
  let selected = usableMeasures(days, measures)
  const reference = referenceSlice(days)
  if (selected.length > 40) {
    selected = selected
      .map((measure) => {
        const values: number[] = []
        for (const day of reference) {
          const value = day.values[measure.key]
          if (typeof value === 'number') values.push(value)
        }
        const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
        const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(values.length, 1)
        return { measure, variance }
      })
      .sort((a, b) => b.variance - a.variance)
      .slice(0, 40)
      .map((item) => item.measure)
  }
  if (selected.length === 0 || reference.length === 0) return empty

  const raw: number[][] = days.map((day) => selected.map((measure) => day.values[measure.key] ?? Number.NaN))
  const inReference = days.map((day) => reference.includes(day))
  const refRows = raw.filter((_, index) => inReference[index])
  const fill = selected.map((measure, index) => {
    const seen: number[] = []
    for (const row of refRows) {
      const value = row[index]
      if (typeof value === 'number' && Number.isFinite(value)) seen.push(value)
    }
    if (seen.length === 0) return 0
    return seen.reduce((sum, value) => sum + value, 0) / seen.length
  })
  const matrix = raw.map((row) => row.map((value, index) => (Number.isFinite(value) ? value : (fill[index] ?? 0))))
  const nominal = matrix.filter((_, index) => inReference[index])
  const rng = mulberry32(FOREST_SEED)
  const train = augment(nominal, rng)
  const { mean, std } = columnMeanStd(train)
  const scaledTrain = train.map((row) =>
    row.map((value, index) => (value - (mean[index] ?? 0)) / Math.max(std[index] ?? 0, 1e-6)),
  )
  const sampleSize = Math.min(FOREST_MAX_SAMPLES, scaledTrain.length)
  const maxDepth = Math.ceil(Math.log2(Math.max(2, sampleSize)))
  const trees: Tree[] = []
  for (let tree = 0; tree < FOREST_TREES; tree += 1) {
    const sample: number[][] = []
    if (scaledTrain.length <= sampleSize) sample.push(...scaledTrain.map((row) => row.slice()))
    else {
      const bag = scaledTrain.map((_, index) => index)
      for (let pick = 0; pick < sampleSize; pick += 1) {
        const swap = pick + Math.floor(rng() * (bag.length - pick))
        const chosen = bag[swap]
        bag[swap] = bag[pick] ?? pick
        bag[pick] = chosen ?? pick
        const row = scaledTrain[bag[pick] ?? 0]
        if (row) sample.push(row)
      }
    }
    trees.push(buildTree(sample, 0, maxDepth, rng))
  }

  const norm = averagePath(sampleSize)
  const scoreOf = (row: number[]) => {
    const scaled = row.map((value, index) => (value - (mean[index] ?? 0)) / Math.max(std[index] ?? 0, 1e-6))
    let total = 0
    for (const tree of trees) total += pathLength(tree, scaled, 0)
    const anomaly = 2 ** (-total / trees.length / Math.max(norm, 1e-6))
    return -anomaly
  }
  const trainScores = scaledTrain.map((row) => {
    let total = 0
    for (const tree of trees) total += pathLength(tree, row, 0)
    return -(2 ** (-total / trees.length / Math.max(norm, 1e-6)))
  })
  const sorted = trainScores.slice().sort((a, b) => a - b)
  const offset = percentile(sorted, FOREST_CONTAMINATION * 100)
  const decision = matrix.map((row) => scoreOf(row) - offset)
  const referenceDecisions = decision.filter((_, index) => inReference[index]).sort((a, b) => a - b)
  const normalLevel = percentile(referenceDecisions, 50)
  const series = decision.map((score) => toPercent(score, normalLevel))
  const flaggedSols = decision.filter((score) => score < 0).length
  const last = days.length - 1
  const perSol: ForestSol[] = days.map((day, index) => ({
    sol: day.sol,
    day: day.day,
    ...(day.phase ? { phase: day.phase } : {}),
    anomaly: series[index] ?? 0,
    drivers: solDrivers(days, index, selected),
  }))

  return {
    anomaly: series[last] ?? null,
    flaggedSols,
    sols: days.length,
    drivers: perSol[last]?.drivers ?? [],
    series,
    perSol,
    referenceSols: reference.length,
    referenceKind: hasPre ? 'pre' : 'first',
  }
}
