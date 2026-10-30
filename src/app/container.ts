/** Composition root: the one place that picks adapters. The demo runs on the mock seed only. */
import { createServices } from '@/application/services'
import { systemClock } from '@/infrastructure/clock'
import { createMockPorts } from '@/infrastructure/mock'

export const services = createServices(createMockPorts(systemClock))
