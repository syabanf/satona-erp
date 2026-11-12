import type { Health } from '@/domain/monitoring'

/** Lamp colour and label for a service's health, shared by the header pill and the monitoring page. */
export const HEALTH_LAMP: Record<Health, string> = { up: 'bg-success', degraded: 'bg-warning', down: 'bg-danger animate-pulse' }
export const HEALTH_TEXT: Record<Health, string> = { up: 'Normal', degraded: 'Terganggu', down: 'Mati' }
