import { Stage } from './Stage'

export interface Bars3D {
  rows: ReadonlyArray<{ id: string; label: string; color: string }>
  columns: readonly string[]
  /** counts[row][column] */
  counts: ReadonlyArray<readonly number[]>
}

const GAP = 1.4

/**
 * Status rows by month columns as 3D bars; bar height is the record count. Clicking a bar picks that cell.
 * Labels and the hover readout live in the page around the canvas: drei's Html mounts its own React roots, which tear down noisily.
 */
export default function RecordBars3D({ data, picked, hover, onPick, onHover, label }: { data: Bars3D; picked?: string; hover?: string; onPick: (row: string, column: number) => void; onHover: (cell: string | undefined) => void; label: string }) {
  const most = Math.max(1, ...data.counts.flat())
  const x0 = ((data.columns.length - 1) * GAP) / 2
  const z0 = ((data.rows.length - 1) * GAP) / 2
  return (
    <Stage label={label} camera={[8, 8, 10]} height={420}>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[data.columns.length * GAP + 1, data.rows.length * GAP + 1]} />
        <meshStandardMaterial color="#9ca3af" transparent opacity={0.12} />
      </mesh>
      {data.rows.map((row, r) =>
        data.columns.map((_, c) => {
          const n = data.counts[r]?.[c] ?? 0
          const h = n ? 0.2 + (n / most) * 4 : 0.04
          const key = `${row.id}:${c}`
          const on = picked === key || hover === key
          return (
            <group key={key} position={[c * GAP - x0, 0, r * GAP - z0]}>
              <mesh
                position={[0, h / 2, 0]}
                castShadow
                onClick={(e) => {
                  e.stopPropagation()
                  onPick(row.id, c)
                }}
                onPointerOver={(e) => {
                  e.stopPropagation()
                  onHover(key)
                }}
                onPointerOut={() => onHover(undefined)}
              >
                <boxGeometry args={[0.8, h, 0.8]} />
                <meshStandardMaterial color={row.color} emissive={on ? row.color : '#000000'} emissiveIntensity={on ? 0.45 : 0} roughness={0.45} />
              </mesh>
            </group>
          )
        }),
      )}
    </Stage>
  )
}
