import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import { cssColor } from './cssColor'
import { Label } from './Label'
import { Stage } from './Stage'

export interface Station3D {
  id: string
  name: string
  oee: number
}

const GAP = 2.6

/** A machine block whose height grows to its OEE; red below 65%. */
function Station({ s, x, onSelect }: { s: Station3D; x: number; onSelect: () => void }) {
  const body = useRef<Mesh>(null)
  const low = s.oee < 65
  const h = 0.6 + (s.oee / 100) * 2.4
  useFrame((_, dt) => {
    const m = body.current
    if (!m) return
    m.scale.y += (1 - m.scale.y) * Math.min(1, dt * 2)
    m.position.y = (h * m.scale.y) / 2 + 0.25
  })
  return (
    <group position={[x, 0, 0]} onClick={(e) => (e.stopPropagation(), onSelect())} onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
      <mesh ref={body} scale={[1, 0.01, 1]} castShadow>
        <boxGeometry args={[1.5, h, 1.5]} />
        <meshStandardMaterial color={low ? cssColor('--color-accent') : cssColor('--color-series-2')} roughness={0.45} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[1.9, 0.24, 1.9]} />
        <meshStandardMaterial color={cssColor('--color-line-strong')} />
      </mesh>
      <Label text={`${s.name} · ${s.oee.toFixed(0)}%`} position={[0, h + 0.9, 0]} alert={low} />
    </group>
  )
}

/** Bags of fertiliser riding the conveyor from the first station to the last. */
function Bags({ length }: { length: number }) {
  const group = useRef<Group>(null)
  useFrame((state) => {
    group.current?.children.forEach((c, i) => {
      c.position.x = (((state.clock.elapsedTime * 1.2 + i * (length / 8)) % length) - length / 2)
    })
  })
  return (
    <group ref={group}>
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[0, 0.42, 1.5]} castShadow>
          <boxGeometry args={[0.45, 0.22, 0.32]} />
          <meshStandardMaterial color={cssColor('--color-pop-blush')} />
        </mesh>
      ))}
    </group>
  )
}

/** The NPK line in 3D: one block per work centre, its height the OEE, a conveyor running past them. */
export default function PlantLine3D({ stations, onSelect }: { stations: readonly Station3D[]; onSelect: (id: string) => void }) {
  const length = stations.length * GAP
  return (
    <Stage label="Plant line in 3D" camera={[4, 7, 13]} height={420}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[length + 6, 8]} />
        <meshStandardMaterial color={cssColor('--color-raised')} />
      </mesh>
      <mesh position={[0, 0.25, 1.5]} receiveShadow>
        <boxGeometry args={[length + 1, 0.12, 0.6]} />
        <meshStandardMaterial color={cssColor('--color-fg')} roughness={0.8} />
      </mesh>
      <Bags length={length} />
      {stations.map((s, i) => (
        <Station key={s.id} s={s} x={(i - (stations.length - 1) / 2) * GAP} onSelect={() => onSelect(s.id)} />
      ))}
    </Stage>
  )
}
