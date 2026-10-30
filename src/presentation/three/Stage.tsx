import type { ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import { useTheme } from '../hooks/useTheme'
import { prefersReducedMotion } from '../ui/animate'

/** Shared 3D stage: soft lights, a contact shadow, orbit controls that drift slowly until the user grabs them. */
export function Stage({ children, camera = [9, 7, 11], label, height = 460 }: { children: ReactNode; camera?: [number, number, number]; label: string; height?: number }) {
  const [theme] = useTheme()
  return (
    <div role="img" aria-label={label} className="relative overflow-hidden rounded-panel bg-gradient-to-b from-raised to-control" style={{ height }}>
      <Canvas key={theme} shadows dpr={[1, 2]} camera={{ position: camera, fov: 40 }}>
        <ambientLight intensity={theme === 'dark' ? 0.5 : 0.8} />
        <directionalLight position={[8, 12, 6]} intensity={1.4} castShadow />
        <directionalLight position={[-6, 4, -6]} intensity={0.4} />
        {children}
        <ContactShadows position={[0, -0.01, 0]} opacity={0.35} scale={30} blur={2.4} far={8} />
        <OrbitControls makeDefault autoRotate={!prefersReducedMotion()} autoRotateSpeed={0.6} enablePan={false} minDistance={6} maxDistance={26} maxPolarAngle={Math.PI / 2.15} />
      </Canvas>
      <p className="pointer-events-none absolute bottom-3 left-4 text-xs text-muted">Drag to orbit · scroll to zoom</p>
    </div>
  )
}
