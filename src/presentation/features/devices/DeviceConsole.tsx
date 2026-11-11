import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Activity, Power, Search } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { DEVICE_KINDS } from '@/domain/catalog/devices'
import type { ErpRecord } from '@/domain/records'
import { cn } from '@/lib/cn'
import { useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { useTicker } from '../../hooks/useTicker'
import { NewButtons } from '../../records/NewButtons'
import { RecordControls } from '../../records/RecordControls'
import { StateBadge } from '../../records/StateBadge'
import { recordPath } from '../../records/text'
import { Tag } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card, CardHeader } from '../../ui/Card'
import { Input } from '../../ui/Field'
import { FilterChips } from '../../ui/FilterChips'
import { Meter } from '../../ui/Meter'
import { CardSkeleton, EmptyState } from '../../ui/States'
import { useToast } from '../../ui/useToast'
import { KpiTile } from '../mes/KpiTile'

const t = (key: string) => typeOf(key)!
const LAMP: Record<string, string> = { online: 'bg-success', offline: 'bg-danger', maintenance: 'bg-warning', provisioned: 'bg-info', retired: 'bg-subtle' }
const v = (r: ErpRecord | undefined, k: string) => String(r?.values[k] ?? '')
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

/**
 * Device console for the group's IoT and OT estate: live heartbeats, filters by kind and status, Ping and Reboot that
 * create remote-command records and report back, firmware compliance per model, running rollouts and open alerts.
 */
export default function DeviceConsole() {
  const all = useAllRecords()
  const { records, clock } = useServices()
  const { role } = useSession()
  const toast = useToast()
  const elapsed = useTicker(1)
  const [params, setParams] = useSearchParams()
  const [busy, setBusy] = useState<string>()
  const kind = DEVICE_KINDS.find((k) => k === params.get('kind'))
  const status = params.get('status') ?? undefined
  const query = params.get('q') ?? ''
  const set = (k: string, value: string | undefined) => setParams((p) => (value ? p.set(k, value) : p.delete(k), p), { replace: true })

  if (!all.data) return <CardSkeleton lines={8} />
  const data = all.data
  const models = new Map((data['dvm.models'] ?? []).map((m) => [m.id, m]))
  const devices = (data['dvm.devices'] ?? []).filter((d) => d.status !== 'retired')
  const kindOf = (d: ErpRecord) => v(models.get(v(d, 'model')), 'kind')
  const outdated = (d: ErpRecord) => v(d, 'firmware') !== v(models.get(v(d, 'model')), 'latestFirmware')
  const today = clock.today()
  const online = devices.filter((d) => d.status === 'online')
  const alerts = (data['dvm.alerts'] ?? []).filter((a) => a.status !== 'resolved')
  const rollouts = (data['dvm.rollouts'] ?? []).filter((r) => r.status === 'running' || r.status === 'planned')

  const shown = devices.filter((d) => (!kind || kindOf(d) === kind) && (!status || d.status === status) && (!query || `${v(d, 'name')} ${v(d, 'site')} ${v(d, 'ip')}`.toLowerCase().includes(query.toLowerCase())))
  const kindCounts = Object.fromEntries(DEVICE_KINDS.map((k) => [k, devices.filter((d) => kindOf(d) === k).length]))
  const states = t('dvm.devices').workflow.states.filter((s) => s.id !== 'retired')
  const statusCounts = Object.fromEntries(states.map((s) => [s.id, devices.filter((d) => d.status === s.id).length]))
  // Online devices beat every 30 seconds; the counter is staggered per device so the column moves.
  const heartbeat = (d: ErpRecord, i: number) => (d.status === 'online' ? `${Math.floor((elapsed + i * 7) % 30)} dtk lalu` : v(d, 'lastSeen') ? `${daysBetween(v(d, 'lastSeen'), today)} hari lalu` : 'belum pernah')

  // A command is a record: queued, sent, then done when the device answers or failed when it is not online.
  async function command(device: ErpRecord, name: 'Ping' | 'Reboot') {
    setBusy(`${device.id}:${name}`)
    try {
      const cmd = await records.create(role, 'dvm.commands', { device: device.id, command: name, requested: today })
      await records.transition(role, 'dvm.commands', cmd.id, 'sent')
      const ok = device.status === 'online'
      await records.update(role, 'dvm.commands', cmd.id, { ...cmd.values, result: ok ? (name === 'Ping' ? 'Reply in 38 ms' : 'Restarted, back online in 41 s') : 'No reply, device not online' })
      await records.transition(role, 'dvm.commands', cmd.id, ok ? 'done' : 'failed')
      toast(ok ? { title: `${name} ${v(device, 'name')} berhasil`, description: `${cmd.id} tercatat di Remote commands.` } : { tone: 'danger', title: `${name} ${v(device, 'name')} gagal`, description: 'Perangkat tidak online.' })
    } catch (e) {
      toast({ tone: 'danger', title: 'Perintah tidak terkirim', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(undefined)
    }
  }

  const compliance = [...models.values()].map((m) => {
    const mine = devices.filter((d) => v(d, 'model') === m.id)
    return { model: m, total: mine.length, latest: mine.filter((d) => !outdated(d)).length }
  }).filter((c) => c.total > 0).sort((a, b) => a.latest / a.total - b.latest / b.total)

  return (
    <div className="space-y-4">
      <NewButtons types={['dvm.devices', 'dvm.rollouts', 'dvm.firmware', 'dvm.models']} />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiTile label="Perangkat online" value={(online.length / Math.max(1, devices.length)) * 100} format={(n) => `${Math.round(n)}%`} to={`${recordPath(t('dvm.devices'))}?status=online`} accent note={`${online.length} dari ${devices.length}`} />
        <KpiTile label="Offline sekarang" value={devices.filter((d) => d.status === 'offline').length} format={(n) => String(Math.round(n))} to={`${recordPath(t('dvm.devices'))}?status=offline`} note="tidak ada heartbeat" />
        <KpiTile label="Firmware usang" value={devices.filter(outdated).length} format={(n) => String(Math.round(n))} to={recordPath(t('dvm.firmware'))} note="di bawah rilis terbaru" />
        <KpiTile label="Alert terbuka" value={alerts.length} format={(n) => String(Math.round(n))} to={`${recordPath(t('dvm.alerts'))}?status=open`} note={`${rollouts.length} rollout aktif`} />
      </div>

      <Card>
        <CardHeader title="Perangkat" icon={<Activity aria-hidden className="size-5 text-muted" />} action={<span className="text-xs text-muted">{shown.length} ditampilkan</span>} />
        <div className="space-y-3">
          <Input icon={<Search className="size-4" />} value={query} onChange={(e) => set('q', e.target.value)} placeholder="Cari nama, lokasi atau IP" aria-label="Cari perangkat" />
          <FilterChips label="Jenis perangkat" options={DEVICE_KINDS.map((k) => ({ value: k, label: k }))} value={kind} counts={kindCounts} total={devices.length} onChange={(k) => set('kind', k)} />
          <FilterChips label="Status" options={states.map((s) => ({ value: s.id, label: s.label }))} value={status} counts={statusCounts} total={devices.length} onChange={(s) => set('status', s)} />
        </div>
        {shown.length === 0 ? (
          <EmptyState title="Tidak ada perangkat yang cocok" action={<Button variant="card" size="sm" onClick={() => setParams({}, { replace: true })}>Hapus filter</Button>}>Ubah pencarian atau filter.</EmptyState>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {shown.slice(0, 40).map((d, i) => (
              <li key={d.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2.5 text-sm md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7rem_7rem_auto]">
                <Link to={recordPath(t('dvm.devices'), d.id)} className="flex min-w-0 items-center gap-2.5 hover:underline">
                  <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', LAMP[d.status], d.status === 'online' && (elapsed + i) % 30 < 1 && 'animate-ping')} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{v(d, 'name')}</span>
                    <span className="block truncate text-xs text-muted">
                      {v(models.get(v(d, 'model')), 'name')} · {kindOf(d)}
                    </span>
                  </span>
                </Link>
                <span className="hidden min-w-0 truncate text-xs text-muted md:block">
                  {v(d, 'site')} · <span className="font-mono">{v(d, 'ip')}</span>
                </span>
                <span className="hidden text-xs md:block">
                  <span className="font-mono">{v(d, 'firmware')}</span> {outdated(d) && <Tag tone="warning">usang</Tag>}
                </span>
                <span className={cn('hidden text-xs tabular md:block', d.status === 'online' ? 'text-muted' : 'font-semibold text-accent-text')}>{heartbeat(d, i)}</span>
                <span className="flex justify-end gap-1.5">
                  <Button variant="card" size="sm" loading={busy === `${d.id}:Ping`} onClick={() => command(d, 'Ping')}>
                    Ping
                  </Button>
                  <Button variant="card" size="icon-sm" aria-label={`Reboot ${v(d, 'name')}`} loading={busy === `${d.id}:Reboot`} onClick={() => command(d, 'Reboot')}>
                    <Power aria-hidden className="size-4" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {shown.length > 40 && (
          <Link to={recordPath(t('dvm.devices'))} className="mt-2 block text-xs text-accent-text hover:underline">
            Lihat semua {shown.length} perangkat
          </Link>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Kepatuhan firmware" action={<span className="text-xs text-muted">per model</span>} />
          <ul className="space-y-3">
            {compliance.map((c) => (
              <li key={c.model.id}>
                <Link to={recordPath(t('dvm.models'), c.model.id)} className="block hover:opacity-80">
                  <span className="flex justify-between gap-2 text-sm">
                    <span className="truncate">{v(c.model, 'name')}</span>
                    <span className="shrink-0 text-xs text-muted tabular">
                      {c.latest}/{c.total} di {v(c.model, 'latestFirmware')}
                    </span>
                  </span>
                  <Meter value={c.latest / c.total} tone={c.latest === c.total ? 'success' : 'accent'} className="mt-1" label={`Kepatuhan firmware ${v(c.model, 'name')}`} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Rollout OTA" action={<Link to={recordPath(t('dvm.rollouts'))} className="text-xs text-accent-text hover:underline">semua rollout</Link>} />
          {rollouts.length === 0 ? (
            <p className="text-sm text-muted">Tidak ada rollout yang berjalan.</p>
          ) : (
            <ul className="divide-y divide-line">
              {rollouts.map((r) => (
                <li key={r.id} className="space-y-1.5 py-2.5">
                  <Link to={recordPath(t('dvm.rollouts'), r.id)} className="flex items-center gap-2 text-sm hover:underline">
                    <span className="min-w-0 flex-1 truncate font-medium">{v(r, 'title')}</span>
                    <StateBadge type={t('dvm.rollouts')} status={r.status} />
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-muted tabular">
                    <Meter value={Number(r.values.progress) / 100} tone="info" className="flex-1" label={`Progres ${v(r, 'title')}`} />
                    {v(r, 'updated') || 0}/{v(r, 'targets')}
                  </span>
                  <RecordControls type={t('dvm.rollouts')} record={r} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Alert perangkat" action={<Link to={recordPath(t('dvm.alerts'))} className="text-xs text-accent-text hover:underline">semua alert</Link>} />
          {alerts.length === 0 ? (
            <p className="text-sm text-muted">Tidak ada alert terbuka.</p>
          ) : (
            <ul className="divide-y divide-line">
              {alerts.slice(0, 8).map((a) => (
                <li key={a.id} className="space-y-1.5 py-2.5">
                  <Link to={recordPath(t('dvm.alerts'), a.id)} className="flex items-center gap-2 text-sm hover:underline">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{v(a, 'kind')}</span> · {v(data['dvm.devices']?.find((d) => d.id === a.values.device), 'name')}
                    </span>
                    <StateBadge type={t('dvm.alerts')} status={a.status} />
                  </Link>
                  <RecordControls type={t('dvm.alerts')} record={a} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
