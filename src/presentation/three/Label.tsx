import { useEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { cssColor } from './cssColor'

/**
 * A text label drawn on a canvas and shown as a sprite that always faces the camera.
 * It stays inside the three.js scene, so leaving the page never has to tear down a second React root.
 */
export function Label({ text, position, alert = false }: { text: string; position: [number, number, number]; alert?: boolean }) {
  const { texture, aspect } = useMemo(() => {
    const scale = 2
    const font = `600 ${22 * scale}px "DM Sans Variable", system-ui, sans-serif`
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    ctx.font = font
    const w = Math.ceil(ctx.measureText(text).width) + 28 * scale
    const h = 40 * scale
    canvas.width = w
    canvas.height = h
    ctx.font = font
    ctx.fillStyle = alert ? cssColor('--color-accent-strong') : cssColor('--color-card')
    ctx.beginPath()
    ctx.roundRect(0, 0, w, h, 12 * scale)
    ctx.fill()
    ctx.fillStyle = alert ? '#ffffff' : cssColor('--color-fg')
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 14 * scale, h / 2 + scale)
    const t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    return { texture: t, aspect: w / h }
  }, [text, alert])
  useEffect(() => () => texture.dispose(), [texture])
  const height = 0.42
  return (
    <sprite position={position} scale={[height * aspect, height, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  )
}
