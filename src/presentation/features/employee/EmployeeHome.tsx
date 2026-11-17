import { Link } from 'react-router'
import { Megaphone, Plus } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { isSupervisor, leaveBalance, ownRecords, SELF_MENU, selfPath, teamRequests } from '@/domain/selfService'
import { moneyCompact } from '@/lib/format'
import { useMe } from '../../hooks/useMe'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { StateBadge } from '../../records/StateBadge'
import { ENTITY_NAME, recordTitle, refTitle } from '../../records/text'
import { Avatar } from '../../ui/Avatar'
import { buttonStyles } from '../../ui/buttonStyles'
import { Card, CardHeader } from '../../ui/Card'
import { CardSkeleton, EmptyState } from '../../ui/States'
import { KpiTile } from '../mes/KpiTile'

const days = (v: number) => `${Math.round(v)} hari`
const REQUESTS = SELF_MENU.flatMap(([, items]) => items).filter((i) => i.create && i.id !== 'team')

/** The employee's own page: who they are, leave left, this month's attendance, requests in flight and the latest news. */
export default function EmployeeHome() {
  const { all, me } = useMe()
  const { role } = useSession()
  const today = useServices().clock.today()
  if (!all) return <CardSkeleton lines={8} />
  if (!me) return <EmptyState title="Data karyawan belum ada">Minta HR mendaftarkan Anda di data karyawan.</EmptyState>

  const own = (key: string) => ownRecords(all[key] ?? [], me.id)
  const leave = leaveBalance(own('hrs.leaves'), today.slice(0, 4))
  const month = own('hrs.attendance').filter((a) => String(a.values.date).startsWith(today.slice(0, 7)))
  const requests = REQUESTS.flatMap((item) => own(item.type!).map((record) => ({ item, record }))).sort((a, b) => b.record.updatedAt.localeCompare(a.record.updatedAt))
  const waiting = requests.filter(({ record }) => ['submitted', 'requested'].includes(record.status)).length
  const slip = own('hrs.payslips').toSorted((a, b) => String(b.values.period).localeCompare(String(a.values.period)))[0]
  const team = isSupervisor(role) ? teamRequests(all, me).length : 0
  const news = (all['hrs.announcements'] ?? []).filter((a) => a.status === 'published').sort((a, b) => String(b.values.publish).localeCompare(String(a.values.publish))).slice(0, 3)

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-4">
        <Avatar name={String(me.values.name)} size="lg" />
        <div className="min-w-0 flex-1 basis-48">
          <p className="truncate text-lg font-semibold">Halo, {String(me.values.name)}</p>
          <p className="truncate text-sm text-muted">
            {refTitle('hrs.positions', String(me.values.position), all).split(' · ')[0]} · {ENTITY_NAME[String(me.values.entity)]}
          </p>
          <p className="font-mono text-xs text-muted">{String(me.values.nik)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {REQUESTS.slice(0, 2).map((item) => (
            <Link key={item.id} to={`${selfPath(item.id)}?new=1`} className={buttonStyles({ variant: item.id === 'leaves' ? 'accent' : 'card', size: 'sm' })}>
              <Plus aria-hidden className="size-4" /> {item.label}
            </Link>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiTile label="Sisa cuti tahunan" value={leave.left} format={days} to={selfPath('leaves')} accent note={`${leave.taken} hari terpakai, ${leave.waiting} menunggu`} />
        <KpiTile label="Hadir bulan ini" value={month.filter((a) => a.values.result === 'On time').length} format={days} to={selfPath('attendance')} note={`${month.filter((a) => a.values.result === 'Late').length} kali terlambat`} />
        <KpiTile label="Pengajuan menunggu" value={waiting} format={(v) => String(Math.round(v))} to={selfPath('leaves')} note="cuti, lembur, pinjaman, kasbon" />
        {team > 0 ? (
          <KpiTile label="Menunggu keputusan Anda" value={team} format={(v) => String(Math.round(v))} to={selfPath('approvals')} note="pengajuan anggota tim" />
        ) : (
          <KpiTile label={`Gaji bersih ${String(slip?.values.period ?? '')}`} value={Number(slip?.values.net) || 0} format={moneyCompact} to={selfPath('payslips')} note="slip gaji terakhir" />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Pengajuan terakhir" />
          {requests.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Belum ada pengajuan.</p>
          ) : (
            <ul className="divide-y divide-line">
              {requests.slice(0, 6).map(({ item, record }) => {
                const type = typeOf(item.type!)!
                return (
                  <li key={record.id}>
                    <Link to={selfPath(item.id)} className="flex items-center gap-3 rounded-xl px-1 py-2.5 hover:bg-raised">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{recordTitle(type, record, all)}</span>
                        <span className="block text-xs text-muted">
                          {item.label} · <span className="font-mono">{record.id}</span>
                        </span>
                      </span>
                      <StateBadge type={type} status={record.status} />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Pengumuman" icon={<Megaphone aria-hidden className="size-5 text-muted" />} />
          <ul className="divide-y divide-line">
            {news.map((a) => (
              <li key={a.id}>
                <Link to={selfPath('announcements')} className="block rounded-xl px-1 py-2.5 hover:bg-raised">
                  <span className="block truncate text-sm font-medium">{String(a.values.title)}</span>
                  <span className="block text-xs text-muted">
                    {String(a.values.publish)} · {String(a.values.audience)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
