import { useMemo } from 'react'
import { Link } from 'react-router'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { typesOf } from '@/domain/catalog'
import type { Role } from '@/domain/erp'
import { featureStats } from '@/domain/featureStats'
import { folderPath } from '@/domain/menu'
import { moduleLabel, recordLabel } from '@/domain/uiLabels'
import { cn } from '@/lib/cn'
import { useAlerts } from '../../hooks/useAlerts'
import { useAccess, useAllRecords, useApprovals } from '../../hooks/useRecords'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { recordPath, recordTitle } from '../../records/text'
import { moduleIcon } from '../../ui/moduleIcons'

type Light = 'red' | 'yellow' | 'green'
const LIGHT: Record<Light, { dot: string; text: string; label: string }> = {
  red: { dot: 'bg-danger', text: 'text-danger', label: 'Perlu tindakan' },
  yellow: { dot: 'bg-warning', text: 'text-warning', label: 'Ada yang menunggu' },
  green: { dot: 'bg-success', text: 'text-success', label: 'Aman' },
}
const AREAS = 8

const greeting = (hour: number) => (hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam')

/**
 * The home page as a command centre: one overall status light, the things to do now as large rows with one button each,
 * and a tile per work area with a traffic light and plain words. Built for people who want to see what needs them and click once.
 */
export function CommandCenter({ role }: { role: Role }) {
  const { erp, clock } = useServices()
  const modules = useResource('erp.modules', () => erp.modules())
  const all = useAllRecords()
  const accessFor = useAccess()
  const approvals = useApprovals()
  const alerts = useAlerts()
  const today = clock.today()

  const areas = useMemo(() => {
    if (!modules.data || !all.data) return []
    return modules.data
      .filter((m) => accessFor(m.id) !== 'none')
      .map((m) => {
        const types = typesOf(m.id)
        const open = types.reduce((s, t) => s + featureStats(t, all.data![t.key] ?? [], today).open, 0)
        const waiting = approvals.filter((a) => a.type.module === m.id).length
        const light: Light = waiting > 10 ? 'red' : waiting > 0 ? 'yellow' : 'green'
        return { m, open, waiting, light }
      })
      .sort((a, b) => b.waiting - a.waiting || b.open - a.open)
  }, [modules.data, all.data, accessFor, approvals, today])

  const urgent = alerts.filter((a) => a.tone === 'danger').length
  const overall: Light = urgent > 0 ? 'red' : approvals.length > 0 ? 'yellow' : 'green'
  const todo = [
    ...alerts.map((a) => ({ id: a.id, light: (a.tone === 'danger' ? 'red' : 'yellow') as Light, title: a.title, detail: a.detail, to: a.to, action: 'Lihat' })),
    ...approvals.slice(0, 6).map((a) => ({
      id: `${a.type.key}-${a.record.id}`,
      light: 'yellow' as Light,
      title: `Setujui ${recordLabel(a.type.key, a.type.singular).toLowerCase()} ${a.record.id}`,
      detail: all.data ? recordTitle(a.type, a.record, all.data) : a.record.id,
      to: recordPath(a.type, a.record.id),
      action: 'Periksa',
    })),
  ].slice(0, 7)
  const hour = new Date().getHours()

  return (
    <section aria-labelledby="command-title" className="mb-5 space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-card bg-invert p-5 text-on-invert shadow-card sm:p-6">
        <span className={cn('relative grid size-14 shrink-0 place-items-center rounded-full', LIGHT[overall].dot)}>
          <span className={cn('absolute inset-0 animate-ping rounded-full opacity-30', LIGHT[overall].dot)} />
          {overall === 'green' && <CheckCircle2 aria-hidden className="relative size-7 text-white" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm opacity-70">
            {greeting(hour)}, {role.name}
          </p>
          <h2 id="command-title" className="mt-0.5 text-2xl font-semibold tracking-tight">
            {overall === 'green' ? 'Semua berjalan normal.' : `${urgent + approvals.length} hal menunggu Anda.`}
          </h2>
          <p className="mt-1 text-sm opacity-70">
            {urgent} peringatan penting · {approvals.length} persetujuan · {alerts.length - urgent} catatan lain
          </p>
        </div>
        {approvals.length > 0 && (
          <Link to="/approvals" className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-base font-semibold text-white shadow-glow transition-transform active:scale-[0.97]">
            Buka persetujuan <ArrowRight aria-hidden className="size-5" />
          </Link>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="min-w-0 rounded-card border border-line bg-card p-5 shadow-card xl:col-span-2">
          <h3 className="text-lg font-semibold">Perlu tindakan sekarang</h3>
          {todo.length === 0 ? (
            <p className="mt-3 flex items-center gap-2 text-base text-success">
              <CheckCircle2 aria-hidden className="size-5" /> Tidak ada yang perlu ditangani.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {todo.map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-panel bg-raised p-3">
                  <span aria-hidden className={cn('size-3 shrink-0 rounded-full', LIGHT[t.light].dot)} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-fg">{t.title}</span>
                    <span className="block truncate text-sm text-muted">{t.detail}</span>
                  </span>
                  <Link to={t.to} className="inline-flex h-11 shrink-0 items-center rounded-full bg-invert px-5 text-sm font-semibold text-on-invert transition-transform active:scale-[0.97]">
                    {t.action}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0 xl:col-span-3">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold">Area kerja</h3>
            <Link to="/modules" className="text-sm font-medium text-accent-text hover:underline">
              Semua area ({areas.length})
            </Link>
          </div>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {areas.slice(0, AREAS).map(({ m, open, waiting, light }) => {
              const Icon = moduleIcon(m.id)
              return (
                <li key={m.id}>
                  <Link to={folderPath(m.id)} className="flex h-full min-h-40 flex-col rounded-card border border-line bg-card p-4 shadow-card transition-[translate] duration-300 active:scale-[0.98] [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1">
                    <span className="flex items-start justify-between">
                      <span className="grid size-12 place-items-center rounded-2xl bg-raised">
                        <Icon aria-hidden className="size-6 text-fg" />
                      </span>
                      <span aria-hidden className={cn('size-3.5 rounded-full ring-4 ring-card', LIGHT[light].dot)} />
                    </span>
                    <span className="mt-3 text-base leading-snug font-semibold text-fg">{moduleLabel(m.id, m.name)}</span>
                    <span className={cn('mt-auto pt-2 text-sm font-medium', LIGHT[light].text)}>{waiting > 0 ? `${waiting} menunggu persetujuan` : LIGHT[light].label}</span>
                    <span className="text-xs text-muted tabular">{open} pekerjaan berjalan</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
