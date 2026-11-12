import { useMemo } from 'react'
import { healthOfShare, worstHealth, type Health } from '@/domain/monitoring'
import { useAllRecords } from './useRecords'

export interface ServiceCheck {
  id: string
  label: string
  health: Health
  /** One line on why the service has this health. */
  detail: string
  /** The list behind the check. */
  to: string
}

/**
 * Health of the platform's services, read from the records that describe them: API routes, event topics, CDC connectors,
 * identity providers, OT data sources and IoT devices. The web app and database have no records and report up.
 */
export function useSystemHealth() {
  const all = useAllRecords()
  return useMemo(() => {
    if (!all.data) return null
    const rows = (key: string) => all.data?.[key] ?? []
    const num = (v: unknown) => Number(v) || 0
    const apis = rows('sys.apis')
    const slowApis = apis.filter((a) => num(a.values.errors) >= 1.5 || num(a.values.p95) >= 800)
    const topics = rows('sys.topics')
    const deadLetters = topics.filter((t) => num(t.values.dlq) > 0)
    const connectors = rows('sys.connectors')
    const lagging = connectors.filter((c) => num(c.values.lag) >= 8)
    const sources = rows('occ.sources').filter((s) => s.status !== 'planned')
    const sourcesDown = sources.filter((s) => s.status === 'offline')
    const sourcesBad = sources.filter((s) => s.status !== 'connected')
    const devices = rows('dvm.devices').filter((d) => d.status !== 'retired' && d.status !== 'provisioned')
    const offline = devices.filter((d) => d.status === 'offline')
    const idp = rows('sys.idp')
    const checks: ServiceCheck[] = [
      { id: 'web', label: 'Aplikasi web', health: 'up', detail: 'Semua halaman tersaji', to: '/dashboard' },
      { id: 'db', label: 'Basis data', health: 'up', detail: 'Primer dan replika sinkron', to: '/integration' },
      { id: 'api', label: 'API gateway', health: healthOfShare(slowApis.length, apis.length), detail: slowApis.length ? `${slowApis.length} dari ${apis.length} rute lambat atau error` : `${apis.length} rute normal`, to: '/modules/sys/apis' },
      { id: 'broker', label: 'Event broker', health: healthOfShare(deadLetters.length, topics.length), detail: deadLetters.length ? `${deadLetters.length} topik punya dead letter` : `${topics.length} topik bersih`, to: '/modules/sys/topics' },
      { id: 'cdc', label: 'Integrasi data (CDC)', health: healthOfShare(lagging.length, connectors.length), detail: lagging.length ? `${lagging.length} konektor tertinggal ≥ 8 dtk` : `${connectors.length} konektor tepat waktu`, to: '/modules/sys/connectors' },
      { id: 'sso', label: 'Login dan SSO', health: idp.length ? 'up' : 'degraded', detail: `${idp.length} penyedia identitas aktif`, to: '/modules/sys/idp' },
      { id: 'ot', label: 'Sumber data OT', health: sourcesDown.length ? 'down' : healthOfShare(sourcesBad.length, sources.length), detail: sourcesBad.length ? `${sourcesBad.length} dari ${sources.length} sumber bermasalah` : `${sources.length} sumber terhubung`, to: '/modules/occ/sources' },
      { id: 'iot', label: 'Perangkat IoT', health: healthOfShare(offline.length, devices.length), detail: `${devices.length - offline.length} dari ${devices.length} online`, to: '/devices' },
    ]
    return { checks, overall: worstHealth(checks.map((c) => c.health)), troubled: checks.filter((c) => c.health !== 'up').length }
  }, [all.data])
}
