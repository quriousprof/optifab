import type { PlacedMachine } from './factoryComponents.ts'

export type Point = [number, number]
export type BeltPath = Pick<PlacedMachine, 'position' | 'length' | 'rotation' | 'angle' | 'entryAngle' | 'exitAngle'>

export const heading = (angle: number): Point => [Math.cos(angle), -Math.sin(angle)]
export const beltAngle = (belt: BeltPath): number => belt.angle ?? (belt.rotation ?? 0) * Math.PI / 2
const beltLength = (belt: BeltPath) => belt.length || 4

export function beltEnds(belt: BeltPath): { start: Point; end: Point } {
  const [dx, dz] = heading(beltAngle(belt))
  const half = beltLength(belt) / 2
  return {
    start: [belt.position[0] - dx * half, belt.position[2] - dz * half],
    end: [belt.position[0] + dx * half, belt.position[2] + dz * half],
  }
}

/** Cubic centreline with tangents inherited from the source and destination belts. */
export function beltControls(belt: BeltPath): [Point, Point, Point, Point] {
  const { start, end } = beltEnds(belt)
  const reach = beltLength(belt)
  const handle = Math.min(14, reach * 0.42)
  const [sx, sz] = heading(belt.entryAngle ?? beltAngle(belt))
  const [ex, ez] = heading(belt.exitAngle ?? beltAngle(belt))
  return [start, [start[0] + sx * handle, start[1] + sz * handle],
    [end[0] - ex * handle, end[1] - ez * handle], end]
}

export function beltPoint(belt: BeltPath, t: number): Point {
  const [p0, p1, p2, p3] = beltControls(belt)
  const u = 1 - t
  return [u ** 3 * p0[0] + 3 * u ** 2 * t * p1[0] + 3 * u * t ** 2 * p2[0] + t ** 3 * p3[0],
    u ** 3 * p0[1] + 3 * u ** 2 * t * p1[1] + 3 * u * t ** 2 * p2[1] + t ** 3 * p3[1]]
}

export function beltTangent(belt: BeltPath, t: number): Point {
  const [p0, p1, p2, p3] = beltControls(belt)
  const u = 1 - t
  const x = 3 * u ** 2 * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t ** 2 * (p3[0] - p2[0])
  const z = 3 * u ** 2 * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t ** 2 * (p3[1] - p2[1])
  const length = Math.hypot(x, z) || 1
  return [x / length, z / length]
}

export function tangentAngle(belt: BeltPath, t: number): number {
  const [x, z] = beltTangent(belt, t)
  return Math.atan2(-z, x)
}

export function closestBeltPoint(belt: BeltPath, point: Point): { point: Point; t: number; distance: number } {
  let bestT = 0
  let bestDistance = Infinity
  const samples = Math.max(20, Math.ceil(beltLength(belt) * 2))
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const p = beltPoint(belt, t)
    const distance = Math.hypot(point[0] - p[0], point[1] - p[1])
    if (distance < bestDistance) { bestT = t; bestDistance = distance }
  }
  let low = Math.max(0, bestT - 1 / samples)
  let high = Math.min(1, bestT + 1 / samples)
  for (let i = 0; i < 22; i++) {
    const left = low + (high - low) / 3
    const right = high - (high - low) / 3
    const a = beltPoint(belt, left), b = beltPoint(belt, right)
    if (Math.hypot(point[0] - a[0], point[1] - a[1]) < Math.hypot(point[0] - b[0], point[1] - b[1])) high = right
    else low = left
  }
  const refinedT = (low + high) / 2
  const refined = beltPoint(belt, refinedT)
  const refinedDistance = Math.hypot(point[0] - refined[0], point[1] - refined[1])
  const t = bestDistance <= refinedDistance ? bestT : refinedT
  const nearest = beltPoint(belt, t)
  return { point: nearest, t, distance: Math.hypot(point[0] - nearest[0], point[1] - nearest[1]) }
}
