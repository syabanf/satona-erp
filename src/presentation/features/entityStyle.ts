import { Building2, FlaskConical, Sprout, Truck, type LucideIcon } from 'lucide-react'
import type { EntityId, ScopeStatus } from '@/domain/erp'
import type { LotState } from '@/domain/ops'
import type { Tone } from '../ui/Badge'
import type { Pop } from '../ui/pop'

/** Icon and pop surface per entity, shared by the overview, entity pages and the user matrix. */
export const ENTITY_ICON: Record<EntityId, LucideIcon> = { holding: Building2, rotama: Truck, rodame: Sprout, roasi: FlaskConical }
export const ENTITY_POP: Record<EntityId, Pop> = { holding: 'ink', rotama: 'blush', rodame: 'sun', roasi: 'red' }
export const ENTITY_OPTIONS: ReadonlyArray<{ value: EntityId; label: string }> = [
  { value: 'holding', label: 'Holding' },
  { value: 'rotama', label: 'Rotama' },
  { value: 'rodame', label: 'Rodame' },
  { value: 'roasi', label: 'Roasi' },
]

/** Twelve month labels ending with the current month. */
export function monthLabels(today: string) {
  const end = new Date(`${today}T00:00:00`)
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(end.getFullYear(), end.getMonth() - 11 + i, 1)
    return d.toLocaleString('en-US', { month: 'short' })
  })
}

export const SCOPE_TONE: Record<ScopeStatus, Tone> = { live: 'success', build: 'info', plan: 'neutral' }
export const LOT_TONE: Record<LotState, Tone> = { released: 'success', hold: 'warning', recalled: 'danger' }
