import { BufferGeometry, Float32BufferAttribute } from 'three'
import { beltPoint, beltTangent, type BeltPath, type Point } from './conveyorPath.ts'

/** Cached strip coverage for hiding internal rails at a split without per-vertex curve searches. */
export function beltCoverage(path: BeltPath, halfWidth: number): (point: Point) => boolean {
  const count = Math.max(32, Math.ceil((path.length ?? 4) * 4))
  const points = Array.from({ length: count + 1 }, (_, index) => beltPoint(path, index / count))
  const xs = points.map((p) => p[0]), zs = points.map((p) => p[1])
  const minX = Math.min(...xs) - halfWidth, maxX = Math.max(...xs) + halfWidth
  const minZ = Math.min(...zs) - halfWidth, maxZ = Math.max(...zs) + halfWidth
  return ([x, z]) => {
    if (x < minX || x > maxX || z < minZ || z > maxZ) return false
    return points.slice(1).some((b, index) => {
      const a = points[index], dx = b[0] - a[0], dz = b[1] - a[1]
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)))
      return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < halfWidth
    })
  }
}

/** Sweeps a rectangular conveyor strip along the centreline, including top, sides and ends. */
export function sweepBelt(path: BeltPath, from: number, to: number, width: number, bottom: number, top: number, offset = 0, visible?: (t: number) => boolean): BufferGeometry {
  const segments = Math.max(16, Math.ceil((path.length ?? 4) * 4))
  const vertices: number[] = []
  const indices: number[] = []
  for (let index = 0; index <= segments; index++) {
    const t = from + (to - from) * index / segments
    const [x, z] = beltPoint(path, t)
    const [dx, dz] = beltTangent(path, t)
    const lateral: [number, number] = [-dz, dx]
    const left = offset - width / 2, right = offset + width / 2
    vertices.push(x + lateral[0] * left, top, z + lateral[1] * left,
      x + lateral[0] * right, top, z + lateral[1] * right,
      x + lateral[0] * left, bottom, z + lateral[1] * left,
      x + lateral[0] * right, bottom, z + lateral[1] * right)
    if (index === segments) continue
    if (visible && !visible(from + (to - from) * (index + 0.5) / segments)) continue
    const a = index * 4, b = a + 4
    indices.push(a, a + 1, b, b, a + 1, b + 1,
      a + 2, b + 2, a + 3, b + 2, b + 3, a + 3,
      a, b, a + 2, b, b + 2, a + 2,
      a + 1, a + 3, b + 1, b + 1, a + 3, b + 3)
  }
  indices.push(0, 2, 1, 1, 2, 3)
  const end = segments * 4
  indices.push(end, end + 1, end + 2, end + 1, end + 3, end + 2)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
