import { Stage } from './Stage'

/** A station or zone with its record colours in display order; `id` is what a click picks. */
export interface Cell3D {
  id: string
  color: string
  items: readonly string[]
}

interface Props {
  cells: readonly Cell3D[]
  picked?: string
  hover?: string
  onPick: (id: string) => void
  onHover: (id: string | undefined) => void
  label: string
}

const BLOCK = 0.32
const PER_ROW = 4
const MAX_BLOCKS = 32

/** Record blocks stacked on a pad: four across, rows backwards, then layers upwards. */
function Blocks({ items }: { items: readonly string[] }) {
  const shown = items.slice(0, MAX_BLOCKS)
  const span = PER_ROW * BLOCK * 1.25
  return (
    <>
      {shown.map((color, i) => {
        const layer = Math.floor(i / (PER_ROW * PER_ROW))
        const inLayer = i % (PER_ROW * PER_ROW)
        const x = (inLayer % PER_ROW) * BLOCK * 1.25 - span / 2 + BLOCK * 0.6
        const z = Math.floor(inLayer / PER_ROW) * BLOCK * 1.25 - span / 2 + BLOCK * 0.6
        return (
          <mesh key={i} position={[x, 0.2 + BLOCK / 2 + layer * BLOCK * 1.1, z]} castShadow>
            <boxGeometry args={[BLOCK, BLOCK, BLOCK]} />
            <meshStandardMaterial color={color} roughness={0.5} />
          </mesh>
        )
      })}
    </>
  )
}

function Pad({ cell, size, on, onPick, onHover }: { cell: Cell3D; size: [number, number]; on: boolean; onPick: Props['onPick']; onHover: Props['onHover'] }) {
  return (
    <mesh
      position={[0, 0.08, 0]}
      receiveShadow
      onClick={(e) => {
        e.stopPropagation()
        onPick(cell.id)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        onHover(cell.id)
      }}
      onPointerOut={() => onHover(undefined)}
    >
      <boxGeometry args={[size[0], 0.16, size[1]]} />
      <meshStandardMaterial color={cell.color} emissive={on ? cell.color : '#000000'} emissiveIntensity={on ? 0.5 : 0} transparent opacity={on ? 0.95 : 0.7} />
    </mesh>
  )
}

/**
 * Single line: the workflow's states as stations along one conveyor, left to right in their order,
 * with each record as a block on the station it sits at.
 */
export function SingleLine3D({ cells, picked, hover, onPick, onHover, label }: Props) {
  const gap = 2.6
  const x0 = ((cells.length - 1) * gap) / 2
  return (
    <Stage label={label} camera={[0, 7, 11]} height={420}>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <boxGeometry args={[cells.length * gap, 0.06, 0.5]} />
        <meshStandardMaterial color="#6b7280" roughness={0.7} />
      </mesh>
      {cells.map((cell, i) => (
        <group key={cell.id} position={[i * gap - x0, 0, 0]}>
          <Pad cell={cell} size={[2, 2]} on={picked === cell.id || hover === cell.id} onPick={onPick} onHover={onHover} />
          <Blocks items={cell.items} />
          {i < cells.length - 1 && (
            <mesh position={[gap / 2, 0.25, 0]} rotation-z={-Math.PI / 2}>
              <coneGeometry args={[0.18, 0.4, 16]} />
              <meshStandardMaterial color="#9ca3af" />
            </mesh>
          )}
        </group>
      ))}
    </Stage>
  )
}

/** Shopfloor: one floor zone per group in a grid, each holding its records as blocks coloured by status. */
export function Shopfloor3D({ cells, picked, hover, onPick, onHover, label }: Props) {
  const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(cells.length))))
  const gap = 3
  const rows = Math.ceil(cells.length / cols)
  return (
    <Stage label={label} camera={[6, 10, 12]} height={420}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[cols * gap + 1, rows * gap + 1]} />
        <meshStandardMaterial color="#9ca3af" transparent opacity={0.15} />
      </mesh>
      {cells.map((cell, i) => (
        <group key={cell.id} position={[(i % cols) * gap - ((cols - 1) * gap) / 2, 0, Math.floor(i / cols) * gap - ((rows - 1) * gap) / 2]}>
          <Pad cell={cell} size={[2.5, 2.5]} on={picked === cell.id || hover === cell.id} onPick={onPick} onHover={onHover} />
          <Blocks items={cell.items} />
        </group>
      ))}
    </Stage>
  )
}
