import { Link } from 'react-router'
import { Activity, ArrowUpRight, Cpu, HardDrive, Layers, MemoryStick } from 'lucide-react'
import type { Health } from '@/domain/monitoring'
import { liveMetric } from '@/domain/telemetry'
import { cn } from '@/lib/cn'
import { LineChart } from '../../charts/LineChart'
import { useRecordsVersion } from '../../hooks/useRecords'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { useSystemHealth } from '../../hooks/useSystemHealth'
import { useTicker } from '../../hooks/useTicker'
import { Card, CardHeader } from '../../ui/Card'
import { HEALTH_LAMP, HEALTH_TEXT } from '../../ui/health'
import { Meter } from '../../ui/Meter'
import { CardSkeleton } from '../../ui/States'
import { KpiTile } from '../mes/KpiTile'

const BANNER: Record<Health, string> = { up: 'bg-success-soft text-success', degraded: 'bg-warning-soft text-warning', down: 'bg-danger-soft text-danger' }
const WINDOW = 30

const RESOURCES = [
  { key: 'cpu', label: 'CPU', icon: Cpu, base: 46, swing: 14, unit: '%' },
  { key: 'mem', label: 'Memori', icon: MemoryStick, base: 63, swing: 6, unit: '%' },
  { key: 'disk', label: 'Disk', icon: HardDrive, base: 71, swing: 1, unit: '%' },
  { key: 'queue', label: 'Antrean job', icon: Layers, base: 18, swing: 12, unit: 'job' },
] as const

/**
 * System monitoring: overall status, one card per platform service with its health and reason, live API latency and
 * throughput, server resources, and the audit stream of every record change across modules.
 */
export default function MonitoringPage() {
  const health = useSystemHealth()
  const { records } = useServices()
  const version = useRecordsVersion()
  const events = useResource(`records:events:${version}`, () => records.events())
  const t = useTicker(1)

  if (!health) return <CardSkeleton lines={8} />
  const ticks = Array.from({ length: WINDOW }, (_, i) => t - (WINDOW - 1 - i))
  const latency = ticks.map((x) => liveMetric('api-p95', x, 128, 34))
  const throughput = ticks.map((x) => liveMetric('api-rpm', x, 1840, 260))
  const errorRate = liveMetric('api-err', t, 0.42, 0.18)

  return (
    <div className="space-y-4">
      <div className={cn('flex flex-wrap items-center gap-3 rounded-card px-5 py-4', BANNER[health.overall])}>
        <span aria-hidden className={cn('size-3 rounded-full', HEALTH_LAMP[health.overall])} />
        <p className="text-base font-semibold">{health.overall === 'up' ? 'Semua sistem normal' : `${health.troubled} layanan perlu perhatian`}</p>
        <p className="text-sm opacity-80">Diperbarui setiap detik dari data integrasi, sumber OT dan perangkat.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiTile label="Uptime 30 hari" value={99.94} format={(v) => `${v.toFixed(2)}%`} to="/monitoring" accent note="target 99,9%" />
        <KpiTile label="Latensi API p95" value={latency.at(-1) ?? 0} format={(v) => `${Math.round(v)} ms`} to="/modules/sys/apis" note="seluruh rute" live />
        <KpiTile label="Permintaan per menit" value={throughput.at(-1) ?? 0} format={(v) => Math.round(v).toLocaleString('id-ID')} to="/modules/sys/apis" note="lewat API gateway" live />
        <KpiTile label="Tingkat error" value={errorRate} format={(v) => `${v.toFixed(2)}%`} to="/modules/sys/apis" note="respons 5xx" live />
      </div>

      <section aria-label="Layanan" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {health.checks.map((c) => (
          <Link key={c.id} to={c.to} className="group flex flex-col gap-2 rounded-card border border-line bg-card p-4 shadow-card transition-colors hover:border-line-strong">
            <span className="flex items-center gap-2">
              <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', HEALTH_LAMP[c.health])} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.label}</span>
              <ArrowUpRight aria-hidden className="size-4 shrink-0 text-subtle group-hover:text-fg" />
            </span>
            <span className={cn('text-xs font-medium', c.health === 'up' ? 'text-success' : c.health === 'degraded' ? 'text-warning' : 'text-danger')}>{HEALTH_TEXT[c.health]}</span>
            <span className="text-xs text-muted">{c.detail}</span>
          </Link>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Lalu lintas API, 30 detik terakhir" icon={<Activity aria-hidden className="size-5 text-muted" />} />
          <LineChart
            labels={ticks.map((_, i) => `-${WINDOW - 1 - i} dtk`)}
            series={[{ id: 'p95', label: 'Latensi p95', values: latency, color: 'var(--color-series-1)', area: true }]}
            format={(v) => `${Math.round(v)} ms`}
            height={200}
            label="Latensi API p95 per detik"
          />
          <p className="mt-2 text-xs text-muted">
            Throughput sekarang {Math.round(throughput.at(-1) ?? 0).toLocaleString('id-ID')} permintaan per menit, error {errorRate.toFixed(2)}%.
          </p>
        </Card>
        <Card>
          <CardHeader title="Sumber daya server" />
          <ul className="space-y-4">
            {RESOURCES.map((r) => {
              const value = liveMetric(r.key, t, r.base, r.swing)
              const share = r.unit === '%' ? value / 100 : value / 60
              return (
                <li key={r.key}>
                  <span className="flex items-center gap-2 text-sm">
                    <r.icon aria-hidden className="size-4 text-muted" />
                    <span className="flex-1">{r.label}</span>
                    <span className="text-xs text-muted tabular">
                      {Math.round(value)} {r.unit}
                    </span>
                  </span>
                  <Meter value={Math.min(1, share)} tone={share > 0.85 ? 'accent' : 'info'} className="mt-1.5" label={`${r.label} terpakai`} />
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="Aktivitas sistem" action={<span className="text-xs text-muted">setiap perubahan data di semua modul</span>} />
        {(events.data ?? []).length === 0 ? (
          <p className="text-sm text-muted">Belum ada aktivitas di sesi ini. Buat, ubah atau setujui data mana pun dan aktivitasnya muncul di sini.</p>
        ) : (
          <ul className="divide-y divide-line">
            {(events.data ?? []).slice(0, 12).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm">
                <span className="w-14 shrink-0 text-xs text-muted tabular">{new Date(e.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="font-mono text-xs">{e.recordId}</span>
                <span className="min-w-0 flex-1 truncate">{e.action}</span>
                <span className="text-xs text-muted">{e.by}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
