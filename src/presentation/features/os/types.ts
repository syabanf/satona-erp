import type { LucideIcon } from 'lucide-react'

export interface App {
  id: string
  title: string
  icon: LucideIcon
  url: string
}
export interface Win {
  id: number
  app: App
  x: number
  y: number
  w: number
  h: number
  z: number
  min: boolean
  max: boolean
  /** The animation playing now; closing and minimising finish when it ends. */
  anim?: 'open' | 'close' | 'min'
}
