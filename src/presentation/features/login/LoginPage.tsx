import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { ArrowRight, Factory, FlaskConical, Lock, Mail, ShieldCheck, Truck } from 'lucide-react'
import { ADMIN_ROLE, type Role } from '@/domain/erp'
import { homeFor } from '@/domain/menu'
import { cn } from '@/lib/cn'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { Avatar } from '../../ui/Avatar'
import { BrandMark } from '../../ui/BrandMark'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Field'
import { POP } from '../../ui/pop'
import { useToast } from '../../ui/useToast'

/** Personas for quick login, by role name from the user matrix, grouped the way a demo walks through them. */
const PERSONAS: ReadonlyArray<{ group: string; names: readonly string[] }> = [
  { group: 'Group', names: ['Group IT Program Lead', 'CFO / Finance Director', 'Head of Procurement', 'Operations Director'] },
  { group: 'Rotama logistics', names: ['Fleet Manager', 'Transport Dispatcher / Planner', 'Driver (Driver App)', 'Warehouse Manager'] },
  { group: 'Rodame and Roasi plants', names: ['Production Manager', 'Plant Operator', 'Maintenance Head', 'QC Manager', 'Tank Farm Supervisor', 'Distributor'] },
]

const ENTITY_LABEL = { holding: 'Holding', rotama: 'Rotama', rodame: 'Rodame', roasi: 'Roasi' } as const

export default function LoginPage() {
  const { erp } = useServices()
  const { signedIn, signIn, role: current } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const roles = useResource('erp.roles', () => erp.roles())
  const [email, setEmail] = useState('raka.pradana@satona.co.id')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  if (signedIn) return <Navigate to={homeFor(current)} replace />

  const find = (name: string): Role | undefined => (name === ADMIN_ROLE.name ? ADMIN_ROLE : roles.data?.find((r) => r.name === name))

  function enter(role: Role) {
    setBusy(role.id)
    // A short pause lets the card show it was picked before the console opens.
    window.setTimeout(() => {
      signIn(role)
      toast({ title: `Signed in as ${role.name}`, description: 'Menus, buttons and approvals follow this role.' })
      navigate(homeFor(role), { replace: true })
    }, 350)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!email.includes('@') || password.length < 4) {
      toast({ tone: 'danger', title: 'Check your email and password', description: 'Demo: any email and a password of 4 or more characters work.' })
      return
    }
    enter(ADMIN_ROLE)
  }

  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[1.05fr_1fr]">
      <section className={cn('relative hidden overflow-hidden p-10 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col', POP.ink)}>
        <div className="flex items-center gap-3">
          <BrandMark className="size-9 text-white" />
          <span className="text-xl font-bold tracking-tight">
            Satona ERP<span className="text-accent">.</span>
          </span>
        </div>
        <div className="mt-auto max-w-lg">
          <p className="eyebrow text-on-ink-muted!">Group command centre</p>
          <h1 className="mt-3 text-[44px] leading-[1.05] font-bold tracking-tight">
            One ERP for logistics, fertiliser and chemicals<span className="text-accent">.</span>
          </h1>
          <p className="mt-4 text-on-ink-muted">20 modules, 95 record types and live views for fleet, plants, tank farms and the group command centre.</p>
        </div>
        <ul className="mt-10 grid grid-cols-3 gap-3">
          {[
            { icon: Truck, label: 'Rotama', note: '128 tankers' },
            { icon: Factory, label: 'Rodame', note: '41,300 t NPK' },
            { icon: FlaskConical, label: 'Roasi', note: '98.7% uptime' },
          ].map((c, i) => (
            <li key={c.label} className="animate-rise rounded-panel bg-white/8 p-4 ring-1 ring-white/10" style={{ animationDelay: `${150 + i * 120}ms` }}>
              <c.icon aria-hidden className="size-5 text-accent" />
              <p className="mt-3 text-sm font-semibold">{c.label}</p>
              <p className="text-xs text-on-ink-muted">{c.note}</p>
            </li>
          ))}
        </ul>
        <span aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-80 animate-pulse rounded-full bg-accent/25 blur-3xl" />
      </section>

      <section className="mx-auto flex w-full max-w-xl flex-col justify-center px-5 py-10 sm:px-8">
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <BrandMark className="size-8 text-fg" />
          <span className="text-lg font-bold tracking-tight">
            Satona ERP<span className="text-accent">.</span>
          </span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight md:text-[28px]">
          Sign in<span className="text-accent">.</span>
        </h2>
        <p className="mt-1 text-sm text-muted">Use your Satona account, or pick a role below to try the demo as that person.</p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Work email</span>
            <Input tone="card" type="email" autoComplete="username" icon={<Mail className="size-4" />} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">Password</span>
            <Input tone="card" type="password" autoComplete="current-password" icon={<Lock className="size-4" />} placeholder="Demo: any 4 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <Button type="submit" variant="accent" className="w-full" loading={busy === ADMIN_ROLE.id}>
            Sign in <ArrowRight aria-hidden className="size-4" />
          </Button>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <ShieldCheck aria-hidden className="size-3.5" /> Single sign-on through Keycloak in production. This demo signs you in locally.
          </p>
        </form>

        <div className="mt-8 flex items-center gap-3">
          <span className="h-px flex-1 bg-line-strong" />
          <span className="eyebrow">Quick login</span>
          <span className="h-px flex-1 bg-line-strong" />
        </div>

        <div className="mt-4 space-y-5">
          {PERSONAS.map((g, gi) => (
            <div key={g.group}>
              <p className="eyebrow mb-2">{g.group}</p>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {g.names.map((name, i) => {
                  const role = find(name)
                  if (!role) return null
                  return (
                    <li key={name} className="animate-rise" style={{ animationDelay: `${(gi * 4 + i) * 45}ms` }}>
                      <button
                        type="button"
                        onClick={() => enter(role)}
                        disabled={busy !== null}
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-3 rounded-panel border border-line bg-card p-3 text-left shadow-card transition-[background-color,translate,scale] duration-300 active:scale-[0.97] disabled:cursor-wait [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-0.5',
                          busy === role.id && 'border-transparent bg-invert text-on-invert',
                        )}
                      >
                        <Avatar name={role.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{role.name}</span>
                          <span className={cn('block truncate text-xs', busy === role.id ? 'opacity-70' : 'text-muted')}>
                            {role.id === ADMIN_ROLE.id ? 'All modules · approves everything' : `${ENTITY_LABEL[role.entity]} · ${role.module.toUpperCase()}${role.external ? ' · portal' : ''}`}
                          </span>
                        </span>
                        <ArrowRight aria-hidden className="size-4 shrink-0 opacity-50" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
