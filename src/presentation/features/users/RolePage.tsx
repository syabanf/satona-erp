import { Link, useParams } from 'react-router'
import { ArrowRight, KeyRound } from 'lucide-react'
import { accessOf, ACCESS_LABEL, type Access } from '@/domain/erp'
import { cn } from '@/lib/cn'
import { seriesColor } from '../../charts/colors'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { Tag } from '../../ui/Badge'
import { buttonStyles } from '../../ui/buttonStyles'
import { Card, CardHeader } from '../../ui/Card'
import { Fallback } from '../../ui/Gate'
import { FactGrid, Headline } from '../../ui/Headline'
import { PageBar } from '../../ui/PageBar'

const PILL: Record<Access, string> = {
  full: 'bg-invert text-on-invert',
  approve: 'bg-accent-strong text-white',
  portal: 'bg-warning-soft text-warning',
  view: 'bg-info-soft text-info-text',
  none: 'bg-control text-subtle',
}

export default function RolePage() {
  const { id = '' } = useParams()
  const { erp } = useServices()
  const role = useResource(`erp.role:${id}`, () => erp.role(id), { keepPrevious: false })
  const modules = useResource('erp.modules', () => erp.modules())
  const entities = useResource('erp.entities', () => erp.entities())

  const r = role.data
  if (!r) return <Fallback error={role.error} onRetry={role.reload} back={{ to: '/users', label: 'Back to the user matrix' }} what="role" />

  const home = modules.data?.find((m) => m.id === r.module)
  const grants = (modules.data ?? []).map((m) => ({ m, a: accessOf(r, m) })).filter((g) => g.a !== 'none')

  return (
    <div className="space-y-4">
      <PageBar
        fallback="/users"
        label="User matrix"
        actions={
          home && (
            <Link to={`/modules/${home.id}`} className={buttonStyles({ variant: 'solid' })}>
              Open {home.code} <ArrowRight aria-hidden className="size-4" />
            </Link>
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="flex items-center gap-2">
            {r.external ? <Tag tone="info">External user</Tag> : <Tag tone="neutral">Employee</Tag>}
          </div>
          <Headline className="mt-3">{r.name}</Headline>
          <FactGrid
            className="mt-5 grid-cols-2"
            facts={[
              ['Department', r.department],
              ['Seats', String(r.seats)],
              ['Home module', home?.code ?? '·'],
              ['Modules reached', String(grants.length)],
            ]}
          />
          <div className="mt-4 flex items-start gap-3 rounded-panel bg-info-soft p-4 text-sm text-info-text">
            <KeyRound aria-hidden className="mt-0.5 size-4 shrink-0" />
            <p>
              Signs in through Keycloak SSO. Access below comes from the RBAC rules,{' '}
              <Link to="/integration?c=keycloak" className="font-semibold underline">
                see the IAM layer
              </Link>
              .
            </p>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Access across the group" />
          <div className="space-y-5">
            {(entities.data ?? []).map((e) => {
              const mods = (modules.data ?? []).filter((m) => m.entity === e.id)
              return (
                <div key={e.id}>
                  <p className="mb-2 flex items-center gap-2 eyebrow">
                    <span className="size-2 rounded-full" style={{ background: seriesColor(e.slot) }} />
                    {e.short}
                  </p>
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {mods.map((m) => {
                      const a = accessOf(r, m)
                      return (
                        <li key={m.id} data-motion="row">
                          <Link to={`/modules/${m.id}`} className={cn('flex items-center gap-3 rounded-panel bg-raised p-3 text-sm hover:bg-control', a === 'none' && 'opacity-60')}>
                            <span className="w-10 font-mono text-xs font-semibold">{m.code}</span>
                            <span className="min-w-0 flex-1 truncate">{m.name}</span>
                            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', PILL[a])}>{ACCESS_LABEL[a]}</span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
