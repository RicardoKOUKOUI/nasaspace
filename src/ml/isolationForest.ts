/** In-browser Isolation Forest. Higher scores are more anomalous. Not a medical device. */

export const ISOLATION_TREES = 200
export const ISOLATION_SUBSAMPLE = 256
export const ISOLATION_CONTAMINATION = 0.02
export const ISOLATION_SEED = 20261115

type Tree = {
  feature?: number
  split?: number
  left?: Tree
  right?: Tree
  size: number
}

export type IsolationModel = {
  trees: Tree[]
  sampleSize: number
  norm: number
  mean: number[]
  std: number[]
  contamination: number
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
  for (let index = 0; index < width; index += 1) mean[index] = (mean[index] ?? 0) / Math.max(rows.length, 1)
  const std = Array.from({ length: width }, () => 0)
  for (const row of rows) {
    for (let index = 0; index < width; index += 1) {
      const delta = (row[index] ?? 0) - (mean[index] ?? 0)
      std[index] = (std[index] ?? 0) + delta * delta
    }
  }
  for (let index = 0; index < width; index += 1) std[index] = Math.sqrt((std[index] ?? 0) / Math.max(rows.length, 1))
  return { mean, std }
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

function scale(row: number[], mean: number[], std: number[]): number[] {
  return row.map((value, index) => (value - (mean[index] ?? 0)) / Math.max(std[index] ?? 0, 1e-6))
}

/** Train on the given numeric rows. Rows are the reference period only. */
export function trainIsolationForest(
  rows: number[][],
  options: { trees?: number; subsample?: number; contamination?: number; seed?: number } = {},
): IsolationModel {
  const treesCount = options.trees ?? ISOLATION_TREES
  const subsample = options.subsample ?? ISOLATION_SUBSAMPLE
  const contamination = options.contamination ?? ISOLATION_CONTAMINATION
  const rng = mulberry32(options.seed ?? ISOLATION_SEED)
  const { mean, std } = columnMeanStd(rows)
  const scaled = rows.map((row) => scale(row, mean, std))
  const sampleSize = Math.min(subsample, Math.max(scaled.length, 1))
  const maxDepth = Math.ceil(Math.log2(Math.max(2, sampleSize)))
  const trees: Tree[] = []
  for (let tree = 0; tree < treesCount; tree += 1) {
    const sample: number[][] = []
    if (scaled.length <= sampleSize) {
      for (const row of scaled) sample.push(row.slice())
    } else {
      const bag = scaled.map((_, index) => index)
      for (let pick = 0; pick < sampleSize; pick += 1) {
        const swap = pick + Math.floor(rng() * (bag.length - pick))
        const chosen = bag[swap]
        bag[swap] = bag[pick] ?? pick
        bag[pick] = chosen ?? pick
        const row = scaled[bag[pick] ?? 0]
        if (row) sample.push(row.slice())
      }
    }
    trees.push(buildTree(sample, 0, maxDepth, rng))
  }
  return {
    trees,
    sampleSize,
    norm: averagePath(sampleSize),
    mean,
    std,
    contamination,
  }
}

/** Anomaly score in (0, 1]. Higher means easier to isolate. */
export function isolationScores(model: IsolationModel, rows: number[][]): number[] {
  return rows.map((row) => {
    const scaled = scale(row, model.mean, model.std)
    let total = 0
    for (const tree of model.trees) total += pathLength(tree, scaled, 0)
    const expected = total / Math.max(model.trees.length, 1)
    return 2 ** (-expected / Math.max(model.norm, 1e-6))
  })
}
