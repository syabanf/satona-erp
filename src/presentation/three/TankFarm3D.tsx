import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh } from 'three'
import { cssColor } from './cssColor'
import { Label } from './Label'
import { Stage } from './Stage'

export interface Tank3D {
  id: string
  product: string
  level: number
  reorderAt: number
}

const H = 3.2
const R = 1

/** One tank: a glass shell, liquid that eases to its level, a dashed reorder ring, a label that follows it. */
function TankMesh({ tank, x, z, selected, onSelect }: { tank: Tank3D; x: number; z: number; selected: boolean; onSelect: () => void }) {
  const liquid = useRef<Mesh>(null)
  const low = tank.level <= tank.reorderAt
  useFrame((_, dt) => {
    const m = liquid.current
    if (!m) return
    const target = Math.max(0.02, tank.level / 100)
    m.scale.y += (target - m.scale.y) * Math.min(1, dt * 2.5)
    m.position.y = (H * m.scale.y) / 2
  })
  return (
    <group position={[x, 0, z]} onClick={(e) => (e.stopPropagation(), onSelect())} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
      <mesh position={[0, H / 2, 0]} castShadow>
        <cylinderGeometry args={[R, R, H, 48, 1, true]} />
        <meshPhysicalMaterial color={cssColor('--color-line-strong')} transparent opacity={0.22} roughness={0.1} transmission={0.6} side={2} />
      </mesh>
      <mesh ref={liquid} scale={[0.96, 0.02, 0.96]} castShadow>
        <cylinderGeometry args={[R, R, H, 48]} />
        <meshStandardMaterial color={low ? cssColor('--color-accent') : cssColor('--color-info')} roughness={0.35} metalness={0.1} emissive={low ? cssColor('--color-accent') : '#000'} emissiveIntensity={low ? 0.25 : 0} />
      </mesh>
      <mesh position={[0, (H * tank.reorderAt) / 100, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[R + 0.04, 0.02, 8, 64]} />
        <meshBasicMaterial color={cssColor('--color-fg')} />
      </mesh>
      <mesh position={[0, H + 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0, R, 48]} />
        <meshStandardMaterial color={cssColor('--color-hover')} />
      </mesh>
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[R + 0.25, R + 0.4, 64]} />
          <meshBasicMaterial color={cssColor('--color-accent')} />
        </mesh>
      )}
      <Label text={`${tank.id.toUpperCase()} · ${tank.level.toFixed(0)}%`} position={[0, H + 0.6, 0]} alert={low} />
    </group>
  )
}

/** The tank farm in 3D: tanks on a pad, liquid levels live, red tanks under their reorder point. */
export default function TankFarm3D({ tanks, selected, onSelect }: { tanks: readonly Tank3D[]; selected?: string; onSelect: (id: string) => void }) {
  const cols = 3
  return (
    <Stage label="Tank farm in 3D" camera={[8, 7, 10]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[14, 10]} />
        <meshStandardMaterial color={cssColor('--color-raised')} />
      </mesh>
      <gridHelper args={[14, 14, cssColor('--color-line-strong'), cssColor('--color-line')]} position={[0, 0.005, 0]} />
      {tanks.map((t, i) => (
        <TankMesh key={t.id} tank={t} x={((i % cols) - (cols - 1) / 2) * 3.4} z={(Math.floor(i / cols) - 0.5) * 3.6} selected={t.id === selected} onSelect={() => onSelect(t.id)} />
      ))}
    </Stage>
  )
}
